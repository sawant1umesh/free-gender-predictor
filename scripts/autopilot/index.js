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
export async function runAutopilot({ generate = false, overrideTopic = null, forceTopic = null, allowCaution = false, runId: customRunId = null, maxAttempts = null } = {}) {
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

  // 5. Generate Mode: Robust Retry Loop with Validation Feedback
  const effectiveMaxAttempts = Number.isInteger(maxAttempts) && maxAttempts > 0
    ? maxAttempts
    : (autopilotConfig.ai.maxGenerationAttempts || 3);

  let attempt = 1;
  let lastValidationErrors = [];
  const attemptsRecord = [];
  let successfulDraft = null;
  let finalFailureState = RESULT_STATES.GENERATION_FAILED;

  while (attempt <= effectiveMaxAttempts) {
    console.log('\n' + '='.repeat(70));
    console.log(`  🎯 GENERATION & VALIDATION ATTEMPT ${attempt} OF ${effectiveMaxAttempts}`);
    console.log(`  Topic: "${selectedCandidate.title}"`);
    if (attempt > 1 && lastValidationErrors.length > 0) {
      console.log(`  ⚠️  Applying corrective feedback from attempt ${attempt - 1} (${lastValidationErrors.length} issues):`);
      for (const err of lastValidationErrors) {
        console.log(`     • ${err}`);
      }
    }
    console.log('='.repeat(70) + '\n');

    // [3/6] Construct editorial prompt with attempt feedback
    console.log(`📝 [3/6] Constructing editorial prompt & safety guardrails (Attempt ${attempt}/${effectiveMaxAttempts})...`);
    const promptData = buildArticlePrompt({
      topic: selectedCandidate,
      inventory,
      whitelistedRoutes: whitelistedPaths,
      attempt,
      maxAttempts: effectiveMaxAttempts,
      previousErrors: lastValidationErrors,
    });

    // [4/6] Call AI Provider Pipeline
    console.log(`🚀 [4/6] Invoking AI Provider Pipeline (Attempt ${attempt}/${effectiveMaxAttempts})...`);
    const aiResult = await generateArticleContent({
      prompt: promptData.prompt,
      systemInstruction: promptData.systemInstruction,
      dryRun: false,
    });

    if (!aiResult.success || !aiResult.rawText) {
      const errMsg = aiResult.error || 'AI provider generation failure';
      console.error(`❌ AI Generation Failed on attempt ${attempt}: ${errMsg}`);
      finalFailureState = RESULT_STATES.GENERATION_FAILED;
      lastValidationErrors = [errMsg];

      attemptsRecord.push({
        attempt,
        timestamp: new Date().toISOString(),
        provider: aiResult.provider || 'unknown',
        model: aiResult.model || 'unknown',
        draftPath: null,
        validationStatus: 'FAILED',
        stage: 'GENERATION',
        errors: [errMsg],
      });

      updateRunManifest({
        currentAttempt: attempt,
        totalAttempts: attempt,
        attempts: attemptsRecord,
        status: 'GENERATING',
        errors: [errMsg],
      });

      attempt++;
      continue;
    }

    console.log(`   ✓ Received response via ${(aiResult.provider || 'AI').toUpperCase()} (${aiResult.model || 'default'})`);
    if (aiResult.fallbackUsed) {
      console.log('   ℹ️  Note: Fallback provider was utilized due to primary provider issue.');
    }

    // [5/6] Parse and validate AI response syntax
    console.log(`\n🔬 [5/6] Parsing AI response structure (Attempt ${attempt}/${effectiveMaxAttempts})...`);
    const parsed = parseAIResponse(aiResult.rawText, {
      whitelistedPaths,
      minWords: autopilotConfig.articleRules.wordCount.min,
    });

    if (!parsed.valid || !parsed.data) {
      const parseErr = parsed.error || 'AI output failed initial parsing/syntax check';
      console.error(`❌ Invalid AI Response on attempt ${attempt}: ${parseErr}`);
      finalFailureState = RESULT_STATES.INVALID_AI_RESPONSE;
      lastValidationErrors = [parseErr];

      attemptsRecord.push({
        attempt,
        timestamp: new Date().toISOString(),
        provider: aiResult.provider || 'unknown',
        model: aiResult.model || 'unknown',
        draftPath: null,
        validationStatus: 'FAILED',
        stage: 'PARSING',
        errors: [parseErr],
      });

      updateRunManifest({
        currentAttempt: attempt,
        totalAttempts: attempt,
        attempts: attemptsRecord,
        status: 'PARSING_FAILED',
        errors: [parseErr],
      });

      attempt++;
      continue;
    }

    // Staging draft file into run-isolated drafts directory: scripts/autopilot/drafts/<run-id>/attempt-<attempt>/
    console.log(`\n💾 Staging draft file for attempt ${attempt} into run-isolated drafts directory...`);
    const draftResult = createDraft({
      frontmatter: parsed.data.frontmatter,
      markdownBody: parsed.data.markdownBody,
      suggestedSlug: selectedCandidate.suggestedSlug,
      runId,
      attempt,
    });

    if (!draftResult.success) {
      console.error(`❌ Draft File Creation Failed on attempt ${attempt}: ${draftResult.error}`);
      finalFailureState = RESULT_STATES.GENERATION_FAILED;
      lastValidationErrors = [draftResult.error];

      attemptsRecord.push({
        attempt,
        timestamp: new Date().toISOString(),
        provider: aiResult.provider || 'unknown',
        model: aiResult.model || 'unknown',
        draftPath: null,
        validationStatus: 'FAILED',
        stage: 'FILE_CREATION',
        errors: [draftResult.error],
      });

      attempt++;
      continue;
    }

    // [6/6] Phase 3 Quality Gate Validation on exact attempt draft
    console.log(`\n🛡️  [6/6] Running Phase 3 Quality Gate & Schema Validation (Attempt ${attempt}/${effectiveMaxAttempts})...`);
    const draftContentOnDisk = fs.readFileSync(draftResult.draftPath, 'utf-8');
    const validation = validateDraft(draftContentOnDisk, { whitelistedRoutes: whitelistedPaths });

    console.log('\n' + '='.repeat(70));
    console.log(`  📊 DRAFT VALIDATION REPORT (Attempt ${attempt}/${effectiveMaxAttempts})`);
    console.log('='.repeat(70));
    console.log(`  • Run ID:         ${runId}`);
    console.log(`  • Attempt:        ${attempt} of ${effectiveMaxAttempts}`);
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
    console.log('='.repeat(70) + '\n');

    attemptsRecord.push({
      attempt,
      timestamp: new Date().toISOString(),
      provider: aiResult.provider || 'unknown',
      model: aiResult.model || 'unknown',
      draftPath: draftResult.draftPath,
      validationStatus: validation.valid ? 'VALID' : 'INVALID',
      stage: 'VALIDATION',
      metrics: validation.metrics,
      errors: validation.errors,
      warnings: validation.warnings,
    });

    if (validation.valid) {
      successfulDraft = {
        draftResult,
        parsed,
        validation,
        aiResult,
        attempt,
      };
      break;
    }

    // Validation failed on this attempt
    finalFailureState = RESULT_STATES.VALIDATION_FAILED;
    lastValidationErrors = validation.errors;

    updateRunManifest({
      currentAttempt: attempt,
      totalAttempts: attempt,
      attempts: attemptsRecord,
      status: 'VALIDATING',
      errors: validation.errors,
    });

    logEvent({
      action: 'DRAFT_VALIDATION_FAILED',
      status: 'WARNING',
      summary: `Attempt ${attempt}/${effectiveMaxAttempts} failed validation for "${selectedCandidate.title}": ${validation.errors.join('; ')}`,
      stats: {
        wordCount: validation.metrics.wordCount,
        internalLinks: validation.metrics.uniqueInternalLinks,
        faqCount: validation.metrics.faqCount,
        attempt,
        valid: false,
      },
      details: {
        runId,
        attempt,
        maxAttempts: effectiveMaxAttempts,
        selectedTopic: selectedCandidate.title,
        draftPath: draftResult.draftPath,
        errors: validation.errors,
        warnings: validation.warnings,
      },
    });

    attempt++;
  }

  // Handle final outcome after retry loop completes
  if (successfulDraft) {
    const { draftResult, parsed, validation, aiResult, attempt: successAttempt } = successfulDraft;

    // Update manifest with verified success
    updateRunManifest({
      status: 'VALIDATED',
      resultState: RESULT_STATES.VALIDATED_DRAFT_CREATED,
      currentAttempt: successAttempt,
      totalAttempts: attemptsRecord.length,
      attempts: attemptsRecord,
      draft: {
        runId,
        attempt: successAttempt,
        title: draftResult.title,
        slug: draftResult.slug,
        filename: draftResult.filename,
        draftPath: draftResult.draftPath,
        category: draftResult.category,
        generationTimestamp: draftResult.generationTimestamp,
      },
      validation: {
        valid: true,
        metrics: validation.metrics,
        errors: [],
        warnings: validation.warnings,
      },
      isPromotable: true,
      errors: [],
    });

    logEvent({
      action: 'DRAFT_VALIDATION_PASSED',
      status: 'SUCCESS',
      summary: `Draft "${parsed.data.frontmatter.title}" PASSED validation on attempt ${successAttempt}/${effectiveMaxAttempts} (${validation.metrics.wordCount} words).`,
      stats: {
        wordCount: validation.metrics.wordCount,
        internalLinks: validation.metrics.uniqueInternalLinks,
        faqCount: validation.metrics.faqCount,
        attempts: attemptsRecord.length,
        valid: true,
      },
      details: {
        runId,
        inventoryScanTimestamp,
        selectedTopic: selectedCandidate.title,
        selectedSlug: draftResult.slug,
        exactGeneratedDraftPath: draftResult.draftPath,
        exactValidatedDraftPath: draftResult.draftPath,
        exactPromotedDraftPath: null,
        finalResultState: RESULT_STATES.VALIDATED_DRAFT_CREATED,
        currentAttempt: successAttempt,
        totalAttempts: attemptsRecord.length,
        topicId: selectedCandidate.id,
        slug: draftResult.slug,
        draftPath: draftResult.draftPath,
        provider: aiResult.provider,
        inventorySlugsAtScanTime: inventory.articles.map((a) => a.slug),
      },
    });

    return {
      state: RESULT_STATES.VALIDATED_DRAFT_CREATED,
      success: true,
      runId,
      topic: selectedCandidate,
      draftPath: draftResult.draftPath,
      slug: draftResult.slug,
      validation,
      attempts: attemptsRecord,
      manifestPath: autopilotConfig.paths.currentRunManifest,
    };
  }

  // All attempts exhausted without achieving a valid draft
  console.error(`\n❌ All ${effectiveMaxAttempts} generation/validation attempt(s) exhausted without success.`);
  console.error(`   Final state: ${finalFailureState}`);
  console.error(`   Errors: ${lastValidationErrors.join('; ')}\n`);

  updateRunManifest({
    status: finalFailureState === RESULT_STATES.GENERATION_FAILED ? 'GENERATION_FAILED' : 'VALIDATION_FAILED',
    resultState: finalFailureState,
    currentAttempt: attemptsRecord.length,
    totalAttempts: attemptsRecord.length,
    attempts: attemptsRecord,
    draft: null, // NO draft marked eligible for promotion
    validation: {
      valid: false,
      errors: lastValidationErrors,
    },
    isPromotable: false,
    errors: lastValidationErrors,
  });

  logEvent({
    action: 'DRAFT_VALIDATION_FAILED',
    status: 'ERROR',
    summary: `All ${effectiveMaxAttempts} generation/validation attempts exhausted for "${selectedCandidate.title}": ${lastValidationErrors.join('; ')}`,
    details: {
      runId,
      inventoryScanTimestamp,
      selectedTopic: selectedCandidate.title,
      selectedSlug: selectedCandidate.suggestedSlug,
      exactGeneratedDraftPath: null,
      exactValidatedDraftPath: null,
      exactPromotedDraftPath: null,
      finalResultState: finalFailureState,
      totalAttempts: attemptsRecord.length,
      errors: lastValidationErrors,
    },
  });

  return {
    state: finalFailureState,
    success: false,
    runId,
    topic: selectedCandidate,
    draftPath: null,
    slug: selectedCandidate.suggestedSlug,
    errors: lastValidationErrors,
    attempts: attemptsRecord,
    manifestPath: autopilotConfig.paths.currentRunManifest,
    error: `Generation attempts exhausted (${attemptsRecord.length}/${effectiveMaxAttempts}): ${lastValidationErrors.join('; ')}`,
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
  let maxAttemptsArg = null;

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
    } else if (arg === '--max-attempts') {
      maxAttemptsArg = parseInt(process.argv[i + 1], 10);
      i++;
    } else if (arg.startsWith('--max-attempts=')) {
      maxAttemptsArg = parseInt(arg.slice('--max-attempts='.length), 10);
    }
  }

  runAutopilot({
    generate: isGenerate,
    forceTopic,
    allowCaution,
    runId: cliRunId,
    maxAttempts: maxAttemptsArg,
  }).then((result) => {
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
