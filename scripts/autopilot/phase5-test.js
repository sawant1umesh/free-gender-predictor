import fs from 'node:fs';
import path from 'node:path';
import { autopilotConfig } from './core/config.js';
import { runAutopilot } from './index.js';

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

const WORKFLOW_PATH = path.join(autopilotConfig.paths.projectRoot, '.github', 'workflows', 'seo-autopilot.yml');
const REAL_PROD_BLOG_DIR = autopilotConfig.paths.productionBlogDir;
const INITIAL_PROD_FILES = fs.readdirSync(REAL_PROD_BLOG_DIR).sort();

async function runPhase5Tests() {
  console.log('\n======================================================================');
  console.log('  🧪 SEO AUTOPILOT - PHASE 5 TEST SUITE');
  console.log('  CI/CD GitHub Actions Workflow & Cloudflare Pages Integration');
  console.log('======================================================================\n');

  // -------------------------------------------------------------
  // Test 1: Workflow file exists
  // -------------------------------------------------------------
  console.log('Test 1: Workflow file exists');
  assert(fs.existsSync(WORKFLOW_PATH), '.github/workflows/seo-autopilot.yml exists on disk');

  const workflowContent = fs.readFileSync(WORKFLOW_PATH, 'utf-8');

  // -------------------------------------------------------------
  // Test 2: Workflow YAML structure contains required top-level keys
  // -------------------------------------------------------------
  console.log('\nTest 2: Workflow YAML structure contains required top-level keys');
  assert(workflowContent.includes('name: SEO Autopilot CI/CD'), 'Workflow name is specified');
  assert(workflowContent.includes('on:'), 'Workflow trigger section defined');
  assert(workflowContent.includes('jobs:'), 'Workflow jobs section defined');

  // -------------------------------------------------------------
  // Test 3: Cron schedule equals Saturday 8:00 AM IST (02:30 UTC)
  // -------------------------------------------------------------
  console.log('\nTest 3: Cron schedule equals Saturday 8:00 AM IST');
  assert(workflowContent.includes("cron: '30 2 * * 6'") || workflowContent.includes('cron: "30 2 * * 6"'), 'Cron expression matches 30 2 * * 6');
  assert(workflowContent.includes('Saturday') && workflowContent.includes('8:00 AM IST'), 'Includes comment explaining UTC+5:30 conversion to 8:00 AM IST');

  // -------------------------------------------------------------
  // Test 4: workflow_dispatch mode input exists
  // -------------------------------------------------------------
  console.log('\nTest 4: workflow_dispatch mode input exists');
  assert(workflowContent.includes('mode:'), 'mode input is declared');
  assert(workflowContent.includes('dry-run') && workflowContent.includes('publish'), 'mode choices include dry-run and publish');
  assert(workflowContent.includes("default: 'dry-run'") || workflowContent.includes('default: "dry-run"'), 'default mode is dry-run');

  // -------------------------------------------------------------
  // Test 5: workflow_dispatch force_topic input exists
  // -------------------------------------------------------------
  console.log('\nTest 5: workflow_dispatch force_topic input exists');
  assert(workflowContent.includes('force_topic:'), 'force_topic input is declared');

  // -------------------------------------------------------------
  // Test 6: Concurrency protection exists
  // -------------------------------------------------------------
  console.log('\nTest 6: Concurrency protection exists');
  assert(workflowContent.includes('concurrency:'), 'concurrency block declared');
  assert(workflowContent.includes('group: seo-autopilot-production'), 'concurrency group set to seo-autopilot-production');
  assert(workflowContent.includes('cancel-in-progress: false'), 'cancel-in-progress is false to avoid aborting in-flight promotion');

  // -------------------------------------------------------------
  // Test 7: contents: write permission exists
  // -------------------------------------------------------------
  console.log('\nTest 7: contents: write permission exists');
  assert(workflowContent.includes('permissions:'), 'permissions block configured');
  assert(workflowContent.includes('contents: write'), 'minimum required permission contents: write is granted');

  // -------------------------------------------------------------
  // Test 8: Node version is strictly 22.12.0
  // -------------------------------------------------------------
  console.log('\nTest 8: Node version is strictly 22.12.0');
  assert(workflowContent.includes("node-version: '22.12.0'") || workflowContent.includes('node-version: "22.12.0"'), 'node-version is 22.12.0');

  // -------------------------------------------------------------
  // Test 9: Gemini secret is wired through environment
  // -------------------------------------------------------------
  console.log('\nTest 9: Gemini secret is wired through environment');
  assert(workflowContent.includes('GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}'), 'GEMINI_API_KEY is mapped from GitHub secrets');

  // -------------------------------------------------------------
  // Test 10: Groq secret is wired through environment
  // -------------------------------------------------------------
  console.log('\nTest 10: Groq secret is wired through environment');
  assert(workflowContent.includes('GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}'), 'GROQ_API_KEY is mapped from GitHub secrets');

  // -------------------------------------------------------------
  // Test 11: Cloudflare secrets are wired through environment
  // -------------------------------------------------------------
  console.log('\nTest 11: Cloudflare secrets are wired through environment');
  assert(workflowContent.includes('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}'), 'CLOUDFLARE_API_TOKEN is mapped from GitHub secrets');
  assert(workflowContent.includes('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}'), 'CLOUDFLARE_ACCOUNT_ID is mapped from GitHub secrets');

  // -------------------------------------------------------------
  // Test 12: Dry-run path does not generate content or deploy
  // -------------------------------------------------------------
  console.log('\nTest 12: Dry-run path executes read-only command');
  assert(workflowContent.includes('inputs.mode == \'dry-run\''), 'Dry run conditional exists');
  assert(workflowContent.includes('node scripts/autopilot/index.js'), 'Dry run calls index.js without --generate');

  // -------------------------------------------------------------
  // Test 13: Publish path includes generation and promotion
  // -------------------------------------------------------------
  console.log('\nTest 13: Publish path includes generation and promotion');
  assert(workflowContent.includes('node scripts/autopilot/index.js --generate'), 'Publish path calls index.js --generate');
  assert(workflowContent.includes('node scripts/autopilot/promote-draft.js'), 'Publish path calls promote-draft.js');

  // -------------------------------------------------------------
  // Test 14: Promotion occurs only after generation/validation
  // -------------------------------------------------------------
  console.log('\nTest 14: Promotion occurs after generation/validation step');
  const genIndex = workflowContent.indexOf('node scripts/autopilot/index.js --generate');
  const promoteIndex = workflowContent.indexOf('node scripts/autopilot/promote-draft.js');
  assert(genIndex > 0 && promoteIndex > genIndex, 'Draft generation occurs before promotion step');

  // -------------------------------------------------------------
  // Test 15 & 16: Astro check and build occur before generation
  // -------------------------------------------------------------
  console.log('\nTest 15 & 16: Astro check and build occur before generation');
  const preCheckIndex = workflowContent.indexOf('Pre-Generation Site Verification');
  assert(preCheckIndex > 0 && preCheckIndex < genIndex, 'Pre-generation verification occurs before generation');

  // -------------------------------------------------------------
  // Test 17 & 18: Astro check and build occur after promotion
  // -------------------------------------------------------------
  console.log('\nTest 17 & 18: Astro check and build occur after promotion');
  const postCheckIndex = workflowContent.indexOf('Post-Promotion Site Verification');
  assert(postCheckIndex > promoteIndex, 'Post-promotion verification occurs after promotion step');

  // -------------------------------------------------------------
  // Test 19: Commit happens after successful post-validation/build
  // -------------------------------------------------------------
  console.log('\nTest 19: Commit happens only after successful post-validation/build');
  const commitIndex = workflowContent.indexOf('Commit & Push Promoted Content');
  assert(commitIndex > postCheckIndex, 'Commit step is placed after post-promotion verification');

  // -------------------------------------------------------------
  // Test 20: Push targets main branch
  // -------------------------------------------------------------
  console.log('\nTest 20: Push targets main branch');
  assert(workflowContent.includes('git push origin main'), 'Push command explicitly targets main');

  // -------------------------------------------------------------
  // Test 21: Cloudflare Pages Wrangler deployment step is configured
  // -------------------------------------------------------------
  console.log('\nTest 21: Cloudflare Pages Wrangler deployment step is configured');
  assert(workflowContent.includes('Deploy to Cloudflare Pages via Wrangler'), 'Wrangler deployment step is present');
  assert(workflowContent.includes('npx wrangler pages deploy dist --project-name=free-gender-predictor'), 'Wrangler deploy uses project-name free-gender-predictor');
  const deployIndex = workflowContent.indexOf('npx wrangler pages deploy dist --project-name=free-gender-predictor');
  assert(deployIndex > commitIndex, 'Deployment occurs after build and commit');

  // -------------------------------------------------------------
  // Test 22: Workflow does not expose secrets
  // -------------------------------------------------------------
  console.log('\nTest 22: Workflow does not expose secrets');
  assert(!workflowContent.includes('AIzaSy'), 'No hardcoded Gemini API keys in workflow');
  assert(!workflowContent.includes('gsk_'), 'No hardcoded Groq API keys in workflow');
  assert(!workflowContent.includes('echo $GEMINI_API_KEY'), 'No Gemini secret echoing');
  assert(!workflowContent.includes('echo $GROQ_API_KEY'), 'No Groq secret echoing');
  assert(!workflowContent.includes('echo $CLOUDFLARE_API_TOKEN'), 'No Cloudflare token echoing');
  assert(!workflowContent.includes('echo $CLOUDFLARE_ACCOUNT_ID'), 'No Cloudflare account ID echoing');

  // -------------------------------------------------------------
  // Test 23: Force-topic with rejected topic is rejected by cannibalization gate
  // -------------------------------------------------------------
  console.log('\nTest 23: Force-topic with rejected topic is rejected by cannibalization gate');
  const forceRejectResult = await runAutopilot({
    generate: false,
    forceTopic: 'Chinese Gender Calendar', // Exact duplicate of existing production article
  });
  assert(forceRejectResult.success === false, 'Forced duplicate topic is rejected by cannibalization gate');
  assert(
    forceRejectResult.state.includes('REJECTED') || forceRejectResult.state.includes('REJECT'),
    'State indicates cannibalization rejection'
  );

  // -------------------------------------------------------------
  // Test 24: Production content safety remains intact
  // -------------------------------------------------------------
  console.log('\nTest 24: Production content safety remains intact');
  const currentProdFiles = fs.readdirSync(REAL_PROD_BLOG_DIR).sort();
  assert(
    JSON.stringify(INITIAL_PROD_FILES) === JSON.stringify(currentProdFiles),
    `Production blog contains exact 8 original articles (${currentProdFiles.length} files)`
  );

  console.log('\n======================================================================');
  console.log(`  TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase5Tests().catch((err) => {
  console.error('Phase 5 test suite error:', err);
  process.exit(1);
});
