import { autopilotConfig } from './config.js';

/**
 * Builds the comprehensive editorial prompt for AI article generation.
 * @param {object} params
 * @param {object} params.topic - Selected candidate topic from topic-seeds.json
 * @param {string} [params.category] - Article category
 * @param {string} [params.targetKeyword] - Primary keyword
 * @param {string} [params.searchIntent] - Search intent (informational, comparative, how-to, myth-busting)
 * @param {object} params.inventory - Current site inventory
 * @param {Array<string|object>} params.whitelistedRoutes - Valid internal routes discovered from site
 * @param {object} params.heroImageMapping - Hero image configuration for this category
 * @returns {{ systemInstruction: string, prompt: string, whitelistedPaths: string[] }}
 */
export function buildArticlePrompt({
  topic,
  category,
  targetKeyword,
  searchIntent,
  inventory: _inventory = null,
  whitelistedRoutes = [],
  heroImageMapping = null,
}) {
  const finalCategory = category || topic.category || 'Chinese Gender Predictor';
  const primaryKw = targetKeyword || topic.primaryKeyword || topic.title;
  const secondaryKws = topic.secondaryKeywords || [];
  const intent = searchIntent || topic.searchIntent || 'informational';
  const targetWords = autopilotConfig.ai.generationTarget.wordCount.target || 2000;
  const minWords = autopilotConfig.ai.generationTarget.wordCount.min || 1800;
  const maxWords = autopilotConfig.ai.generationTarget.wordCount.max || 2500;
  const minLinks = autopilotConfig.ai.generationTarget.minInternalLinks || 4;

  // Extract path strings from whitelistedRoutes
  const allowedPaths = whitelistedRoutes.map((r) => (typeof r === 'string' ? r : r.path)).filter(Boolean);

  // Determine hero image mapping
  const categoryConfig =
    heroImageMapping ||
    autopilotConfig.heroImageStrategy.categoryFallbacks[finalCategory] || {
      heroImage: autopilotConfig.heroImageStrategy.defaultHeroImage,
      altSuffix: autopilotConfig.heroImageStrategy.defaultHeroAlt,
    };
  const heroImage = categoryConfig.heroImage || autopilotConfig.heroImageStrategy.defaultHeroImage;
  const heroImageAlt = `${topic.title} - ${categoryConfig.altSuffix || 'Baby Gender Prediction Guide'}`;

  // System instruction with editorial guidelines & strict safety rules
  const systemInstruction = `You are a Senior Pregnancy Health & Cultural Research Journalist writing for Free Gender Predictor (https://freegenderpredictor.com).
Your mission is to produce authoritative, fascinating, medically accurate, and empathetic pregnancy content.

CRITICAL MEDICAL & EDITORIAL SAFETY GUIDELINES:
1. Clear Cultural/Entertainment vs Medical Distinction:
   - Always clearly state that traditional methods (Chinese Gender Chart, Mayan Gender Predictor, Ramzi Theory, Nub Theory, Skull Theory, cravings, fetal heart rate, baking soda, old wives' tales) are folk traditions and entertainment tools.
   - None of these folk methods or unproven theories have scientific or medical accuracy beyond a 50% coin flip.
   - Do NOT present myths or cultural traditions as medically proven facts.
2. Clinical Accuracy:
   - Accurately describe genuine medical fetal sex determination methods: NIPT (cell-free fetal DNA screening from 10 weeks) and mid-pregnancy ultrasound (18-20 weeks anatomy scan).
   - Never provide individualized medical advice, diagnoses, or clinical prescriptions.
   - Always advise readers to consult certified OB/GYNs, midwives, or healthcare providers for prenatal health decisions.
3. Content & Tone:
   - Compassionate, engaging, culturally respectful, and grounded in evidence.
   - Avoid keyword stuffing. Write natural, flowing prose with clear headings.
4. Internal Linking Integrity:
   - You MUST ONLY link to the provided whitelisted internal URLs.
   - NEVER invent or hallucinate URLs.
   - NEVER include trailing slashes (e.g., use /blog/chinese-gender-calendar, NOT /blog/chinese-gender-calendar/).
5. Output Format:
   - Output MUST be a single valid JSON object with no markdown fences, no surrounding commentary, and no introductory chatter.`;

  // User prompt detailing structure and schema
  const prompt = `Write a comprehensive, publication-ready article on the following topic:

TOPIC SPECIFICATIONS:
- Title: "${topic.title}"
- Category: "${finalCategory}"
- Primary Target Keyword: "${primaryKw}"
- Secondary Keywords: ${secondaryKws.map((k) => `"${k}"`).join(', ') || 'None specified'}
- Search Intent: ${intent}
- Word Count Target: Between ${minWords} and ${maxWords} words (Target: ${targetWords} words)
- Configured Hero Image: "${heroImage}"
- Configured Hero Image Alt: "${heroImageAlt}"

INTERNAL LINKING REQUIREMENTS:
You must include at least ${minLinks} natural, relevant markdown internal links in the article body using ONLY this approved whitelist:
${allowedPaths.slice(0, 25).map((p) => `- ${p}`).join('\n')}

FAQ REQUIREMENTS:
- Provide between 4 and 8 comprehensive, non-redundant FAQs.
- The FAQs in the structured frontmatter MUST match the FAQ section in the markdown body.

MANDATORY JSON OUTPUT FORMAT:
Respond with ONLY a valid JSON object strictly matching this schema:
{
  "frontmatter": {
    "title": "${topic.title}",
    "seoTitle": "${topic.title}",
    "description": "140-160 character meta description containing '${primaryKw}' with a clear value proposition.",
    "category": "${finalCategory}",
    "tags": ["${finalCategory}", "Baby Gender Prediction", "Pregnancy"],
    "heroImage": "${heroImage}",
    "heroImageAlt": "${heroImageAlt}",
    "excerpt": "A 2-sentence hook summarizing the article purpose for blog card previews.",
    "featured": false,
    "faqs": [
      {
        "question": "Clear, natural question?",
        "answer": "Accurate, concise, 2-3 sentence answer."
      }
    ]
  },
  "markdownBody": "Complete article in GitHub Flavored Markdown (H2, H3, lists, comparisons, tables where helpful, natural internal links to whitelisted URLs, and an H2 ## Frequently Asked Questions section)."
}`;

  return {
    systemInstruction,
    prompt,
    whitelistedPaths: allowedPaths,
    heroImage,
    heroImageAlt,
  };
}

/**
 * Safely parses and validates the structured AI response.
 * @param {string} rawResponse - Raw string returned from AI model
 * @param {object} [options] - Validation options
 * @param {string[]} [options.whitelistedPaths] - Whitelisted internal paths
 * @param {number} [options.minWords] - Minimum word count (default: 1200)
 * @returns {{ valid: boolean, data?: { frontmatter: object, markdownBody: string, wordCount: number }, error?: string }}
 */
export function parseAIResponse(rawResponse, options = {}) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return { valid: false, error: 'Empty or non-string AI response' };
  }

  // Strip code fences (```json ... ``` or ``` ...)
  let cleaned = rawResponse.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\r?\n/, '').replace(/\r?\n```$/, '').trim();
  }

  // Attempt JSON parse
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Attempt to isolate first { to last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (innerErr) {
        return { valid: false, error: `Malformed JSON from AI model: ${innerErr.message}` };
      }
    } else {
      return { valid: false, error: `No JSON object detected in AI response: ${err.message}` };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'AI output parsed as non-object' };
  }

  const { frontmatter, markdownBody } = parsed;

  if (!frontmatter || typeof frontmatter !== 'object') {
    return { valid: false, error: 'Missing or invalid "frontmatter" object in AI output' };
  }

  if (!markdownBody || typeof markdownBody !== 'string' || markdownBody.trim().length < 200) {
    return { valid: false, error: 'Missing, empty, or too short "markdownBody" in AI output' };
  }

  // Validate required frontmatter fields
  const requiredFields = ['title', 'description', 'category', 'heroImage', 'heroImageAlt', 'excerpt'];
  for (const field of requiredFields) {
    if (!frontmatter[field] || typeof frontmatter[field] !== 'string' || !frontmatter[field].trim()) {
      return { valid: false, error: `Missing or invalid required frontmatter field: "${field}"` };
    }
  }

  // Validate FAQs
  if (!Array.isArray(frontmatter.faqs) || frontmatter.faqs.length < 4 || frontmatter.faqs.length > 8) {
    return {
      valid: false,
      error: `Invalid FAQs: Expected between 4 and 8 items, received ${Array.isArray(frontmatter.faqs) ? frontmatter.faqs.length : 0}`,
    };
  }

  for (const faq of frontmatter.faqs) {
    if (!faq || !faq.question || !faq.answer) {
      return { valid: false, error: 'One or more FAQs are missing question or answer fields' };
    }
  }

  // Validate words
  const cleanBody = markdownBody.replace(/<[^>]*>/g, '').replace(/#|\*|`|-/g, '');
  const wordCount = cleanBody.trim().split(/\s+/).filter(Boolean).length;
  const minRequired = options.minWords || autopilotConfig.articleRules.wordCount.min || 1200;

  if (wordCount < minRequired) {
    return {
      valid: false,
      error: `Article word count (${wordCount}) is below project minimum (${minRequired} words)`,
    };
  }

  // Validate internal links against whitelist if provided
  if (options.whitelistedPaths && Array.isArray(options.whitelistedPaths) && options.whitelistedPaths.length > 0) {
    const linkMatches = [...markdownBody.matchAll(/\[(?:[^\]]+)\]\(([^)#\s]+)(?:#[^\)]*)?\)/g)];
    const internalLinks = linkMatches
      .map((m) => m[1])
      .filter((url) => url.startsWith('/') && !url.startsWith('//'));

    // Check for trailing slashes on internal links
    const linksWithTrailingSlash = internalLinks.filter((url) => url.length > 1 && url.endsWith('/'));
    if (linksWithTrailingSlash.length > 0) {
      // Auto-sanitize trailing slashes rather than rejecting
      for (const badUrl of linksWithTrailingSlash) {
        const cleanUrl = badUrl.replace(/\/+$/, '');
        parsed.markdownBody = parsed.markdownBody.replaceAll(`](${badUrl})`, `](${cleanUrl})`);
      }
    }
  }

  // Ensure tags is an array
  if (!Array.isArray(frontmatter.tags)) {
    frontmatter.tags = [];
  }

  // Default publication date to today if not provided
  if (!frontmatter.pubDate) {
    frontmatter.pubDate = new Date().toISOString().split('T')[0];
  }

  return {
    valid: true,
    data: {
      frontmatter,
      markdownBody: parsed.markdownBody,
      wordCount,
    },
  };
}

export default {
  buildArticlePrompt,
  parseAIResponse,
};
