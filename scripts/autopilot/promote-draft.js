import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { validateDraft } from './core/validator.js';
import { scanInventory } from './core/inventory.js';
import { analyzeTopicCandidate } from './core/gap-analyzer.js';
import { logEvent } from './core/audit-logger.js';

const __filename = fileURLToPath(import.meta.url);

/**
 * Validates whether a draft filename conforms to strict safe naming standards.
 * Allowed: lowercase letters, numbers, and single hyphen separators, ending in .md
 * e.g., "chinese-gender-calendar-guide.md"
 * Rejects: uppercase, spaces, special chars, multiple dots (.md.exe), ../, etc.
 * 
 * @param {string} filename
 * @returns {boolean}
 */
export function isSafeFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
  // Strict regex: lowercase alphanumeric words separated by single hyphens, ending in .md
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(filename);
}

/**
 * Safely promotes a validated draft from the drafts directory to the production blog directory.
 * 
 * @param {string} draftPath - Path to the draft file (filename, relative, or absolute)
 * @param {object} [options]
 * @param {string} [options.draftsDir] - Custom drafts directory (useful for isolated testing)
 * @param {string} [options.productionBlogDir] - Custom production blog directory (for isolated testing)
 * @param {boolean} [options.allowCaution] - Whether to allow CAUTION-level topic promotion (default: false)
 * @param {boolean} [options.logToAudit] - Whether to record into audit log (default: true)
 * @param {object} [options.inventory] - Pre-scanned inventory object (optional override)
 * @returns {Promise<{
 *   success: boolean,
 *   state: string,
 *   message: string,
 *   sourcePath?: string,
 *   promotedPath?: string,
 *   slug?: string,
 *   validation?: object,
 *   cannibalization?: object,
 *   errors?: string[]
 * }>}
 */
export async function promoteDraft(draftPath, options = {}) {
  const draftsDir = path.resolve(options.draftsDir || autopilotConfig.paths.draftsDir);
  const productionBlogDir = path.resolve(options.productionBlogDir || autopilotConfig.paths.productionBlogDir);
  const allowCaution = options.allowCaution ?? false;
  const logToAudit = options.logToAudit ?? true;

  // 1. Resolve and Validate Source Path Safety
  if (!draftPath || typeof draftPath !== 'string') {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_UNSAFE_PATH,
      message: 'Draft path must be a non-empty string.',
      errors: ['Draft path is missing or invalid.'],
    };
  }

  // Resolve absolute path
  const resolvedDraftPath = path.isAbsolute(draftPath)
    ? path.resolve(draftPath)
    : path.resolve(draftsDir, path.basename(draftPath) === draftPath ? draftPath : draftPath);

  // Path containment check: Must reside strictly within draftsDir
  const relDraft = path.relative(draftsDir, resolvedDraftPath);
  if (relDraft.startsWith('..') || path.isAbsolute(relDraft)) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_UNSAFE_PATH,
      message: `Access denied: Draft path "${draftPath}" resolves outside allowed drafts directory.`,
      errors: ['Path traversal or outside draft directory access attempt detected.'],
    };
  }

  // Verify file exists and is a regular file
  if (!fs.existsSync(resolvedDraftPath)) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_FILE_NOT_FOUND,
      message: `Draft file not found at: ${resolvedDraftPath}`,
      errors: [`File does not exist: ${resolvedDraftPath}`],
    };
  }

  let stat;
  try {
    stat = fs.statSync(resolvedDraftPath);
  } catch (err) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_FILE_NOT_FOUND,
      message: `Could not access draft file: ${err.message}`,
      errors: [err.message],
    };
  }

  if (!stat.isFile()) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_UNSAFE_PATH,
      message: 'Specified path is a directory or special file, not a regular draft file.',
      errors: ['Target must be a regular markdown file.'],
    };
  }

  // 2. Validate Filename & Slug Format
  const filename = path.basename(resolvedDraftPath);
  if (!isSafeFilename(filename)) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_UNSAFE_FILENAME,
      message: `Unsafe or invalid draft filename: "${filename}". Must be lowercase alphanumeric with single hyphens and .md extension.`,
      errors: [`Filename "${filename}" violates naming standards.`],
    };
  }

  const slug = filename.replace(/\.md$/, '');
  if (!slug) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_UNSAFE_FILENAME,
      message: 'Derived slug is empty.',
      errors: ['Empty slug.'],
    };
  }

  // 3. Check for Existing Production Slug Collision
  const destinationPath = path.join(productionBlogDir, filename);
  const relDest = path.relative(productionBlogDir, destinationPath);
  if (relDest.startsWith('..') || path.isAbsolute(relDest)) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_UNSAFE_PATH,
      message: `Security violation: Destination path "${destinationPath}" resolves outside production directory.`,
      errors: ['Production destination traversal detected.'],
    };
  }

  if (fs.existsSync(destinationPath)) {
    if (logToAudit) {
      logEvent({
        action: 'PROMOTE_DRAFT',
        status: 'ERROR',
        summary: `Promotion rejected: Production article already exists for slug "${slug}"`,
        details: { sourceDraft: filename, destinationSlug: slug, reason: RESULT_STATES.PRODUCTION_SLUG_EXISTS },
      });
    }
    return {
      success: false,
      state: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
      message: `Promotion rejected: A production article with slug "${slug}" already exists in ${productionBlogDir}. Overwriting is strictly prohibited.`,
      slug,
      errors: [`Production slug collision: "${slug}" already published.`],
    };
  }

  // 4. Read Draft Content and Execute Phase 3 Validation Gate
  let draftContent;
  try {
    draftContent = fs.readFileSync(resolvedDraftPath, 'utf-8');
  } catch (err) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_FILE_NOT_FOUND,
      message: `Failed to read draft content: ${err.message}`,
      errors: [err.message],
    };
  }

  // Scan current production inventory for route whitelist and cannibalization check
  let inventory = options.inventory;
  if (!inventory) {
    try {
      inventory = await scanInventory();
    } catch (err) {
      return {
        success: false,
        state: RESULT_STATES.PROMOTION_VALIDATION_FAILED,
        message: `Failed to scan site inventory: ${err.message}`,
        errors: [err.message],
      };
    }
  }

  const whitelistedRoutes = inventory.routes ? inventory.routes.map((r) => r.path) : [];
  const validationResult = validateDraft(draftContent, { whitelistedRoutes });

  if (!validationResult.valid) {
    if (logToAudit) {
      logEvent({
        action: 'PROMOTE_DRAFT',
        status: 'ERROR',
        summary: `Promotion rejected: Draft "${filename}" failed Phase 3 validation`,
        details: { sourceDraft: filename, errors: validationResult.errors },
      });
    }
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_VALIDATION_FAILED,
      message: `Draft "${filename}" failed validation quality gate and cannot be promoted to production.`,
      slug,
      validation: validationResult,
      errors: validationResult.errors,
    };
  }

  // 5. Final Production Inventory Cannibalization Recheck
  // Parse frontmatter from draft
  const frontmatterMatch = draftContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let parsedTitle = '';
  let parsedCategory = '';
  let parsedTags = [];

  if (frontmatterMatch) {
    const titleMatch = frontmatterMatch[1].match(/^title:\s*["']?(.*?)["']?$/m);
    if (titleMatch) parsedTitle = titleMatch[1].trim();

    const catMatch = frontmatterMatch[1].match(/^category:\s*["']?(.*?)["']?$/m);
    if (catMatch) parsedCategory = catMatch[1].trim();

    const tagsMatch = frontmatterMatch[1].match(/^tags:\s*\[(.*?)\]/m);
    if (tagsMatch) {
      parsedTags = tagsMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }

  const candidate = {
    title: parsedTitle || slug,
    category: parsedCategory || 'Chinese Gender Predictor',
    suggestedSlug: slug,
    primaryKeyword: parsedTitle,
    secondaryKeywords: parsedTags,
  };

  const cannibalizationAnalysis = analyzeTopicCandidate(candidate, inventory);

  if (cannibalizationAnalysis.decision === 'REJECT') {
    if (logToAudit) {
      logEvent({
        action: 'PROMOTE_DRAFT',
        status: 'ERROR',
        summary: `Promotion rejected: Cannibalization conflict for "${parsedTitle}"`,
        details: { sourceDraft: filename, reason: cannibalizationAnalysis.reason, closestMatch: cannibalizationAnalysis.closestMatch },
      });
    }
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
      message: `Promotion rejected due to content cannibalization: ${cannibalizationAnalysis.reason}`,
      slug,
      cannibalization: cannibalizationAnalysis,
      errors: [cannibalizationAnalysis.reason],
    };
  }

  if (cannibalizationAnalysis.decision === 'CAUTION' && !allowCaution) {
    if (logToAudit) {
      logEvent({
        action: 'PROMOTE_DRAFT',
        status: 'WARNING',
        summary: `Promotion blocked: CAUTION-level topical overlap for "${parsedTitle}"`,
        details: { sourceDraft: filename, reason: cannibalizationAnalysis.reason },
      });
    }
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
      message: `Promotion blocked by default on CAUTION-level overlap: ${cannibalizationAnalysis.reason}`,
      slug,
      cannibalization: cannibalizationAnalysis,
      errors: [cannibalizationAnalysis.reason],
    };
  }

  // 6. Safe & Atomic Promotion via Temporary File
  // Ensure productionBlogDir exists
  if (!fs.existsSync(productionBlogDir)) {
    fs.mkdirSync(productionBlogDir, { recursive: true });
  }

  const tempFilename = `.promote-${slug}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.tmp`;
  const tempFilePath = path.join(productionBlogDir, tempFilename);

  try {
    // Write atomically to temporary file first
    fs.writeFileSync(tempFilePath, draftContent, 'utf-8');

    // Double check destination does not exist immediately before rename
    if (fs.existsSync(destinationPath)) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return {
        success: false,
        state: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
        message: `Race condition prevention: Destination "${destinationPath}" was created concurrently. Overwriting blocked.`,
        slug,
        errors: ['Destination file already exists.'],
      };
    }

    // Rename temp file to final production destination
    fs.renameSync(tempFilePath, destinationPath);
  } catch (err) {
    // Clean up temporary file on failure
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (_) {
        // ignore cleanup error
      }
    }
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_VERIFICATION_FAILED,
      message: `File promotion write error: ${err.message}`,
      errors: [err.message],
    };
  }

  // 7. Post-Promotion Verification
  if (!fs.existsSync(destinationPath)) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_VERIFICATION_FAILED,
      message: 'Post-promotion verification failed: Promoted file does not exist at destination.',
      errors: ['Destination file missing after promotion attempt.'],
    };
  }

  const promotedContent = fs.readFileSync(destinationPath, 'utf-8');
  if (promotedContent !== draftContent) {
    // If content doesn't match, remove corrupted file
    try {
      fs.unlinkSync(destinationPath);
    } catch (_) {}
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_VERIFICATION_FAILED,
      message: 'Post-promotion verification failed: Promoted content does not match source draft content.',
      errors: ['Promoted file content mismatch.'],
    };
  }

  // Verify the promoted file independently passes validation
  const postValidation = validateDraft(promotedContent, { whitelistedRoutes });
  if (!postValidation.valid) {
    try {
      fs.unlinkSync(destinationPath);
    } catch (_) {}
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_VERIFICATION_FAILED,
      message: 'Post-promotion verification failed: Promoted file failed schema validation.',
      errors: postValidation.errors,
    };
  }

  // Confirm source draft still exists in drafts directory (do not delete source draft)
  const sourceDraftStillExists = fs.existsSync(resolvedDraftPath);

  // 8. Record Successful Promotion in Audit Log
  if (logToAudit) {
    logEvent({
      action: 'PROMOTE_DRAFT',
      status: 'SUCCESS',
      summary: `Successfully promoted draft "${filename}" to production article "${slug}"`,
      details: {
        sourceDraft: filename,
        destinationSlug: slug,
        productionPath: destinationPath,
        wordCount: validationResult.metrics.wordCount,
        internalLinks: validationResult.metrics.internalLinks,
        faqCount: validationResult.metrics.faqCount,
        sourceDraftPreserved: sourceDraftStillExists,
      },
    });
  }

  return {
    success: true,
    state: RESULT_STATES.PROMOTION_SUCCESS,
    message: `Draft "${filename}" was safely promoted to production at: ${destinationPath}`,
    sourcePath: resolvedDraftPath,
    promotedPath: destinationPath,
    slug,
    validation: validationResult,
    cannibalization: cannibalizationAnalysis,
  };
}

/**
 * CLI Handler for manual or workflow draft promotion.
 */
async function main() {
  const args = process.argv.slice(2);
  let draftFile = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      draftFile = args[i + 1];
      i++;
    } else if (arg.startsWith('--file=')) {
      draftFile = arg.split('=')[1];
    } else if (!arg.startsWith('-') && !draftFile) {
      draftFile = arg;
    }
  }

  console.log('\n======================================================================');
  console.log('  🚀 SEO AUTOPILOT - PHASE 4: DRAFT PROMOTION ENGINE');
  console.log('  Site: Free Gender Predictor (https://freegenderpredictor.com)');
  console.log('======================================================================\n');

  if (!draftFile) {
    console.error('❌ Error: No draft file specified.');
    console.log('Usage:');
    console.log('  node scripts/autopilot/promote-draft.js --file <draft-filename>');
    console.log('Example:');
    console.log('  node scripts/autopilot/promote-draft.js --file chinese-gender-calendar-2027.md\n');
    process.exit(1);
  }

  console.log(`🔍 Inspecting draft: ${draftFile}...`);

  try {
    const result = await promoteDraft(draftFile);

    if (result.success) {
      console.log('\n[Promotion Engine]');
      console.log('  ✓ Draft source path verified');
      console.log('  ✓ Phase 3 schema & quality gate passed');
      console.log('  ✓ Production collision check passed');
      console.log('  ✓ Cannibalization analysis passed');
      console.log('  ✓ Atomic promotion completed');
      console.log('  ✓ Post-promotion validation verified\n');
      console.log('PROMOTED_FILE:');
      console.log(`  ${result.promotedPath}\n`);
      console.log('PROMOTED_SLUG:');
      console.log(`  ${result.slug}\n`);
      console.log('======================================================================');
      console.log('  ✅ PROMOTION STATUS: SUCCESS');
      console.log('======================================================================\n');
      process.exit(0);
    } else {
      console.error('\n[Promotion Engine]');
      console.error(`PROMOTION_FAILED: ${result.state}`);
      console.error(`Reason: ${result.message}\n`);
      if (result.errors && result.errors.length > 0) {
        console.error('Errors:');
        for (const err of result.errors) {
          console.error(`  • ${err}`);
        }
      }
      console.log('\n======================================================================');
      console.log('  ❌ PROMOTION STATUS: REJECTED / FAILED');
      console.log('======================================================================\n');
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Unexpected promotion engine error: ${err.message}`);
    process.exit(1);
  }
}

// Execute CLI only when invoked directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}

export default {
  promoteDraft,
  isSafeFilename,
};
