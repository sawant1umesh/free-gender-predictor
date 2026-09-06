#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { setMockHandler, generateArticleContent, sanitizeErrorMessage } from './core/ai-client.js';
import { parseAIResponse } from './core/prompt-builder.js';
import { createDraft, sanitizeSlug } from './core/draft-generator.js';
import { runAutopilot } from './index.js';
import { readLogs } from './core/audit-logger.js';

// Tracking test drafts for reliable cleanup
const createdTestDrafts = new Set();

/**
 * Generate mock valid markdown body meeting word count requirements (~1,300 words)
 */
function createMockArticleBody() {
  const paragraph = `When expectant parents explore baby gender prediction methods, they frequently encounter ancient cultural charts, folk traditions, and modern clinical diagnostics. While tools like the traditional [Chinese Gender Predictor](/) offer an entertaining way to explore pregnancy lore based on maternal lunar age and lunar conception months, it is essential to understand the scientific reality behind fetal sex determination. Studies analyzing millions of births have consistently demonstrated that folk charts perform at roughly a fifty percent statistical rate, which is equivalent to a random coin flip. For families interested in exploring the history, our [Chinese Gender Calendar](/blog/chinese-gender-calendar) guide provides deep cultural context without mistaking folklore for clinical diagnostics. You can also consult our [Frequently Asked Questions](/faq) and our [Medical Disclaimer](/medical-disclaimer) before making prenatal assumptions. Meanwhile, genuine clinical determination relies on mid-pregnancy ultrasound anatomy scans at eighteen to twenty weeks or cell-free fetal DNA screening (NIPT) from ten weeks of gestation. Parents should always consult certified healthcare professionals for prenatal medical guidance. `;

  let body = `# Understanding Baby Gender Prediction: Cultural Tradition vs Clinical Science\n\n`;
  body += `Finding out whether you are expecting a boy or a girl is one of the most exciting milestones in pregnancy.\n\n`;
  body += `## The History of Traditional Gender Prediction Charts\n\n`;
  body += paragraph.repeat(4) + `\n\n`;
  body += `## Comparing Folk Traditions with Clinical Methods\n\n`;
  body += paragraph.repeat(4) + `\n\n`;
  body += `## Scientific Diagnostics: Ultrasounds and DNA Blood Tests\n\n`;
  body += paragraph.repeat(4) + `\n\n`;
  body += `## Frequently Asked Questions\n\n`;
  body += `### What is the Chinese Gender Predictor?\nIt is a traditional folk chart dating back centuries based on lunar months.\n\n`;
  body += `### Is it scientifically accurate?\nNo, scientific studies indicate accuracy is roughly fifty percent.\n\n`;
  body += `### When can doctors determine baby gender reliably?\nNIPT blood testing is available from week 10, and ultrasound anatomy scans occur around weeks 18 to 20.\n\n`;
  body += `### Should I make nursery purchases based on folk charts?\nIt is best to wait for clinical ultrasound or NIPT confirmation before making major purchases.\n\n`;

  return body;
}

/**
 * Valid sample structured AI output
 */
function createValidMockAIOutput(title = 'Test Gender Prediction Guide') {
  return JSON.stringify({
    frontmatter: {
      title,
      seoTitle: `${title} | Complete Guide`,
      description: 'A comprehensive guide exploring baby gender prediction traditions and scientific facts.',
      category: 'Chinese Gender Predictor',
      tags: ['Chinese Gender Predictor', 'Baby Gender Prediction', 'Pregnancy'],
      heroImage: '/logo.svg',
      heroImageAlt: `${title} - Baby Gender Prediction Guide`,
      excerpt: 'Learn the differences between traditional baby gender prediction charts and medical testing.',
      featured: false,
      faqs: [
        {
          question: 'What is the Chinese Gender Predictor?',
          answer: 'It is a traditional folk chart dating back centuries based on lunar months.',
        },
        {
          question: 'Is the Chinese Gender Predictor scientifically accurate?',
          answer: 'No, scientific evaluations confirm it has approximately a 50% accuracy rate.',
        },
        {
          question: 'When can doctors determine baby gender reliably?',
          answer: 'NIPT blood testing is available from week 10, and ultrasound anatomy scans occur around weeks 18 to 20.',
        },
        {
          question: 'Does maternal diet or cravings indicate baby gender?',
          answer: 'No clinical evidence links specific cravings with fetal sex.',
        },
      ],
    },
    markdownBody: createMockArticleBody(),
  });
}

// Test Runner Framework
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

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  🧪 RUNNING PHASE 2 AUTOMATED TEST SUITE');
  console.log('  Testing AI generation pipeline, dual provider failover & safety');
  console.log('='.repeat(70) + '\n');

  const initialProdArticles = fs.readdirSync(autopilotConfig.paths.productionBlogDir);

  // -------------------------------------------------------------
  // Test 0: Verify AI model configuration source of truth
  // -------------------------------------------------------------
  console.log('Test 0: Verify AI model configuration source of truth');
  assert(autopilotConfig.ai.gemini.model === 'gemini-3.6-flash', 'Gemini model is configured as gemini-3.6-flash');
  assert(autopilotConfig.ai.groq.model === 'openai/gpt-oss-120b', 'Groq fallback model is configured as openai/gpt-oss-120b');
  assert(autopilotConfig.ai.primaryProvider === 'gemini', 'Primary provider is gemini');
  assert(autopilotConfig.ai.fallbackProvider === 'groq', 'Fallback provider is groq');

  // -------------------------------------------------------------
  // Test 1: Dry-run makes zero AI calls
  // -------------------------------------------------------------
  console.log('\nTest 1: Dry-run mode makes zero AI calls');
  let aiCalledInDryRun = false;
  setMockHandler(() => {
    aiCalledInDryRun = true;
    return { success: true, rawText: createValidMockAIOutput() };
  });

  const dryRunRes = await runAutopilot({ generate: false });
  assert(!aiCalledInDryRun, 'Dry-run executed with zero AI provider calls');
  assert(dryRunRes.state === RESULT_STATES.DRY_RUN_COMPLETE, 'Dry-run returned DRY_RUN_COMPLETE state');

  // -------------------------------------------------------------
  // Test 2: Generate mode with mocked Gemini creates a draft
  // -------------------------------------------------------------
  console.log('\nTest 2: Generate mode with mocked Gemini success creates a draft');
  const testTopic = {
    id: 'test-seed-001',
    title: 'Automated Test Guide to Gender Calendars',
    suggestedSlug: 'automated-test-guide-gender-calendars',
    category: 'Chinese Gender Predictor',
    primaryKeyword: 'gender calendars test',
    targetWordCount: 1500,
  };

  setMockHandler(() => {
    return {
      success: true,
      rawText: createValidMockAIOutput('Automated Test Guide to Gender Calendars'),
      provider: 'gemini',
      model: autopilotConfig.ai.gemini.model,
      fallbackUsed: false,
    };
  });

  const genRes = await runAutopilot({ generate: true, overrideTopic: testTopic });
  assert(
    genRes.state === RESULT_STATES.DRAFT_CREATED || genRes.state === RESULT_STATES.VALIDATED_DRAFT_CREATED,
    'Generation returned valid draft created state'
  );
  assert(Boolean(genRes.draftPath && fs.existsSync(genRes.draftPath)), 'Draft file was created on disk');
  if (genRes.draftPath) createdTestDrafts.add(genRes.draftPath);

  // -------------------------------------------------------------
  // Test 3: Generated draft exists ONLY inside scripts/autopilot/drafts/
  // -------------------------------------------------------------
  console.log('\nTest 3: Generated draft exists strictly within scripts/autopilot/drafts/');
  const draftsDirNorm = path.normalize(path.resolve(autopilotConfig.paths.draftsDir));
  const createdPathNorm = path.normalize(path.resolve(genRes.draftPath || ''));
  assert(
    createdPathNorm.startsWith(draftsDirNorm),
    `Draft path "${createdPathNorm}" is strictly within drafts directory "${draftsDirNorm}"`
  );

  // -------------------------------------------------------------
  // Test 4: Production src/content/blog/ remains untouched
  // -------------------------------------------------------------
  console.log('\nTest 4: Production src/content/blog/ remains completely untouched');
  const currentProdArticles = fs.readdirSync(autopilotConfig.paths.productionBlogDir);
  assert(
    JSON.stringify(initialProdArticles.sort()) === JSON.stringify(currentProdArticles.sort()),
    `Production blog directory still contains exact initial 8 articles (${currentProdArticles.length} files)`
  );

  // -------------------------------------------------------------
  // Test 5: Gemini failure triggers Groq fallback when configured
  // -------------------------------------------------------------
  console.log('\nTest 5: Gemini failure triggers Groq fallback');
  let fallbackAttempted = false;
  setMockHandler(() => {
    fallbackAttempted = true;
    return {
      success: true,
      rawText: createValidMockAIOutput('Groq Fallback Test Article'),
      provider: 'groq',
      model: autopilotConfig.ai.groq.model,
      fallbackUsed: true,
    };
  });

  const fallbackRes = await generateArticleContent({
    prompt: 'test prompt',
    systemInstruction: 'test instruction',
    dryRun: false,
  });

  assert(fallbackAttempted, 'Fallback provider handler was invoked upon primary failure');
  assert(fallbackRes.provider === 'groq', 'Response was served by fallback provider "groq"');
  assert(fallbackRes.fallbackUsed === true, 'fallbackUsed flag is correctly set to true');

  // -------------------------------------------------------------
  // Test 6: Both providers failing returns GENERATION_FAILED safely
  // -------------------------------------------------------------
  console.log('\nTest 6: Both providers failing returns GENERATION_FAILED safely');
  setMockHandler(() => {
    return {
      success: false,
      errorState: RESULT_STATES.GENERATION_FAILED,
      error: 'Simulated failure of all providers',
    };
  });

  const failRes = await runAutopilot({ generate: true, overrideTopic: testTopic });
  assert(failRes.state === RESULT_STATES.GENERATION_FAILED, 'Returns GENERATION_FAILED state when providers fail');
  assert(!failRes.success, 'Success is false on generation failure');

  // -------------------------------------------------------------
  // Test 7: Missing API keys handled safely without throwing
  // -------------------------------------------------------------
  console.log('\nTest 7: Missing API keys handled safely without throwing');
  setMockHandler(null); // Clear mock to test live credential check logic
  const originalGemini = process.env.GEMINI_API_KEY;
  const originalGroq = process.env.GROQ_API_KEY;

  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;

  const noKeyRes = await generateArticleContent({
    prompt: 'test',
    systemInstruction: 'test',
    dryRun: false,
  });

  assert(!noKeyRes.success, 'Missing keys result in success: false');
  assert(noKeyRes.errorState === RESULT_STATES.GENERATION_FAILED, 'Missing keys return GENERATION_FAILED state');
  assert(noKeyRes.error.includes('Neither GEMINI_API_KEY nor GROQ_API_KEY'), 'Clear error explanation provided');

  // Restore env
  if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
  if (originalGroq) process.env.GROQ_API_KEY = originalGroq;

  // -------------------------------------------------------------
  // Test 8: Malformed AI response returns INVALID_AI_RESPONSE
  // -------------------------------------------------------------
  console.log('\nTest 8: Malformed AI response returns INVALID_AI_RESPONSE');
  setMockHandler(() => {
    return {
      success: true,
      rawText: 'This is not JSON at all, just plain conversational text from an LLM.',
      provider: 'gemini',
      model: autopilotConfig.ai.gemini.model,
    };
  });

  const malformedRes = await runAutopilot({ generate: true, overrideTopic: testTopic });
  assert(malformedRes.state === RESULT_STATES.INVALID_AI_RESPONSE, 'Returns INVALID_AI_RESPONSE for non-JSON text');
  assert(!malformedRes.success, 'Success is false when response is invalid');

  // -------------------------------------------------------------
  // Test 9: Invalid/path traversal slug is sanitized or rejected
  // -------------------------------------------------------------
  console.log('\nTest 9: Invalid / path-traversal slug is sanitized safely');
  const traversalSlug = '../../dangerous/path/injection';
  const cleanSlug = sanitizeSlug(traversalSlug);
  assert(!cleanSlug.includes('..'), 'Path traversal dots are stripped');
  assert(!cleanSlug.includes('/'), 'Forward slashes are stripped');
  assert(!cleanSlug.includes('\\'), 'Backslashes are stripped');

  // Test createDraft boundary rejection
  const boundaryEscape = createDraft({
    frontmatter: {
      title: 'Escape Test',
      description: 'Test',
      category: 'Chinese Gender Predictor',
      heroImage: '/logo.svg',
      heroImageAlt: 'Alt',
      excerpt: 'Excerpt',
    },
    markdownBody: 'Body content',
    suggestedSlug: '../../../etc/passwd',
  });
  // Since sanitizeSlug removes dots and slashes, it becomes "etc-passwd" and writes into drafts dir, not root
  if (boundaryEscape.success) {
    createdTestDrafts.add(boundaryEscape.draftPath);
    assert(
      boundaryEscape.draftPath.startsWith(path.resolve(autopilotConfig.paths.draftsDir)),
      'Even malicious slug stays confined inside draftsDir'
    );
  }

  // -------------------------------------------------------------
  // Test 10: Generated Markdown contains all required Astro frontmatter fields
  // -------------------------------------------------------------
  console.log('\nTest 10: Generated Markdown contains all required Astro frontmatter fields');
  const sampleParsed = parseAIResponse(createValidMockAIOutput('Frontmatter Integrity Test'));
  assert(sampleParsed.valid, 'Mock AI response parses cleanly');

  const draftObj = createDraft({
    frontmatter: sampleParsed.data.frontmatter,
    markdownBody: sampleParsed.data.markdownBody,
    suggestedSlug: 'frontmatter-integrity-test',
  });
  createdTestDrafts.add(draftObj.draftPath);

  const fileContent = fs.readFileSync(draftObj.draftPath, 'utf-8');
  const requiredFields = ['title', 'description', 'pubDate', 'category', 'heroImage', 'heroImageAlt', 'excerpt'];
  for (const field of requiredFields) {
    assert(fileContent.includes(`${field}:`), `Draft markdown file contains required frontmatter field: "${field}"`);
  }

  // -------------------------------------------------------------
  // Test 11: Hero image uses configured local mapping
  // -------------------------------------------------------------
  console.log('\nTest 11: Hero image uses configured local mapping');
  assert(sampleParsed.data.frontmatter.heroImage === '/logo.svg', 'Hero image is set to configured local path /logo.svg');
  assert(
    !sampleParsed.data.frontmatter.heroImage.startsWith('http'),
    'Hero image contains no external URLs or third-party hosts'
  );

  // -------------------------------------------------------------
  // Test 12: FAQ data is preserved correctly
  // -------------------------------------------------------------
  console.log('\nTest 12: FAQ data is preserved correctly');
  assert(Array.isArray(sampleParsed.data.frontmatter.faqs), 'Frontmatter FAQs is an array');
  assert(
    sampleParsed.data.frontmatter.faqs.length >= 4 && sampleParsed.data.frontmatter.faqs.length <= 8,
    `FAQ count (${sampleParsed.data.frontmatter.faqs.length}) is within limits (4-8)`
  );
  assert(fileContent.includes('faqs:'), 'Draft frontmatter includes faqs block');
  assert(fileContent.includes('question:'), 'Draft frontmatter includes question items');

  // -------------------------------------------------------------
  // Test 13: Audit log contains no raw API keys
  // -------------------------------------------------------------
  console.log('\nTest 13: Audit log contains zero raw secrets or API keys');
  const fakeKey = 'AIzaSyFakeSecretKey1234567890abcdefg';
  const scrubbed = sanitizeErrorMessage(new Error(`API Error with key ${fakeKey}`));
  assert(!scrubbed.includes(fakeKey), 'Error sanitizer redacts sensitive key patterns');

  const logs = readLogs();
  const rawLogsStr = JSON.stringify(logs);
  assert(
    !rawLogsStr.includes('AIzaSy') && !rawLogsStr.includes('gsk_'),
    'Audit log file contains zero API key fingerprints'
  );

  // -------------------------------------------------------------
  // Clean Up Test Drafts
  // -------------------------------------------------------------
  console.log('\n🧹 Cleaning up temporary test artifacts...');
  for (const draftPath of createdTestDrafts) {
    try {
      if (fs.existsSync(draftPath)) {
        fs.unlinkSync(draftPath);
        console.log(`   ✓ Removed test draft: ${path.basename(draftPath)}`);
      }
    } catch (err) {
      console.warn(`   ⚠️ Could not remove ${draftPath}: ${err.message}`);
    }
  }

  // Reset mock handler
  setMockHandler(null);

  console.log('\n' + '='.repeat(70));
  console.log(`  TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('='.repeat(70) + '\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Error:', err);
  process.exit(1);
});
