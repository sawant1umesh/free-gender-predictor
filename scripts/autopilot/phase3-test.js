#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { validateDraft } from './core/validator.js';
import { runAutopilot } from './index.js';
import { setMockHandler } from './core/ai-client.js';
import { readLogs } from './core/audit-logger.js';

// Track test draft files for guaranteed cleanup
const createdTestFiles = new Set();

const WHITELISTED_ROUTES = [
  '/',
  '/blog',
  '/faq',
  '/about',
  '/contact',
  '/medical-disclaimer',
  '/privacy-policy',
  '/terms-and-conditions',
  '/blog/chinese-gender-calendar',
  '/blog/how-does-the-chinese-gender-predictor-work',
  '/blog/category/chinese-gender-calendar',
  '/blog/category/chinese-gender-predictor',
];

/**
 * Creates a valid base article body meeting word count (~1,900 words) with H2/H3 and valid links
 */
function createValidArticleBody(customOverrides = {}) {
  const paragraph = `When expectant parents explore baby gender prediction methods, they frequently encounter ancient cultural charts, folk traditions, and modern clinical diagnostics. While tools like the traditional [Chinese Gender Predictor](/) offer an entertaining way to explore pregnancy lore based on maternal lunar age and lunar conception months, it is essential to understand the scientific reality behind fetal sex determination. Studies analyzing millions of births have consistently demonstrated that folk charts perform at roughly a fifty percent statistical rate, which is equivalent to a random coin flip. For families interested in exploring the history, our [Chinese Gender Calendar](/blog/chinese-gender-calendar) guide provides deep cultural context without mistaking folklore for clinical diagnostics. Meanwhile, genuine clinical determination relies on mid-pregnancy ultrasound anatomy scans at eighteen to twenty weeks or cell-free fetal DNA screening (NIPT) from ten weeks of gestation. Parents should always consult certified healthcare professionals for prenatal medical guidance. `;

  let body = `# Complete Guide to Baby Gender Prediction Methods\n\n`;
  body += `Understanding the differences between cultural traditions and medical science during pregnancy.\n\n`;
  body += `## Overview of Folk Traditions and Cultural Charts\n\n`;
  body += paragraph.repeat(4) + `\n\n`;
  body += `## Comparing Ancient Methods with Clinical Reality\n\n`;
  body += `Parents can also explore the [Chinese Gender Predictor Guide](/blog/how-does-the-chinese-gender-predictor-work) and review our [Frequently Asked Questions](/faq) for common inquiries.\n\n`;
  body += paragraph.repeat(4) + `\n\n`;
  body += `## Medical Diagnostics: Ultrasounds and NIPT Screening\n\n`;
  body += paragraph.repeat(4) + `\n\n`;
  body += `## Clinical Safety and Guidance\n\n`;
  body += `Always review the [Medical Disclaimer](/medical-disclaimer) and talk with your physician.\n\n`;
  body += paragraph.repeat(2) + `\n\n`;
  body += `## Frequently Asked Questions\n\n`;
  body += `### What is the Chinese Gender Predictor?\nA traditional folk chart based on lunar age and lunar months.\n\n`;
  body += `### Is the method medically reliable?\nNo, it has a 50% accuracy rate equivalent to guessing.\n\n`;
  body += `### When can doctors determine baby gender?\nFrom 10 weeks with NIPT blood tests or 18-20 weeks with anatomy ultrasound.\n\n`;
  body += `### Does baby heart rate predict gender?\nNo, clinical studies show fetal heart rate does not reliably indicate sex.\n\n`;

  if (customOverrides.append) {
    body += customOverrides.append;
  }
  return body;
}

/**
 * Creates valid base frontmatter
 */
function createValidFrontmatter(overrides = {}) {
  return {
    title: 'Complete Guide to Baby Gender Prediction Methods',
    seoTitle: 'Baby Gender Prediction Methods: Folk Traditions vs Science',
    description: 'Learn how traditional Chinese gender predictors compare with medical testing including ultrasounds and NIPT.',
    pubDate: '2026-09-06',
    category: 'Chinese Gender Predictor',
    tags: ['Chinese Gender Predictor', 'Baby Gender Prediction', 'Pregnancy'],
    heroImage: '/logo.svg',
    heroImageAlt: 'Baby Gender Prediction Methods - Traditional Chart Guide',
    excerpt: 'Explore traditional baby gender prediction charts and clinical testing timelines with scientific accuracy facts.',
    featured: false,
    faqs: [
      {
        question: 'What is the Chinese Gender Predictor?',
        answer: 'A traditional folk chart based on maternal lunar age and lunar conception month.',
      },
      {
        question: 'Is the Chinese Gender Predictor accurate?',
        answer: 'Scientific studies show accuracy is roughly 50%, equivalent to a coin toss.',
      },
      {
        question: 'When can doctors determine baby gender reliably?',
        answer: 'Via NIPT cell-free DNA blood screening from week 10, or ultrasound at 18-20 weeks.',
      },
      {
        question: 'Does baby heart rate indicate gender?',
        answer: 'No medical study confirms heart rate differences between male and female fetuses.',
      },
    ],
    ...overrides,
  };
}

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log('\n' + '='.repeat(70));
  console.log('  🧪 RUNNING PHASE 3 QUALITY GATE & VALIDATION TEST SUITE');
  console.log('  Testing frontmatter, word counts, links, FAQs, safety & pipeline');
  console.log('='.repeat(70) + '\n');

  const initialProdArticles = fs.readdirSync(autopilotConfig.paths.productionBlogDir);

  // -------------------------------------------------------------
  // Test 1: Valid article passes validation
  // -------------------------------------------------------------
  console.log('Test 1: Valid article passes validation');
  const validDraft = {
    frontmatter: createValidFrontmatter(),
    markdownBody: createValidArticleBody(),
  };
  const res1 = validateDraft(validDraft, { whitelistedRoutes: WHITELISTED_ROUTES });
  assert(res1.valid === true, 'Valid draft returns valid: true');
  assert(res1.errors.length === 0, 'Valid draft has 0 errors');

  // -------------------------------------------------------------
  // Test 2: Missing required frontmatter fails
  // -------------------------------------------------------------
  console.log('\nTest 2: Missing required frontmatter fails');
  const res2 = validateDraft(
    {
      frontmatter: createValidFrontmatter({ title: '' }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res2.valid === false, 'Draft missing title fails validation');
  assert(res2.errors.some((e) => e.includes('title')), 'Error specifically identifies missing title');

  // -------------------------------------------------------------
  // Test 3: Invalid category fails
  // -------------------------------------------------------------
  console.log('\nTest 3: Invalid category fails');
  const res3 = validateDraft(
    {
      frontmatter: createValidFrontmatter({ category: 'Unapproved Astrology Category' }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res3.valid === false, 'Draft with unapproved category fails');
  assert(res3.errors.some((e) => e.includes('approved category')), 'Error mentions approved category');

  // -------------------------------------------------------------
  // Test 4: Missing heroImage fails
  // -------------------------------------------------------------
  console.log('\nTest 4: Missing heroImage fails');
  const res4 = validateDraft(
    {
      frontmatter: createValidFrontmatter({ heroImage: '' }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res4.valid === false, 'Draft missing heroImage fails');
  assert(res4.errors.some((e) => e.includes('heroImage')), 'Error mentions heroImage');

  // -------------------------------------------------------------
  // Test 5: Missing heroImageAlt fails
  // -------------------------------------------------------------
  console.log('\nTest 5: Missing heroImageAlt fails');
  const res5 = validateDraft(
    {
      frontmatter: createValidFrontmatter({ heroImageAlt: '' }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res5.valid === false, 'Draft missing heroImageAlt fails');
  assert(res5.errors.some((e) => e.includes('heroImageAlt')), 'Error mentions heroImageAlt');

  // -------------------------------------------------------------
  // Test 6: Word count below hard minimum fails
  // -------------------------------------------------------------
  console.log('\nTest 6: Word count below hard minimum fails');
  const shortBody = 'Too short body. Only a few words here. Not enough for an article.';
  const res6 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: shortBody,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res6.valid === false, 'Draft below 1200 words fails');
  assert(res6.errors.some((e) => e.includes('below production minimum threshold')), 'Error explains word count minimum');

  // -------------------------------------------------------------
  // Test 7: Word count above hard maximum fails
  // -------------------------------------------------------------
  console.log('\nTest 7: Word count above hard maximum fails');
  const longParagraph = 'word '.repeat(3000);
  const res7 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: `## Section\n\n${longParagraph}`,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res7.valid === false, 'Draft above 2500 words fails');
  assert(res7.errors.some((e) => e.includes('exceeds maximum threshold')), 'Error explains word count maximum');

  // -------------------------------------------------------------
  // Test 8: Preferred editorial range warning behavior
  // -------------------------------------------------------------
  console.log('\nTest 8: Preferred editorial range warning behavior');
  // Create body with exactly ~1,400 words (between 1200 hard min and 1800 editorial target)
  const paragraph1400 = 'word '.repeat(1400);
  const res8 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: `## Section 1\n\n${paragraph1400}\n\n## Section 2\n[Link](/) [Link 2](/blog) [Link 3](/faq) [Link 4](/medical-disclaimer)\n\n## Section 3\nMore content.`,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res8.warnings.some((w) => w.includes('preferred editorial target')), 'Produces warning for word count between 1200 and 1800');

  // -------------------------------------------------------------
  // Test 9: Valid internal links pass
  // -------------------------------------------------------------
  console.log('\nTest 9: Valid internal links pass');
  const linksTestBody = `
## Section 1
Check our [Home](/) and [Blog](/blog).

## Section 2
Read the [FAQ](/faq) and [Medical Disclaimer](/medical-disclaimer).

## Section 3
${'word '.repeat(1300)}
  `;
  const res9 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: linksTestBody,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(!res9.errors.some((e) => e.includes('internal link')), 'Valid whitelisted internal links pass');

  // -------------------------------------------------------------
  // Test 10: Invalid internal links fail
  // -------------------------------------------------------------
  console.log('\nTest 10: Invalid internal links fail');
  const invalidLinkBody = createValidArticleBody({
    append: '\n\nCheck this [Fake Page](/unrecognized-secret-route-12345) for info.',
  });
  const res10 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: invalidLinkBody,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res10.valid === false, 'Invalid internal link causes validation failure');
  assert(res10.errors.some((e) => e.includes('/unrecognized-secret-route-12345')), 'Error identifies unwhitelisted link');

  // -------------------------------------------------------------
  // Test 11: Path traversal links fail
  // -------------------------------------------------------------
  console.log('\nTest 11: Path traversal links fail');
  const traversalLinkBody = createValidArticleBody({
    append: '\n\nDangerous link [Back](../admin/secrets).',
  });
  const res11 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: traversalLinkBody,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res11.valid === false, 'Path traversal link fails');
  assert(res11.errors.some((e) => e.includes('Path traversal')), 'Identifies path traversal link');

  // -------------------------------------------------------------
  // Test 12: External links are not counted as internal links
  // -------------------------------------------------------------
  console.log('\nTest 12: External links are not counted as internal links');
  const externalLinkBody = `
## Section 1
[Google](https://google.com) [Wikipedia](https://wikipedia.org) [CDC](https://cdc.gov) [WHO](https://who.int)

## Section 2
${'word '.repeat(1300)}

## Section 3
Done.
  `;
  const res12 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: externalLinkBody,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res12.metrics.internalLinks === 0, 'External links not counted as internal links');
  assert(res12.errors.some((e) => e.includes('unique internal link')), 'Fails minimum internal links because links are external');

  // -------------------------------------------------------------
  // Test 13: Minimum internal link threshold is enforced
  // -------------------------------------------------------------
  console.log('\nTest 13: Minimum internal link threshold is enforced');
  const twoLinksBody = `
## Section 1
Only two links: [Home](/) and [Blog](/blog).

## Section 2
${'word '.repeat(1300)}

## Section 3
Done.
  `;
  const res13 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: twoLinksBody,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res13.valid === false, 'Draft with only 2 internal links fails minimum 4 requirement');

  // -------------------------------------------------------------
  // Test 14: Valid FAQ structure passes
  // -------------------------------------------------------------
  console.log('\nTest 14: Valid FAQ structure passes');
  assert(res1.metrics.faqCount === 4, 'Valid draft has exactly 4 FAQs recorded');

  // -------------------------------------------------------------
  // Test 15: Too few FAQs fail
  // -------------------------------------------------------------
  console.log('\nTest 15: Too few FAQs fail');
  const res15 = validateDraft(
    {
      frontmatter: createValidFrontmatter({
        faqs: [
          { question: 'What is it?', answer: 'It is a Chinese gender prediction calendar.' },
        ],
      }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res15.valid === false, 'Draft with 1 FAQ fails');
  assert(res15.errors.some((e) => e.includes('Minimum required is 4')), 'Identifies minimum FAQ requirement failure');

  // -------------------------------------------------------------
  // Test 16: Too many FAQs fail
  // -------------------------------------------------------------
  console.log('\nTest 16: Too many FAQs fail');
  const nineFaqs = Array.from({ length: 9 }, (_, i) => ({
    question: `Question number ${i + 1} here?`,
    answer: `Answer number ${i + 1} with sufficient length details.`,
  }));
  const res16 = validateDraft(
    {
      frontmatter: createValidFrontmatter({ faqs: nineFaqs }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res16.valid === false, 'Draft with 9 FAQs fails maximum 8 limit');

  // -------------------------------------------------------------
  // Test 17: Empty FAQ question or answer fails
  // -------------------------------------------------------------
  console.log('\nTest 17: Empty FAQ question/answer fails');
  const res17 = validateDraft(
    {
      frontmatter: createValidFrontmatter({
        faqs: [
          { question: '', answer: 'Valid answer here with sufficient text length.' },
          { question: 'Valid question?', answer: '' },
          { question: 'Q3?', answer: 'A3' },
          { question: 'Q4?', answer: 'A4' },
        ],
      }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res17.valid === false, 'Empty FAQ question/answer fails validation');

  // -------------------------------------------------------------
  // Test 18: Duplicate FAQs are detected
  // -------------------------------------------------------------
  console.log('\nTest 18: Duplicate FAQs are detected');
  const duplicateFaqs = [
    { question: 'What is the Chinese Gender Calendar?', answer: 'A traditional calendar system.' },
    { question: 'what is the chinese gender calendar?', answer: 'Identical normalized question text.' },
    { question: 'How does it work?', answer: 'By cross-referencing lunar age and conception month.' },
    { question: 'Is it accurate?', answer: 'No, it has a 50% accuracy rate.' },
  ];
  const res18 = validateDraft(
    {
      frontmatter: createValidFrontmatter({ faqs: duplicateFaqs }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res18.valid === false, 'Duplicate FAQ question detected and rejected');
  assert(res18.errors.some((e) => e.includes('Duplicate FAQ question')), 'Error message mentions Duplicate FAQ question');

  // -------------------------------------------------------------
  // Test 19: Placeholder content fails
  // -------------------------------------------------------------
  console.log('\nTest 19: Placeholder content fails');
  const placeholderBody = createValidArticleBody({
    append: '\n\nTODO: Fill in the remaining medical statistics later.\n\nLorem ipsum dolor sit amet.',
  });
  const res19 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: placeholderBody,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res19.valid === false, 'Draft with placeholder text fails');
  assert(res19.errors.some((e) => e.includes('placeholder')), 'Error flags placeholder content');

  // -------------------------------------------------------------
  // Test 20: Invalid/malformed markdown handled safely
  // -------------------------------------------------------------
  console.log('\nTest 20: Invalid/malformed markdown handled safely');
  const res20 = validateDraft('Not YAML at all, just broken random gibberish', {
    whitelistedRoutes: WHITELISTED_ROUTES,
  });
  assert(res20.valid === false, 'Malformed markdown string handled safely without crashing');
  assert(Array.isArray(res20.errors) && res20.errors.length > 0, 'Returns structured errors array');

  // -------------------------------------------------------------
  // Test 21: Obvious unsafe medical certainty claims are flagged
  // -------------------------------------------------------------
  console.log('\nTest 21: Obvious unsafe medical certainty claims are flagged');
  const unsafeMedicalBody = createValidArticleBody({
    append: '\n\nThis Chinese gender calendar is a 100% accurate guaranteed result for predicting boys or girls.',
  });
  const res21 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: unsafeMedicalBody,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res21.valid === false, 'Claims of 100% accurate / guaranteed result fail');
  assert(res21.errors.some((e) => e.includes('medical certainty')), 'Error identifies medical certainty claim');

  // -------------------------------------------------------------
  // Test 22: Folk methods are not allowed to be presented as guaranteed medical fact
  // -------------------------------------------------------------
  console.log('\nTest 22: Folk methods not allowed as guaranteed clinical fact');
  const clinicalProofBody = createValidArticleBody({
    append: '\n\nIt is scientifically proven that the Chinese gender calendar determines baby sex with absolute accuracy.',
  });
  const res22 = validateDraft(
    {
      frontmatter: createValidFrontmatter(),
      markdownBody: clinicalProofBody,
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res22.valid === false, 'Claims of scientifically proven folk methods fail');
  assert(res22.errors.some((e) => e.includes('Prohibited clinical claim')), 'Identifies prohibited clinical claim');

  // -------------------------------------------------------------
  // Test 23: Local hero image paths pass
  // -------------------------------------------------------------
  console.log('\nTest 23: Local hero image paths pass');
  const res23 = validateDraft(
    {
      frontmatter: createValidFrontmatter({ heroImage: '/logo.svg' }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(!res23.errors.some((e) => e.includes('heroImage')), 'Root-relative local hero image path passes');

  // -------------------------------------------------------------
  // Test 24: Unsafe remote hero image URLs fail if disallowed
  // -------------------------------------------------------------
  console.log('\nTest 24: Unsafe remote hero image URLs fail');
  const res24 = validateDraft(
    {
      frontmatter: createValidFrontmatter({ heroImage: 'https://images.unsplash.com/photo-12345.jpg' }),
      markdownBody: createValidArticleBody(),
    },
    { whitelistedRoutes: WHITELISTED_ROUTES }
  );
  assert(res24.valid === false, 'Remote HTTPS heroImage fails');
  assert(res24.errors.some((e) => e.includes('Unsafe remote heroImage URL')), 'Identifies unsafe remote hero image');

  // -------------------------------------------------------------
  // Test 25: Validation failure never modifies src/content/blog/
  // -------------------------------------------------------------
  console.log('\nTest 25: Validation failure never modifies src/content/blog/');
  const currentProdArticles = fs.readdirSync(autopilotConfig.paths.productionBlogDir);
  assert(
    JSON.stringify(initialProdArticles.sort()) === JSON.stringify(currentProdArticles.sort()),
    `Production blog directory still contains exact initial 8 articles (${currentProdArticles.length} files)`
  );

  // -------------------------------------------------------------
  // Test 26: Draft generation remains isolated to scripts/autopilot/drafts/
  // -------------------------------------------------------------
  console.log('\nTest 26: Draft generation remains isolated to scripts/autopilot/drafts/');
  const draftsDirNorm = path.normalize(path.resolve(autopilotConfig.paths.draftsDir));
  const testTopic = {
    id: 'val-test-01',
    title: 'Phase Three Test Article Topic',
    suggestedSlug: 'phase-three-test-article-topic',
    category: 'Chinese Gender Predictor',
    primaryKeyword: 'test topic',
    targetWordCount: 1500,
  };

  setMockHandler(() => {
    return {
      success: true,
      rawText: JSON.stringify({
        frontmatter: createValidFrontmatter({ title: 'Phase Three Test Article Topic' }),
        markdownBody: createValidArticleBody(),
      }),
      provider: 'gemini',
      model: autopilotConfig.ai.gemini.model,
    };
  });

  const pipelineRes = await runAutopilot({ generate: true, overrideTopic: testTopic });
  assert(pipelineRes.draftPath, 'Pipeline created draft');
  if (pipelineRes.draftPath) {
    createdTestFiles.add(pipelineRes.draftPath);
    const draftPathNorm = path.normalize(path.resolve(pipelineRes.draftPath));
    assert(draftPathNorm.startsWith(draftsDirNorm), 'Draft is strictly confined inside scripts/autopilot/drafts/');
  }

  // -------------------------------------------------------------
  // Test 27: Audit logs contain validation result
  // -------------------------------------------------------------
  console.log('\nTest 27: Audit logs contain validation result');
  const logs = readLogs();
  const lastLog = logs[logs.length - 1];
  assert(Boolean(lastLog && lastLog.action.includes('DRAFT_VALIDATION')), 'Audit log recorded validation action');
  assert(lastLog.stats && typeof lastLog.stats.valid === 'boolean', 'Audit log includes validation boolean status');

  // -------------------------------------------------------------
  // Test 28: Audit logs contain no secrets
  // -------------------------------------------------------------
  console.log('\nTest 28: Audit logs contain no secrets');
  const logStr = JSON.stringify(logs);
  assert(!logStr.includes('AIzaSy') && !logStr.includes('gsk_'), 'No raw API keys in audit logs');

  // -------------------------------------------------------------
  // Test 29: Pipeline returns VALIDATION_FAILED correctly
  // -------------------------------------------------------------
  console.log('\nTest 29: Pipeline returns VALIDATION_FAILED correctly');
  setMockHandler(() => {
    return {
      success: true,
      rawText: JSON.stringify({
        frontmatter: createValidFrontmatter({ title: 'Invalid Draft With Bad Category', category: 'Invalid Category' }),
        markdownBody: createValidArticleBody(),
      }),
      provider: 'gemini',
      model: autopilotConfig.ai.gemini.model,
    };
  });

  const invalidPipelineRes = await runAutopilot({ generate: true, overrideTopic: testTopic });
  assert(invalidPipelineRes.state === RESULT_STATES.VALIDATION_FAILED, 'Pipeline returns VALIDATION_FAILED state');
  assert(!invalidPipelineRes.success, 'Pipeline success is false on validation failure');
  if (invalidPipelineRes.draftPath) createdTestFiles.add(invalidPipelineRes.draftPath);

  // -------------------------------------------------------------
  // Test 30: Pipeline returns validated success state correctly
  // -------------------------------------------------------------
  console.log('\nTest 30: Pipeline returns VALIDATED_DRAFT_CREATED state correctly');
  setMockHandler(() => {
    return {
      success: true,
      rawText: JSON.stringify({
        frontmatter: createValidFrontmatter({ title: 'Approved Validated Draft Title' }),
        markdownBody: createValidArticleBody(),
      }),
      provider: 'gemini',
      model: autopilotConfig.ai.gemini.model,
    };
  });

  const validPipelineRes = await runAutopilot({ generate: true, overrideTopic: testTopic });
  assert(validPipelineRes.state === RESULT_STATES.VALIDATED_DRAFT_CREATED, 'Pipeline returns VALIDATED_DRAFT_CREATED state');
  assert(validPipelineRes.success === true, 'Pipeline success is true for validated draft');
  if (validPipelineRes.draftPath) createdTestFiles.add(validPipelineRes.draftPath);

  // -------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------
  console.log('\n🧹 Cleaning up test artifacts...');
  for (const filePath of createdTestFiles) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`   ✓ Removed test draft: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.warn(`   ⚠️ Could not remove ${filePath}: ${err.message}`);
    }
  }

  setMockHandler(null);

  console.log('\n' + '='.repeat(70));
  console.log(`  TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('='.repeat(70) + '\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('\n❌ Phase 3 Test Suite Error:', err);
  process.exit(1);
});
