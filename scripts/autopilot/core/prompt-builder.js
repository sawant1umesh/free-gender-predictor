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
  attempt = 1,
  maxAttempts = 3,
  previousErrors = [],
}) {
  const finalCategory = category || topic.category || 'Chinese Gender Predictor';
  const primaryKw = targetKeyword || topic.primaryKeyword || topic.title;
  const secondaryKws = topic.secondaryKeywords || [];
  const intent = searchIntent || topic.searchIntent || 'informational';
  const targetWords = autopilotConfig.ai.generationTarget.wordCount.target || 2000;
  const minWords = autopilotConfig.ai.generationTarget.wordCount.min || 1800;
  const maxWords = autopilotConfig.ai.generationTarget.wordCount.max || 2300;
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
1. Strict Folklore vs Medical Science Distinction:
   - Always clearly state that traditional methods (Chinese Gender Predictor, Chinese Gender Calendar, Mayan Gender Predictor, Ramzi Theory, Nub Theory, Skull Theory, cravings, fetal heart rate, baking soda, old wives' tales) are cultural folklore, historical traditions, and entertainment tools.
   - PROHIBITED MEDICAL CERTAINTY CLAIMS: You must NEVER state, suggest, or imply that Chinese gender prediction, lunar age methods, charts, calendars, or any folk traditions are guaranteed, certain, 100% accurate, foolproof, scientifically proven, or clinically reliable.
   - Traditional charts perform at roughly a 50% coin-flip rate in scientific evaluations.
   - When discussing accuracy, use evidence-based language: "traditional method", "folklore", "cultural belief", "entertainment use", "not a clinical diagnostic method", "cannot reliably determine an individual baby's sex".
2. Clinical Accuracy & Boundaries:
   - Genuine medical fetal sex determination relies exclusively on clinical diagnostics: cell-free fetal DNA screening (NIPT from 10 weeks) and mid-pregnancy ultrasound anatomy scans (18-20 weeks).
   - Never provide individualized medical advice, diagnoses, or clinical prescriptions.
   - Always advise readers to consult certified OB/GYNs, midwives, or licensed healthcare professionals for prenatal medical guidance.
3. Content & Tone:
   - Compassionate, engaging, culturally respectful, and grounded in evidence.
   - Avoid keyword stuffing. Write natural, flowing prose with clear headings.
4. Internal Linking Integrity:
   - You MUST ONLY link to the provided whitelisted internal URLs.
   - NEVER invent or hallucinate URLs.
   - NEVER include trailing slashes (e.g., use /blog/chinese-gender-calendar, NOT /blog/chinese-gender-calendar/).
5. Output Format:
   - Output MUST be a single valid JSON object with no markdown fences, no surrounding commentary, and no introductory chatter.`;

  // Feedback section if regenerating after validation failure
  let feedbackSection = '';
  if (attempt > 1 && Array.isArray(previousErrors) && previousErrors.length > 0) {
    const errorBullets = previousErrors.map((err) => `  - ❌ ${err}`).join('\n');
    const hasWordCountError = previousErrors.some((e) => /word count/i.test(e));
    const hasMedicalError = previousErrors.some((e) => /medical safety|guaranteed|100%|proven|diagnosis|doctor/i.test(e));
    const hasFaqError = previousErrors.some((e) => /faq/i.test(e));
    const hasLinkError = previousErrors.some((e) => /internal link|whitelist|trailing slash/i.test(e));
    const hasCategoryError = previousErrors.some((e) => /category/i.test(e));
    const hasParsingError = previousErrors.some((e) => /malformed|json|parse|syntax|control character|unescaped|invalid ai response/i.test(e));

    feedbackSection = `
======================================================================
🚨 CRITICAL REVISION REQUIRED (Attempt ${attempt} of ${maxAttempts})
The previous draft attempt failed automated Phase 3 validation for the following reason(s):
${errorBullets}

YOU MUST FULLY REVISE AND RESOLVE THESE ISSUES IN THIS NEW RESPONSE:
${hasParsingError ? '• OUTPUT FORMAT & DELIMITERS CORRECTION: Your previous response failed parsing due to syntax or malformed structure. You MUST strictly use the <<<METADATA>>> and <<<ARTICLE>>> delimiters. Place only the short JSON metadata between <<<METADATA>>> tags, and write the full article as clean Markdown between <<<ARTICLE>>> tags without JSON escaping.\n' : ''}${hasWordCountError ? '• WORD COUNT CORRECTION: Your previous draft was outside acceptable word count limits (1200-2500 words). Strictly write between 1800 and 2300 words. Do NOT exceed 2300 words under any circumstance.\n' : ''}${hasMedicalError ? '• MEDICAL SAFETY CORRECTION: Remove ANY claim or implication that folk gender prediction methods are guaranteed, certain, 100% accurate, foolproof, or scientifically/clinically proven. Strictly present them as folklore and entertainment, contrasting with medical ultrasound and NIPT.\n' : ''}${hasFaqError ? '• FAQ CORRECTION: Ensure between 4 and 8 structured FAQs with complete, non-empty question and answer fields. The FAQs in frontmatter MUST match the FAQ section in the markdown body.\n' : ''}${hasLinkError ? '• INTERNAL LINK CORRECTION: Use ONLY the approved whitelisted links below with root-relative paths starting with "/" and NO trailing slashes.\n' : ''}${hasCategoryError ? `• CATEGORY CORRECTION: Ensure frontmatter category is strictly "${finalCategory}".\n` : ''}
IMPORTANT: Do not simply append or prefix corrections. Return a clean, complete, fully corrected article strictly adhering to all guidelines.
======================================================================
`;
  }

  // User prompt detailing structure and schema
  const prompt = `${feedbackSection ? feedbackSection + '\n' : ''}Write a comprehensive, publication-ready article on the following topic:

TOPIC SPECIFICATIONS:
- Title: "${topic.title}"
- Category: "${finalCategory}"
- Primary Target Keyword: "${primaryKw}"
- Secondary Keywords: ${secondaryKws.map((k) => `"${k}"`).join(', ') || 'None specified'}
- Search Intent: ${intent}
- Word Count Target: Strictly between ${minWords} and ${maxWords} words (Target: ${targetWords} words).
  CRITICAL: Do not exceed approximately 2300 words. Keeping the article under 2300 words provides an essential safety buffer below the hard 2500-word limit. Articles exceeding 2500 words or below 1200 words are rejected immediately by automated quality gates.
- Configured Hero Image: "${heroImage}"
- Configured Hero Image Alt: "${heroImageAlt}"

INTERNAL LINKING REQUIREMENTS:
You must include at least ${minLinks} natural, relevant markdown internal links in the article body using ONLY this approved whitelist:
${allowedPaths.slice(0, 25).map((p) => `- ${p}`).join('\n')}

FAQ REQUIREMENTS:
- Provide between 4 and 8 comprehensive, non-redundant FAQs.
- The FAQs in the structured frontmatter MUST match the FAQ section in the markdown body.

MANDATORY OUTPUT FORMAT:
You MUST provide the structured frontmatter metadata and the complete markdown article using the exact delimiters below:

<<<METADATA>>>
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
  }
}
<<<METADATA>>>

<<<ARTICLE>>>
[Write the complete, publication-ready article here in GitHub Flavored Markdown]
- Include H2 and H3 headings, lists, comparisons, tables where helpful
- Include natural internal links to approved whitelisted URLs
- Include an H2 ## Frequently Asked Questions section matching the frontmatter FAQs
- Write clean, standard markdown directly. Do NOT JSON-escape quotation marks, quotes, or newlines in this section.
<<<ARTICLE>>>`;

  return {
    systemInstruction,
    prompt,
    whitelistedPaths: allowedPaths,
    heroImage,
    heroImageAlt,
    attempt,
    maxAttempts,
  };
}

/**
 * Safely unescapes escaped control characters and quotes from a markdown string
 * while leaving raw unescaped newlines and quotes intact.
 * @param {string} str
 * @returns {string}
 */
export function cleanMarkdownString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Parses delimited multi-part output (<<<METADATA>>> ... <<<ARTICLE>>>)
 * or markdown code-fenced metadata blocks.
 * @param {string} rawResponse
 * @returns {{ frontmatter: object, markdownBody: string } | null}
 */
export function parseDelimitedResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string') return null;

  // 1. Tag delimited format: <<<METADATA>>> ... <<<METADATA>>> and <<<ARTICLE>>> ... <<<ARTICLE>>>
  const metadataTagMatch = rawResponse.match(/<<<METADATA>>>([\s\S]*?)<<<METADATA>>>/i);
  const articleTagMatch = rawResponse.match(/<<<ARTICLE>>>([\s\S]*?)(?:<<<ARTICLE>>>|$)/i);

  if (metadataTagMatch && articleTagMatch) {
    const metaText = metadataTagMatch[1].trim();
    const articleText = articleTagMatch[1].trim();

    let metaObj;
    try {
      metaObj = JSON.parse(metaText);
    } catch (_) {
      const b1 = metaText.indexOf('{');
      const b2 = metaText.lastIndexOf('}');
      if (b1 !== -1 && b2 > b1) {
        try {
          metaObj = JSON.parse(metaText.substring(b1, b2 + 1));
        } catch (__) {
          return null;
        }
      } else {
        return null;
      }
    }

    const frontmatter = metaObj?.frontmatter && typeof metaObj.frontmatter === 'object'
      ? metaObj.frontmatter
      : metaObj;

    return {
      frontmatter,
      markdownBody: articleText,
    };
  }

  // 2. Code fence metadata followed by article: ```json { ... } ``` followed by # or ##
  const fenceMatch = rawResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```([\s\S]*)$/i);
  if (fenceMatch) {
    const jsonText = fenceMatch[1].trim();
    const bodyText = fenceMatch[2].trim();

    if (bodyText.length > 100 && /(?:^|\n)#{1,3}\s+/m.test(bodyText)) {
      try {
        const metaObj = JSON.parse(jsonText);
        const frontmatter = metaObj?.frontmatter && typeof metaObj.frontmatter === 'object'
          ? metaObj.frontmatter
          : metaObj;
        return {
          frontmatter,
          markdownBody: bodyText,
        };
      } catch (_) {}
    }
  }

  return null;
}

/**
 * Deterministically repairs malformed JSON responses where long article content
 * inside "markdownBody" broke standard JSON.parse due to unescaped quotes,
 * raw control characters (literal newlines/tabs), or trailing commas.
 * 
 * Never fabricates or guesses missing structured fields.
 * 
 * @param {string} rawText
 * @returns {{ frontmatter: object, markdownBody: string } | null}
 */
export function repairMalformedJsonArticle(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  // Check if this looks like an attempted JSON article with frontmatter and markdownBody
  const hasFm = rawText.includes('"frontmatter"') || rawText.includes('"title"');
  const hasMb = rawText.includes('"markdownBody"');
  if (!hasFm || !hasMb) return null;

  // 1. Extract frontmatter object by tracking balanced braces
  let frontmatter = null;
  const fmKeyMatch = rawText.match(/"frontmatter"\s*:\s*\{/);
  if (fmKeyMatch) {
    const fmStartIndex = fmKeyMatch.index + fmKeyMatch[0].length - 1;
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let fmEndIndex = -1;

    for (let i = fmStartIndex; i < rawText.length; i++) {
      const ch = rawText[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === '{') braceCount++;
        else if (ch === '}') {
          braceCount--;
          if (braceCount === 0) {
            fmEndIndex = i;
            break;
          }
        }
      }
    }

    if (fmEndIndex !== -1) {
      const fmJsonStr = rawText.substring(fmStartIndex, fmEndIndex + 1);
      try {
        frontmatter = JSON.parse(fmJsonStr);
      } catch (_) {
        // Safe cleanup of trailing commas or control characters within frontmatter
        try {
          const sanitized = fmJsonStr
            .replace(/,\s*([\}\]])/g, '$1')
            .replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? ' ' : ''));
          frontmatter = JSON.parse(sanitized);
        } catch (__) {}
      }
    }
  }

  // If "frontmatter" key was not found, check if frontmatter fields are top-level before "markdownBody"
  if (!frontmatter) {
    const mbKeyIdx = rawText.indexOf('"markdownBody"');
    if (mbKeyIdx !== -1) {
      const textBeforeMb = rawText.substring(0, mbKeyIdx).trim().replace(/,\s*$/, '') + '}';
      const firstBrace = textBeforeMb.indexOf('{');
      if (firstBrace !== -1) {
        try {
          const topObj = JSON.parse(textBeforeMb.substring(firstBrace));
          if (topObj && topObj.title && topObj.description) {
            frontmatter = topObj;
          }
        } catch (_) {}
      }
    }
  }

  if (!frontmatter || typeof frontmatter !== 'object') return null;

  // 2. Extract markdownBody from the remainder
  const mbKeyMatch = rawText.match(/"markdownBody"\s*:\s*"?/);
  if (!mbKeyMatch) return null;

  const mbStartIndex = mbKeyMatch.index + mbKeyMatch[0].length;
  const lastBrace = rawText.lastIndexOf('}');
  if (lastBrace <= mbStartIndex) return null;

  let rawBody = rawText.substring(mbStartIndex, lastBrace).trim();

  // Strip trailing quote if present before the last brace
  if (rawBody.endsWith('"')) {
    rawBody = rawBody.slice(0, -1).trim();
  }

  const markdownBody = cleanMarkdownString(rawBody);
  if (!markdownBody || markdownBody.length < 200) return null;

  return {
    frontmatter,
    markdownBody,
  };
}

/**
 * Parses basic YAML frontmatter if returned directly as Astro markdown.
 * @param {string} content
 * @returns {{ frontmatter: object, markdownBody: string } | null}
 */
export function parseYamlFrontmatter(content) {
  if (!content || !content.startsWith('---')) return null;
  const endMatch = content.slice(3).indexOf('---');
  if (endMatch === -1) return null;

  const fmText = content.slice(3, endMatch + 3).trim();
  const body = content.slice(endMatch + 6).trim();

  const frontmatter = {};
  const lines = fmText.split(/\r?\n/);
  let inFaqs = false;
  let currentFaq = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('faqs:')) {
      inFaqs = true;
      frontmatter.faqs = [];
      continue;
    }

    if (inFaqs) {
      if (line.startsWith('  - question:') || line.startsWith('- question:')) {
        currentFaq = { question: trimmed.replace(/^-?\s*question:\s*/, '').replace(/^["']|["']$/g, ''), answer: '' };
        frontmatter.faqs.push(currentFaq);
        continue;
      }
      if (currentFaq && (line.startsWith('    answer:') || line.startsWith('  answer:'))) {
        currentFaq.answer = trimmed.replace(/^answer:\s*/, '').replace(/^["']|["']$/g, '');
        continue;
      }
      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        inFaqs = false;
      }
    }

    if (!inFaqs) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmed.substring(0, colonIdx).trim();
        let val = trimmed.substring(colonIdx + 1).trim();
        if (val.startsWith('[') && val.endsWith(']')) {
          try {
            val = JSON.parse(val);
          } catch (_) {
            val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
          }
        } else {
          val = val.replace(/^["']|["']$/g, '');
          if (val === 'true') val = true;
          else if (val === 'false') val = false;
        }
        frontmatter[key] = val;
      }
    }
  }

  return { frontmatter, markdownBody: body };
}

/**
 * Safely parses and validates the structured AI response across multiple formats:
 * 1. Delimited multi-part format (<<<METADATA>>> + <<<ARTICLE>>>)
 * 2. YAML frontmatter format (--- ... ---)
 * 3. Standard JSON ({ frontmatter, markdownBody })
 * 4. Deterministic repair of malformed JSON (bad control characters, unescaped quotes)
 * 
 * @param {string} rawResponse - Raw string returned from AI model
 * @param {object} [options] - Validation options
 * @param {string[]} [options.whitelistedPaths] - Whitelisted internal paths
 * @param {number} [options.minWords] - Minimum word count (default: 1200)
 * @returns {{
 *   valid: boolean,
 *   data?: { frontmatter: object, markdownBody: string, wordCount: number },
 *   repaired?: boolean,
 *   classification?: string,
 *   recoverable?: boolean,
 *   error?: string
 * }}
 */
export function parseAIResponse(rawResponse, options = {}) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return {
      valid: false,
      error: 'Empty or non-string AI response',
      classification: 'EMPTY_RESPONSE',
      recoverable: false,
    };
  }

  let cleaned = rawResponse.trim();
  let frontmatter = null;
  let markdownBody = null;
  let repaired = false;

  // Strategy 1: Check delimited <<<METADATA>>> and <<<ARTICLE>>> format
  const delimited = parseDelimitedResponse(cleaned);
  if (delimited && delimited.frontmatter && delimited.markdownBody) {
    frontmatter = delimited.frontmatter;
    markdownBody = delimited.markdownBody;
  }

  // Strategy 2: Check YAML frontmatter (--- ... ---)
  if (!frontmatter && cleaned.startsWith('---')) {
    const yamlParsed = parseYamlFrontmatter(cleaned);
    if (yamlParsed && yamlParsed.frontmatter && yamlParsed.markdownBody) {
      frontmatter = yamlParsed.frontmatter;
      markdownBody = yamlParsed.markdownBody;
    }
  }

  // Strategy 3: Standard JSON parse
  if (!frontmatter) {
    let jsonCandidate = cleaned;
    if (jsonCandidate.startsWith('```')) {
      jsonCandidate = jsonCandidate.replace(/^```(?:json)?\r?\n/, '').replace(/\r?\n```$/, '').trim();
    }

    let parsed = null;
    let jsonParseError = null;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch (err) {
      jsonParseError = err;
      const firstBrace = jsonCandidate.indexOf('{');
      const lastBrace = jsonCandidate.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(jsonCandidate.substring(firstBrace, lastBrace + 1));
          jsonParseError = null;
        } catch (innerErr) {
          jsonParseError = innerErr;
        }
      }
    }

    if (parsed && typeof parsed === 'object') {
      frontmatter = parsed.frontmatter || parsed;
      markdownBody = parsed.markdownBody;
    }

    // Strategy 4: Deterministic JSON Repair if standard parse failed or had syntax issues
    if ((!frontmatter || !markdownBody) && (jsonParseError || jsonCandidate.includes('"markdownBody"'))) {
      const repairedData = repairMalformedJsonArticle(cleaned);
      if (repairedData && repairedData.frontmatter && repairedData.markdownBody) {
        frontmatter = repairedData.frontmatter;
        markdownBody = repairedData.markdownBody;
        repaired = true;
      } else if (jsonParseError) {
        return {
          valid: false,
          error: `Malformed JSON from AI model: ${jsonParseError.message}`,
          classification: 'MALFORMED_JSON_SYNTAX',
          recoverable: false,
        };
      }
    }
  }

  // Classification check if extraction still failed
  if (!frontmatter || typeof frontmatter !== 'object') {
    return {
      valid: false,
      error: 'Missing or invalid "frontmatter" object in AI output',
      classification: 'MISSING_STRUCTURED_METADATA',
      recoverable: false,
    };
  }

  if (!markdownBody || typeof markdownBody !== 'string' || markdownBody.trim().length < 200) {
    return {
      valid: false,
      error: 'Missing, empty, or too short "markdownBody" in AI output',
      classification: 'ARTICLE_BODY_EMPTY',
      recoverable: false,
    };
  }

  // Validate required frontmatter fields
  const requiredFields = ['title', 'description', 'category', 'heroImage', 'heroImageAlt', 'excerpt'];
  for (const field of requiredFields) {
    if (!frontmatter[field] || typeof frontmatter[field] !== 'string' || !frontmatter[field].trim()) {
      return {
        valid: false,
        error: `Missing or invalid required frontmatter field: "${field}"`,
        classification: 'MISSING_REQUIRED_FIELDS',
        recoverable: false,
      };
    }
  }

  // Validate FAQs
  if (!Array.isArray(frontmatter.faqs) || frontmatter.faqs.length < 4 || frontmatter.faqs.length > 8) {
    return {
      valid: false,
      error: `Invalid FAQs: Expected between 4 and 8 items, received ${Array.isArray(frontmatter.faqs) ? frontmatter.faqs.length : 0}`,
      classification: 'INVALID_FAQS',
      recoverable: false,
    };
  }

  for (const faq of frontmatter.faqs) {
    if (!faq || typeof faq !== 'object' || !faq.question || !faq.answer) {
      return {
        valid: false,
        error: 'One or more FAQs are missing question or answer fields',
        classification: 'INVALID_FAQS',
        recoverable: false,
      };
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
      classification: 'WORD_COUNT_TOO_LOW',
      recoverable: false,
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
      for (const badUrl of linksWithTrailingSlash) {
        const cleanUrl = badUrl.replace(/\/+$/, '');
        markdownBody = markdownBody.replaceAll(`](${badUrl})`, `](${cleanUrl})`);
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
      markdownBody,
      wordCount,
    },
    repaired,
  };
}

export default {
  buildArticlePrompt,
  parseAIResponse,
  parseDelimitedResponse,
  repairMalformedJsonArticle,
  parseYamlFrontmatter,
  cleanMarkdownString,
};
