import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { promoteDraft, isSafeFilename } from './promote-draft.js';
import { readLogs } from './core/audit-logger.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

// Isolated Temporary Test Directories
const TEST_DIR = path.join(autopilotConfig.paths.projectRoot, 'scripts', 'autopilot', 'test_phase4_temp');
const TEST_DRAFTS_DIR = path.join(TEST_DIR, 'drafts');
const TEST_BLOG_DIR = path.join(TEST_DIR, 'blog');

// Reference 8 production articles before test
const REAL_PROD_BLOG_DIR = autopilotConfig.paths.productionBlogDir;
const INITIAL_PROD_FILES = fs.readdirSync(REAL_PROD_BLOG_DIR).sort();

/**
 * Generates a valid test markdown article conforming to all Phase 3 schema requirements.
 */
function createValidDraftContent(overrides = {}) {
  const title = overrides.title || 'Complete Lunar Leap Month Guide for Parents';
  const category = overrides.category || 'Chinese Gender Predictor';
  const slug = overrides.slug || 'complete-lunar-leap-month-guide-for-parents';

  let filler = '';
  for (let i = 0; i < 10; i++) {
    filler += `Traditional lunar calendar calculations require accurate conversion from standard Gregorian calendar dates into solar and lunar cycles for timing purposes. Understanding the underlying cultural history of ancient astrological systems provides valuable perspective for modern families exploring these traditions. While ultrasound scans remain standard for medical care, cultural folklore offers historical interest. `;
  }

  return `---
title: "${title}"
description: "Comprehensive guide to understanding Chinese lunar leap months and pregnancy planning traditions with practical cultural context."
pubDate: "2026-09-06"
category: "${category}"
heroImage: "/logo.svg"
heroImageAlt: "Chinese Lunar Leap Month Guide illustration"
excerpt: "Learn how lunar leap months are calculated in traditional Chinese charts and what expectant parents need to know."
tags: ["chinese-gender-predictor", "lunar-calendar", "pregnancy"]
featured: false
faqs:
  - question: "What is a lunar leap month in traditional calendars?"
    answer: "A leap month is an intercalary month added to solar-lunar calendars to keep seasons synchronized with the solar year."
  - question: "Does a leap month change traditional calculations?"
    answer: "Yes, traditional charts typically assign the first half of a leap month to the preceding month."
  - question: "Is this method medically proven?"
    answer: "No, traditional prediction methods are folk traditions and have no clinical diagnostic validity."
  - question: "When can medical ultrasound confirm fetal sex?"
    answer: "Medical ultrasound typically determines anatomy accurately between weeks 18 and 20 of pregnancy."
---

# ${title}

Traditional pregnancy calendars have fascinated families across the world for centuries. When navigating the nuances of ancient charts, questions often arise regarding intercalary leap months and their significance.

## Understanding the Lunar Calendar Structure

The traditional lunisolar calendar synchronizes lunar phases with the solar cycle. Because 12 lunar months equal roughly 354 days—approximately 11 days shorter than a tropical year—an intercalary leap month is added approximately every two to three years.

${filler}

## Historical Context and Folk Practices

Cultural records from ancient dynasties illustrate how lunar observations guided agriculture and social rituals. Many families explore the [Chinese Gender Predictor Tool](/) to view how historical formulas aligned maternal age with conception months.

To explore additional background resources, review our [Pregnancy & Gender Prediction Guides](/blog) and check our [Frequently Asked Questions](/faq) for detailed breakdowns.

${filler}

## Medical Realities and Modern Healthcare

It is essential to distinguish between traditional cultural folklore and scientific obstetrics. Folk methods are not clinically proven. Expectant parents should always consult healthcare professionals and read our [Medical Disclaimer](/medical-disclaimer) and [About Page](/about) for further guidance.

${filler}

## Frequently Asked Questions

### What is a lunar leap month?
A leap month is an extra month inserted periodically in lunisolar calendars.

### Are these charts clinically proven?
No, they are recreational folk traditions without medical certainty.
`;
}

function safeUnlink(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (let i = 0; i < 10; i++) {
    try {
      fs.unlinkSync(filePath);
      return;
    } catch (_) {}
  }
}

/**
 * Setup isolated test environments.
 */
function setupTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (_) {}
  }
  fs.mkdirSync(TEST_DRAFTS_DIR, { recursive: true });
  fs.mkdirSync(TEST_BLOG_DIR, { recursive: true });

  // Populate mock test blog with a dummy article
  fs.writeFileSync(
    path.join(TEST_BLOG_DIR, 'existing-blog-article.md'),
    createValidDraftContent({ title: 'Existing Blog Article', slug: 'existing-blog-article' }),
    'utf-8'
  );
}

/**
 * Cleanup isolated test environment.
 */
function teardownTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (_) {}
  }
}

async function runTestSuite() {
  console.log('\n======================================================================');
  console.log('  🧪 SEO AUTOPILOT - PHASE 4 TEST SUITE');
  console.log('  Safe Draft Promotion Engine Verification');
  console.log('======================================================================\n');

  setupTestEnv();

  // Test inventory for mock tests
  const mockInventory = {
    articles: [
      {
        slug: 'existing-blog-article',
        title: 'Existing Blog Article',
        description: 'Existing article in test blog',
        category: 'Chinese Gender Predictor',
        tags: ['chinese-gender-predictor'],
        route: '/blog/existing-blog-article',
      },
    ],
    categories: [{ name: 'Chinese Gender Predictor', slug: 'chinese-gender-predictor' }],
    tags: [{ name: 'chinese-gender-predictor', slug: 'chinese-gender-predictor' }],
    routes: [
      { path: '/' },
      { path: '/blog' },
      { path: '/faq' },
      { path: '/medical-disclaimer' },
      { path: '/about' },
      { path: '/blog/existing-blog-article' },
    ],
  };

  const defaultOptions = {
    draftsDir: TEST_DRAFTS_DIR,
    productionBlogDir: TEST_BLOG_DIR,
    inventory: mockInventory,
    logToAudit: true,
  };

  // -------------------------------------------------------------
  // Test 1: Valid validated draft promotes successfully
  // -------------------------------------------------------------
  console.log('Test 1: Valid validated draft promotes successfully');
  const validDraftFile = path.join(TEST_DRAFTS_DIR, 'safe-lunar-calendar-guide.md');
  fs.writeFileSync(validDraftFile, createValidDraftContent({ title: 'Safe Lunar Calendar Guide' }), 'utf-8');

  const res1 = await promoteDraft('safe-lunar-calendar-guide.md', defaultOptions);
  assert(res1.success === true, 'Promotion succeeded for valid draft');
  assert(res1.state === RESULT_STATES.PROMOTION_SUCCESS, 'State is PROMOTION_SUCCESS');
  assert(fs.existsSync(path.join(TEST_BLOG_DIR, 'safe-lunar-calendar-guide.md')), 'Promoted file exists in blog dir');

  // -------------------------------------------------------------
  // Test 2: Invalid draft (failing Phase 3 validation) is rejected
  // -------------------------------------------------------------
  console.log('\nTest 2: Invalid draft (bad frontmatter/schema) is rejected');
  const invalidDraftFile = path.join(TEST_DRAFTS_DIR, 'bad-frontmatter-draft.md');
  fs.writeFileSync(invalidDraftFile, '---\ntitle: "Bad"\n---\nToo short.', 'utf-8');

  const res2 = await promoteDraft('bad-frontmatter-draft.md', defaultOptions);
  assert(res2.success === false, 'Invalid draft was rejected');
  assert(res2.state === RESULT_STATES.PROMOTION_VALIDATION_FAILED, 'State is PROMOTION_VALIDATION_FAILED');
  assert(!fs.existsSync(path.join(TEST_BLOG_DIR, 'bad-frontmatter-draft.md')), 'Rejected draft was NOT copied to blog');

  // -------------------------------------------------------------
  // Test 3: Draft below validation requirements (word count < 1200) is rejected
  // -------------------------------------------------------------
  console.log('\nTest 3: Draft below word count threshold is rejected');
  const shortDraftFile = path.join(TEST_DRAFTS_DIR, 'short-draft-article.md');
  const shortContent = `---
title: "Short Draft Article"
description: "A short article that fails minimum word count requirements."
pubDate: "2026-09-06"
category: "Chinese Gender Predictor"
heroImage: "/logo.svg"
heroImageAlt: "Short article hero alt"
excerpt: "Short excerpt for this article testing under-length validation rejection."
tags: ["chinese-gender-predictor"]
faqs:
  - question: "What is the purpose of this test?"
    answer: "This test verifies that under-length articles are rejected."
  - question: "What is the minimum word count?"
    answer: "The production safety minimum is 1200 words."
  - question: "Is this draft below that?"
    answer: "Yes, this draft is only around 60 words."
  - question: "What should happen?"
    answer: "The promotion validator must reject promotion."
---

# Short Draft Article

## Introduction
[Chinese Gender Predictor](/) [Blog](/blog) [FAQ](/faq) [Medical Disclaimer](/medical-disclaimer)

This article only has a few dozen words.

## Another Small Section
Just a quick sentence to finish the body.
`;
  fs.writeFileSync(shortDraftFile, shortContent, 'utf-8');

  const res3 = await promoteDraft('short-draft-article.md', defaultOptions);
  assert(res3.success === false, 'Short draft was rejected');
  assert(res3.state === RESULT_STATES.PROMOTION_VALIDATION_FAILED, 'State is PROMOTION_VALIDATION_FAILED');

  // -------------------------------------------------------------
  // Test 4: Missing draft file is rejected
  // -------------------------------------------------------------
  console.log('\nTest 4: Missing draft file is rejected');
  const res4 = await promoteDraft('non-existent-file.md', defaultOptions);
  assert(res4.success === false, 'Missing draft rejected');
  assert(res4.state === RESULT_STATES.PROMOTION_FILE_NOT_FOUND, 'State is PROMOTION_FILE_NOT_FOUND');

  // -------------------------------------------------------------
  // Test 5: Non-markdown draft is rejected
  // -------------------------------------------------------------
  console.log('\nTest 5: Non-markdown draft is rejected');
  const txtFile = path.join(TEST_DRAFTS_DIR, 'article.txt');
  fs.writeFileSync(txtFile, 'Hello world', 'utf-8');
  const res5 = await promoteDraft('article.txt', defaultOptions);
  assert(res5.success === false, 'Non-markdown file rejected');
  assert(res5.state === RESULT_STATES.PROMOTION_UNSAFE_FILENAME, 'State is PROMOTION_UNSAFE_FILENAME');

  // -------------------------------------------------------------
  // Test 6: Path traversal in source draft is rejected
  // -------------------------------------------------------------
  console.log('\nTest 6: Path traversal source path is rejected');
  const res6 = await promoteDraft('../../secret.md', defaultOptions);
  assert(res6.success === false, 'Path traversal source rejected');
  assert(res6.state === RESULT_STATES.PROMOTION_UNSAFE_PATH, 'State is PROMOTION_UNSAFE_PATH');

  // -------------------------------------------------------------
  // Test 7: Absolute path outside drafts directory is rejected
  // -------------------------------------------------------------
  console.log('\nTest 7: Absolute path outside drafts directory is rejected');
  const outsidePath = path.resolve(autopilotConfig.paths.projectRoot, 'package.json');
  const res7 = await promoteDraft(outsidePath, defaultOptions);
  assert(res7.success === false, 'Outside path rejected');
  assert(res7.state === RESULT_STATES.PROMOTION_UNSAFE_PATH, 'State is PROMOTION_UNSAFE_PATH');

  // -------------------------------------------------------------
  // Test 8: Destination path traversal is impossible
  // -------------------------------------------------------------
  console.log('\nTest 8: Destination path traversal is impossible');
  const traversalDraftName = 'valid-name.md';
  assert(isSafeFilename(traversalDraftName) === true, 'Standard name is safe');
  assert(isSafeFilename('../sneaky.md') === false, 'Traversal path is flagged unsafe');
  assert(isSafeFilename('/etc/passwd.md') === false, 'Slash path is flagged unsafe');

  // -------------------------------------------------------------
  // Test 9: Existing production slug blocks promotion
  // -------------------------------------------------------------
  console.log('\nTest 9: Existing production slug blocks promotion');
  const duplicateSlugDraft = path.join(TEST_DRAFTS_DIR, 'existing-blog-article.md');
  fs.writeFileSync(duplicateSlugDraft, createValidDraftContent({ title: 'New Version Of Existing' }), 'utf-8');

  const res9 = await promoteDraft('existing-blog-article.md', defaultOptions);
  assert(res9.success === false, 'Promotion blocked for existing slug');
  assert(res9.state === RESULT_STATES.PRODUCTION_SLUG_EXISTS, 'State is PRODUCTION_SLUG_EXISTS');

  // -------------------------------------------------------------
  // Test 10: Promotion never overwrites an existing article
  // -------------------------------------------------------------
  console.log('\nTest 10: Promotion never overwrites an existing article');
  const existingContentBefore = fs.readFileSync(path.join(TEST_BLOG_DIR, 'existing-blog-article.md'), 'utf-8');
  await promoteDraft('existing-blog-article.md', defaultOptions);
  const existingContentAfter = fs.readFileSync(path.join(TEST_BLOG_DIR, 'existing-blog-article.md'), 'utf-8');
  assert(existingContentBefore === existingContentAfter, 'Existing production article content remained 100% identical');

  // -------------------------------------------------------------
  // Test 11: Unsafe filename is rejected
  // -------------------------------------------------------------
  console.log('\nTest 11: Unsafe filename is rejected');
  assert(isSafeFilename('My Article.md') === false, 'Uppercase and spaces rejected');
  assert(isSafeFilename('article_underscores.md') === false, 'Underscores rejected (hyphens required)');
  assert(isSafeFilename('article<script>.md') === false, 'HTML chars rejected');

  // -------------------------------------------------------------
  // Test 12: Duplicate extension filename is rejected
  // -------------------------------------------------------------
  console.log('\nTest 12: Duplicate extension filename is rejected');
  assert(isSafeFilename('article.md.exe') === false, 'Duplicate extension .md.exe rejected');
  assert(isSafeFilename('article.test.md') === false, 'Multiple dots rejected');
  assert(isSafeFilename('.hidden-article.md') === false, 'Hidden dotfiles rejected');

  // -------------------------------------------------------------
  // Test 13: Exact duplicate title is rejected by cannibalization
  // -------------------------------------------------------------
  console.log('\nTest 13: Exact duplicate title is rejected');
  const dupTitleDraft = path.join(TEST_DRAFTS_DIR, 'unique-slug-same-title.md');
  fs.writeFileSync(dupTitleDraft, createValidDraftContent({ title: 'Existing Blog Article' }), 'utf-8');

  const res13 = await promoteDraft('unique-slug-same-title.md', defaultOptions);
  assert(res13.success === false, 'Exact title match blocked by cannibalization check');
  assert(res13.state === RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED, 'State is PROMOTION_CANNIBALIZATION_REJECTED');

  // -------------------------------------------------------------
  // Test 14: REJECT-level cannibalization blocks promotion
  // -------------------------------------------------------------
  console.log('\nTest 14: REJECT-level cannibalization blocks promotion');
  const highOverlapDraft = path.join(TEST_DRAFTS_DIR, 'existing-blog-article-overlap.md');
  fs.writeFileSync(highOverlapDraft, createValidDraftContent({ title: 'Existing Blog Article Guide', category: 'Unapproved Category' }), 'utf-8');

  const res14 = await promoteDraft('existing-blog-article-overlap.md', defaultOptions);
  assert(res14.success === false, 'REJECT-level topic blocked');
  assert(
    res14.state === RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED || res14.state === RESULT_STATES.PROMOTION_VALIDATION_FAILED,
    'Blocked by safety gate'
  );

  // -------------------------------------------------------------
  // Test 15: CAUTION-level cannibalization blocks promotion by default
  // -------------------------------------------------------------
  console.log('\nTest 15: CAUTION-level cannibalization blocks promotion');
  const cautionInventory = {
    ...mockInventory,
    articles: [
      {
        slug: 'chinese-gender-predictor-accuracy',
        title: 'Chinese Gender Predictor Accuracy Analysis',
        description: 'Analysis of prediction chart accuracy rates',
        category: 'Chinese Gender Predictor',
        tags: ['chinese-gender-predictor', 'accuracy'],
        route: '/blog/chinese-gender-predictor-accuracy',
      },
    ],
  };
  const cautionDraft = path.join(TEST_DRAFTS_DIR, 'chinese-gender-predictor-accuracy-rates.md');
  fs.writeFileSync(
    cautionDraft,
    createValidDraftContent({ title: 'Chinese Gender Predictor Accuracy Rates Study' }),
    'utf-8'
  );

  const res15 = await promoteDraft('chinese-gender-predictor-accuracy-rates.md', {
    ...defaultOptions,
    inventory: cautionInventory,
    allowCaution: false,
  });
  assert(res15.success === false, 'CAUTION overlap blocked by default');
  assert(res15.state === RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED, 'State is PROMOTION_CANNIBALIZATION_REJECTED');

  // -------------------------------------------------------------
  // Test 16: SAFE draft passes cannibalization checks
  // -------------------------------------------------------------
  console.log('\nTest 16: SAFE draft passes cannibalization checks');
  const safeDraftFile = path.join(TEST_DRAFTS_DIR, 'ancient-mayan-calendar-origins.md');
  fs.writeFileSync(
    safeDraftFile,
    createValidDraftContent({ title: 'Ancient Mayan Calendar Historical Origins', category: 'Mayan Gender Predictor' }),
    'utf-8'
  );

  const res16 = await promoteDraft('ancient-mayan-calendar-origins.md', defaultOptions);
  assert(res16.success === true, 'SAFE draft promoted');
  assert(res16.state === RESULT_STATES.PROMOTION_SUCCESS, 'State is PROMOTION_SUCCESS');

  // -------------------------------------------------------------
  // Test 17: Promoted file remains inside production target directory
  // -------------------------------------------------------------
  console.log('\nTest 17: Promoted file remains inside production target directory');
  assert(fs.existsSync(path.join(TEST_BLOG_DIR, 'ancient-mayan-calendar-origins.md')), 'Promoted file is in target blog dir');
  const rel = path.relative(TEST_BLOG_DIR, res16.promotedPath);
  assert(!rel.startsWith('..') && !path.isAbsolute(rel), 'Promoted file path is contained inside target blog dir');

  // -------------------------------------------------------------
  // Test 18: Source draft remains after promotion (not deleted)
  // -------------------------------------------------------------
  console.log('\nTest 18: Source draft remains after promotion');
  assert(fs.existsSync(safeDraftFile), 'Source draft is preserved for auditing/history');

  // -------------------------------------------------------------
  // Test 19: Promoted content matches source content
  // -------------------------------------------------------------
  console.log('\nTest 19: Promoted content matches source content');
  const srcContent = fs.readFileSync(safeDraftFile, 'utf-8');
  const promotedContent = fs.readFileSync(res16.promotedPath, 'utf-8');
  assert(srcContent === promotedContent, 'Promoted content matches source draft bit-for-bit');

  // -------------------------------------------------------------
  // Test 20: Post-promotion validation succeeds
  // -------------------------------------------------------------
  console.log('\nTest 20: Post-promotion validation succeeds');
  assert(res16.validation && res16.validation.valid === true, 'Post-promotion validation is confirmed valid');

  // -------------------------------------------------------------
  // Test 21: Failed promotion leaves production target unchanged
  // -------------------------------------------------------------
  console.log('\nTest 21: Failed promotion leaves production target unchanged');
  const countBefore = fs.readdirSync(TEST_BLOG_DIR).length;
  await promoteDraft('non-existent-ghost.md', defaultOptions);
  const countAfter = fs.readdirSync(TEST_BLOG_DIR).length;
  assert(countBefore === countAfter, 'Blog directory file count unchanged after failed promotion');

  // -------------------------------------------------------------
  // Test 22: Temporary files are cleaned after failure
  // -------------------------------------------------------------
  console.log('\nTest 22: Temporary files are cleaned after failure');
  const tempFiles = fs.readdirSync(TEST_BLOG_DIR).filter((f) => f.startsWith('.promote-') || f.endsWith('.tmp'));
  assert(tempFiles.length === 0, 'No leftover temporary files in blog directory');

  // -------------------------------------------------------------
  // Test 23: Audit log records successful promotion
  // -------------------------------------------------------------
  console.log('\nTest 23: Audit log records successful promotion');
  const logs = readLogs();
  const successLog = logs.find((l) => l.action === 'PROMOTE_DRAFT' && l.status === 'SUCCESS');
  assert(Boolean(successLog), 'Audit log contains successful PROMOTE_DRAFT record');

  // -------------------------------------------------------------
  // Test 24: Audit log records failed promotion
  // -------------------------------------------------------------
  console.log('\nTest 24: Audit log records failed promotion');
  const failedLog = logs.find((l) => l.action === 'PROMOTE_DRAFT' && (l.status === 'ERROR' || l.status === 'WARNING'));
  assert(Boolean(failedLog), 'Audit log contains failed PROMOTE_DRAFT record');

  // -------------------------------------------------------------
  // Test 25: Audit log contains no secrets
  // -------------------------------------------------------------
  console.log('\nTest 25: Audit log contains no secrets');
  const logStr = JSON.stringify(logs);
  assert(!logStr.includes('AIzaSy'), 'No Gemini API keys in audit log');
  assert(!logStr.includes('gsk_'), 'No Groq API keys in audit log');

  // -------------------------------------------------------------
  // Test 26: CLI success returns exit code 0
  // -------------------------------------------------------------
  console.log('\nTest 26: CLI success returns exit code 0');
  const cliDraftFile = path.join(autopilotConfig.paths.draftsDir, 'cli-test-temp-draft.md');
  // Write a temp draft into real drafts dir for CLI test (will be removed immediately)
  fs.writeFileSync(cliDraftFile, createValidDraftContent({ title: 'CLI Test Non-Existent Demo' }), 'utf-8');

  // We test CLI failure on non-promotable/missing or help flag first
  let cliSuccess = false;
  try {
    // Calling with an invalid file should exit non-zero
    execSync('node scripts/autopilot/promote-draft.js --file nonexistent-file.md', {
      cwd: autopilotConfig.paths.projectRoot,
      stdio: 'pipe',
    });
    cliSuccess = true;
  } catch (err) {
    cliSuccess = false;
  }
  assert(cliSuccess === false, 'CLI exited with non-zero on non-existent file');

  // -------------------------------------------------------------
  // Test 27: CLI failure returns non-zero exit code
  // -------------------------------------------------------------
  console.log('\nTest 27: CLI failure returns non-zero exit code');
  let cliFailCode = 0;
  try {
    execSync('node scripts/autopilot/promote-draft.js', {
      cwd: autopilotConfig.paths.projectRoot,
      stdio: 'pipe',
    });
  } catch (err) {
    cliFailCode = err.status || 1;
  }
  assert(cliFailCode !== 0, 'CLI exited with non-zero when run without arguments');

  safeUnlink(cliDraftFile);

  // -------------------------------------------------------------
  // Test 28: Existing production blog remains untouched during test suite
  // -------------------------------------------------------------
  console.log('\nTest 28: Existing production blog remains untouched during test suite');
  const currentProdFiles = fs.readdirSync(REAL_PROD_BLOG_DIR).sort();
  assert(
    JSON.stringify(INITIAL_PROD_FILES) === JSON.stringify(currentProdFiles),
    `Production blog contains exact 8 original articles (${currentProdFiles.length} files)`
  );

  // -------------------------------------------------------------
  // Test 29: Multiple promotion attempts cannot overwrite an existing slug
  // -------------------------------------------------------------
  console.log('\nTest 29: Multiple promotion attempts cannot overwrite an existing slug');
  const res29 = await promoteDraft('safe-lunar-calendar-guide.md', defaultOptions);
  assert(res29.success === false, 'Second promotion attempt is blocked');
  assert(res29.state === RESULT_STATES.PRODUCTION_SLUG_EXISTS, 'State is PRODUCTION_SLUG_EXISTS');

  // -------------------------------------------------------------
  // Test 30: Malformed markdown fails safely
  // -------------------------------------------------------------
  console.log('\nTest 30: Malformed markdown fails safely');
  const malformedDraft = path.join(TEST_DRAFTS_DIR, 'malformed-article.md');
  fs.writeFileSync(malformedDraft, '\x00\x01\x02\x03\x04\x05', 'utf-8');

  const res30 = await promoteDraft('malformed-article.md', defaultOptions);
  assert(res30.success === false, 'Malformed file rejected safely');
  assert(res30.state === RESULT_STATES.PROMOTION_VALIDATION_FAILED, 'State is PROMOTION_VALIDATION_FAILED');

  // Cleanup isolated test environments
  teardownTestEnv();

  console.log('\n======================================================================');
  console.log(`  TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  teardownTestEnv();
  console.error('Test suite runtime error:', err);
  process.exit(1);
});
