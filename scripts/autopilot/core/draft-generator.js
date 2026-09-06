import fs from 'node:fs';
import path from 'node:path';
import { autopilotConfig } from './config.js';
import { slugify } from './inventory.js';

/**
 * Format string for safe YAML frontmatter value (escapes quotes and newlines)
 * @param {string} val
 * @returns {string}
 */
function escapeYamlString(val) {
  if (typeof val !== 'string') return `"${String(val || '')}"`;
  return JSON.stringify(val);
}

/**
 * Serializes structured article data into Astro-compatible markdown with YAML frontmatter.
 * @param {object} frontmatter
 * @param {string} markdownBody
 * @returns {string}
 */
export function serializeAstroMarkdown(frontmatter, markdownBody) {
  const lines = ['---'];

  // Required frontmatter fields
  lines.push(`title: ${escapeYamlString(frontmatter.title)}`);
  if (frontmatter.seoTitle) {
    lines.push(`seoTitle: ${escapeYamlString(frontmatter.seoTitle)}`);
  }
  lines.push(`description: ${escapeYamlString(frontmatter.description)}`);

  // Publication date
  const pubDateStr = frontmatter.pubDate
    ? typeof frontmatter.pubDate === 'string'
      ? frontmatter.pubDate.split('T')[0]
      : new Date(frontmatter.pubDate).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  lines.push(`pubDate: ${pubDateStr}`);

  if (frontmatter.updatedDate) {
    const updDateStr = typeof frontmatter.updatedDate === 'string'
      ? frontmatter.updatedDate.split('T')[0]
      : new Date(frontmatter.updatedDate).toISOString().split('T')[0];
    lines.push(`updatedDate: ${updDateStr}`);
  }

  // Authorship
  lines.push(`author: ${escapeYamlString(frontmatter.author || autopilotConfig.schema.defaults.author)}`);
  lines.push(`authorRole: ${escapeYamlString(frontmatter.authorRole || autopilotConfig.schema.defaults.authorRole)}`);
  lines.push(`authorAvatar: ${escapeYamlString(frontmatter.authorAvatar || autopilotConfig.schema.defaults.authorAvatar)}`);

  // Category & Taxonomy
  lines.push(`category: ${escapeYamlString(frontmatter.category)}`);

  const tags = Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0
    ? frontmatter.tags
    : [frontmatter.category, 'Baby Gender Prediction', 'Pregnancy'];
  const formattedTags = tags.map((t) => escapeYamlString(t)).join(', ');
  lines.push(`tags: [${formattedTags}]`);

  // Media
  lines.push(`heroImage: ${escapeYamlString(frontmatter.heroImage || autopilotConfig.heroImageStrategy.defaultHeroImage)}`);
  lines.push(`heroImageAlt: ${escapeYamlString(frontmatter.heroImageAlt || frontmatter.title)}`);

  // Content flags & excerpt
  lines.push(`featured: ${Boolean(frontmatter.featured)}`);
  lines.push(`excerpt: ${escapeYamlString(frontmatter.excerpt)}`);

  // FAQs block
  if (Array.isArray(frontmatter.faqs) && frontmatter.faqs.length > 0) {
    lines.push('faqs:');
    for (const faq of frontmatter.faqs) {
      lines.push(`  - question: ${escapeYamlString(faq.question)}`);
      lines.push(`    answer: ${escapeYamlString(faq.answer)}`);
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(markdownBody.trim());
  lines.push('');

  return lines.join('\n');
}

/**
 * Sanitize candidate slug and prevent path traversal
 * @param {string} rawSlug
 * @returns {string}
 */
export function sanitizeSlug(rawSlug) {
  if (!rawSlug || typeof rawSlug !== 'string') return '';
  // Remove path traversal and directory separators
  const cleaned = rawSlug
    .replace(/[\/\\]/g, '-')
    .replace(/\0/g, '')
    .replace(/\.\./g, '');
  return slugify(cleaned);
}

/**
 * Generates an Astro-compatible draft file in scripts/autopilot/drafts/
 * NEVER writes to production src/content/blog/.
 * @param {object} params
 * @param {object} params.frontmatter - Validated frontmatter metadata
 * @param {string} params.markdownBody - Validated markdown body
 * @param {string} [params.suggestedSlug] - Preferred slug
 * @returns {{
 *   success: boolean,
 *   draftPath?: string,
 *   slug?: string,
 *   filename?: string,
 *   frontmatter?: object,
 *   creationStatus?: string,
 *   error?: string
 * }}
 */
export function createDraft({ frontmatter, markdownBody, suggestedSlug = null }) {
  if (!frontmatter || !markdownBody) {
    return { success: false, error: 'Missing frontmatter or markdownBody' };
  }

  const draftsDir = path.resolve(autopilotConfig.paths.draftsDir);
  const productionBlogDir = path.resolve(autopilotConfig.paths.productionBlogDir);

  // 1. Generate & sanitize slug
  const rawSlug = suggestedSlug || frontmatter.slug || frontmatter.title;
  const slug = sanitizeSlug(rawSlug);

  if (!slug || slug.length < 3) {
    return { success: false, error: `Invalid or unsafe slug derived: "${rawSlug}"` };
  }

  const filename = `${slug}.md`;
  const draftPath = path.resolve(draftsDir, filename);

  // 2. Strict path traversal & production directory boundary enforcement
  const normalizedDraftsDir = path.normalize(draftsDir) + path.sep;
  const normalizedDraftPath = path.normalize(draftPath);

  if (!normalizedDraftPath.startsWith(normalizedDraftsDir)) {
    return {
      success: false,
      error: `Security violation: draft path "${draftPath}" escapes drafts directory "${draftsDir}"`,
    };
  }

  if (normalizedDraftPath.startsWith(path.normalize(productionBlogDir))) {
    return {
      success: false,
      error: `CRITICAL SAFETY VIOLATION: Attempted to write draft to production directory "${productionBlogDir}"`,
    };
  }

  // 3. Ensure drafts directory exists
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true });
  }

  // 4. Serialize document
  const content = serializeAstroMarkdown(frontmatter, markdownBody);

  // 5. Write draft file
  fs.writeFileSync(draftPath, content, 'utf-8');

  return {
    success: true,
    draftPath,
    slug,
    filename,
    frontmatter,
    creationStatus: 'DRAFT_CREATED',
  };
}

export default {
  createDraft,
  serializeAstroMarkdown,
  sanitizeSlug,
};
