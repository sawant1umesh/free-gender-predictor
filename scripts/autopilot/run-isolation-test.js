#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { scanInventory } from './core/inventory.js';
import { runAutopilot } from './index.js';
import { promoteDraft } from './promote-draft.js';
import { setMockHandler } from './core/ai-client.js';
import { createRunId, readRunManifest, writeRunManifest, clearCurrentRunManifest } from './core/manifest.js';
import { createDraft, serializeAstroMarkdown } from './core/draft-generator.js';

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

// Production blog backup reference
const REAL_PROD_BLOG_DIR = autopilotConfig.paths.productionBlogDir;
const INITIAL_PROD_FILES = fs.readdirSync(REAL_PROD_BLOG_DIR).sort();

// Isolated temporary test environment
const TEST_DIR = path.join(autopilotConfig.paths.projectRoot, 'scripts', 'autopilot', 'test_isolation_temp');
const TEST_DRAFTS_DIR = path.join(TEST_DIR, 'drafts');
const TEST_BLOG_DIR = path.join(TEST_DIR, 'blog');
const TEST_MANIFEST_PATH = path.join(TEST_DIR, '.test-current-run.json');

function setupTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
  fs.mkdirSync(TEST_DRAFTS_DIR, { recursive: true });
  fs.mkdirSync(TEST_BLOG_DIR, { recursive: true });

  // Copy initial production articles to test blog
  for (const file of INITIAL_PROD_FILES) {
    fs.copyFileSync(path.join(REAL_PROD_BLOG_DIR, file), path.join(TEST_BLOG_DIR, file));
  }
}

function teardownTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
}

function createValidArticleOutput(title = 'Lunar Conception Patterns and Pregnancy Lore') {
  const paragraph = `When expectant parents explore baby gender prediction methods, they frequently encounter ancient cultural charts, folk traditions, and modern clinical diagnostics. While tools like the traditional [Chinese Gender Predictor](/) offer an entertaining way to explore pregnancy lore based on maternal lunar age and lunar conception months, it is essential to understand the scientific reality behind fetal sex determination. Studies analyzing millions of births have consistently demonstrated that folk charts perform at roughly a fifty percent statistical rate, which is equivalent to a random coin flip. For families interested in exploring the history, our [Chinese Gender Calendar](/blog/chinese-gender-calendar) guide provides deep cultural context without mistaking folklore for clinical diagnostics. Meanwhile, genuine clinical determination relies on mid-pregnancy ultrasound anatomy scans at eighteen to twenty weeks or cell-free fetal DNA screening (NIPT) from ten weeks of gestation. Parents should always consult certified healthcare professionals for prenatal medical guidance. `;

  return JSON.stringify({
    frontmatter: {
      title,
      seoTitle: `${title} - Cultural Guide`,
      description: 'Comprehensive analysis of lunar conception patterns and how traditional charts compare with modern diagnostics.',
      pubDate: '2026-09-13',
      category: 'Chinese Gender Predictor',
      tags: ['Chinese Gender Predictor', 'Baby Gender Prediction', 'Pregnancy'],
      heroImage: '/logo.svg',
      heroImageAlt: 'Lunar Conception Patterns Guide',
      excerpt: 'Discover the history of lunar conception patterns in traditional pregnancy folklore and what scientific research says.',
      featured: false,
      faqs: [
        {
          question: 'What is lunar conception prediction?',
          answer: 'It is a traditional folk system that matches maternal lunar age with lunar calendar months.',
        },
        {
          question: 'Is this method scientifically verified?',
          answer: 'No, scientific evaluations show approximately a 50% accuracy rate.',
        },
        {
          question: 'When does medical ultrasound determine gender?',
          answer: 'Anatomy ultrasounds typically detect anatomical sex at 18 to 20 weeks.',
        },
        {
          question: 'Does maternal diet determine baby gender?',
          answer: 'Clinical evidence does not support maternal diet as a deterministic factor.',
        },
      ],
    },
    markdownBody: `# ${title}\n\n` +
      `Understanding traditional cultural charts versus medical prenatal care.\n\n` +
      `## Overview of Cultural Lore\n\n${paragraph.repeat(4)}\n\n` +
      `## The Science of Fetal Sex Determination\n\nParents can consult our [FAQ](/faq) and [Medical Disclaimer](/medical-disclaimer) pages.\n\n${paragraph.repeat(4)}\n\n` +
      `## Clinical Methods: Ultrasounds and NIPT\n\nReview our [Guides](/blog) for more details.\n\n${paragraph.repeat(4)}\n\n` +
      `## Summary and Guidelines\n\n${paragraph.repeat(2)}\n\n` +
      `## Frequently Asked Questions\n\n` +
      `### What is lunar conception prediction?\nA traditional folk chart system.\n\n` +
      `### Is this method accurate?\nIt performs at random chance.\n\n` +
      `### When can gender be determined medically?\nFrom 10 weeks via NIPT or 18-20 weeks via ultrasound.\n\n` +
      `### Does diet influence gender?\nNo scientific evidence supports this.\n`,
  });
}

async function runIsolationTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  🧪 SEO AUTOPILOT - RUN ISOLATION & STALE DRAFT PREVENTION TESTS');
  console.log('  Verifying unique run IDs, staging isolation, and manifest handoff');
  console.log('='.repeat(70) + '\n');

  setupTestEnv();

  // ------------------------------------------------------------------
  // Test 1: Unique Run ID generation & format
  // ------------------------------------------------------------------
  console.log('Test 1: Unique Run ID generation & format');
  const id1 = createRunId();
  const id2 = createRunId();
  assert(id1 !== id2, 'createRunId produces unique values');
  assert(/^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{6}$/.test(id1), `Run ID matches expected ISO format: ${id1}`);

  // ------------------------------------------------------------------
  // Test 2: createDraft creates run-isolated subdirectories
  // ------------------------------------------------------------------
  console.log('\nTest 2: createDraft creates run-isolated subdirectories');
  const testRunId = createRunId();
  const draftRes = createDraft({
    frontmatter: {
      title: 'Run Isolation Sample Article',
      category: 'Chinese Gender Predictor',
      description: 'Test article for isolated run directories.',
      heroImage: '/logo.svg',
      heroImageAlt: 'Sample',
      excerpt: 'Sample excerpt text.',
    },
    markdownBody: '## Heading\n\nBody content.',
    suggestedSlug: 'run-isolation-sample-article',
    runId: testRunId,
    draftsDir: TEST_DRAFTS_DIR,
  });

  assert(draftRes.success === true, 'createDraft succeeds with runId');
  assert(draftRes.runId === testRunId, 'draftRes returns matching runId');
  assert(
    draftRes.draftPath.includes(testRunId),
    `Draft file path contains runId subfolder: ${draftRes.draftPath}`
  );
  assert(fs.existsSync(draftRes.draftPath), 'Draft file was created in isolated run directory');

  // Verify duplicate filename inside same run is rejected
  const dupDraftRes = createDraft({
    frontmatter: { title: 'Duplicate Article', category: 'Chinese Gender Predictor' },
    markdownBody: 'Body',
    suggestedSlug: 'run-isolation-sample-article',
    runId: testRunId,
    draftsDir: TEST_DRAFTS_DIR,
  });
  assert(dupDraftRes.success === false, 'Duplicate draft in same run directory is rejected');
  assert(dupDraftRes.error.includes('already exists in run directory'), 'Error message warns about duplicate in run directory');

  // ------------------------------------------------------------------
  // Test 3: Stale draft exists in drafts directory while a new run starts
  // ------------------------------------------------------------------
  console.log('\nTest 3: Stale draft in drafts directory is ignored by new run');
  // Create a stale historical draft in root drafts dir
  const staleDraftPath = path.join(autopilotConfig.paths.draftsDir, 'stale-historical-old-draft.md');
  fs.writeFileSync(
    staleDraftPath,
    '---\ntitle: "Old Stale Draft"\ncategory: "Chinese Gender Predictor"\n---\nOld content',
    'utf-8'
  );

  setMockHandler(() => ({
    success: true,
    rawText: createValidArticleOutput('Fresh Generated Article for Current Run'),
  }));

  const candidateTopic = {
    id: 'seed-fresh-01',
    title: 'Fresh Generated Article for Current Run',
    suggestedSlug: 'fresh-generated-article-current-run',
    category: 'Chinese Gender Predictor',
    primaryKeyword: 'fresh generated article current run',
    secondaryKeywords: [],
  };

  const currentRunRes = await runAutopilot({
    generate: true,
    overrideTopic: candidateTopic,
  });

  assert(currentRunRes.success === true, 'Current run succeeds');
  assert(Boolean(currentRunRes.runId), 'Current run has valid runId');
  assert(
    currentRunRes.draftPath.includes(currentRunRes.runId),
    `Current run draft path is isolated in run folder: ${currentRunRes.draftPath}`
  );

  // Verify manifest points strictly to the current run draft, NOT stale draft
  const currentManifest = readRunManifest();
  assert(currentManifest !== null, 'Current run manifest exists');
  assert(currentManifest.runId === currentRunRes.runId, 'Manifest has matching current runId');
  assert(
    currentManifest.draft.draftPath === currentRunRes.draftPath,
    'Manifest draftPath points to current run draft'
  );
  assert(
    !currentManifest.draft.draftPath.includes('stale-historical-old-draft.md'),
    'Manifest does NOT reference the stale draft file'
  );

  // Clean up stale test file and current test draft
  try {
    if (fs.existsSync(staleDraftPath)) fs.unlinkSync(staleDraftPath);
    if (fs.existsSync(currentRunRes.draftPath)) fs.unlinkSync(currentRunRes.draftPath);
    const runDir = path.dirname(currentRunRes.draftPath);
    if (fs.existsSync(runDir)) fs.rmSync(runDir, { recursive: true, force: true });
  } catch (_) {}

  // ------------------------------------------------------------------
  // Test 4: Stale draft slug already exists in production -> new run ignores it
  // ------------------------------------------------------------------
  console.log('\nTest 4: Stale draft whose slug exists in production is never promoted');
  // Create a stale draft matching an existing production article
  const prodSlugDraft = path.join(autopilotConfig.paths.draftsDir, 'baby-gender-prediction-methods.md');
  fs.writeFileSync(
    prodSlugDraft,
    '---\ntitle: "Baby Gender Prediction Methods: Folk Traditions vs. Medical Facts"\ncategory: "Baby Gender Prediction Methods"\n---\nOld content',
    'utf-8'
  );

  // Write a manifest for a different valid topic
  const testSafeRunId = createRunId();
  const testSafeRunDir = path.join(TEST_DRAFTS_DIR, testSafeRunId);
  fs.mkdirSync(testSafeRunDir, { recursive: true });
  const validCurrentDraftPath = path.join(testSafeRunDir, 'clinical-ultrasound-vs-genetic-testing.md');
  const safeData = JSON.parse(createValidArticleOutput('Clinical Ultrasound Anatomy Scans vs Genetic NIPT Testing'));
  fs.writeFileSync(
    validCurrentDraftPath,
    serializeAstroMarkdown(safeData.frontmatter, safeData.markdownBody),
    'utf-8'
  );

  const manifestWithSafeTopic = {
    runId: testSafeRunId,
    status: 'VALIDATED',
    resultState: RESULT_STATES.VALIDATED_DRAFT_CREATED,
    draft: {
      runId: testSafeRunId,
      slug: 'clinical-ultrasound-vs-genetic-testing',
      draftPath: validCurrentDraftPath,
    },
    validation: { valid: true },
  };
  writeRunManifest(manifestWithSafeTopic, TEST_MANIFEST_PATH);

  // Promote via manifest in test environment
  const promoteRes = await promoteDraft(null, {
    manifest: TEST_MANIFEST_PATH,
    productionBlogDir: TEST_BLOG_DIR,
    draftsDir: TEST_DRAFTS_DIR,
    logToAudit: false,
  });

  assert(promoteRes.success === true, 'Promotion via manifest succeeds for current run draft');
  assert(promoteRes.slug === 'clinical-ultrasound-vs-genetic-testing', 'Promoted current run slug');
  assert(
    !promoteRes.slug || !promoteRes.slug.includes('baby-gender-prediction-methods'),
    'Stale draft baby-gender-prediction-methods was NOT touched or promoted'
  );

  // Clean up stale file
  try {
    if (fs.existsSync(prodSlugDraft)) fs.unlinkSync(prodSlugDraft);
  } catch (_) {}

  // ------------------------------------------------------------------
  // Test 5: Generation failure stops pipeline safely; never promotes stale draft
  // ------------------------------------------------------------------
  console.log('\nTest 5: Generation failure stops pipeline safely; never promotes stale draft');
  // Create a stale draft in drafts dir
  const lingeringDraft = path.join(autopilotConfig.paths.draftsDir, 'lingering-old-draft.md');
  fs.writeFileSync(lingeringDraft, '---\ntitle: "Lingering Draft"\n---\nBody', 'utf-8');

  // Force AI failure
  setMockHandler(() => ({
    success: false,
    error: 'Simulated upstream AI provider failure',
  }));

  const failedGenRun = await runAutopilot({
    generate: true,
    overrideTopic: {
      title: 'Valid Topic That Fails Generation',
      suggestedSlug: 'valid-topic-fails-generation',
      category: 'Chinese Gender Predictor',
    },
  });

  assert(failedGenRun.success === false, 'runAutopilot returns success: false on generation failure');
  assert(failedGenRun.state === RESULT_STATES.GENERATION_FAILED, 'State is GENERATION_FAILED');

  // Verify manifest indicates generation failed and draft is null
  const failedManifest = readRunManifest();
  assert(failedManifest !== null, 'Manifest exists after failed run');
  assert(failedManifest.status === 'GENERATION_FAILED', 'Manifest status is GENERATION_FAILED');
  assert(failedManifest.draft === null, 'Manifest draft is null');

  // Promote via manifest -> must fail safely and NEVER promote lingering draft
  const failedPromoteRes = await promoteDraft(null, {
    manifest: autopilotConfig.paths.currentRunManifest,
    logToAudit: false,
  });

  assert(failedPromoteRes.success === false, 'promoteDraft fails safely on ungenerated manifest');
  assert(
    failedPromoteRes.state === RESULT_STATES.CURRENT_RUN_DRAFT_INVALID,
    `State is CURRENT_RUN_DRAFT_INVALID (${failedPromoteRes.state})`
  );
  assert(
    !fs.existsSync(path.join(REAL_PROD_BLOG_DIR, 'lingering-old-draft.md')),
    'Lingering draft was NEVER promoted to production'
  );

  try {
    if (fs.existsSync(lingeringDraft)) fs.unlinkSync(lingeringDraft);
  } catch (_) {}

  // ------------------------------------------------------------------
  // Test 6: Validation failure stops pipeline safely; never promotes stale draft
  // ------------------------------------------------------------------
  console.log('\nTest 6: Validation failure stops pipeline safely; never promotes stale draft');
  // Mock AI produces valid syntax and body but unapproved category, triggering Phase 3 validation failure
  setMockHandler(() => {
    const validData = JSON.parse(createValidArticleOutput('Draft With Invalid Unapproved Category'));
    validData.frontmatter.category = 'Invalid Unapproved Category';
    return {
      success: true,
      rawText: JSON.stringify(validData),
    };
  });

  const failedValRun = await runAutopilot({
    generate: true,
    overrideTopic: {
      title: 'Draft With Invalid Unapproved Category',
      suggestedSlug: 'draft-with-invalid-unapproved-category',
      category: 'Chinese Gender Predictor',
    },
  });

  assert(failedValRun.success === false, 'runAutopilot fails on invalid draft');
  assert(failedValRun.state === RESULT_STATES.VALIDATION_FAILED, `State is VALIDATION_FAILED (${failedValRun.state})`);

  const valFailManifest = readRunManifest();
  assert(valFailManifest.status === 'VALIDATION_FAILED', `Manifest status is VALIDATION_FAILED (${valFailManifest.status})`);

  const valPromoteRes = await promoteDraft(null, {
    manifest: autopilotConfig.paths.currentRunManifest,
    logToAudit: false,
  });

  assert(valPromoteRes.success === false, 'promoteDraft rejects invalid validation draft');
  assert(valPromoteRes.state === RESULT_STATES.CURRENT_RUN_DRAFT_INVALID, 'State is CURRENT_RUN_DRAFT_INVALID');

  // Clean up invalid draft file and directory
  if (failedValRun.draftPath && fs.existsSync(failedValRun.draftPath)) {
    try {
      fs.unlinkSync(failedValRun.draftPath);
      const valDir = path.dirname(failedValRun.draftPath);
      if (fs.existsSync(valDir)) fs.rmSync(valDir, { recursive: true, force: true });
    } catch (_) {}
  }

  // ------------------------------------------------------------------
  // Test 7: Multiple historical drafts exist -> none are promoted by scheduled run
  // ------------------------------------------------------------------
  console.log('\nTest 7: Multiple historical drafts exist -> none are promoted');
  const histDir = TEST_DRAFTS_DIR;
  const oldFiles = ['hist-article-1.md', 'hist-article-2.md', 'hist-article-3.md'];
  for (const f of oldFiles) {
    fs.writeFileSync(path.join(histDir, f), '---\ntitle: "Historical"\n---\nContent', 'utf-8');
  }

  // Current run has its own run-specific directory
  const multiTestRunId = createRunId();
  const multiTestRunDir = path.join(TEST_DRAFTS_DIR, multiTestRunId);
  fs.mkdirSync(multiTestRunDir, { recursive: true });
  const newValidDraft = path.join(multiTestRunDir, 'brand-new-isolated-article.md');
  const multiData = JSON.parse(createValidArticleOutput('Brand New Isolated Article For Multi Test'));
  fs.writeFileSync(
    newValidDraft,
    serializeAstroMarkdown(multiData.frontmatter, multiData.markdownBody),
    'utf-8'
  );

  const multiManifest = {
    runId: multiTestRunId,
    status: 'VALIDATED',
    resultState: RESULT_STATES.VALIDATED_DRAFT_CREATED,
    draft: {
      runId: multiTestRunId,
      slug: 'brand-new-isolated-article',
      draftPath: newValidDraft,
    },
    validation: { valid: true },
  };
  const multiManifestPath = path.join(TEST_DIR, '.multi-manifest.json');
  writeRunManifest(multiManifest, multiManifestPath);

  const multiPromoteRes = await promoteDraft(null, {
    manifest: multiManifestPath,
    productionBlogDir: TEST_BLOG_DIR,
    draftsDir: TEST_DRAFTS_DIR,
    logToAudit: false,
  });

  assert(multiPromoteRes.success === true, 'Promotion succeeds for current run draft');
  assert(multiPromoteRes.slug === 'brand-new-isolated-article', 'Promoted exact current run slug');

  // Verify none of the historical drafts were copied to blog dir
  for (const f of oldFiles) {
    assert(!fs.existsSync(path.join(TEST_BLOG_DIR, f)), `Historical draft "${f}" was NOT promoted`);
  }

  // ------------------------------------------------------------------
  // Test 8: Production overwrite protection remains strictly blocked
  // ------------------------------------------------------------------
  console.log('\nTest 8: Overwriting production articles remains strictly blocked');
  const overwriteTestRunId = createRunId();
  const overwriteRunDir = path.join(TEST_DRAFTS_DIR, overwriteTestRunId);
  fs.mkdirSync(overwriteRunDir, { recursive: true });
  const overwriteDraftPath = path.join(overwriteRunDir, 'baby-gender-prediction-methods.md');
  const overwriteData = JSON.parse(createValidArticleOutput('Baby Gender Prediction Methods: Folk Traditions vs. Medical Facts'));
  fs.writeFileSync(
    overwriteDraftPath,
    serializeAstroMarkdown(overwriteData.frontmatter, overwriteData.markdownBody),
    'utf-8'
  );

  const overwriteManifest = {
    runId: overwriteTestRunId,
    status: 'VALIDATED',
    resultState: RESULT_STATES.VALIDATED_DRAFT_CREATED,
    draft: {
      runId: overwriteTestRunId,
      slug: 'baby-gender-prediction-methods',
      draftPath: overwriteDraftPath,
    },
    validation: { valid: true },
  };
  const overwriteManifestPath = path.join(TEST_DIR, '.overwrite-manifest.json');
  writeRunManifest(overwriteManifest, overwriteManifestPath);

  const overwriteRes = await promoteDraft(null, {
    manifest: overwriteManifestPath,
    productionBlogDir: TEST_BLOG_DIR,
    draftsDir: TEST_DRAFTS_DIR,
    logToAudit: false,
  });

  assert(overwriteRes.success === false, 'Overwrite of existing production article is rejected');
  assert(
    overwriteRes.state === RESULT_STATES.PRODUCTION_SLUG_EXISTS,
    'State is PRODUCTION_SLUG_EXISTS'
  );

  // ------------------------------------------------------------------
  // Test 9: No SAFE topic available -> exits cleanly with NO_STRONG_TOPIC_FOUND / NO_PROMOTION_REQUIRED
  // ------------------------------------------------------------------
  console.log('\nTest 9: No SAFE topic available -> clean exit');
  // Write a manifest representing no topic found
  const noTopicRunId = createRunId();
  const noTopicManifest = {
    runId: noTopicRunId,
    status: 'NO_STRONG_TOPIC_FOUND',
    resultState: RESULT_STATES.NO_STRONG_TOPIC_FOUND,
    draft: null,
    validation: null,
  };
  const noTopicManifestPath = path.join(TEST_DIR, '.no-topic-manifest.json');
  writeRunManifest(noTopicManifest, noTopicManifestPath);

  const noTopicPromoteRes = await promoteDraft(null, {
    manifest: noTopicManifestPath,
    logToAudit: false,
  });

  assert(noTopicPromoteRes.success === true, 'promoteDraft returns success: true on NO_STRONG_TOPIC_FOUND');
  assert(
    noTopicPromoteRes.state === RESULT_STATES.NO_PROMOTION_REQUIRED,
    'State is NO_PROMOTION_REQUIRED (safe clean exit)'
  );

  // ------------------------------------------------------------------
  // Test 10: Dry-run manifest handled cleanly by promotion engine
  // ------------------------------------------------------------------
  console.log('\nTest 10: Dry-run manifest handled cleanly by promotion engine');
  const dryRunManifest = {
    runId: createRunId(),
    mode: 'dry-run',
    status: 'DRY_RUN_COMPLETE',
    resultState: RESULT_STATES.DRY_RUN_COMPLETE,
    draft: null,
  };
  const dryRunManifestPath = path.join(TEST_DIR, '.dry-run-manifest.json');
  writeRunManifest(dryRunManifest, dryRunManifestPath);

  const dryRunPromoteRes = await promoteDraft(null, {
    manifest: dryRunManifestPath,
    logToAudit: false,
  });

  assert(dryRunPromoteRes.success === true, 'promoteDraft handles dry-run cleanly');
  assert(dryRunPromoteRes.state === RESULT_STATES.NO_PROMOTION_REQUIRED, 'State is NO_PROMOTION_REQUIRED');

  // ------------------------------------------------------------------
  // Test 11: Real production content remains completely untouched
  // ------------------------------------------------------------------
  console.log('\nTest 11: Production content safety remains intact');
  const currentProdFiles = fs.readdirSync(REAL_PROD_BLOG_DIR).sort();
  assert(
    JSON.stringify(INITIAL_PROD_FILES) === JSON.stringify(currentProdFiles),
    `Production blog contains exact 9 original articles (${currentProdFiles.length} files)`
  );

  setMockHandler(null);
  teardownTestEnv();
  clearCurrentRunManifest();

  console.log('\n' + '='.repeat(70));
  console.log(`  TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('='.repeat(70) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runIsolationTests().catch((err) => {
  setMockHandler(null);
  teardownTestEnv();
  console.error('\n❌ Run Isolation Test Suite Error:', err);
  process.exit(1);
});
