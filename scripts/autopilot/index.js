#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autopilotConfig, RESULT_STATES } from './core/config.js';
import { scanInventory, slugify } from './core/inventory.js';
import { analyzeSeeds, analyzeTopicCandidate } from './core/gap-analyzer.js';
import { buildArticlePrompt, parseAIResponse } from './core/prompt-builder.js';
import { generateArticleContent, getProviderAvailability } from './core/ai-client.js';
import { createDraft } from './core/draft-generator.js';
import { validateDraft } from './core/validator.js';
import { logEvent } from './core/audit-logger.js';
import { createRunId, writeRunManifest, updateRunManifest, clearCurrentRunManifest } from './core/manifest.js';

/**
 * Main orchestrator for SEO Autopilot
 * @param {object} [options]
 * @param {boolean} [options.generate] - If true, runs generation pipeline. Defaults to false (dry-run).
 * @param {object|string} [options.overrideTopic] - Optional specific topic candidate to run.
 * @param {object|string} [options.forceTopic] - Optional specific topic candidate to run with safety checks.
 * @param {boolean} [options.allowCaution] - Whether to allow CAUTION-level topic selection.
 * @param {string} [options.runId] - Optional explicit run identifier for transaction tracking.
 * @returns {Promise<{
 *   state: string,
 *   success: boolean,
 *   runId: string,
 *   topic?: object,
 *   draftPath?: string,
 *   slug?: string,
 *   validation?: object,
 *   manifestPath?: string,
 *   error?: string
 * }>}
 */
export async function runAutopilot({ generate = false, overrideTopic = null, forceTopic = null, allowCaution = false, runId: customRunId = null } = {}) {
  const isGenerateMode = Boolean(generate);
  const runId = (customRunId && typeof customRunId === 'string') ? customRunId : createRunId();

  // Reset/clean previous run state safely
  clearCurrentRunManifest();

  console.log('\n' + '='.repeat(70));
  console.log('  🎯 SEO AUTOPILOT - PHASE 3: QUALITY GATE & DRAFT VALIDATION');
  console.log('  Site: Free Gender Predictor (https://freegenderpredictor.com)');
  console.log(`  Run ID: ${runId}`);
  console.log(`  Mode: ${isGenerateMode ? '🚀 GENERATE (Draft staging & validation)' : '🛡️  DRY-RUN / READ-ONLY (No drafts created)'}`);
  console.log('='.repeat(70) + '\n');

  // 1. Scan Content Inventory & Whitelist Routes (Fresh Runtime Scan)
  // IMPORTANT: This scan reads the CURRENT filesystem state at runtime.
  // All topic-selection safety decisions are made against this exact snapshot.
  const inventoryScanTimestamp = new Date().toISOString();
  console.log('🔍 [1/6] Scanning production blog inventory & internal routes...');
  console.log(`   • Run ID:         ${runId}`);
  console.log(`   • Scan timestamp: ${inventoryScanTimestamp}`);
  const inventory = await scanInventory();
  const whitelistedPaths = inventory.routes.map((r) => r.path);

  // Initialize current run manifest
  const manifestData = {
    runId,
    createdAt: new Date().toISOString(),
    mode: isGenerateMode ? 'generate' : 'dry-run',
    status: 'INITIALIZING',
    resultState: null,
    inventoryScan: {
      timestamp: inventoryScanTimestamp,
      totalArticles: inventory.stats.totalArticles,
      productionSlugs: inventory.articles.map((a) => a.slug),
      productionTitles: inventory.articles.map((a) => a.title),
    },
    selectedTopic: null,
    draft: null,
    validation: null,
    promotion: null,
    errors: [],
  };
  writeRunManifest(manifestData);

  console.log(`   ✓ Found ${inventory.stats.totalArticles} published articles`);
  console.log(`   ✓ Discovered ${inventory.stats.totalCategories} active categories`);
  console.log(`   ✓ Discovered ${inventory.stats.totalRoutes} valid internal linking routes`);
  console.log(`   ✓ Average published article length: ${inventory.stats.avgWordCount} words`);
  console.log(`   • Current production articles (${inventory.stats.totalArticles}):`);
  for (const art of inventory.articles) {
    console.log(`       /blog/${art.slug}  —  "${art.title}"`);
  }
  console.log('');

  // 2. Load Topic Seeds & Gap Analysis
  console.log('🧠 [2/6] Evaluating topic candidates for duplicate/cannibalization risk...');
  const seedsPath = autopilotConfig.paths.topicSeedsFile;
  if (!fs.existsSync(seedsPath)) {
    throw new Error(`Topic seeds file missing at ${seedsPath}`);
  }

  const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf-8'));
  const analysisResults = analyzeSeeds(seeds, inventory);

  const safeTopics = analysisResults.filter((r) => r.decision === 'SAFE');
  const cautionTopics = analysisResults.filter((r) => r.decision === 'CAUTION');
  const rejectTopics = analysisResults.filter((r) => r.decision === 'REJECT');

  console.log(`   ✓ Analysis results: ${safeTopics.length} SAFE | ${cautionTopics.length} CAUTION | ${rejectTopics.length} REJECT`);
  if (cautionTopics.length > 0) {
    console.log(`   ⚠️  CAUTION seeds (blocked by default):`);
    for (const r of cautionTopics) {
      console.log(`       [CAUTION] "${r.candidate.title}" — ${r.reason}`);
    }
  }
  if (rejectTopics.length > 0) {
    console.log(`   ❌ REJECT seeds:`);
    for (const r of rejectTopics) {
      console.log(`       [REJECT]  "${r.candidate.title}" — ${r.reason}`);
    }
  }
  console.log('');

  // Select target topic
  let selectedCandidate = null;
  const rawTarget = forceTopic || overrideTopic;

  if (rawTarget) {
    let candidateToTest = null;
    if (typeof rawTarget === 'string') {
      const matchedSeed = seeds.find(
        (s) => s.id === rawTarget || s.title.toLowerCase() === rawTarget.toLowerCase()
      );
      candidateToTest = matchedSeed || {
        id: `forced-${Date.now()}`,
        title: rawTarget,
        category: 'Chinese Gender Predictor',
        suggestedSlug: slugify(rawTarget),
        primaryKeyword: rawTarget,
        secondaryKeywords: [],
        targetWordCount: 2000,
      };
    } else if (typeof rawTarget === 'object') {
      candidateToTest = rawTarget;
    }

    // Run strict duplicate & cannibalization check on the forced candidate
    const forcedAnalysis = analyzeTopicCandidate(candidateToTest, inventory);
    if (forcedAnalysis.decision === 'REJECT') {
      console.error(`❌ Forced topic rejected due to cannibalization or duplicate conflict: ${forcedAnalysis.reason}`);
      updateRunManifest({
        status: 'REJECTED',
        resultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
        errors: [forcedAnalysis.reason],
      });
      logEvent({
        action: 'TOPIC_SELECTION',
        status: 'ERROR',
        summary: `Forced topic "${candidateToTest.title}" REJECTED: ${forcedAnalysis.reason}`,
        details: {
          runId,
          inventoryScanTimestamp,
          selectedTopic: candidateToTest.title,
          selectedSlug: candidateToTest.suggestedSlug,
          exactGeneratedDraftPath: null,
          exactValidatedDraftPath: null,
          exactPromotedDraftPath: null,
          finalResultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
          topic: candidateToTest,
          reason: forcedAnalysis.reason,
        },
      });
      return {
        state: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
        success: false,
        runId,
        error: `Forced topic rejected by cannibalization gate: ${forcedAnalysis.reason}`,
      };
    } else if (forcedAnalysis.decision === 'CAUTION') {
      if (!allowCaution) {
        console.error(`❌ Forced topic rejected before generation due to CAUTION-level overlap: ${forcedAnalysis.reason}`);
        updateRunManifest({
          status: 'REJECTED',
          resultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
          errors: [forcedAnalysis.reason],
        });
        logEvent({
          action: 'TOPIC_SELECTION',
          status: 'ERROR',
          summary: `Forced topic "${candidateToTest.title}" REJECTED: ${forcedAnalysis.reason}`,
          details: {
            runId,
            inventoryScanTimestamp,
            selectedTopic: candidateToTest.title,
            selectedSlug: candidateToTest.suggestedSlug,
            exactGeneratedDraftPath: null,
            exactValidatedDraftPath: null,
            exactPromotedDraftPath: null,
            finalResultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
            topic: candidateToTest,
            reason: forcedAnalysis.reason,
          },
        });
        return {
          state: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
          success: false,
          runId,
          error: `Forced topic rejected before generation due to CAUTION-level overlap: ${forcedAnalysis.reason}`,
        };
      } else {
        console.warn(`⚠️  Forced topic has CAUTION overlap: ${forcedAnalysis.reason}`);
        selectedCandidate = candidateToTest;
      }
    } else {
      selectedCandidate = candidateToTest;
    }
  } else {
    // Autonomous topic selection:
    // Exclude test seeds (priority: 'test')
    // Exclude any seed whose slug, title, or filename exists in current production inventory
    const eligibleSafe = safeTopics.filter((r) => {
      const cand = r.candidate;
      if (cand.priority === 'test') return false;
      const cSlug = slugify((cand.suggestedSlug || cand.slug || cand.title || '').replace(/\.(md|mdx)$/i, ''));
      const cTitle = (cand.title || '').trim().toLowerCase();
      if (inventory.existingSlugs && inventory.existingSlugs.has(cSlug)) return false;
      if (inventory.existingFilenames && inventory.existingFilenames.has(`${cSlug}.md`)) return false;
      if (inventory.existingTitles && inventory.existingTitles.has(cTitle)) return false;
      return true;
    });

    if (eligibleSafe.length > 0) {
      selectedCandidate = eligibleSafe[0].candidate;
    }
  }

  if (!selectedCandidate) {
    console.warn('⚠️  No SAFE topic candidate found for generation.');
    updateRunManifest({
      status: 'NO_STRONG_TOPIC_FOUND',
      resultState: RESULT_STATES.NO_STRONG_TOPIC_FOUND,
      errors: ['No safe topic candidates available after gap analysis.'],
    });
    logEvent({
      action: 'TOPIC_SELECTION',
      status: 'WARNING',
      summary: 'Pipeline halted: No SAFE topic candidates available after gap analysis.',
      stats: { safeCount: 0, cautionCount: cautionTopics.length, rejectCount: rejectTopics.length },
      details: {
        runId,
        inventoryScanTimestamp,
        selectedTopic: null,
        selectedSlug: null,
        exactGeneratedDraftPath: null,
        exactValidatedDraftPath: null,
        exactPromotedDraftPath: null,
        finalResultState: RESULT_STATES.NO_STRONG_TOPIC_FOUND,
      },
    });

    return {
      state: RESULT_STATES.NO_STRONG_TOPIC_FOUND,
      success: false,
      runId,
      error: 'No safe topic candidates found.',
    };
  }

  // Pre-generation final safety check: confirm candidate is genuinely SAFE
  const preGenCheck = analyzeTopicCandidate(selectedCandidate, inventory);
  if (preGenCheck.decision === 'REJECT' || (preGenCheck.decision === 'CAUTION' && !allowCaution)) {
    console.error(`❌ Selected topic failed pre-generation safety check: ${preGenCheck.reason}`);
    updateRunManifest({
      status: 'REJECTED',
      resultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
      errors: [preGenCheck.reason],
    });
    logEvent({
      action: 'TOPIC_SELECTION',
      status: 'ERROR',
      summary: `Selected topic "${selectedCandidate.title}" REJECTED before generation: ${preGenCheck.reason}`,
      details: {
        runId,
        inventoryScanTimestamp,
        selectedTopic: selectedCandidate.title,
        selectedSlug: selectedCandidate.suggestedSlug,
        exactGeneratedDraftPath: null,
        exactValidatedDraftPath: null,
        exactPromotedDraftPath: null,
        finalResultState: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
        topic: selectedCandidate,
        reason: preGenCheck.reason,
      },
    });
    return {
      state: RESULT_STATES.PROMOTION_CANNIBALIZATION_REJECTED,
      success: false,
      runId,
      error: `Topic rejected by pre-generation safety gate: ${preGenCheck.reason}`,
    };
  }

  // Update manifest with selected candidate
  updateRunManifest({
    selectedTopic: {
      id: selectedCandidate.id,
      title: selectedCandidate.title,
      category: selectedCandidate.category,
      suggestedSlug: selectedCandidate.suggestedSlug,
    },
  });

  console.log(`🎯 Selected Topic for Pipeline:`);
  console.log(`   • Run ID: ${runId}`);
  console.log(`   • Title: "${selectedCandidate.title}"`);
  console.log(`   • Category: "${selectedCandidate.category}"`);
  console.log(`   • Target Word Count: ${selectedCandidate.targetWordCount || 2000}`);
  console.log(`   • Suggested Slug: /blog/${selectedCandidate.suggestedSlug}\n`);

  // 3. Build Editorial Prompt
  console.log('📝 [3/6] Constructing editorial prompt & safety guardrails...');
  const promptData = buildArticlePrompt({
    topic: selectedCandidate,
    inventory,
    whitelistedRoutes: whitelistedPaths,
  });

  const providers = getProviderAvailability();
  console.log('   Provider Configuration:');
  console.log(`     • Google Gemini (Primary): ${providers.geminiAvailable ? 'Configured ✅' : 'Not configured ⚪'}`);
  console.log(`     • Groq (Fallback):         ${providers.groqAvailable ? 'Configured ✅' : 'Not configured ⚪'}\n`);

  // 4. Execution branching: Dry-Run vs Generation
  if (!isGenerateMode) {
    console.log('🛡️  [DRY-RUN MODE] Generation skipped by request.');
    console.log('   • ZERO API calls made.');
    console.log('   • ZERO draft files created.');
    console.log('   • ZERO production files touched.');
    console.log(`   • Prompt constructed successfully (${promptData.prompt.length} chars).\n`);

    updateRunManifest({
      status: 'DRY_RUN_COMPLETE',
      resultState: RESULT_STATES.DRY_RUN_COMPLETE,
    });

    logEvent({
      action: 'CONTENT_PLANNING_DRY_RUN',
      status: 'SUCCESS',
      summary: `Dry-run completed successfully for "${selectedCandidate.title}". Zero drafts created.`,
      stats: {
        publishedArticles: inventory.stats.totalArticles,
        safeTopicsCount: safeTopics.length,
      },
      details: {
        runId,
        inventoryScanTimestamp,
        selectedTopic: selectedCandidate.title,
        selectedSlug: selectedCandidate.suggestedSlug,
        exactGeneratedDraftPath: null,
        exactValidatedDraftPath: null,
        exactPromotedDraftPath: null,
        finalResultState: RESULT_STATES.DRY_RUN_COMPLETE,
        selectedTopicId: selectedCandidate.id,
        inventorySlugsAtScanTime: inventory.articles.map((a) => a.slug),
      },
    });

    console.log('='.repeat(70));
    console.log('  🛡️  SAFETY VERIFICATION:');
    console.log('     • Result State: DRY_RUN_COMPLETE');
    console.log(`     • Run ID: ${runId}`);
    console.log('     • Production files modified: 0');
    console.log('     • Drafts created: 0');
    console.log('='.repeat(70) + '\n');

    return {
      state: RESULT_STATES.DRY_RUN_COMPLETE,
      success: true,
      runId,
      topic: selectedCandidate,
      manifestPath: autopilotConfig.paths.currentRunManifest,
    };
  }

  // 5. Generate Mode: Call AI Provider Pipeline
  console.log('🚀 [4/6] Invoking AI Provider Pipeline (Gemini with Groq Fallback)...');
  const aiResult = await generateArticleContent({
    prompt: promptData.prompt,
    systemInstruction: promptData.systemInstruction,
    dryRun: false,
  });

  if (!aiResult.success || !aiResult.rawText) {
    const errMsg = aiResult.error || 'Unknown AI generation failure';
    console.error(`❌ AI Generation Failed: ${errMsg}`);

    updateRunManifest({
      status: 'GENERATION_FAILED',
      resultState: RESULT_STATES.GENERATION_FAILED,
      errors: [errMsg],
    });

    logEvent({
      action: 'DRAFT_GENERATION',
      status: 'ERROR',
      summary: `Generation failed for "${selectedCandidate.title}": ${errMsg}`,
      details: {
        runId,
        inventoryScanTimestamp,
        selectedTopic: selectedCandidate.title,
        selectedSlug: selectedCandidate.suggestedSlug,
        exactGeneratedDraftPath: null,
        exactValidatedDraftPath: null,
        exactPromotedDraftPath: null,
        finalResultState: RESULT_STATES.GENERATION_FAILED,
        topicId: selectedCandidate.id,
        error: errMsg,
      },
    });

    return {
      state: RESULT_STATES.GENERATION_FAILED,
      success: false,
      runId,
      topic: selectedCandidate,
      error: errMsg,
    };
  }

  console.log(`   ✓ Received response via ${(aiResult.provider || 'AI').toUpperCase()} (${aiResult.model || 'default'})`);
  if (aiResult.fallbackUsed) {
    console.log('   ℹ️  Note: Fallback provider was utilized due to primary provider issue.');
  }

  // 6. Parse and Validate AI Response Syntax
  console.log('\n🔬 [5/6] Parsing AI response structure...');
  const parsed = parseAIResponse(aiResult.rawText, {
    whitelistedPaths,
    minWords: autopilotConfig.articleRules.wordCount.min,
  });

  if (!parsed.valid || !parsed.data) {
    const parseErr = parsed.error || 'AI output failed initial parsing/syntax check';
    console.error(`❌ Invalid AI Response: ${parseErr}`);

    updateRunManifest({
      status: 'INVALID_AI_RESPONSE',
      resultState: RESULT_STATES.INVALID_AI_RESPONSE,
      errors: [parseErr],
    });

    logEvent({
      action: 'DRAFT_SYNTAX_PARSING',
      status: 'ERROR',
      summary: `Invalid AI output for "${selectedCandidate.title}": ${parseErr}`,
      details: {
        runId,
        inventoryScanTimestamp,
        selectedTopic: selectedCandidate.title,
        selectedSlug: selectedCandidate.suggestedSlug,
        exactGeneratedDraftPath: null,
        exactValidatedDraftPath: null,
        exactPromotedDraftPath: null,
        finalResultState: RESULT_STATES.INVALID_AI_RESPONSE,
        topicId: selectedCandidate.id,
        error: parseErr,
      },
    });

    return {
      state: RESULT_STATES.INVALID_AI_RESPONSE,
      success: false,
      runId,
      topic: selectedCandidate,
      error: parseErr,
    };
  }

  // 7. Write Staged Draft into run-isolated scripts/autopilot/drafts/<run-id>/
  console.log('\n💾 Staging draft file into run-isolated drafts directory...');
  const draftResult = createDraft({
    frontmatter: parsed.data.frontmatter,
    markdownBody: parsed.data.markdownBody,
    suggestedSlug: selectedCandidate.suggestedSlug,
    runId,
  });

  if (!draftResult.success) {
    console.error(`❌ Draft File Creation Failed: ${draftResult.error}`);
    updateRunManifest({
      status: 'GENERATION_FAILED',
      resultState: RESULT_STATES.GENERATION_FAILED,
      errors: [draftResult.error],
    });

    logEvent({
      action: 'DRAFT_FILE_WRITE',
      status: 'ERROR',
      summary: `Failed to write draft file: ${draftResult.error}`,
      details: {
        runId,
        inventoryScanTimestamp,
        selectedTopic: selectedCandidate.title,
        selectedSlug: selectedCandidate.suggestedSlug,
        exactGeneratedDraftPath: null,
        exactValidatedDraftPath: null,
        exactPromotedDraftPath: null,
        finalResultState: RESULT_STATES.GENERATION_FAILED,
        error: draftResult.error,
      },
    });

    return {
      state: RESULT_STATES.GENERATION_FAILED,
      success: false,
      runId,
      topic: selectedCandidate,
      error: draftResult.error,
    };
  }

  // Record draft details in manifest
  updateRunManifest({
    status: 'DRAFT_CREATED',
    resultState: RESULT_STATES.DRAFT_CREATED,
    draft: {
      runId,
      title: draftResult.title,
      slug: draftResult.slug,
      filename: draftResult.filename,
      draftPath: draftResult.draftPath,
      category: draftResult.category,
      generationTimestamp: draftResult.generationTimestamp,
    },
  });

  // 8. Phase 3 Quality Gate Validation - Validate ONLY the exact draft created during current run
  console.log('\n🛡️  [6/6] Running Phase 3 Quality Gate & Schema Validation on CURRENT run draft...');
  const draftContentOnDisk = fs.readFileSync(draftResult.draftPath, 'utf-8');
  const validation = validateDraft(draftContentOnDisk, { whitelistedRoutes: whitelistedPaths });

  console.log('\n' + '='.repeat(70));
  console.log('  📊 DRAFT VALIDATION REPORT');
  console.log('='.repeat(70));
  console.log(`  • Run ID:         ${runId}`);
  console.log(`  • Title:          ${parsed.data.frontmatter.title}`);
  console.log(`  • Word Count:     ${validation.metrics.wordCount} words`);
  console.log(`  • Internal Links: ${validation.metrics.uniqueInternalLinks} unique (${validation.metrics.internalLinks} total)`);
  console.log(`  • FAQs:           ${validation.metrics.faqCount} items`);
  console.log(`  • Headings:       ${validation.metrics.h2Count} H2s, ${validation.metrics.h3Count} H3s`);
  console.log(`  • Draft File:     ${draftResult.draftPath}`);
  console.log(`  • Validation:     ${validation.valid ? 'PASSED ✅ (Eligible for future promotion)' : 'FAILED ❌ (NOT eligible for promotion)'}`);

  if (validation.warnings.length > 0) {
    console.log('\n  ⚠️  VALIDATION WARNINGS:');
    for (const w of validation.warnings) {
      console.log(`     • ${w}`);
    }
  }

  if (!validation.valid) {
    console.log('\n  ❌ VALIDATION ERRORS:');
    for (const err of validation.errors) {
      console.log(`     • ${err}`);
    }
  }

  console.log('='.repeat(70));
  console.log('  🛡️  SAFETY CONFIRMATION:');
  console.log('     • Production src/content/blog/ modified: 0');
  console.log('     • Production pages modified: 0');
  console.log('     • Live deployment triggered: 0');
  console.log('='.repeat(70) + '\n');

  // Update manifest with validation result
  updateRunManifest({
    status: validation.valid ? 'VALIDATED' : 'VALIDATION_FAILED',
    resultState: validation.valid ? RESULT_STATES.VALIDATED_DRAFT_CREATED : RESULT_STATES.VALIDATION_FAILED,
    validation: {
      valid: validation.valid,
      metrics: validation.metrics,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    errors: validation.errors,
  });

  // Log validation audit event with required transaction metadata
  logEvent({
    action: validation.valid ? 'DRAFT_VALIDATION_PASSED' : 'DRAFT_VALIDATION_FAILED',
    status: validation.valid ? 'SUCCESS' : 'WARNING',
    summary: validation.valid
      ? `Draft "${parsed.data.frontmatter.title}" PASSED all validation checks (${validation.metrics.wordCount} words).`
      : `Draft "${parsed.data.frontmatter.title}" FAILED validation: ${validation.errors.join('; ')}`,
    stats: {
      wordCount: validation.metrics.wordCount,
      internalLinks: validation.metrics.uniqueInternalLinks,
      faqCount: validation.metrics.faqCount,
      valid: validation.valid,
    },
    details: {
      runId,
      inventoryScanTimestamp,
      selectedTopic: selectedCandidate.title,
      selectedSlug: draftResult.slug,
      exactGeneratedDraftPath: draftResult.draftPath,
      exactValidatedDraftPath: draftResult.draftPath,
      exactPromotedDraftPath: null,
      finalResultState: validation.valid ? RESULT_STATES.VALIDATED_DRAFT_CREATED : RESULT_STATES.VALIDATION_FAILED,
      topicId: selectedCandidate.id,
      slug: draftResult.slug,
      draftPath: draftResult.draftPath,
      errors: validation.errors,
      warnings: validation.warnings,
      provider: aiResult.provider,
      inventorySlugsAtScanTime: inventory.articles.map((a) => a.slug),
    },
  });

  if (!validation.valid) {
    return {
      state: RESULT_STATES.VALIDATION_FAILED,
      success: false,
      runId,
      topic: selectedCandidate,
      draftPath: draftResult.draftPath,
      slug: draftResult.slug,
      validation,
      manifestPath: autopilotConfig.paths.currentRunManifest,
    };
  }

  return {
    state: RESULT_STATES.VALIDATED_DRAFT_CREATED,
    success: true,
    runId,
    topic: selectedCandidate,
    draftPath: draftResult.draftPath,
    slug: draftResult.slug,
    validation,
    manifestPath: autopilotConfig.paths.currentRunManifest,
  };
}

// CLI execution handling
const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (invokedFile && invokedFile === path.resolve(currentFile)) {
  const isGenerate = process.argv.includes('--generate');
  const allowCaution = process.argv.includes('--allow-caution');
  let forceTopic = null;
  let cliRunId = null;

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--force-topic' || arg === '-t') {
      forceTopic = process.argv[i + 1];
      i++;
    } else if (arg.startsWith('--force-topic=')) {
      forceTopic = arg.slice('--force-topic='.length);
    } else if (arg === '--run-id') {
      cliRunId = process.argv[i + 1];
      i++;
    } else if (arg.startsWith('--run-id=')) {
      cliRunId = arg.slice('--run-id='.length);
    }
  }

  runAutopilot({ generate: isGenerate, forceTopic, allowCaution, runId: cliRunId }).then((result) => {
    console.log(`\nRUN_ID: ${result.runId}`);
    if (result.manifestPath) {
      console.log(`MANIFEST: ${result.manifestPath}`);
    }
    if (result.draftPath) {
      console.log(`CURRENT_RUN_DRAFT: ${result.draftPath}`);
    }
    console.log(`STATUS: ${result.state}`);
    if (!result.success) {
      process.exit(1);
    }
  }).catch((err) => {
    console.error('\n❌ Fatal Autopilot Error:', err);
    process.exit(1);
  });
}

export default {
  runAutopilot,
};
