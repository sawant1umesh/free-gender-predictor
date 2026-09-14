#!/usr/bin/env node

/**
 * Parsing Robustness & Structured Output Regression Test Suite
 * 
 * Verifies that the AI generation pipeline:
 * 1. Handles clean delimited structured output (<<<METADATA>>> + <<<ARTICLE>>>)
 * 2. Deterministically repairs malformed JSON with unescaped quotes & bad control characters
 * 3. Safely classifies unrecoverable malformed outputs
 * 4. Passes parsing error feedback into subsequent retry attempts
 * 5. Successfully recovers on retry after parsing failures
 * 6. Never fabricates missing structured fields or promotes unvalidated content
 */

import fs from 'node:fs';
import path from 'node:path';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { setMockHandler } from './core/ai-client.js';
import {
  parseAIResponse,
  buildArticlePrompt,
  repairMalformedJsonArticle,
  parseDelimitedResponse,
  cleanMarkdownString,
} from './core/prompt-builder.js';
import { runAutopilot } from './index.js';
import { clearCurrentRunManifest, readRunManifest } from './core/manifest.js';

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

const TEST_TOPIC = {
  id: 'parsing-test-topic-01',
  title: 'Understanding Lunar Months in Chinese Gender Prediction',
  suggestedSlug: 'understanding-lunar-months-chinese-gender-prediction',
  category: 'Chinese Gender Predictor',
  primaryKeyword: 'lunar months Chinese gender prediction',
  secondaryKeywords: ['lunar conception month', 'Chinese gender chart'],
};

const SAMPLE_BODY_PARAGRAPH = `When expectant parents investigate traditional baby gender prediction methods, they frequently encounter ancient cultural charts, folk traditions, and modern clinical diagnostics. While tools like the traditional [Chinese Gender Predictor](/) offer an entertaining way to explore pregnancy lore based on maternal lunar age and lunar conception months, it is essential to understand the scientific reality behind fetal sex determination. Studies analyzing millions of births have consistently demonstrated that folk charts perform at roughly a fifty percent statistical rate, which is equivalent to a random coin flip. For families interested in exploring the history, our [Chinese Gender Calendar](/blog/chinese-gender-calendar) guide provides deep cultural context without mistaking folklore for clinical diagnostics. You can also consult our [Frequently Asked Questions](/faq) and our [Medical Disclaimer](/medical-disclaimer) before making prenatal assumptions. Meanwhile, genuine clinical determination relies on mid-pregnancy ultrasound anatomy scans at eighteen to twenty weeks or cell-free fetal DNA screening (NIPT) from ten weeks of gestation. Parents should always consult certified healthcare professionals for prenatal medical guidance. `;

function createValidMarkdownBody(extraText = '') {
  let body = `# Understanding Lunar Months in Chinese Gender Prediction\n\n`;
  body += `Finding out whether you are expecting a boy or a girl is one of the most exciting milestones in pregnancy.\n\n`;
  body += `## The Mathematical Structure of Lunar Conception Months\n\n`;
  body += SAMPLE_BODY_PARAGRAPH.repeat(4) + `\n\n`;
  if (extraText) body += `${extraText}\n\n`;
  body += `## Comparing Folk Traditions with Clinical Methods\n\n`;
  body += SAMPLE_BODY_PARAGRAPH.repeat(4) + `\n\n`;
  body += `## Scientific Diagnostics: Ultrasounds and DNA Blood Tests\n\n`;
  body += SAMPLE_BODY_PARAGRAPH.repeat(4) + `\n\n`;
  body += `## Frequently Asked Questions\n\n`;
  body += `### What is a lunar conception month?\nIt is the month of conception calculated according to the traditional Chinese lunisolar calendar.\n\n`;
  body += `### Is lunar age scientifically accurate?\nNo, scientific studies indicate accuracy is roughly fifty percent.\n\n`;
  body += `### When can doctors determine baby gender reliably?\nNIPT blood testing is available from week 10, and ultrasound anatomy scans occur around weeks 18 to 20.\n\n`;
  body += `### Should I make nursery purchases based on lunar charts?\nIt is best to wait for clinical ultrasound or NIPT confirmation before making major purchases.\n\n`;
  return body;
}

function cleanupRun(runId) {
  if (!runId) return;
  const runDir = path.resolve(autopilotConfig.paths.draftsDir, runId);
  try {
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  } catch (_) {}
}

async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  🧪 RUNNING PARSING ROBUSTNESS & STRUCTURED OUTPUT TEST SUITE');
  console.log('='.repeat(70) + '\n');

  // ------------------------------------------------------------------
  // Test 1: Valid structured AI response (Delimited <<<METADATA>>> & <<<ARTICLE>>>)
  // ------------------------------------------------------------------
  console.log('Test 1: Valid structured AI response (Delimited format)');
  const delimitedOutput = `<<<METADATA>>>
{
  "frontmatter": {
    "title": "Understanding Lunar Months in Chinese Gender Prediction",
    "seoTitle": "Understanding Lunar Months | Chinese Gender Guide",
    "description": "Comprehensive guide explaining lunar conception months and scientific accuracy.",
    "category": "Chinese Gender Predictor",
    "tags": ["Chinese Gender Predictor", "Baby Gender Prediction", "Pregnancy"],
    "heroImage": "/logo.svg",
    "heroImageAlt": "Understanding Lunar Months",
    "excerpt": "A deep dive into lunar conception months vs clinical fetal diagnostics.",
    "featured": false,
    "faqs": [
      { "question": "What is a lunar month?", "answer": "A month based on cycles of the lunar phases." },
      { "question": "How accurate is it?", "answer": "Evaluations show accuracy is roughly 50%." },
      { "question": "When can ultrasound determine sex?", "answer": "Ultrasound scans occur at 18-20 weeks." },
      { "question": "Does diet affect gender?", "answer": "Diet has no clinical effect on fetal sex." }
    ]
  }
}
<<<METADATA>>>

<<<ARTICLE>>>
${createValidMarkdownBody()}
<<<ARTICLE>>>`;

  const parsed1 = parseAIResponse(delimitedOutput);
  assert(parsed1.valid === true, 'Delimited format parsed successfully');
  assert(parsed1.data.frontmatter.title === 'Understanding Lunar Months in Chinese Gender Prediction', 'Title parsed intact');
  assert(parsed1.data.frontmatter.faqs.length === 4, 'All 4 FAQs parsed intact');
  assert(parsed1.data.wordCount >= 1200, `Word count satisfies minimum (${parsed1.data.wordCount} words)`);

  // ------------------------------------------------------------------
  // Test 2: Valid structured AI response (Legacy JSON format)
  // ------------------------------------------------------------------
  console.log('\nTest 2: Valid structured AI response (Legacy JSON format)');
  const jsonOutput = JSON.stringify({
    frontmatter: {
      title: 'Understanding Lunar Months in Chinese Gender Prediction',
      seoTitle: 'Understanding Lunar Months | Chinese Gender Guide',
      description: 'Comprehensive guide explaining lunar conception months and scientific accuracy.',
      category: 'Chinese Gender Predictor',
      tags: ['Chinese Gender Predictor', 'Baby Gender Prediction', 'Pregnancy'],
      heroImage: '/logo.svg',
      heroImageAlt: 'Understanding Lunar Months',
      excerpt: 'A deep dive into lunar conception months vs clinical fetal diagnostics.',
      featured: false,
      faqs: [
        { question: 'What is a lunar month?', answer: 'A month based on cycles of the lunar phases.' },
        { question: 'How accurate is it?', answer: 'Evaluations show accuracy is roughly 50%.' },
        { question: 'When can ultrasound determine sex?', answer: 'Ultrasound scans occur at 18-20 weeks.' },
        { question: 'Does diet affect gender?', answer: 'Diet has no clinical effect on fetal sex.' },
      ],
    },
    markdownBody: createValidMarkdownBody(),
  });

  const parsed2 = parseAIResponse(jsonOutput);
  assert(parsed2.valid === true, 'Legacy JSON format parsed successfully');
  assert(parsed2.data.frontmatter.category === 'Chinese Gender Predictor', 'Category preserved intact');

  // ------------------------------------------------------------------
  // Test 3: Long article containing unescaped double quotes inside JSON
  // ------------------------------------------------------------------
  console.log('\nTest 3: Long article containing unescaped double quotes inside JSON (Attempt 2 error simulation)');
  // Construct raw JSON string with unescaped double quote inside markdownBody
  const unescapedQuoteBody = createValidMarkdownBody('According to Dr. Zhang, "the chart represents historical folk culture rather than medical certainty."');
  const malformedQuoteJson = `{
  "frontmatter": {
    "title": "Understanding Lunar Months in Chinese Gender Prediction",
    "description": "Comprehensive guide explaining lunar conception months and scientific accuracy.",
    "category": "Chinese Gender Predictor",
    "tags": ["Chinese Gender Predictor"],
    "heroImage": "/logo.svg",
    "heroImageAlt": "Understanding Lunar Months",
    "excerpt": "A deep dive into lunar conception months vs clinical fetal diagnostics.",
    "featured": false,
    "faqs": [
      { "question": "What is a lunar month?", "answer": "A month based on cycles of the lunar phases." },
      { "question": "How accurate is it?", "answer": "Evaluations show accuracy is roughly 50%." },
      { "question": "When can ultrasound determine sex?", "answer": "Ultrasound scans occur at 18-20 weeks." },
      { "question": "Does diet affect gender?", "answer": "Diet has no clinical effect on fetal sex." }
    ]
  },
  "markdownBody": "## Overview\n\nDr. Smith said, "unescaped quote right here" and continued writing.\n\n${unescapedQuoteBody.replaceAll('"', '')}"
}`;

  // Standard JSON.parse throws here
  let standardParseFailed = false;
  try {
    JSON.parse(malformedQuoteJson);
  } catch (_) {
    standardParseFailed = true;
  }
  assert(standardParseFailed, 'Standard JSON.parse correctly fails on unescaped quote in JSON string');

  const repairedQuoteRes = parseAIResponse(malformedQuoteJson);
  assert(repairedQuoteRes.valid === true, 'parseAIResponse deterministically repairs JSON with unescaped quotes');
  assert(repairedQuoteRes.repaired === true, 'repaired flag is set to true');
  assert(repairedQuoteRes.data.markdownBody.includes('unescaped quote right here'), 'Unescaped quote text preserved in markdown body');

  // ------------------------------------------------------------------
  // Test 4: Multiline article content with raw newline characters (Attempt 3 error simulation)
  // ------------------------------------------------------------------
  console.log('\nTest 4: Raw newline control characters inside JSON string (Attempt 3 error simulation)');
  // In JSON, literal newlines inside string literals cause: "Bad control character in string literal"
  const rawNewlineJson = `{
  "frontmatter": {
    "title": "Understanding Lunar Months in Chinese Gender Prediction",
    "description": "Comprehensive guide explaining lunar conception months and scientific accuracy.",
    "category": "Chinese Gender Predictor",
    "tags": ["Chinese Gender Predictor"],
    "heroImage": "/logo.svg",
    "heroImageAlt": "Understanding Lunar Months",
    "excerpt": "A deep dive into lunar conception months vs clinical fetal diagnostics.",
    "featured": false,
    "faqs": [
      { "question": "What is a lunar month?", "answer": "A month based on cycles of the lunar phases." },
      { "question": "How accurate is it?", "answer": "Evaluations show accuracy is roughly 50%." },
      { "question": "When can ultrasound determine sex?", "answer": "Ultrasound scans occur at 18-20 weeks." },
      { "question": "Does diet affect gender?", "answer": "Diet has no clinical effect on fetal sex." }
    ]
  },
  "markdownBody": "${createValidMarkdownBody()}"
}`;

  let controlCharFailed = false;
  try {
    JSON.parse(rawNewlineJson);
  } catch (err) {
    controlCharFailed = err.message.includes('control character') || err.message.includes('Bad control');
  }
  assert(controlCharFailed, 'Standard JSON.parse fails with Bad control character in string literal');

  const repairedControlRes = parseAIResponse(rawNewlineJson);
  assert(repairedControlRes.valid === true, 'parseAIResponse deterministically repairs JSON with raw newlines');
  assert(repairedControlRes.data.wordCount >= 1200, 'Repaired body meets word count requirement');

  // ------------------------------------------------------------------
  // Test 5: Rich Markdown content preservation
  // ------------------------------------------------------------------
  console.log('\nTest 5: Rich Markdown content preservation');
  const markdownSample = `# Main Title\n\n## Section 2\n\n- Bullet 1\n- Bullet 2\n\n| Col A | Col B |\n| --- | --- |\n| Data 1 | Data 2 |\n\n**Bold text** and *italic text*.`;
  const cleanedMd = cleanMarkdownString(markdownSample);
  assert(cleanedMd.includes('| Col A | Col B |'), 'Markdown tables preserved');
  assert(cleanedMd.includes('- Bullet 1'), 'Markdown lists preserved');
  assert(cleanedMd.includes('**Bold text**'), 'Bold formatting preserved');

  // ------------------------------------------------------------------
  // Test 6: Unrecoverable truncated malformed response
  // ------------------------------------------------------------------
  console.log('\nTest 6: Unrecoverable truncated malformed response');
  const truncatedOutput = `{"frontmatter": {"title": "Truncated Guide", "description": "Incomplete`;
  const truncatedRes = parseAIResponse(truncatedOutput);
  assert(truncatedRes.valid === false, 'Truncated response is rejected safely');
  assert(truncatedRes.classification === 'MALFORMED_JSON_SYNTAX', `Classified as MALFORMED_JSON_SYNTAX (${truncatedRes.classification})`);
  assert(truncatedRes.recoverable === false, 'Marked as unrecoverable');

  // ------------------------------------------------------------------
  // Test 7: Missing required frontmatter fields rejected
  // ------------------------------------------------------------------
  console.log('\nTest 7: Missing required frontmatter fields rejected without guessing');
  const missingFieldOutput = `<<<METADATA>>>
{
  "frontmatter": {
    "title": "Incomplete Metadata Guide",
    "category": "Chinese Gender Predictor",
    "faqs": [
      { "question": "Q1?", "answer": "A1" },
      { "question": "Q2?", "answer": "A2" },
      { "question": "Q3?", "answer": "A3" },
      { "question": "Q4?", "answer": "A4" }
    ]
  }
}
<<<METADATA>>>

<<<ARTICLE>>>
${createValidMarkdownBody()}
<<<ARTICLE>>>`;

  const missingFieldRes = parseAIResponse(missingFieldOutput);
  assert(missingFieldRes.valid === false, 'Missing required fields rejected');
  assert(missingFieldRes.classification === 'MISSING_REQUIRED_FIELDS', 'Classified as MISSING_REQUIRED_FIELDS');
  assert(missingFieldRes.error.includes('description'), 'Error identifies missing description field');

  // ------------------------------------------------------------------
  // Test 8: Invalid FAQs count rejected
  // ------------------------------------------------------------------
  console.log('\nTest 8: Invalid FAQs count rejected');
  const badFaqOutput = `<<<METADATA>>>
{
  "frontmatter": {
    "title": "Understanding Lunar Months in Chinese Gender Prediction",
    "description": "Comprehensive guide explaining lunar conception months and scientific accuracy.",
    "category": "Chinese Gender Predictor",
    "tags": ["Chinese Gender Predictor"],
    "heroImage": "/logo.svg",
    "heroImageAlt": "Understanding Lunar Months",
    "excerpt": "A deep dive into lunar conception months vs clinical fetal diagnostics.",
    "featured": false,
    "faqs": [
      { "question": "Q1?", "answer": "A1" }
    ]
  }
}
<<<METADATA>>>

<<<ARTICLE>>>
${createValidMarkdownBody()}
<<<ARTICLE>>>`;

  const badFaqRes = parseAIResponse(badFaqOutput);
  assert(badFaqRes.valid === false, 'Response with insufficient FAQs rejected');
  assert(badFaqRes.classification === 'INVALID_FAQS', 'Classified as INVALID_FAQS');

  // ------------------------------------------------------------------
  // Test 9: Conversational non-JSON chatter rejected
  // ------------------------------------------------------------------
  console.log('\nTest 9: Conversational non-JSON chatter rejected');
  const chatterOutput = `Sure! Here is a great article about Chinese gender prediction for your website. It explains everything you need to know about lunar charts!`;
  const chatterRes = parseAIResponse(chatterOutput);
  assert(chatterRes.valid === false, 'Conversational chatter rejected');
  assert(
    chatterRes.classification === 'MISSING_STRUCTURED_METADATA' || chatterRes.classification === 'MALFORMED_JSON_SYNTAX',
    `Classified safely (${chatterRes.classification})`
  );

  // ------------------------------------------------------------------
  // Test 10: Feedback prompt generation on parsing failure
  // ------------------------------------------------------------------
  console.log('\nTest 10: Parsing failure triggers explicit delimiter feedback in prompt');
  const promptWithParsingError = buildArticlePrompt({
    topic: TEST_TOPIC,
    attempt: 2,
    maxAttempts: 3,
    previousErrors: ['Malformed JSON from AI model: Expected \',\' or \'}\' after property value in JSON at position 3157'],
  });

  assert(
    promptWithParsingError.prompt.includes('OUTPUT FORMAT & DELIMITERS CORRECTION'),
    'Prompt includes explicit delimiter correction instruction'
  );
  assert(
    promptWithParsingError.prompt.includes('<<<METADATA>>>') && promptWithParsingError.prompt.includes('<<<ARTICLE>>>'),
    'Prompt contains required delimiter specifications'
  );

  // ------------------------------------------------------------------
  // Test 11: Successful retry after attempt 1 parsing failure
  // ------------------------------------------------------------------
  console.log('\nTest 11: Successful retry after attempt 1 parsing failure');
  clearCurrentRunManifest();

  let attemptCallCount = 0;
  setMockHandler(({ prompt }) => {
    attemptCallCount++;
    if (attemptCallCount === 1) {
      // Attempt 1: Unrecoverable malformed text
      return {
        success: true,
        rawText: 'This is conversational chat with no structured metadata whatsoever.',
        provider: 'gemini',
        model: 'gemini-3.6-flash',
      };
    }
    // Attempt 2: Correct structured delimited format
    return {
      success: true,
      rawText: delimitedOutput,
      provider: 'gemini',
      model: 'gemini-3.6-flash',
    };
  });

  const retryRunRes = await runAutopilot({
    generate: true,
    overrideTopic: TEST_TOPIC,
    maxAttempts: 3,
  });

  assert(retryRunRes.success === true, 'Autopilot recovered and succeeded on retry');
  assert(retryRunRes.state === RESULT_STATES.VALIDATED_DRAFT_CREATED, 'Final state is VALIDATED_DRAFT_CREATED');
  assert(attemptCallCount === 2, `Used exactly 2 attempts (count: ${attemptCallCount})`);

  const retryManifest = readRunManifest();
  assert(retryManifest.totalAttempts === 2, 'Manifest recorded 2 total attempts');
  assert(retryManifest.attempts[0].stage === 'PARSING', 'Attempt 1 recorded stage as PARSING');
  assert(retryManifest.attempts[0].validationStatus === 'FAILED', 'Attempt 1 marked FAILED');
  assert(retryManifest.attempts[1].validationStatus === 'VALID', 'Attempt 2 marked VALID');
  assert(retryManifest.isPromotable === true, 'Final draft marked promotable');

  cleanupRun(retryRunRes.runId);

  // ------------------------------------------------------------------
  // Test 12: Exhaustion when all 3 attempts produce unrecoverable malformed output
  // ------------------------------------------------------------------
  console.log('\nTest 12: Exhaustion when all 3 attempts produce unrecoverable malformed output');
  clearCurrentRunManifest();

  let exhaustedCallCount = 0;
  setMockHandler(() => {
    exhaustedCallCount++;
    return {
      success: true,
      rawText: `Attempt ${exhaustedCallCount} conversational output with no valid JSON or delimiters.`,
      provider: 'gemini',
      model: 'gemini-3.6-flash',
    };
  });

  const exhaustRunRes = await runAutopilot({
    generate: true,
    overrideTopic: TEST_TOPIC,
    maxAttempts: 3,
  });

  assert(exhaustRunRes.success === false, 'Workflow stops safely on exhaustion');
  assert(exhaustRunRes.state === RESULT_STATES.INVALID_AI_RESPONSE, `State is INVALID_AI_RESPONSE (${exhaustRunRes.state})`);
  assert(exhaustedCallCount === 3, 'All 3 attempts were invoked');

  const exhaustManifest = readRunManifest();
  assert(exhaustManifest.status === 'INVALID_AI_RESPONSE', `Manifest status is INVALID_AI_RESPONSE (${exhaustManifest.status})`);
  assert(exhaustManifest.isPromotable === false, 'Draft is NOT marked promotable');
  assert(exhaustManifest.draft === null, 'No draft path recorded in manifest');

  cleanupRun(exhaustRunRes.runId);

  // ------------------------------------------------------------------
  // Test 13: Internal link trailing slash auto-sanitization
  // ------------------------------------------------------------------
  console.log('\nTest 13: Internal link trailing slash auto-sanitization');
  const slashOutput = `<<<METADATA>>>
{
  "frontmatter": {
    "title": "Understanding Lunar Months in Chinese Gender Prediction",
    "description": "Comprehensive guide explaining lunar conception months and scientific accuracy.",
    "category": "Chinese Gender Predictor",
    "tags": ["Chinese Gender Predictor"],
    "heroImage": "/logo.svg",
    "heroImageAlt": "Understanding Lunar Months",
    "excerpt": "A deep dive into lunar conception months vs clinical fetal diagnostics.",
    "featured": false,
    "faqs": [
      { "question": "What is a lunar month?", "answer": "A month based on cycles of the lunar phases." },
      { "question": "How accurate is it?", "answer": "Evaluations show accuracy is roughly 50%." },
      { "question": "When can ultrasound determine sex?", "answer": "Ultrasound scans occur at 18-20 weeks." },
      { "question": "Does diet affect gender?", "answer": "Diet has no clinical effect on fetal sex." }
    ]
  }
}
<<<METADATA>>>

<<<ARTICLE>>>
${createValidMarkdownBody().replace('/blog/chinese-gender-calendar', '/blog/chinese-gender-calendar/')}
<<<ARTICLE>>>`;

  const slashRes = parseAIResponse(slashOutput, {
    whitelistedPaths: ['/blog/chinese-gender-calendar', '/', '/faq', '/medical-disclaimer'],
  });

  assert(slashRes.valid === true, 'Response with trailing slash link parsed successfully');
  assert(!slashRes.data.markdownBody.includes('/blog/chinese-gender-calendar/'), 'Trailing slash was sanitized from internal link');
  assert(slashRes.data.markdownBody.includes('/blog/chinese-gender-calendar'), 'Clean internal link is preserved');

  // ------------------------------------------------------------------
  // Test 14: YAML frontmatter format support
  // ------------------------------------------------------------------
  console.log('\nTest 14: YAML frontmatter format support');
  const yamlOutput = `---
title: "Understanding Lunar Months in Chinese Gender Prediction"
description: "Comprehensive guide explaining lunar conception months and scientific accuracy."
category: "Chinese Gender Predictor"
tags: ["Chinese Gender Predictor", "Baby Gender Prediction"]
heroImage: "/logo.svg"
heroImageAlt: "Understanding Lunar Months"
excerpt: "A deep dive into lunar conception months vs clinical fetal diagnostics."
featured: false
faqs:
  - question: "What is a lunar month?"
    answer: "A month based on cycles of the lunar phases."
  - question: "How accurate is it?"
    answer: "Evaluations show accuracy is roughly 50%."
  - question: "When can ultrasound determine sex?"
    answer: "Ultrasound scans occur at 18-20 weeks."
  - question: "Does diet affect gender?"
    answer: "Diet has no clinical effect on fetal sex."
---

${createValidMarkdownBody()}`;

  const yamlRes = parseAIResponse(yamlOutput);
  assert(yamlRes.valid === true, 'Native YAML frontmatter parsed successfully');
  assert(yamlRes.data.frontmatter.title === 'Understanding Lunar Months in Chinese Gender Prediction', 'YAML title extracted');
  assert(yamlRes.data.frontmatter.faqs.length === 4, 'YAML FAQs extracted');

  // ------------------------------------------------------------------
  // Test Summary
  // ------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log(`  PARSING ROBUSTNESS TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('='.repeat(70) + '\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error in parsing robustness test suite:', err);
  process.exit(1);
});
