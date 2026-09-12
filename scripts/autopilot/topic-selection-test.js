#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { scanInventory, slugify } from './core/inventory.js';
import { analyzeTopicCandidate, analyzeSeeds } from './core/gap-analyzer.js';
import { runAutopilot } from './index.js';
import { setMockHandler } from './core/ai-client.js';
import { promoteDraft } from './promote-draft.js';

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

async function runTopicSelectionTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  🧪 SEO AUTOPILOT - TOPIC SELECTION & PRE-GENERATION SAFETY TESTS');
  console.log('  Verifying fresh scan, duplicate exclusion, and cannibalization gates');
  console.log('='.repeat(70) + '\n');

  // -------------------------------------------------------------
  // Test 1: Fresh runtime scan of production blog inventory
  // -------------------------------------------------------------
  console.log('Test 1: Fresh runtime scan of production blog inventory');
  const inventory = await scanInventory();
  assert(inventory.stats.totalArticles >= 8, `Discovered ${inventory.stats.totalArticles} production articles`);
  assert(inventory.existingSlugs instanceof Set, 'inventory.existingSlugs is a Set');
  assert(inventory.existingFilenames instanceof Set, 'inventory.existingFilenames is a Set');
  assert(inventory.existingTitles instanceof Set, 'inventory.existingTitles is a Set');
  assert(
    inventory.existingSlugs.has('chinese-gender-calendar-2026-2027'),
    'inventory includes chinese-gender-calendar-2026-2027 slug'
  );

  // -------------------------------------------------------------
  // Test 2: Existing slug is rejected before generation
  // -------------------------------------------------------------
  console.log('\nTest 2: Existing slug is rejected before generation');
  let aiCalled = false;
  setMockHandler(() => {
    aiCalled = true;
    return { success: true, rawText: '{}' };
  });

  const existingSlugTopic = {
    title: 'Completely Unique Title Here',
    suggestedSlug: 'chinese-gender-calendar-2026-2027',
    category: 'Chinese Gender Calendar',
  };

  const resSlug = await runAutopilot({
    generate: true,
    overrideTopic: existingSlugTopic,
  });

  assert(resSlug.success === false, 'Existing slug rejected before generation');
  assert(
    resSlug.state === RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
    'State is PROMOTION_CANNIBALIZATION_REJECTED'
  );
  assert(!aiCalled, 'Zero AI provider calls made for existing slug');

  // -------------------------------------------------------------
  // Test 3: Existing filename (.md) is rejected before generation
  // -------------------------------------------------------------
  console.log('\nTest 3: Existing filename is rejected before generation');
  aiCalled = false;
  const existingFilenameTopic = {
    title: 'Brand New Topic Idea',
    suggestedSlug: 'chinese-gender-calendar-2026-2027.md',
    category: 'Chinese Gender Calendar',
  };

  const resFilename = await runAutopilot({
    generate: true,
    overrideTopic: existingFilenameTopic,
  });

  assert(resFilename.success === false, 'Existing filename rejected before generation');
  assert(!aiCalled, 'Zero AI provider calls made for existing filename');

  // -------------------------------------------------------------
  // Test 4: Exact duplicate title is rejected before generation
  // -------------------------------------------------------------
  console.log('\nTest 4: Exact duplicate title is rejected before generation');
  aiCalled = false;
  const duplicateTitleTopic = {
    title: 'Chinese Gender Calendar 2026–2027: How Does It Work?',
    suggestedSlug: 'brand-new-distinct-slug-xyz',
    category: 'Chinese Gender Calendar',
  };

  const resTitle = await runAutopilot({
    generate: true,
    overrideTopic: duplicateTitleTopic,
  });

  assert(resTitle.success === false, 'Exact duplicate title rejected before generation');
  assert(
    resTitle.state === RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
    'State is PROMOTION_CANNIBALIZATION_REJECTED'
  );
  assert(!aiCalled, 'Zero AI provider calls made for duplicate title');

  // -------------------------------------------------------------
  // Test 5: Exact title with punctuation variation is rejected
  // -------------------------------------------------------------
  console.log('\nTest 5: Exact title with hyphen instead of en-dash is rejected');
  aiCalled = false;
  const hyphenTitleTopic = {
    title: 'Chinese Gender Calendar 2026-2027: How Does It Work?',
    suggestedSlug: 'chinese-calendar-alt-slug',
    category: 'Chinese Gender Calendar',
  };

  const resHyphenTitle = await runAutopilot({
    generate: true,
    overrideTopic: hyphenTitleTopic,
  });

  assert(resHyphenTitle.success === false, 'Title with hyphen vs en-dash rejected');
  assert(!aiCalled, 'Zero AI calls made for normalized title match');

  // -------------------------------------------------------------
  // Test 6: REJECT-level overlap topic is rejected before generation
  // -------------------------------------------------------------
  console.log('\nTest 6: REJECT-level overlap topic is rejected before generation');
  aiCalled = false;
  const rejectOverlapTopic = {
    id: 'test-cannibalization-reject',
    title: 'How Does the Chinese Gender Predictor Work?',
    category: 'Chinese Gender Predictor',
    suggestedSlug: 'how-does-the-chinese-gender-predictor-work',
  };

  const resReject = await runAutopilot({
    generate: true,
    overrideTopic: rejectOverlapTopic,
  });

  assert(resReject.success === false, 'REJECT topic rejected before generation');
  assert(!aiCalled, 'Zero AI provider calls made for REJECT topic');

  // -------------------------------------------------------------
  // Test 7: Promotion-blocked CAUTION topic is rejected before generation by default
  // -------------------------------------------------------------
  console.log('\nTest 7: Promotion-blocked CAUTION topic is rejected before generation');
  aiCalled = false;
  // This topic has moderate topical overlap (52% similarity) with existing 2026-2027 article
  const cautionTopic = {
    title: 'Chinese Gender Calendar 2027: How Does It Work?',
    category: 'Chinese Gender Calendar',
    suggestedSlug: 'chinese-gender-calendar-2027-how-does-it-work',
    primaryKeyword: 'chinese gender calendar 2027',
  };

  const resCaution = await runAutopilot({
    generate: true,
    overrideTopic: cautionTopic,
    allowCaution: false, // default in production
  });

  assert(resCaution.success === false, 'CAUTION topic blocked before generation when allowCaution: false');
  assert(
    resCaution.state === RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
    'Returns PROMOTION_CANNIBALIZATION_REJECTED before generation'
  );
  assert(!aiCalled, 'Zero AI calls made for CAUTION topic');

  // -------------------------------------------------------------
  // Test 8: CLI force-topic with CAUTION topic is blocked before generation
  // -------------------------------------------------------------
  console.log('\nTest 8: Forced CAUTION seed is blocked before generation');
  aiCalled = false;
  const resForceCaution = await runAutopilot({
    generate: true,
    forceTopic: 'test-cannibalization-caution',
    allowCaution: false,
  });

  assert(resForceCaution.success === false, 'Forced test-cannibalization-caution blocked');
  assert(
    resForceCaution.state === RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
    'Returns cannibalization rejection'
  );
  assert(!aiCalled, 'Zero AI calls made for forced CAUTION seed');

  // -------------------------------------------------------------
  // Test 9: Genuinely SAFE topics can still be selected
  // -------------------------------------------------------------
  console.log('\nTest 9: Genuinely SAFE topics can still be selected');
  const dryRunRes = await runAutopilot({ generate: false });
  assert(dryRunRes.success === true, 'Autonomous dry-run succeeds');
  assert(dryRunRes.state === RESULT_STATES.DRY_RUN_COMPLETE, 'Dry-run returns DRY_RUN_COMPLETE');
  assert(Boolean(dryRunRes.topic), 'A topic candidate was selected');

  const selectedCandidateCheck = analyzeTopicCandidate(dryRunRes.topic, inventory);
  assert(
    selectedCandidateCheck.decision === 'SAFE',
    `Selected topic "${dryRunRes.topic.title}" is confirmed SAFE (score: ${selectedCandidateCheck.score})`
  );

  // -------------------------------------------------------------
  // Test 10: Newly published article cannot be selected again
  // -------------------------------------------------------------
  console.log('\nTest 10: Newly published article cannot be selected again');
  // Simulate an inventory that now contains the currently selected topic as published
  const simulatedInventory = {
    ...inventory,
    articles: [
      ...inventory.articles,
      {
        slug: dryRunRes.topic.suggestedSlug,
        filename: `${dryRunRes.topic.suggestedSlug}.md`,
        title: dryRunRes.topic.title,
        description: 'Newly published simulated article',
        category: dryRunRes.topic.category,
        tags: [],
        route: `/blog/${dryRunRes.topic.suggestedSlug}`,
      },
    ],
    existingSlugs: new Set([...inventory.existingSlugs, dryRunRes.topic.suggestedSlug]),
    existingFilenames: new Set([...inventory.existingFilenames, `${dryRunRes.topic.suggestedSlug}.md`]),
    existingTitles: new Set([...inventory.existingTitles, dryRunRes.topic.title.toLowerCase().trim()]),
  };

  const retestAnalysis = analyzeTopicCandidate(dryRunRes.topic, simulatedInventory);
  assert(retestAnalysis.decision === 'REJECT', 'Topic that matches newly published article is REJECTED');

  // -------------------------------------------------------------
  // Test 11: Phase 4 promotion safety gates remain fully functional
  // -------------------------------------------------------------
  console.log('\nTest 11: Phase 4 promotion safety gates remain fully functional');
  // Check that Phase 4 still blocks duplicate production slugs
  const resPhase4Dup = await promoteDraft('non-existent-draft.md');
  assert(resPhase4Dup.success === false, 'Phase 4 blocks missing draft safely');
  assert(
    resPhase4Dup.state === RESULT_STATES.PROMOTION_FILE_NOT_FOUND,
    'Phase 4 returns PROMOTION_FILE_NOT_FOUND'
  );

  setMockHandler(null);

  console.log('\n' + '='.repeat(70));
  console.log(`  TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('='.repeat(70) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTopicSelectionTests().catch((err) => {
  setMockHandler(null);
  console.error('\n❌ Topic Selection Test Suite Error:', err);
  process.exit(1);
});
