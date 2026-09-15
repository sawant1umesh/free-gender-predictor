#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { scanInventory, slugify } from './core/inventory.js';
import { analyzeTopicCandidate, selectNextSafeCandidate } from './core/gap-analyzer.js';
import { runAutopilot } from './index.js';
import { promoteDraft } from './promote-draft.js';
import { setMockHandler } from './core/ai-client.js';
import { readRunManifest, writeRunManifest, clearCurrentRunManifest } from './core/manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function createMockArticleMarkdown(title, category, slug, wordCount = 1800) {
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(`word${i}`);
  }
  const bodyText = words.join(' ');

  return `---
title: "${title}"
description: "A comprehensive medical and cultural guide to ${title}."
pubDate: "${new Date().toISOString().split('T')[0]}"
category: "${category}"
heroImage: "/logo.svg"
heroImageAlt: "Guide to ${title}"
excerpt: "Learn all about ${title} with our detailed breakdown."
tags: ["Gender Predictor", "Chinese Calendar", "Pregnancy"]
faqs:
  - question: "How does this method work?"
    answer: "It uses traditional timing and charts."
  - question: "Is this scientifically accurate?"
    answer: "No, folk methods are for entertainment and lack scientific proof."
  - question: "When should I use this?"
    answer: "Anytime during pregnancy planning."
  - question: "Can ultrasound confirm gender?"
    answer: "Yes, medical ultrasound is the standard method."
---

# ${title}

${bodyText}

## Core Concepts Explained

This article covers [Chinese Gender Predictor Calculator](/) and our [Pregnancy Guides](/blog).
Review our [Frequently Asked Questions](/faq) and our [Medical Disclaimer](/medical-disclaimer).

## Traditional Background

More detailed cultural context regarding gender prediction.

## Scientific Analysis

Science demonstrates that chromosome inheritance determines biological sex.

## Practical Advice

Consult a physician for medical advice during pregnancy.
`;
}

async function runRegressionSuite() {
  console.log('\n' + '='.repeat(70));
  console.log('  🧪 SEO AUTOPILOT - SAFE SELECTION & COLLISION RECOVERY TEST SUITE');
  console.log('  Verifying production scan first, candidate skipping, & bounded reselection');
  console.log('='.repeat(70) + '\n');

  // Isolated test directories
  const testSandboxDir = path.join(__dirname, 'sandbox-test-' + Date.now());
  const testBlogDir = path.join(testSandboxDir, 'blog');
  const testDraftsDir = path.join(testSandboxDir, 'drafts');
  const testManifestPath = path.join(testSandboxDir, '.current-run.json');

  fs.mkdirSync(testBlogDir, { recursive: true });
  fs.mkdirSync(testDraftsDir, { recursive: true });

  // Populate mock production blog in sandbox
  const prodArticle1 = createMockArticleMarkdown(
    'Chinese Gender Calendar Leap Month Rules',
    'Chinese Gender Calendar',
    'chinese-gender-calendar-leap-month-rules'
  );
  fs.writeFileSync(path.join(testBlogDir, 'chinese-gender-calendar-leap-month-rules.md'), prodArticle1, 'utf-8');

  const prodArticle2 = createMockArticleMarkdown(
    'How Does the Chinese Gender Predictor Work',
    'Chinese Gender Predictor',
    'how-does-the-chinese-gender-predictor-work'
  );
  fs.writeFileSync(path.join(testBlogDir, 'how-does-the-chinese-gender-predictor-work.md'), prodArticle2, 'utf-8');

  const prodArticle3 = createMockArticleMarkdown(
    'Chinese Gender Calendar History and Guide',
    'Chinese Gender Calendar',
    'chinese-gender-calendar-history-and-guide'
  );
  fs.writeFileSync(path.join(testBlogDir, 'chinese-gender-calendar-history-and-guide.md'), prodArticle3, 'utf-8');

  // -------------------------------------------------------------
  // Test 1: First step scans all production blogs before topic selection
  // -------------------------------------------------------------
  console.log('Test 1: First step scans all production blogs before topic selection');
  const run1Result = await runAutopilot({
    generate: false,
  });

  assert(run1Result.success === true, 'Autopilot run initializes successfully');
  const manifest1 = readRunManifest();
  assert(manifest1 !== null, 'Run manifest exists on disk');
  assert(manifest1.inventoryScan !== null, 'Manifest contains inventoryScan');
  assert(typeof manifest1.inventoryScan.timestamp === 'string', 'Inventory scan timestamp is recorded');
  assert(manifest1.inventoryScan.totalArticles >= 9, `Scanned ${manifest1.inventoryScan.totalArticles} production articles`);
  assert(
    manifest1.inventoryScan.productionSlugs.includes('chinese-gender-calendar-leap-month-rules'),
    'Production slugs recorded in manifest before selection'
  );

  // -------------------------------------------------------------
  // Test 2: Duplicate candidate title is skipped
  // -------------------------------------------------------------
  console.log('\nTest 2: Duplicate candidate title is skipped');
  const realInventory = await scanInventory();
  const duplicateTitleCandidate = {
    id: 'cand-dup-title',
    title: 'Chinese Gender Calendar Leap Month: How Lunar Leap Years Affect Predictions',
    suggestedSlug: 'unique-new-slug-alpha',
    category: 'Chinese Gender Calendar',
  };
  const safeCandidate2 = {
    id: 'cand-safe-2',
    title: 'Postpartum Lunar Recovery Timing',
    suggestedSlug: 'postpartum-lunar-recovery-timing',
    category: 'Chinese Gender Predictor',
  };

  const selResult2 = selectNextSafeCandidate([duplicateTitleCandidate, safeCandidate2], realInventory);
  assert(selResult2.selectedTopic !== null, 'Candidate was selected');
  assert(selResult2.selectedTopic.id === 'cand-safe-2', 'Selected SAFE candidate, not duplicate title');
  assert(selResult2.skippedCandidates.length === 1, 'Exactly 1 candidate skipped');
  assert(selResult2.skippedCandidates[0].decision === 'REJECT', 'Skipped candidate marked REJECT');
  assert(selResult2.skippedCandidates[0].reason.includes('duplicate title'), 'Reason specifies duplicate title');

  // -------------------------------------------------------------
  // Test 3: Duplicate candidate slug is skipped
  // -------------------------------------------------------------
  console.log('\nTest 3: Duplicate candidate slug is skipped');
  const duplicateSlugCandidate = {
    id: 'cand-dup-slug',
    title: 'Unrelated Title About Conception Rules',
    suggestedSlug: 'how-does-the-chinese-gender-predictor-work',
    category: 'Chinese Gender Predictor',
  };

  const selResult3 = selectNextSafeCandidate([duplicateSlugCandidate, safeCandidate2], realInventory);
  assert(selResult3.selectedTopic !== null, 'Candidate was selected');
  assert(selResult3.selectedTopic.id === 'cand-safe-2', 'Selected SAFE candidate, not duplicate slug');
  assert(selResult3.skippedCandidates.length === 1, 'Exactly 1 candidate skipped');
  assert(selResult3.skippedCandidates[0].decision === 'REJECT', 'Skipped candidate marked REJECT');
  assert(
    selResult3.skippedCandidates[0].reason.includes('Duplicate slug') || selResult3.skippedCandidates[0].reason.includes('duplicate title or slug'),
    'Reason specifies duplicate slug'
  );

  // -------------------------------------------------------------
  // Test 4: CAUTION candidate (50%+ overlap) is skipped
  // -------------------------------------------------------------
  console.log('\nTest 4: CAUTION candidate (50%+ overlap) is skipped');
  const cautionCandidate = {
    id: 'cand-caution-overlap',
    title: 'Chinese Gender Calendar: Complete History and Lunar Conversion Guide',
    suggestedSlug: 'chinese-gender-calendar-complete-history-conversion-guide',
    category: 'Chinese Gender Calendar',
    primaryKeyword: 'chinese gender calendar history',
    secondaryKeywords: ['lunar conversion chart', 'chinese pregnancy calendar origin', 'qing dynasty chart history'],
  };

  const selResult4 = selectNextSafeCandidate([cautionCandidate, safeCandidate2], realInventory, { allowCaution: false });
  assert(selResult4.selectedTopic !== null, 'Candidate was selected');
  assert(selResult4.selectedTopic.id === 'cand-safe-2', 'Selected SAFE candidate, skipped CAUTION overlap');
  assert(selResult4.skippedCandidates.length === 1, 'Exactly 1 candidate skipped');
  assert(selResult4.skippedCandidates[0].decision === 'CAUTION', 'Skipped candidate marked CAUTION');
  assert(selResult4.skippedCandidates[0].reason.includes('Moderate topical overlap'), 'Reason specifies topical overlap');

  // -------------------------------------------------------------
  // Test 5: REJECT candidate is skipped
  // -------------------------------------------------------------
  console.log('\nTest 5: REJECT candidate (unapproved category) is skipped');
  const rejectCategoryCandidate = {
    id: 'cand-unapproved-category',
    title: 'Horoscope Zodiac Compatibility for Babies',
    suggestedSlug: 'horoscope-zodiac-compatibility-babies',
    category: 'Astrology & Horoscopes', // Not in approved categories
  };

  const selResult5 = selectNextSafeCandidate([rejectCategoryCandidate, safeCandidate2], realInventory);
  assert(selResult5.selectedTopic !== null, 'Candidate was selected');
  assert(selResult5.selectedTopic.id === 'cand-safe-2', 'Selected SAFE candidate, skipped REJECT category');
  assert(selResult5.skippedCandidates.length === 1, 'Exactly 1 candidate skipped');
  assert(selResult5.skippedCandidates[0].decision === 'REJECT', 'Skipped candidate marked REJECT');
  assert(selResult5.skippedCandidates[0].reason.includes('not in approved site taxonomy'), 'Reason specifies unapproved category');

  // -------------------------------------------------------------
  // Test 6: Multiple rejected candidates followed by a SAFE candidate
  // -------------------------------------------------------------
  console.log('\nTest 6: Multiple rejected candidates followed by a SAFE candidate');
  const candidatePool6 = [
    duplicateTitleCandidate,
    duplicateSlugCandidate,
    cautionCandidate,
    rejectCategoryCandidate,
    safeCandidate2,
  ];

  const selResult6 = selectNextSafeCandidate(candidatePool6, realInventory, { allowCaution: false });
  assert(selResult6.selectedTopic !== null, 'Candidate was selected');
  assert(selResult6.selectedTopic.id === 'cand-safe-2', 'Final candidate selected is the SAFE candidate');
  assert(selResult6.skippedCandidates.length === 4, 'Exactly 4 non-safe candidates were skipped');
  assert(selResult6.skippedCandidates[0].candidate.id === 'cand-dup-title', 'First skipped is duplicate title');
  assert(selResult6.skippedCandidates[1].candidate.id === 'cand-dup-slug', 'Second skipped is duplicate slug');
  assert(selResult6.skippedCandidates[2].candidate.id === 'cand-caution-overlap', 'Third skipped is caution overlap');
  assert(selResult6.skippedCandidates[3].candidate.id === 'cand-unapproved-category', 'Fourth skipped is unapproved category');

  // -------------------------------------------------------------
  // Test 7: SAFE candidate is generated
  // -------------------------------------------------------------
  console.log('\nTest 7: SAFE candidate is generated');
  const PARA = 'When expectant parents explore baby gender prediction methods, they encounter ancient cultural charts and folk traditions. While tools like the traditional [Chinese Gender Predictor](/) offer an entertaining way to explore pregnancy lore based on maternal lunar age and lunar conception months, it is essential to understand the scientific reality. Studies consistently demonstrate that folk charts perform at roughly a fifty percent statistical rate. For cultural context, our [Chinese Gender Calendar](/blog/chinese-gender-calendar) guide provides deep background without mistaking folklore for clinical diagnostics. Genuine clinical determination relies on mid-pregnancy ultrasound anatomy scans at eighteen to twenty weeks or cell-free fetal DNA screening (NIPT) from ten weeks of gestation. Parents should always consult certified healthcare professionals for prenatal medical guidance. See our [Medical Disclaimer](/medical-disclaimer) and visit our [blog](/blog) or [FAQ](/faq) for more. ';

  function buildValidMock(title, slug) {
    const titleTokens = title.split(' ').filter(Boolean);
    const tag1 = titleTokens[0] || 'Topic';
    const tag2 = titleTokens[1] || 'Guide';
    return JSON.stringify({
      frontmatter: {
        title,
        seoTitle: title + ' - Complete Guide',
        description: `A comprehensive medical and cultural guide covering ${title} and traditional lunar timing concepts.`,
        pubDate: '2026-09-14',
        category: 'Chinese Gender Predictor',
        tags: [tag1, tag2, 'Pregnancy'],
        heroImage: '/logo.svg',
        heroImageAlt: title + ' Guide',
        excerpt: 'Discover how this topic works in traditional Chinese gender prediction and what modern medicine says.',
        featured: false,
        faqs: [
          { question: 'What is this topic about?', answer: 'Traditional calculation methods based on lunar charts.' },
          { question: 'Is this medically accurate?', answer: 'No, scientific evaluations show 50% accuracy equivalent to chance.' },
          { question: 'When does ultrasound determine sex?', answer: 'Ultrasounds detect sex at 18 to 20 weeks of pregnancy.' },
          { question: 'What is NIPT?', answer: 'A cell-free fetal DNA test from around 10 weeks.' },
        ],
      },
      markdownBody:
        '# ' + title + '\n\n' +
        'Understanding traditional cultural charts versus medical prenatal care.\n\n' +
        '## Overview of Lunar Calculations\n\n' + PARA.repeat(3) + '\n\n' +
        '## How Traditional Charts Function\n\n' + PARA.repeat(3) + '\n\n' +
        '## The Science of Fetal Sex Determination\n\n' + PARA.repeat(3) + '\n\n' +
        '## Clinical Methods: Ultrasound and NIPT\n\n' + PARA.repeat(3) + '\n\n' +
        '## Summary and Medical Recommendations\n\n' + PARA.repeat(2) + '\n\n' +
        '## Frequently Asked Questions\n\n' +
        '### What is this method?\nA traditional folk chart.\n\n' +
        '### Is this accurate?\nIt performs at random chance.\n\n' +
        '### When can sex be determined clinically?\nFrom 10 weeks via NIPT or 18-20 weeks via ultrasound.\n\n' +
        '### What is NIPT?\nA cell-free fetal DNA test.\n',
    });
  }

  setMockHandler((promptData) => {
    return {
      success: true,
      rawText: buildValidMock(safeCandidate2.title, safeCandidate2.suggestedSlug),
    };
  });

  const run7Result = await runAutopilot({
    generate: true,
    candidates: [duplicateTitleCandidate, duplicateSlugCandidate, safeCandidate2],
  });

  assert(run7Result.success === true, 'Autopilot run succeeded for SAFE candidate');
  assert(run7Result.state === RESULT_STATES.VALIDATED_DRAFT_CREATED, 'Result state is VALIDATED_DRAFT_CREATED');
  assert(run7Result.topic.id === 'cand-safe-2', 'Generated draft corresponds to SAFE topic');
  assert(fs.existsSync(run7Result.draftPath), 'Draft file exists in run-isolated draft folder');

  // -------------------------------------------------------------
  // Test 8: No SAFE candidate exists -> clean exit
  // -------------------------------------------------------------
  console.log('\nTest 8: No SAFE candidate exists -> clean exit with NO_STRONG_TOPIC_FOUND');
  const run8Result = await runAutopilot({
    generate: true,
    candidates: [duplicateTitleCandidate, duplicateSlugCandidate, cautionCandidate, rejectCategoryCandidate],
  });

  assert(run8Result.success === false, 'Run fails cleanly when no SAFE topics exist');
  assert(run8Result.state === RESULT_STATES.NO_STRONG_TOPIC_FOUND, 'State is NO_STRONG_TOPIC_FOUND');
  const manifest8 = readRunManifest();
  assert(manifest8.status === 'NO_STRONG_TOPIC_FOUND', 'Manifest status is NO_STRONG_TOPIC_FOUND');
  assert(manifest8.draft === null, 'No draft was staged in manifest');

  // -------------------------------------------------------------
  // Test 9 & 10 & 11: Production changes between initial scan and promotion
  // -> Promotion detects conflict, conflicting draft abandoned safely
  // -------------------------------------------------------------
  console.log('\nTest 9, 10, 11: Promotion detects new conflict, draft abandoned safely');
  const safeCandidateA = {
    id: 'cand-race-a',
    title: 'Lunar Timing for Baby Milestones',
    suggestedSlug: 'lunar-timing-baby-milestones',
    category: 'Chinese Gender Predictor',
  };
  const safeCandidateB = {
    id: 'cand-race-b',
    title: 'Ancient Lunar Calendar Astronomy Facts',
    suggestedSlug: 'ancient-lunar-calendar-astronomy-facts',
    category: 'Chinese Gender Predictor',
  };

  // Generate candidate A first
  setMockHandler((promptData) => {
    const promptStr = promptData.prompt || '';
    const isTopicB = promptStr.includes('Ancient Lunar Calendar Astronomy Facts');
    const selected = isTopicB ? safeCandidateB : safeCandidateA;
    return {
      success: true,
      rawText: buildValidMock(selected.title, selected.suggestedSlug),
    };
  });

  const runGenResult = await runAutopilot({
    generate: true,
    candidates: [safeCandidateA, safeCandidateB],
  });
  assert(runGenResult.success === true, 'Candidate A draft generated successfully');
  assert(runGenResult.slug === safeCandidateA.suggestedSlug, 'Draft generated is candidate A');

  // SIMULATE: Production changes AFTER generation!
  // Someone pushed an article to production with candidate A's slug:
  const mockCollisionProdFile = path.join(autopilotConfig.paths.productionBlogDir, `${safeCandidateA.suggestedSlug}.md`);
  const mockCollisionContent = createMockArticleMarkdown(
    safeCandidateA.title,
    safeCandidateA.category,
    safeCandidateA.suggestedSlug
  );
  fs.writeFileSync(mockCollisionProdFile, mockCollisionContent, 'utf-8');

  // Now call promoteDraft with reselection enabled and candidate pool [safeCandidateA, safeCandidateB]
  const promoResult = await promoteDraft(null, {
    reselectOnCollision: true,
    candidates: [safeCandidateA, safeCandidateB],
  });

  // Clean up simulated collision file from production blog
  try {
    fs.unlinkSync(mockCollisionProdFile);
  } catch (_) {}

  // -------------------------------------------------------------
  // Test 12 & 13: Fresh inventory re-scanned and next SAFE topic selected & promoted
  // -------------------------------------------------------------
  console.log('\nTest 12 & 13: Next SAFE topic selected and promoted after collision recovery');
  assert(promoResult.success === true, 'Promotion recovered from collision and succeeded');
  assert(promoResult.slug === safeCandidateB.suggestedSlug, 'Promoted draft is candidate B');
  assert(promoResult.state === RESULT_STATES.PROMOTION_SUCCESS, 'State is PROMOTION_SUCCESS');

  // Verify candidate B exists in production blog, and clean it up
  const promotedFileB = path.join(autopilotConfig.paths.productionBlogDir, `${safeCandidateB.suggestedSlug}.md`);
  assert(fs.existsSync(promotedFileB), 'Candidate B article was promoted to production blog');
  try {
    fs.unlinkSync(promotedFileB);
  } catch (_) {}

  // -------------------------------------------------------------
  // Test 14: Stale drafts cannot be reused
  // -------------------------------------------------------------
  console.log('\nTest 14: Stale drafts cannot be reused');
  // Write a rogue stale draft in drafts directory root
  const staleDraftPath = path.join(autopilotConfig.paths.draftsDir, 'stale-historical-article.md');
  fs.writeFileSync(staleDraftPath, createMockArticleMarkdown('Stale Article', 'Chinese Gender Predictor', 'stale-article'), 'utf-8');

  // Execute a run manifest with NO_STRONG_TOPIC_FOUND
  writeRunManifest({
    runId: 'test-run-stale-protection',
    mode: 'generate',
    status: 'NO_STRONG_TOPIC_FOUND',
    resultState: RESULT_STATES.NO_STRONG_TOPIC_FOUND,
    draft: null,
    isPromotable: false,
  });

  const stalePromoResult = await promoteDraft(null, {
    manifest: autopilotConfig.paths.currentRunManifest,
  });

  assert(stalePromoResult.state === RESULT_STATES.NO_PROMOTION_REQUIRED, 'Promotion rejects stale draft promotion');
  assert(stalePromoResult.promotedPath === undefined, 'No file promoted from stale draft');
  try {
    fs.unlinkSync(staleDraftPath);
  } catch (_) {}

  // -------------------------------------------------------------
  // Test 15: Bounded reselection prevents infinite loops
  // -------------------------------------------------------------
  console.log('\nTest 15: Bounded reselection prevents infinite loops');
  // Pass only candidates that will collide with production
  const infiniteLoopCandidates = [
    duplicateTitleCandidate,
    duplicateSlugCandidate,
  ];

  const boundedRun = await runAutopilot({
    generate: true,
    candidates: infiniteLoopCandidates,
    maxTopicReselections: 2,
  });

  assert(boundedRun.success === false, 'Bounded reselection halts when no SAFE candidates exist');
  assert(boundedRun.state === RESULT_STATES.NO_STRONG_TOPIC_FOUND, 'Clean exit state NO_STRONG_TOPIC_FOUND');

  // Cleanup test sandbox
  try {
    fs.rmSync(testSandboxDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n' + '='.repeat(70));
  console.log(`  SAFE SELECTION REGRESSION TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('='.repeat(70) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('\n❌ Fatal error in regression suite:', err);
  process.exit(1);
});
