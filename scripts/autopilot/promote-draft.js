import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { validateDraft } from './core/validator.js';
import { scanInventory } from './core/inventory.js';
import { analyzeTopicCandidate } from './core/gap-analyzer.js';
import { logEvent } from './core/audit-logger.js';
import { readRunManifest, updateRunManifest } from './core/manifest.js';

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
 * When options.manifest is provided (or when draftPath is omitted and currentRunManifest exists),
 * only the exact validated draft generated during the current run is promoted.
 * 
 * @param {string|object} [draftPathOrOptions] - Path to draft file, or options object
 * @param {object} [options]
 * @param {string} [options.manifest] - Path to run manifest (promotes current-run validated draft)
 * @param {string} [options.runId] - Optional run identifier to verify draft ownership
 * @param {string} [options.draftsDir] - Custom drafts directory (useful for isolated testing)
 * @param {string} [options.productionBlogDir] - Custom production blog directory (for isolated testing)
 * @param {boolean} [options.allowCaution] - Whether to allow CAUTION-level topic promotion (default: false)
 * @param {boolean} [options.logToAudit] - Whether to record into audit log (default: true)
 * @param {object} [options.inventory] - Pre-scanned inventory object (optional override)
 * @returns {Promise<{
 *   success: boolean,
 *   state: string,
 *   message: string,
 *   runId?: string|null,
 *   sourcePath?: string,
 *   promotedPath?: string,
 *   slug?: string,
 *   validation?: object,
 *   cannibalization?: object,
 *   errors?: string[]
 * }>}
 */
export async function promoteDraft(draftPathOrOptions, options = {}) {
  let draftPath = draftPathOrOptions;
  let mergedOptions = { ...options };

  if (draftPathOrOptions && typeof draftPathOrOptions === 'object' && !Array.isArray(draftPathOrOptions)) {
    mergedOptions = { ...draftPathOrOptions, ...options };
    draftPath = mergedOptions.file || mergedOptions.draftPath || null;
  }

  let manifestData = null;
  let targetManifestPath = mergedOptions.manifest || null;

  // If manifest explicitly passed, or no draftPath passed and default manifest exists
  if (targetManifestPath || (!draftPath && fs.existsSync(autopilotConfig.paths.currentRunManifest))) {
    const resolvedManifestPath = path.resolve(targetManifestPath || autopilotConfig.paths.currentRunManifest);
    targetManifestPath = resolvedManifestPath;
    manifestData = readRunManifest(resolvedManifestPath);

    if (!manifestData) {
      return {
        success: false,
        state: RESULT_STATES.PROMOTION_FILE_NOT_FOUND,
        message: `Run manifest not found or invalid at: ${resolvedManifestPath}`,
        errors: [`Manifest missing or unreadable: ${resolvedManifestPath}`],
      };
    }

    // Check manifest status for expected non-promotable states
    if (manifestData.resultState === RESULT_STATES.DRY_RUN_COMPLETE || manifestData.mode === 'dry-run') {
      return {
        success: true,
        state: RESULT_STATES.NO_PROMOTION_REQUIRED,
        message: 'Current run was executed in dry-run mode. Zero drafts to promote.',
        runId: manifestData.runId,
      };
    }

    if (manifestData.resultState === RESULT_STATES.NO_STRONG_TOPIC_FOUND || manifestData.status === 'NO_STRONG_TOPIC_FOUND') {
      return {
        success: true,
        state: RESULT_STATES.NO_PROMOTION_REQUIRED,
        message: 'No safe topic was available in current run. Zero drafts to promote.',
        runId: manifestData.runId,
      };
    }

    if (manifestData.status === 'PROMOTED' || manifestData.promotion?.status === 'SUCCESS') {
      return {
        success: true,
        state: RESULT_STATES.NO_PROMOTION_REQUIRED,
        message: `Draft for run "${manifestData.runId}" was already promoted.`,
        runId: manifestData.runId,
        promotedPath: manifestData.promotion?.promotedPath,
      };
    }

    if (manifestData.status !== 'VALIDATED' || !manifestData.draft?.draftPath || !manifestData.validation?.valid) {
      return {
        success: false,
        state: RESULT_STATES.CURRENT_RUN_DRAFT_INVALID,
        message: `Current run draft is invalid or unvalidated (status: ${manifestData.status || 'unknown'}, state: ${manifestData.resultState || 'unknown'}). Promotion aborted.`,
        runId: manifestData.runId,
        errors: manifestData.errors && manifestData.errors.length > 0 ? manifestData.errors : ['Current run draft did not pass Phase 3 validation.'],
      };
    }

    draftPath = manifestData.draft.draftPath;
    mergedOptions.runId = manifestData.runId;
  }

  const draftsDir = path.resolve(mergedOptions.draftsDir || autopilotConfig.paths.draftsDir);
  const productionBlogDir = path.resolve(mergedOptions.productionBlogDir || autopilotConfig.paths.productionBlogDir);
  const allowCaution = mergedOptions.allowCaution ?? false;
  const logToAudit = mergedOptions.logToAudit ?? true;
  const effectiveRunId = mergedOptions.runId || manifestData?.runId || null;
  const isDefaultManifest = Boolean(targetManifestPath && path.resolve(targetManifestPath) === path.resolve(autopilotConfig.paths.currentRunManifest));
  const isDefaultProdDir = productionBlogDir === path.resolve(autopilotConfig.paths.productionBlogDir);
  const reselectOnCollision = mergedOptions.reselectOnCollision ?? (isDefaultManifest && isDefaultProdDir);
  const currentReselectionCount = mergedOptions.reselectionCount ?? manifestData?.reselectionCount ?? 0;
  const maxReselections = mergedOptions.maxReselections ?? autopilotConfig.ai.maxTopicReselections ?? 3;

  // 1. Resolve and Validate Source Path Safety
  if (!draftPath || typeof draftPath !== 'string') {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_UNSAFE_PATH,
      message: 'Draft path must be a non-empty string.',
      errors: ['Draft path is missing or invalid.'],
    };
  }

  // Resolve absolute path (handles flat or subfolder run-isolated paths)
  const resolvedDraftPath = path.isAbsolute(draftPath)
    ? path.resolve(draftPath)
    : path.resolve(draftsDir, draftPath);

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

    // Scan current production inventory for route whitelist and cannibalization check
  let inventory = mergedOptions.inventory;
  const inventoryScanTimestamp = new Date().toISOString();
  if (!inventory) {
    try {
      inventory = await scanInventory();
    } catch (err) {
      return {
        success: false,
        state: RESULT_STATES.PROMOTION_VALIDATION_FAILED,
        message: `Failed to scan site inventory: ${err.message}`,
        runId: effectiveRunId,
        errors: [err.message],
      };
    }
  }

  const whitelistedRoutes = inventory.routes ? inventory.routes.map((r) => r.path) : [];

  // Check for existing production slug collision against fresh inventory
  if (fs.existsSync(destinationPath) || (inventory.existingSlugs && inventory.existingSlugs.has(slug))) {
    if (reselectOnCollision) {
      if (manifestData && targetManifestPath) {
        updateRunManifest({
          status: 'DRAFT_ABANDONED_COLLISION',
          resultState: RESULT_STATES.DRAFT_ABANDONED_COLLISION,
          isPromotable: false,
          abandonedDraft: {
            slug,
            draftPath: resolvedDraftPath,
            reason: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
          },
          promotion: {
            status: 'COLLISION_ABANDONED',
            reason: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
            timestamp: new Date().toISOString(),
          },
          errors: [`Production slug collision: "${slug}" already published. Draft safely abandoned.`],
        }, targetManifestPath);
      }

      console.warn(`\n⚠️  Promotion collision detected: Production article already exists for slug "${slug}".`);
      console.warn(`🗑️  Safely abandoning conflicting current draft: ${resolvedDraftPath}`);

      if (currentReselectionCount >= maxReselections) {
        console.error(`❌ Bounded reselection limit reached (${currentReselectionCount}/${maxReselections}). Halting to prevent infinite loops.`);
        return {
          success: false,
          state: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
          message: `Promotion rejected: A production article with slug "${slug}" already exists in ${productionBlogDir}. Maximum reselection limit reached.`,
          slug,
          runId: effectiveRunId,
          errors: [`Production slug collision: "${slug}" already published. Reselection limit reached.`],
        };
      }

      console.log(`🔄 Re-scanning fresh inventory and automatically selecting another SAFE topic (reselection ${currentReselectionCount + 1}/${maxReselections})...\n`);

      const { runAutopilot } = await import('./index.js');
      const newRunResult = await runAutopilot({
        generate: true,
        runId: effectiveRunId,
        allowCaution,
        candidates: mergedOptions.candidates,
        maxTopicReselections: maxReselections,
        reselectionCount: currentReselectionCount + 1,
        excludedSlugs: [slug, ...(manifestData?.excludedSlugs || [])],
        excludedTitles: [slug, manifestData?.selectedTopic?.title || '', ...(manifestData?.excludedTitles || [])].filter(Boolean),
        excludedTopicIds: [manifestData?.selectedTopic?.id || ''].filter(Boolean),
      });

      if (newRunResult.success && newRunResult.state === RESULT_STATES.VALIDATED_DRAFT_CREATED) {
        console.log(`🎯 Promoting newly generated SAFE topic: "${newRunResult.topic?.title || newRunResult.slug}"...`);
        return await promoteDraft(null, {
          ...mergedOptions,
          manifest: targetManifestPath || autopilotConfig.paths.currentRunManifest,
          reselectionCount: currentReselectionCount + 1,
          reselectOnCollision: true,
        });
      }

      if (newRunResult.state === RESULT_STATES.NO_STRONG_TOPIC_FOUND) {
        return {
          success: true,
          state: RESULT_STATES.NO_PROMOTION_REQUIRED,
          message: 'No further SAFE topic candidates available after collision. Zero drafts to promote.',
          runId: effectiveRunId,
        };
      }

      return {
        success: false,
        state: newRunResult.state || RESULT_STATES.PROMOTION_VALIDATION_FAILED,
        message: `Reselected topic generation failed with state: ${newRunResult.state}`,
        runId: effectiveRunId,
        errors: [newRunResult.error || 'Reselection generation failed.'],
      };
    }

    if (manifestData && targetManifestPath) {
      updateRunManifest({
        status: 'PROMOTION_FAILED',
        resultState: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
        promotion: {
          status: 'REJECTED',
          reason: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
          timestamp: new Date().toISOString(),
        },
        errors: [`Production slug collision: "${slug}" already published.`],
      }, targetManifestPath);
    }

    if (logToAudit) {
      logEvent({
        action: 'PROMOTE_DRAFT',
        status: 'ERROR',
        summary: `Promotion rejected: Production article already exists for slug "${slug}"`,
        details: {
          runId: effectiveRunId,
          inventoryScanTimestamp,
          selectedTopic: slug,
          selectedSlug: slug,
          exactGeneratedDraftPath: resolvedDraftPath,
          exactValidatedDraftPath: resolvedDraftPath,
          exactPromotedDraftPath: null,
          finalResultState: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
          sourceDraft: filename,
          destinationSlug: slug,
          reason: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
        },
      });
    }

    return {
      success: false,
      state: RESULT_STATES.PRODUCTION_SLUG_EXISTS,
      message: `Promotion rejected: A production article with slug "${slug}" already exists in ${productionBlogDir}. Overwriting is strictly prohibited.`,
      slug,
      runId: effectiveRunId,
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
      runId: effectiveRunId,
      errors: [err.message],
    };
  }

  const validationResult = validateDraft(draftContent, { whitelistedRoutes });

  if (!validationResult.valid) {
    if (manifestData && targetManifestPath) {
      updateRunManifest({
        status: 'PROMOTION_FAILED',
        resultState: RESULT_STATES.PROMOTION_VALIDATION_FAILED,
        errors: validationResult.errors,
      }, targetManifestPath);
    }

    if (logToAudit) {
      logEvent({
        action: 'PROMOTE_DRAFT',
        status: 'ERROR',
        summary: `Promotion rejected: Draft "${filename}" failed Phase 3 validation`,
        details: {
          runId: effectiveRunId,
          inventoryScanTimestamp,
          selectedTopic: slug,
          selectedSlug: slug,
          exactGeneratedDraftPath: resolvedDraftPath,
          exactValidatedDraftPath: resolvedDraftPath,
          exactPromotedDraftPath: null,
          finalResultState: RESULT_STATES.PROMOTION_VALIDATION_FAILED,
          sourceDraft: filename,
          errors: validationResult.errors,
        },
      });
    }
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_VALIDATION_FAILED,
      message: `Draft "${filename}" failed validation quality gate and cannot be promoted to production.`,
      slug,
      runId: effectiveRunId,
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
    if (reselectOnCollision) {
      const collisionReason = cannibalizationAnalysis.reason;
      if (manifestData && targetManifestPath) {
        updateRunManifest({
          status: 'DRAFT_ABANDONED_COLLISION',
          resultState: RESULT_STATES.DRAFT_ABANDONED_COLLISION,
          isPromotable: false,
          abandonedDraft: {
            slug,
            draftPath: resolvedDraftPath,
            reason: collisionReason,
          },
          promotion: {
            status: 'COLLISION_ABANDONED',
            reason: collisionReason,
            timestamp: new Date().toISOString(),
          },
          errors: [`Promotion cannibalization collision for "${parsedTitle}": ${collisionReason}. Draft safely abandoned.`],
        }, targetManifestPath);
      }

      console.warn(`\n⚠️  Promotion collision detected: Cannibalization conflict for "${parsedTitle}": ${collisionReason}`);
      console.warn(`🗑️  Safely abandoning conflicting current draft: ${resolvedDraftPath}`);

      if (currentReselectionCount >= maxReselections) {
        console.error(`❌ Bounded reselection limit reached (${currentReselectionCount}/${maxReselections}). Halting to prevent infinite loops.`);
        return {
          success: false,
          state: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
          message: `Promotion rejected due to content cannibalization: ${collisionReason}. Maximum reselection limit reached.`,
          slug,
          runId: effectiveRunId,
          cannibalization: cannibalizationAnalysis,
          errors: [collisionReason],
        };
      }

      console.log(`🔄 Re-scanning fresh inventory and automatically selecting another SAFE topic (reselection ${currentReselectionCount + 1}/${maxReselections})...\n`);

      const { runAutopilot } = await import('./index.js');
      const newRunResult = await runAutopilot({
        generate: true,
        runId: effectiveRunId,
        allowCaution,
        candidates: mergedOptions.candidates,
        maxTopicReselections: maxReselections,
        reselectionCount: currentReselectionCount + 1,
        excludedSlugs: [slug, ...(manifestData?.excludedSlugs || [])],
        excludedTitles: [parsedTitle, slug, manifestData?.selectedTopic?.title || '', ...(manifestData?.excludedTitles || [])].filter(Boolean),
        excludedTopicIds: [manifestData?.selectedTopic?.id || ''].filter(Boolean),
      });

      if (newRunResult.success && newRunResult.state === RESULT_STATES.VALIDATED_DRAFT_CREATED) {
        console.log(`🎯 Promoting newly generated SAFE topic: "${newRunResult.topic?.title || newRunResult.slug}"...`);
        return await promoteDraft(null, {
          ...mergedOptions,
          manifest: targetManifestPath || autopilotConfig.paths.currentRunManifest,
          reselectionCount: currentReselectionCount + 1,
          reselectOnCollision: true,
        });
      }

      if (newRunResult.state === RESULT_STATES.NO_STRONG_TOPIC_FOUND) {
        return {
          success: true,
          state: RESULT_STATES.NO_PROMOTION_REQUIRED,
          message: 'No further SAFE topic candidates available after collision. Zero drafts to promote.',
          runId: effectiveRunId,
        };
      }

      return {
        success: false,
        state: newRunResult.state || RESULT_STATES.PROMOTION_VALIDATION_FAILED,
        message: `Reselected topic generation failed with state: ${newRunResult.state}`,
        runId: effectiveRunId,
        errors: [newRunResult.error || 'Reselection generation failed.'],
      };
    }

    if (manifestData && targetManifestPath) {
      updateRunManifest({
        status: 'PROMOTION_FAILED',
        resultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
        errors: [cannibalizationAnalysis.reason],
      }, targetManifestPath);
    }

    if (logToAudit) {
      logEvent({
        action: 'PROMOTE_DRAFT',
        status: 'ERROR',
        summary: `Promotion rejected: Cannibalization conflict for "${parsedTitle}"`,
        details: {
          runId: effectiveRunId,
          inventoryScanTimestamp,
          selectedTopic: parsedTitle || slug,
          selectedSlug: slug,
          exactGeneratedDraftPath: resolvedDraftPath,
          exactValidatedDraftPath: resolvedDraftPath,
          exactPromotedDraftPath: null,
          finalResultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
          sourceDraft: filename,
          reason: cannibalizationAnalysis.reason,
          closestMatch: cannibalizationAnalysis.closestMatch,
        },
      });
    }
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
      message: `Promotion rejected due to content cannibalization: ${cannibalizationAnalysis.reason}`,
      slug,
      runId: effectiveRunId,
      cannibalization: cannibalizationAnalysis,
      errors: [cannibalizationAnalysis.reason],
    };
  }

  if (cannibalizationAnalysis.decision === 'CAUTION' && !allowCaution) {
    if (reselectOnCollision) {
      const collisionReason = cannibalizationAnalysis.reason;
      if (manifestData && targetManifestPath) {
        updateRunManifest({
          status: 'DRAFT_ABANDONED_COLLISION',
          resultState: RESULT_STATES.DRAFT_ABANDONED_COLLISION,
          isPromotable: false,
          abandonedDraft: {
            slug,
            draftPath: resolvedDraftPath,
            reason: collisionReason,
          },
          promotion: {
            status: 'COLLISION_ABANDONED',
            reason: collisionReason,
            timestamp: new Date().toISOString(),
          },
          errors: [`Promotion CAUTION collision for "${parsedTitle}": ${collisionReason}. Draft safely abandoned.`],
        }, targetManifestPath);
      }

      console.warn(`\n⚠️  Promotion collision detected: CAUTION overlap for "${parsedTitle}": ${collisionReason}`);
      console.warn(`🗑️  Safely abandoning conflicting current draft: ${resolvedDraftPath}`);

      if (currentReselectionCount >= maxReselections) {
        console.error(`❌ Bounded reselection limit reached (${currentReselectionCount}/${maxReselections}). Halting to prevent infinite loops.`);
        return {
          success: false,
          state: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
          message: `Promotion blocked by default on CAUTION-level overlap: ${collisionReason}. Maximum reselection limit reached.`,
          slug,
          runId: effectiveRunId,
          cannibalization: cannibalizationAnalysis,
          errors: [collisionReason],
        };
      }

      console.log(`🔄 Re-scanning fresh inventory and automatically selecting another SAFE topic (reselection ${currentReselectionCount + 1}/${maxReselections})...\n`);

      const { runAutopilot } = await import('./index.js');
      const newRunResult = await runAutopilot({
        generate: true,
        runId: effectiveRunId,
        allowCaution,
        candidates: mergedOptions.candidates,
        maxTopicReselections: maxReselections,
        reselectionCount: currentReselectionCount + 1,
        excludedSlugs: [slug, ...(manifestData?.excludedSlugs || [])],
        excludedTitles: [parsedTitle, slug, manifestData?.selectedTopic?.title || '', ...(manifestData?.excludedTitles || [])].filter(Boolean),
        excludedTopicIds: [manifestData?.selectedTopic?.id || ''].filter(Boolean),
      });

      if (newRunResult.success && newRunResult.state === RESULT_STATES.VALIDATED_DRAFT_CREATED) {
        console.log(`🎯 Promoting newly generated SAFE topic: "${newRunResult.topic?.title || newRunResult.slug}"...`);
        return await promoteDraft(null, {
          ...mergedOptions,
          manifest: targetManifestPath || autopilotConfig.paths.currentRunManifest,
          reselectionCount: currentReselectionCount + 1,
          reselectOnCollision: true,
        });
      }

      if (newRunResult.state === RESULT_STATES.NO_STRONG_TOPIC_FOUND) {
        return {
          success: true,
          state: RESULT_STATES.NO_PROMOTION_REQUIRED,
          message: 'No further SAFE topic candidates available after collision. Zero drafts to promote.',
          runId: effectiveRunId,
        };
      }

      return {
        success: false,
        state: newRunResult.state || RESULT_STATES.PROMOTION_VALIDATION_FAILED,
        message: `Reselected topic generation failed with state: ${newRunResult.state}`,
        runId: effectiveRunId,
        errors: [newRunResult.error || 'Reselection generation failed.'],
      };
    }

    if (manifestData && targetManifestPath) {
      updateRunManifest({
        status: 'PROMOTION_FAILED',
        resultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
        errors: [cannibalizationAnalysis.reason],
      }, targetManifestPath);
    }

    if (logToAudit) {
      logEvent({
        action: 'PROMOTE_DRAFT',
        status: 'WARNING',
        summary: `Promotion blocked: CAUTION-level topical overlap for "${parsedTitle}"`,
        details: {
          runId: effectiveRunId,
          inventoryScanTimestamp,
          selectedTopic: parsedTitle || slug,
          selectedSlug: slug,
          exactGeneratedDraftPath: resolvedDraftPath,
          exactValidatedDraftPath: resolvedDraftPath,
          exactPromotedDraftPath: null,
          finalResultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
          sourceDraft: filename,
          reason: cannibalizationAnalysis.reason,
        },
      });
    }
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
      message: `Promotion blocked by default on CAUTION-level overlap: ${cannibalizationAnalysis.reason}`,
      slug,
      runId: effectiveRunId,
      cannibalization: cannibalizationAnalysis,
      errors: [cannibalizationAnalysis.reason],
    };
  }

  // 6. Safe & Atomic Promotion via Temporary File
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
        runId: effectiveRunId,
        errors: ['Destination file already exists.'],
      };
    }

    // Rename temp file to final production destination
    fs.renameSync(tempFilePath, destinationPath);
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (_) {}
    }
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_VERIFICATION_FAILED,
      message: `File promotion write error: ${err.message}`,
      runId: effectiveRunId,
      errors: [err.message],
    };
  }

  // 7. Post-Promotion Verification
  if (!fs.existsSync(destinationPath)) {
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_VERIFICATION_FAILED,
      message: 'Post-promotion verification failed: Promoted file does not exist at destination.',
      runId: effectiveRunId,
      errors: ['Destination file missing after promotion attempt.'],
    };
  }

  const promotedContent = fs.readFileSync(destinationPath, 'utf-8');
  if (promotedContent !== draftContent) {
    try {
      fs.unlinkSync(destinationPath);
    } catch (_) {}
    return {
      success: false,
      state: RESULT_STATES.PROMOTION_VERIFICATION_FAILED,
      message: 'Post-promotion verification failed: Promoted content does not match source draft content.',
      runId: effectiveRunId,
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
      runId: effectiveRunId,
      errors: postValidation.errors,
    };
  }

  // Confirm source draft still exists in drafts directory (do not delete source draft)
  const sourceDraftStillExists = fs.existsSync(resolvedDraftPath);

  // Update manifest if operating within a transaction
  if (manifestData && targetManifestPath) {
    updateRunManifest({
      status: 'PROMOTED',
      resultState: RESULT_STATES.PROMOTION_SUCCESS,
      promotion: {
        status: 'SUCCESS',
        promotedPath: destinationPath,
        promotedAt: new Date().toISOString(),
        slug,
      },
    }, targetManifestPath);
  }

  // 8. Record Successful Promotion in Audit Log
  if (logToAudit) {
    logEvent({
      action: 'PROMOTE_DRAFT',
      status: 'SUCCESS',
      summary: `Successfully promoted draft "${filename}" to production article "${slug}"`,
      details: {
        runId: effectiveRunId,
        inventoryScanTimestamp,
        selectedTopic: parsedTitle || slug,
        selectedSlug: slug,
        exactGeneratedDraftPath: resolvedDraftPath,
        exactValidatedDraftPath: resolvedDraftPath,
        exactPromotedDraftPath: destinationPath,
        finalResultState: RESULT_STATES.PROMOTION_SUCCESS,
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
    runId: effectiveRunId,
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
  let manifestFile = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      draftFile = args[i + 1];
      i++;
    } else if (arg.startsWith('--file=')) {
      draftFile = arg.split('=')[1];
    } else if (arg === '--manifest' || arg === '-m') {
      manifestFile = args[i + 1];
      i++;
    } else if (arg.startsWith('--manifest=')) {
      manifestFile = arg.slice('--manifest='.length);
    } else if (!arg.startsWith('-') && !draftFile) {
      draftFile = arg;
    }
  }

  // If no explicit draft file or manifest was passed, check for default current run manifest
  if (!draftFile && !manifestFile && fs.existsSync(autopilotConfig.paths.currentRunManifest)) {
    manifestFile = autopilotConfig.paths.currentRunManifest;
  }

  console.log('\n======================================================================');
  console.log('  🚀 SEO AUTOPILOT - PHASE 4: DRAFT PROMOTION ENGINE');
  console.log('  Site: Free Gender Predictor (https://freegenderpredictor.com)');
  console.log('======================================================================\n');

  if (!draftFile && !manifestFile) {
    console.error('❌ Error: No draft file or manifest specified, and no current run manifest found.');
    console.log('Usage:');
    console.log('  node scripts/autopilot/promote-draft.js --manifest scripts/autopilot/.current-run.json');
    console.log('  node scripts/autopilot/promote-draft.js --file <draft-filename>');
    console.log('Example:');
    console.log('  node scripts/autopilot/promote-draft.js --manifest=scripts/autopilot/.current-run.json\n');
    process.exit(1);
  }

  if (manifestFile) {
    console.log(`🔍 Inspecting run manifest: ${manifestFile}...`);
  } else {
    console.log(`🔍 Inspecting draft file: ${draftFile}...`);
  }

  try {
    const result = manifestFile
      ? await promoteDraft(null, { manifest: manifestFile })
      : await promoteDraft(draftFile);

    if (result.state === RESULT_STATES.NO_PROMOTION_REQUIRED) {
      console.log('\n[Promotion Engine]');
      console.log(`  ℹ️  ${result.message}`);
      console.log('======================================================================');
      console.log('  ✅ STATUS: NO_PROMOTION_REQUIRED (Clean safe exit)');
      console.log('======================================================================\n');
      process.exit(0);
    }

    if (result.success) {
      console.log('\n[Promotion Engine]');
      console.log(`  ✓ Current run verified (Run ID: ${result.runId || 'manual'})`);
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
