import { autopilotConfig } from './config.js';
import { parseMarkdownWithFrontmatter } from './inventory.js';

// Common placeholder markers that must never appear in production content
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bLorem ipsum\b/i,
  /\bInsert content here\b/i,
  /\[PLACEHOLDER\]/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /\[INSERT\b/i,
  /\bASDF\b/i,
];

// Dangerous medical claims that must fail validation (targeted at affirmative claims, not myth-busting)
const MEDICAL_SAFETY_PROHIBITED_PATTERNS = [
  {
    pattern: /(?<!not\s+|never\s+|no\s+|n't\s+)\b(100%\s*accurate|guaranteed\s*(result|boy|girl|accuracy)|foolproof\s*method)\b/i,
    context: /(chinese\s*gender|mayan|ramzi|nub\s*theory|skull\s*theory|baking\s*soda|cravings|heart\s*rate|folk\s*method)/i,
    message: 'Prohibited medical certainty claim: Folk gender prediction methods cannot be claimed as guaranteed or 100% accurate.',
  },
  {
    pattern: /(?<!not\s+|never\s+|no\s+|n't\s+)\b(?:is|are|has\s+been)\s+(?:scientifically|clinically)\s+proven\b|\b(?:scientifically|clinically)\s+proven\s+to\s+(?:predict|determine|guarantee|work)\b/i,
    context: /(chinese\s*gender|mayan\s*gender|baking\s*soda|skull\s*theory|cravings\s*mean)/i,
    message: 'Prohibited clinical claim: Folk methods and unproven theories cannot be claimed as scientifically/clinically proven.',
  },
  {
    pattern: /\b(stop\s*seeing\s*your\s*doctor|skip\s*your\s*ultrasound|you\s*do\s*not\s*need\s*a\s*doctor|disregard\s*(?:medical|doctor)|ignore\s*your\s*doctor)\b/i,
    message: 'Critical safety violation: Content must never advise skipping medical care or ignoring healthcare professionals.',
  },
  {
    pattern: /\b(we\s*diagnose|this\s*tool\s*diagnoses|medical\s*diagnosis\s*guarantee)\b/i,
    message: 'Critical safety violation: Non-clinical tools must never offer medical diagnosis.',
  },
];

/**
 * Counts words accurately excluding frontmatter, code blocks, HTML, and markdown syntax.
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;

  let cleaned = text
    // Strip code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Strip inline code
    .replace(/`[^`]*`/g, '')
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Strip URLs in links [text](http...) -> text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Strip standalone URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    // Strip markdown headers & decorators
    .replace(/^[#\*\-_=~>|]+\s*/gm, '')
    // Replace punctuation with spaces
    .replace(/[^\w\s]/g, ' ');

  const tokens = cleaned.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}

/**
 * Extracts and inspects internal and external links in markdown content.
 * @param {string} markdownBody
 * @returns {{ internalLinks: Array<{ text: string, url: string }>, externalLinks: string[] }}
 */
export function extractLinks(markdownBody) {
  const linkMatches = [...markdownBody.matchAll(/\[([^\]]+)\]\(([^)#\s]+)(?:#[^\)]*)?\)/g)];
  const internalLinks = [];
  const externalLinks = [];

  for (const match of linkMatches) {
    const text = match[1].trim();
    const url = match[2].trim();

    if (/^https?:\/\/|^\/\//i.test(url) || url.startsWith('mailto:')) {
      externalLinks.push(url);
    } else {
      internalLinks.push({ text, url });
    }
  }

  return { internalLinks, externalLinks };
}

/**
 * Validates a blog draft article against quality, schema, safety, and linking standards.
 * Accepts either:
 * - A parsed article object: { frontmatter, markdownBody }
 * - A raw markdown string with YAML frontmatter
 *
 * @param {string|object} input - Raw markdown string or parsed { frontmatter, markdownBody }
 * @param {object} [options]
 * @param {string[]} [options.whitelistedRoutes] - Valid site routes for internal link verification
 * @returns {{
 *   valid: boolean,
 *   errors: string[],
 *   warnings: string[],
 *   metrics: {
 *     wordCount: number,
 *     internalLinks: number,
 *     uniqueInternalLinks: number,
 *     externalLinks: number,
 *     faqCount: number,
 *     h2Count: number,
 *     h3Count: number
 *   }
 * }}
 */
export function validateDraft(input, options = {}) {
  const errors = [];
  const warnings = [];

  // 1. Normalize Input (raw string vs parsed object)
  let frontmatter = null;
  let markdownBody = '';

  if (typeof input === 'string') {
    const parsed = parseMarkdownWithFrontmatter(input);
    frontmatter = parsed.frontmatter;
    markdownBody = parsed.body || '';
  } else if (input && typeof input === 'object') {
    if (input.frontmatter && typeof input.markdownBody === 'string') {
      frontmatter = input.frontmatter;
      markdownBody = input.markdownBody;
    } else if (input.rawContent && typeof input.rawContent === 'string') {
      const parsed = parseMarkdownWithFrontmatter(input.rawContent);
      frontmatter = parsed.frontmatter;
      markdownBody = parsed.body || '';
    }
  }

  if (!frontmatter || typeof frontmatter !== 'object') {
    return {
      valid: false,
      errors: ['Frontmatter is missing, empty, or unparseable.'],
      warnings: [],
      metrics: { wordCount: 0, internalLinks: 0, uniqueInternalLinks: 0, externalLinks: 0, faqCount: 0, h2Count: 0, h3Count: 0 },
    };
  }

  // 2. Frontmatter Required Fields Validation
  const requiredFields = [
    { key: 'title', minLen: 5, label: 'Title' },
    { key: 'description', minLen: 20, label: 'Description' },
    { key: 'category', minLen: 3, label: 'Category' },
    { key: 'heroImage', minLen: 3, label: 'Hero image' },
    { key: 'heroImageAlt', minLen: 5, label: 'Hero image alt' },
    { key: 'excerpt', minLen: 20, label: 'Excerpt' },
  ];

  for (const req of requiredFields) {
    const val = frontmatter[req.key];
    if (!val || typeof val !== 'string' || val.trim().length < req.minLen) {
      errors.push(`Frontmatter field "${req.key}" is missing or does not meet minimum length (${req.minLen} chars).`);
    }
  }

  // Publication date check
  if (!frontmatter.pubDate) {
    errors.push('Frontmatter "pubDate" is missing.');
  } else {
    const parsedDate = new Date(frontmatter.pubDate);
    if (isNaN(parsedDate.getTime())) {
      errors.push(`Frontmatter "pubDate" is not a valid date: "${frontmatter.pubDate}".`);
    }
  }

  // Category whitelist check
  const approvedCategories = autopilotConfig.approvedCategories || [];
  if (frontmatter.category && !approvedCategories.includes(frontmatter.category)) {
    errors.push(`Category "${frontmatter.category}" is not an approved category. Approved: ${approvedCategories.join(', ')}.`);
  }

  // Hero image safety
  if (frontmatter.heroImage) {
    if (/^https?:\/\/|^\/\//i.test(frontmatter.heroImage)) {
      errors.push(`Unsafe remote heroImage URL: "${frontmatter.heroImage}". Only local paths (e.g., /logo.svg) are permitted.`);
    } else if (!frontmatter.heroImage.startsWith('/')) {
      errors.push(`Hero image path must be root-relative starting with "/": "${frontmatter.heroImage}".`);
    }
  }

  // Optional fields structural check
  if (frontmatter.tags !== undefined && !Array.isArray(frontmatter.tags)) {
    errors.push('Frontmatter "tags" must be an array of strings.');
  }

  // 3. Word Count Validation
  const wordCount = countWords(markdownBody);
  const hardMinWords = autopilotConfig.articleRules?.wordCount?.min || 1200;
  const hardMaxWords = autopilotConfig.articleRules?.wordCount?.max || 2500;
  const editorialMinWords = autopilotConfig.ai?.generationTarget?.wordCount?.min || 1800;

  if (wordCount < hardMinWords) {
    errors.push(`Word count (${wordCount}) is below production minimum threshold of ${hardMinWords} words.`);
  } else if (wordCount > hardMaxWords) {
    errors.push(`Word count (${wordCount}) exceeds maximum threshold of ${hardMaxWords} words.`);
  } else if (wordCount < editorialMinWords) {
    warnings.push(`Word count (${wordCount}) meets minimum production safety (${hardMinWords}) but is below preferred editorial target (${editorialMinWords} words).`);
  }

  // 4. Content Structure Validation
  // Headings analysis
  const h1Matches = [...markdownBody.matchAll(/^#\s+(.+)$/gm)];
  const h2Matches = [...markdownBody.matchAll(/^##\s+(.+)$/gm)];
  const h3Matches = [...markdownBody.matchAll(/^###\s+(.+)$/gm)];

  const h2Count = h2Matches.length;
  const h3Count = h3Matches.length;

  if (h1Matches.length > 1) {
    errors.push(`Found ${h1Matches.length} H1 headings in markdown body. Articles must contain at most one H1 heading.`);
  }

  const minH2 = autopilotConfig.articleRules?.headings?.minH2 || 3;
  if (h2Count < minH2) {
    errors.push(`Article body contains only ${h2Count} H2 section(s). Long-form articles require at least ${minH2} H2 sections.`);
  }

  // Check for placeholder text
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(markdownBody)) {
      errors.push(`Article contains placeholder or template content matching pattern: ${pattern.toString()}`);
      break;
    }
  }

  // Reject empty / trivial bodies
  if (!markdownBody || markdownBody.trim().length < 300) {
    errors.push('Article body is empty, missing, or trivially short.');
  }

  // 5. Internal Links Validation
  const { internalLinks, externalLinks } = extractLinks(markdownBody);
  const uniqueInternalUrls = new Set(internalLinks.map((l) => l.url));
  const minInternalLinks = autopilotConfig.internalLinking?.minLinks || 4;

  if (uniqueInternalUrls.size < minInternalLinks) {
    errors.push(`Found ${uniqueInternalUrls.size} unique internal link(s). Minimum required is ${minInternalLinks}.`);
  }

  // Verify internal link syntax & boundaries
  const whitelistedRoutes = options.whitelistedRoutes || [];
  const whitelistSet = new Set(whitelistedRoutes);

  for (const link of internalLinks) {
    const url = link.url;

    // Path traversal or non-root relative links
    if (url.includes('..') || url.includes('\\') || !url.startsWith('/')) {
      errors.push(`Path traversal or illegal relative internal link detected: "${url}". Internal links must be root-relative starting with "/".`);
    }

    // Trailing slash check per site config trailingSlash: "never"
    if (url.length > 1 && url.endsWith('/')) {
      errors.push(`Internal link "${url}" violates site "trailingSlash: never" rule. Must be "${url.replace(/\/+$/, '')}".`);
    }

    // Whitelist check (if whitelistedRoutes was provided)
    if (whitelistSet.size > 0 && !whitelistSet.has(url)) {
      errors.push(`Internal link "${url}" is not a recognized or whitelisted route in site inventory.`);
    }
  }

  // 6. FAQ Validation
  const faqs = frontmatter.faqs;
  const minFaqs = autopilotConfig.articleRules?.faqs?.min || 4;
  const maxFaqs = autopilotConfig.articleRules?.faqs?.max || 8;
  let faqCount = 0;

  if (!Array.isArray(faqs)) {
    errors.push('Frontmatter "faqs" must be an array of questions and answers.');
  } else {
    faqCount = faqs.length;
    if (faqCount < minFaqs) {
      errors.push(`Article has ${faqCount} FAQ item(s). Minimum required is ${minFaqs}.`);
    } else if (faqCount > maxFaqs) {
      errors.push(`Article has ${faqCount} FAQ item(s). Maximum allowed is ${maxFaqs}.`);
    }

    const seenQuestions = new Set();
    for (let i = 0; i < faqs.length; i++) {
      const item = faqs[i];
      if (!item || typeof item !== 'object') {
        errors.push(`FAQ item #${i + 1} is not a valid object.`);
        continue;
      }
      if (!item.question || typeof item.question !== 'string' || item.question.trim().length < 5) {
        errors.push(`FAQ #${i + 1} has an empty or invalid question.`);
      }
      if (!item.answer || typeof item.answer !== 'string' || item.answer.trim().length < 10) {
        errors.push(`FAQ #${i + 1} has an empty or invalid answer.`);
      }

      // Check duplicate FAQ questions
      if (item.question) {
        const normQ = item.question.toLowerCase().replace(/[^\w\s]/g, '').trim();
        if (seenQuestions.has(normQ)) {
          errors.push(`Duplicate FAQ question detected: "${item.question}".`);
        }
        seenQuestions.add(normQ);
      }
    }
  }

  // 7. Medical Safety & Niche Quality Guardrails
  for (const rule of MEDICAL_SAFETY_PROHIBITED_PATTERNS) {
    if (rule.context) {
      // Must match pattern AND have nearby folk context
      if (rule.pattern.test(markdownBody) && rule.context.test(markdownBody)) {
        errors.push(`Medical safety violation: ${rule.message}`);
      }
    } else if (rule.pattern.test(markdownBody)) {
      errors.push(`Medical safety violation: ${rule.message}`);
    }
  }

  const isValid = errors.length === 0;

  return {
    valid: isValid,
    errors,
    warnings,
    metrics: {
      wordCount,
      internalLinks: internalLinks.length,
      uniqueInternalLinks: uniqueInternalUrls.size,
      externalLinks: externalLinks.length,
      faqCount,
      h2Count,
      h3Count,
    },
  };
}

export default {
  validateDraft,
  countWords,
  extractLinks,
};
