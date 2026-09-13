#!/usr/bin/env node

/**
 * Retry / Self-Correction Regression Test Suite
 * Verifies the automatic validation-feedback regeneration loop in index.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { runAutopilot } from './index.js';
import { setMockHandler } from './core/ai-client.js';
import { readRunManifest, clearCurrentRunManifest } from './core/manifest.js';
import { buildArticlePrompt } from './core/prompt-builder.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \u2705 PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  \u274c FAIL: ${message}`);
    failedTests++;
  }
}

// ---------------------------------------------------------------------------
// Article body helpers
// ---------------------------------------------------------------------------

const PARA = 'When expectant parents explore baby gender prediction methods, they encounter ancient cultural charts and folk traditions. While tools like the traditional [Chinese Gender Predictor](/) offer an entertaining way to explore pregnancy lore based on maternal lunar age and lunar conception months, it is essential to understand the scientific reality. Studies consistently demonstrate that folk charts perform at roughly a fifty percent statistical rate. For cultural context, our [Chinese Gender Calendar](/blog/chinese-gender-calendar) guide provides deep background without mistaking folklore for clinical diagnostics. Genuine clinical determination relies on mid-pregnancy ultrasound anatomy scans at eighteen to twenty weeks or cell-free fetal DNA screening (NIPT) from ten weeks of gestation. Parents should always consult certified healthcare professionals for prenatal medical guidance. See our [Medical Disclaimer](/medical-disclaimer) and visit our [blog](/blog) or [FAQ](/faq) for more. ';

function buildValidOutput(title) {
  title = title || 'Lunar Age Calculation in Chinese Gender Prediction';
  return JSON.stringify({
    frontmatter: {
      title,
      seoTitle: title + ' - Complete Guide',
      description: 'A comprehensive guide to lunar age calculation methods in traditional Chinese gender prediction and how they compare with modern prenatal diagnostics.',
      pubDate: '2026-09-13',
      category: 'Chinese Gender Predictor',
      tags: ['Chinese Gender Predictor', 'Baby Gender Prediction', 'Pregnancy'],
      heroImage: '/logo.svg',
      heroImageAlt: title + ' Guide',
      excerpt: 'Discover how lunar age calculations work in traditional Chinese gender prediction and what modern medicine says.',
      featured: false,
      faqs: [
        { question: 'What is maternal lunar age?', answer: 'A traditional calculation method in Chinese gender prediction charts based on the lunar calendar.' },
        { question: 'Is the Chinese Gender Predictor medically accurate?', answer: 'No. Scientific evaluations show approximately a 50% accuracy rate, equivalent to chance.' },
        { question: 'When does medical ultrasound determine fetal sex?', answer: 'Anatomy ultrasounds detect anatomical sex at 18 to 20 weeks of pregnancy.' },
        { question: 'What is NIPT?', answer: 'A cell-free fetal DNA blood test available from around 10 weeks that can identify fetal sex chromosomes.' },
      ],
    },
    markdownBody:
      '# ' + title + '\n\n' +
      'Understanding traditional cultural charts versus medical prenatal care.\n\n' +
      '## Overview of Lunar Age Calculations\n\n' + PARA.repeat(4) + '\n\n' +
      '## How the Chinese Gender Predictor Uses Lunar Age\n\n' + PARA.repeat(4) + '\n\n' +
      '## The Science of Fetal Sex Determination\n\n' + PARA.repeat(3) + '\n\n' +
      '## Clinical Methods: Ultrasound and NIPT\n\n' + PARA.repeat(3) + '\n\n' +
      '## Summary and Recommendations\n\n' + PARA.repeat(2) + '\n\n' +
      '## Frequently Asked Questions\n\n' +
      '### What is maternal lunar age?\nA traditional folk chart calculation.\n\n' +
      '### Is this accurate?\nIt performs at random chance.\n\n' +
      '### When can gender be determined medically?\nFrom 10 weeks via NIPT or 18-20 weeks via ultrasound.\n\n' +
      '### What is NIPT?\nA cell-free fetal DNA test from ~10 weeks.\n',
  });
}

function buildWordCountExceedingOutput(title) {
  title = title || 'Lunar Age Calculation in Chinese Gender Prediction';
  const longBlock = PARA.repeat(16);
  const data = JSON.parse(buildValidOutput(title));
  data.markdownBody =
    '# ' + title + '\n\n' +
    '## Section One\n\n' + longBlock + '\n\n' +
    '## Section Two\n\n' + longBlock + '\n\n' +
    '## Section Three\n\n' + longBlock + '\n\n' +
    '## Frequently Asked Questions\n\n' +
    '### What is maternal lunar age?\nTraditional chart.\n\n' +
    '### Is this accurate?\nNo.\n\n' +
    '### Medical timing?\n18-20 weeks.\n\n' +
    '### What is NIPT?\nA DNA test.\n';
  return JSON.stringify(data);
}

function buildMedicalViolationOutput(title) {
  title = title || 'Lunar Age Calculation in Chinese Gender Prediction';
  const data = JSON.parse(buildValidOutput(title));
  data.markdownBody = data.markdownBody.replace(
    '## Overview of Lunar Age Calculations',
    "## Overview of Lunar Age Calculations\n\nThe Chinese gender predictor chart is 100% accurate and guaranteed to predict your baby's sex correctly.\n\n",
  );
  return JSON.stringify(data);
}

const TEST_TOPIC = {
  id: 'retry-test-topic-01',
  title: 'Lunar Age Calculation in Chinese Gender Prediction',
  suggestedSlug: 'lunar-age-calculation-chinese-gender-prediction',
  category: 'Chinese Gender Predictor',
  primaryKeyword: 'lunar age calculation Chinese gender prediction',
  secondaryKeywords: ['maternal lunar age', 'Chinese gender chart'],
};

let capturedPrompts = [];

function makeMock(responses) {
  let idx = 0;
  return ({ prompt }) => {
    capturedPrompts.push(prompt);
    const res = responses[idx] != null ? responses[idx] : responses[responses.length - 1];
    idx++;
    return res;
  };
}

function cleanupRun(runId) {
  if (!runId) return;
  const dir = path.join(autopilotConfig.paths.draftsDir, runId);
  if (fs.existsSync(dir)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
async function runRetryTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  \ud83d\udd01 SEO AUTOPILOT - RETRY / SELF-CORRECTION REGRESSION TESTS');
  console.log('  Verifying automatic validation-feedback regeneration loop');
  console.log('='.repeat(70) + '\n');

  // =========================================================================
  // Test 1: First generation valid -> 1 attempt, no retries
  // =========================================================================
  console.log('Test 1: First generation is valid -> succeeds on attempt 1 with no retries');
  capturedPrompts = [];
  clearCurrentRunManifest();
  setMockHandler(makeMock([{ success: true, rawText: buildValidOutput() }]));

  const r1 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r1.success === true, 'Run succeeds');
  assert(r1.state === RESULT_STATES.VALIDATED_DRAFT_CREATED, 'State is VALIDATED_DRAFT_CREATED');
  assert(capturedPrompts.length === 1, 'Only 1 prompt sent to AI');
  assert(!capturedPrompts[0].includes('CRITICAL REVISION REQUIRED'), 'No feedback block on attempt 1');

  const m1 = readRunManifest();
  assert(m1 !== null, 'Manifest exists');
  assert(m1.attempts.length === 1, 'Manifest records 1 attempt');
  assert(m1.attempts[0].attempt === 1, 'Attempt numbered 1');
  assert(m1.attempts[0].validationStatus === 'VALID', 'Attempt 1 is VALID');
  assert(m1.isPromotable === true, 'isPromotable is true');
  assert(typeof m1.draft?.draftPath === 'string', 'Draft path recorded');
  assert(m1.draft.draftPath.includes(r1.runId), 'Draft path contains runId');
  assert(m1.draft.draftPath.includes('attempt-1'), 'Draft path is under attempt-1');
  cleanupRun(r1.runId);

  // =========================================================================
  // Test 2: Word count exceeded on attempt 1 -> retry -> attempt 2 succeeds
  // =========================================================================
  console.log('\nTest 2: Word count exceeded on attempt 1 -> retry -> attempt 2 succeeds');
  capturedPrompts = [];
  clearCurrentRunManifest();
  setMockHandler(makeMock([
    { success: true, rawText: buildWordCountExceedingOutput() },
    { success: true, rawText: buildValidOutput() },
  ]));

  const r2 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r2.success === true, 'Run succeeds on attempt 2');
  assert(capturedPrompts.length === 2, 'Exactly 2 prompts sent');
  assert(!capturedPrompts[0].includes('CRITICAL REVISION REQUIRED'), 'No feedback on attempt 1');
  assert(capturedPrompts[1].includes('CRITICAL REVISION REQUIRED'), 'Feedback block on attempt 2');
  assert(/word count/i.test(capturedPrompts[1]), 'Attempt 2 prompt mentions word count error');

  const m2 = readRunManifest();
  assert(m2.attempts.length === 2, 'Manifest records 2 attempts');
  assert(m2.attempts[0].validationStatus === 'INVALID', 'Attempt 1 is INVALID');
  assert(m2.attempts[1].validationStatus === 'VALID', 'Attempt 2 is VALID');
  assert(m2.isPromotable === true, 'isPromotable is true');
  assert(m2.draft.draftPath.includes('attempt-2'), 'Promotable draft from attempt-2');
  assert(m2.runId === r2.runId, 'Run ID preserved in manifest');

  const a1dir2 = path.join(autopilotConfig.paths.draftsDir, r2.runId, 'attempt-1');
  assert(fs.existsSync(a1dir2), 'attempt-1 directory exists for failed draft');
  cleanupRun(r2.runId);

  // =========================================================================
  // Test 3: Medical certainty violation -> retry -> attempt 2 succeeds
  // =========================================================================
  console.log('\nTest 3: Medical safety violation on attempt 1 -> retry -> attempt 2 succeeds');
  capturedPrompts = [];
  clearCurrentRunManifest();
  setMockHandler(makeMock([
    { success: true, rawText: buildMedicalViolationOutput() },
    { success: true, rawText: buildValidOutput() },
  ]));

  const r3 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r3.success === true, 'Run succeeds on attempt 2 after medical violation');
  assert(capturedPrompts.length === 2, '2 prompts sent');
  assert(capturedPrompts[1].includes('CRITICAL REVISION REQUIRED'), 'Feedback block on attempt 2');
  assert(/medical safety|guaranteed|100%/i.test(capturedPrompts[1]), 'Attempt 2 references medical error');

  const m3 = readRunManifest();
  assert(m3.attempts[0].validationStatus === 'INVALID', 'Attempt 1 INVALID');
  assert(m3.attempts[1].validationStatus === 'VALID', 'Attempt 2 VALID');
  cleanupRun(r3.runId);

  // =========================================================================
  // Test 4: Same Run ID and topic preserved across all 3 attempts
  // =========================================================================
  console.log('\nTest 4: Same Run ID and topic preserved across all 3 attempts');
  capturedPrompts = [];
  clearCurrentRunManifest();
  let calls4 = 0;
  setMockHandler(({ prompt }) => { capturedPrompts.push(prompt); calls4++; return { success: true, rawText: buildWordCountExceedingOutput() }; });

  const r4 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r4.success === false, 'Run fails after 3 exhausted attempts');
  assert(calls4 === 3, 'Exactly 3 AI calls made');

  const m4 = readRunManifest();
  assert(m4.attempts.length === 3, 'Manifest records 3 attempts');
  for (const att of m4.attempts) {
    if (att.draftPath) assert(att.draftPath.includes(r4.runId), 'Attempt draftPath contains same runId');
  }
  assert(m4.runId === r4.runId, 'Manifest runId matches result runId');
  assert(m4.selectedTopic?.title === TEST_TOPIC.title, 'Selected topic preserved in manifest');
  cleanupRun(r4.runId);

  // =========================================================================
  // Test 5: Each attempt isolated in separate directory; attempt 3 succeeds
  // =========================================================================
  console.log('\nTest 5: Each attempt isolated in separate attempt directory; attempt 3 can succeed');
  capturedPrompts = [];
  clearCurrentRunManifest();
  setMockHandler(makeMock([
    { success: true, rawText: buildWordCountExceedingOutput() },
    { success: true, rawText: buildMedicalViolationOutput() },
    { success: true, rawText: buildValidOutput() },
  ]));

  const r5 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r5.success === true, 'Run succeeds on attempt 3');

  const slugFile = TEST_TOPIC.suggestedSlug + '.md';
  const m5 = readRunManifest();
  for (let i = 1; i <= 3; i++) {
    const attDir = path.join(autopilotConfig.paths.draftsDir, r5.runId, 'attempt-' + i);
    assert(fs.existsSync(attDir), 'attempt-' + i + ' directory exists');
    assert(fs.existsSync(path.join(attDir, slugFile)), 'attempt-' + i + ' contains draft file');
  }
  assert(m5.draft.draftPath.includes('attempt-3'), 'Promotable draft from attempt-3');
  assert(m5.isPromotable === true, 'isPromotable is true');
  assert(m5.attempts[0].validationStatus === 'INVALID', 'Attempt 1 INVALID');
  assert(m5.attempts[1].validationStatus === 'INVALID', 'Attempt 2 INVALID');
  assert(m5.attempts[2].validationStatus === 'VALID', 'Attempt 3 VALID');
  cleanupRun(r5.runId);

  // =========================================================================
  // Test 6: Exact validation errors injected into next prompt
  // =========================================================================
  console.log('\nTest 6: Exact validation error text is injected into the next attempt prompt');
  capturedPrompts = [];
  clearCurrentRunManifest();
  setMockHandler(makeMock([
    { success: true, rawText: buildWordCountExceedingOutput() },
    { success: true, rawText: buildValidOutput() },
  ]));

  await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  const p2 = capturedPrompts[1];
  assert(/Attempt 2 of/i.test(p2), 'Second prompt states attempt number');
  assert(/word count.*exceeds|exceeds.*word count|word count.*maximum|maximum.*word count/i.test(p2), 'Second prompt contains word count error');
  assert(/CRITICAL REVISION REQUIRED/i.test(p2), 'Second prompt has revision header');
  assert(/1800.*2300|2300.*1800/i.test(p2), 'Second prompt restates word count correction range');

  const r6 = readRunManifest();
  cleanupRun(r6 && r6.runId);

  // =========================================================================
  // Test 7: Maximum of 3 attempts enforced; 4th call never happens
  // =========================================================================
  console.log('\nTest 7: Maximum of 3 attempts enforced; no 4th AI call');
  capturedPrompts = [];
  clearCurrentRunManifest();
  let calls7 = 0;
  setMockHandler(() => { calls7++; return { success: true, rawText: buildWordCountExceedingOutput() }; });

  const r7 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r7.success === false, 'Run fails after 3 exhausted attempts');
  assert(calls7 === 3, 'Exactly 3 AI calls; not 4 (got ' + calls7 + ')');
  assert(r7.state === RESULT_STATES.VALIDATION_FAILED, 'Final state is VALIDATION_FAILED');

  const m7 = readRunManifest();
  assert(m7.isPromotable === false, 'isPromotable is false');
  assert(m7.draft === null, 'draft is null');
  assert(m7.status === 'VALIDATION_FAILED', 'Manifest status is VALIDATION_FAILED (got ' + m7.status + ')');
  cleanupRun(r7.runId);

  // =========================================================================
  // Test 8: All generation-level failures -> GENERATION_FAILED
  // =========================================================================
  console.log('\nTest 8: All attempts failing at AI generation level -> GENERATION_FAILED state');
  capturedPrompts = [];
  clearCurrentRunManifest();
  setMockHandler(() => ({ success: false, error: 'Simulated Gemini quota exceeded' }));

  const r8 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r8.success === false, 'Run fails when AI always errors');
  assert(r8.state === RESULT_STATES.GENERATION_FAILED, 'State is GENERATION_FAILED (got ' + r8.state + ')');

  const m8 = readRunManifest();
  assert(m8.status === 'GENERATION_FAILED', 'Manifest status is GENERATION_FAILED (got ' + m8.status + ')');
  assert(m8.isPromotable === false, 'isPromotable is false');
  assert(m8.draft === null, 'draft is null');
  cleanupRun(r8.runId);

  // =========================================================================
  // Test 9: Failed drafts never marked promotable
  // =========================================================================
  console.log('\nTest 9: Failed drafts from all attempts are never marked promotable');
  clearCurrentRunManifest();
  setMockHandler(() => ({ success: true, rawText: buildWordCountExceedingOutput() }));

  const r9 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r9.success === false, 'Run fails');
  assert(r9.draftPath === null, 'No draftPath in result');

  const m9 = readRunManifest();
  assert(m9.isPromotable === false, 'isPromotable stays false');
  assert(m9.draft === null, 'draft is null in manifest');
  cleanupRun(r9.runId);

  // =========================================================================
  // Test 10: Slug preserved across all retry attempts
  // =========================================================================
  console.log('\nTest 10: Same slug preserved across all attempt directories');
  capturedPrompts = [];
  clearCurrentRunManifest();
  setMockHandler(makeMock([
    { success: true, rawText: buildWordCountExceedingOutput() },
    { success: true, rawText: buildMedicalViolationOutput() },
    { success: true, rawText: buildValidOutput() },
  ]));

  const r10 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r10.success === true, 'Run succeeds on attempt 3');
  assert(r10.slug === TEST_TOPIC.suggestedSlug, 'Slug preserved: ' + r10.slug);

  const m10 = readRunManifest();
  for (const att of m10.attempts) {
    if (att.draftPath) assert(att.draftPath.includes(TEST_TOPIC.suggestedSlug), 'Attempt ' + att.attempt + ' draftPath has correct slug');
  }
  cleanupRun(r10.runId);

  // =========================================================================
  // Test 11: Manifest records all required per-attempt metadata
  // =========================================================================
  console.log('\nTest 11: Manifest records all required per-attempt metadata');
  clearCurrentRunManifest();
  setMockHandler(makeMock([
    { success: true, rawText: buildWordCountExceedingOutput() },
    { success: true, rawText: buildValidOutput() },
  ]));

  const r11 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  const m11 = readRunManifest();
  assert(m11.attempts.length === 2, 'Manifest has 2 attempts');
  assert(m11.totalAttempts === 2, 'totalAttempts is 2');

  const a1 = m11.attempts[0];
  assert(a1.attempt === 1, 'First attempt numbered 1');
  assert(typeof a1.timestamp === 'string', 'Attempt 1 has timestamp');
  assert(a1.validationStatus === 'INVALID', 'Attempt 1 is INVALID');
  assert(Array.isArray(a1.errors) && a1.errors.length > 0, 'Attempt 1 errors non-empty');
  assert(typeof a1.draftPath === 'string', 'Attempt 1 has draftPath');

  const a2 = m11.attempts[1];
  assert(a2.attempt === 2, 'Second attempt numbered 2');
  assert(a2.validationStatus === 'VALID', 'Attempt 2 is VALID');
  assert(Array.isArray(a2.errors) && a2.errors.length === 0, 'Attempt 2 errors empty');

  assert(m11.draft.draftPath === a2.draftPath, 'manifest.draft.draftPath matches final valid attempt');
  assert(m11.validation.valid === true, 'manifest.validation.valid is true');
  assert(m11.isPromotable === true, 'isPromotable is true');
  cleanupRun(r11.runId);

  // =========================================================================
  // Test 12: Stale drafts in drafts root never touched during retries
  // =========================================================================
  console.log('\nTest 12: Stale drafts in drafts root never touched or promoted during retries');
  clearCurrentRunManifest();

  const staleFile = path.join(autopilotConfig.paths.draftsDir, TEST_TOPIC.suggestedSlug + '.md');
  fs.writeFileSync(staleFile, '---\ntitle: "Stale"\n---\nStale content', 'utf-8');

  setMockHandler(makeMock([
    { success: true, rawText: buildWordCountExceedingOutput() },
    { success: true, rawText: buildValidOutput() },
  ]));

  const r12 = await runAutopilot({ generate: true, overrideTopic: TEST_TOPIC });
  assert(r12.success === true, 'Run succeeds even with stale root draft');

  const m12 = readRunManifest();
  assert(m12.draft.draftPath !== staleFile, 'Manifest does not reference stale root draft');
  assert(m12.draft.draftPath.includes(r12.runId), 'Manifest references current run draft');
  assert(fs.readFileSync(staleFile, 'utf-8').includes('Stale content'), 'Stale root draft untouched');

  try { fs.unlinkSync(staleFile); } catch (_) {}
  cleanupRun(r12.runId);

  // =========================================================================
  // Test 13: buildArticlePrompt feedback block only from attempt 2 onward
  // =========================================================================
  console.log('\nTest 13: buildArticlePrompt feedback block only injected for attempt >= 2');

  const p13a = buildArticlePrompt({ topic: TEST_TOPIC, inventory: null, whitelistedRoutes: ['/'], attempt: 1, maxAttempts: 3, previousErrors: ['Some error'] });
  assert(!p13a.prompt.includes('CRITICAL REVISION REQUIRED'), 'Attempt 1 prompt has no feedback block');

  const p13b = buildArticlePrompt({ topic: TEST_TOPIC, inventory: null, whitelistedRoutes: ['/'], attempt: 2, maxAttempts: 3, previousErrors: ['Word count (2678) exceeds maximum threshold of 2500 words.'] });
  assert(p13b.prompt.includes('CRITICAL REVISION REQUIRED'), 'Attempt 2 prompt has feedback block');
  assert(/word count/i.test(p13b.prompt), 'Word count error appears in attempt 2 prompt');

  const p13c = buildArticlePrompt({ topic: TEST_TOPIC, inventory: null, whitelistedRoutes: ['/'], attempt: 2, maxAttempts: 3, previousErrors: [] });
  assert(!p13c.prompt.includes('CRITICAL REVISION REQUIRED'), 'Attempt 2 with empty errors has no feedback block');

  // =========================================================================
  // Test 14: Production content untouched throughout all retry scenarios
  // =========================================================================
  console.log('\nTest 14: Production content untouched after all retry scenarios');
  const prodFiles = fs.readdirSync(autopilotConfig.paths.productionBlogDir).sort();
  assert(prodFiles.length === 9, 'Production blog still has exactly 9 articles (got ' + prodFiles.length + ')');

  // Cleanup
  setMockHandler(null);
  clearCurrentRunManifest();

  console.log('\n' + '='.repeat(70));
  console.log('  TEST RESULTS: ' + passedTests + ' PASSED | ' + failedTests + ' FAILED');
  console.log('='.repeat(70) + '\n');

  if (failedTests > 0) process.exit(1);
}

runRetryTests().catch((err) => {
  setMockHandler(null);
  clearCurrentRunManifest();
  console.error('\n\u274c Retry Test Suite Fatal Error:', err);
  process.exit(1);
});

