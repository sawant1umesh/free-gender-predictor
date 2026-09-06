import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root directory
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

/**
 * Result states for safe workflow tracking
 */
export const RESULT_STATES = Object.freeze({
  DRY_RUN_COMPLETE: 'DRY_RUN_COMPLETE',
  NO_STRONG_TOPIC_FOUND: 'NO_STRONG_TOPIC_FOUND',
  GENERATION_FAILED: 'GENERATION_FAILED',
  INVALID_AI_RESPONSE: 'INVALID_AI_RESPONSE',
  DRAFT_CREATED: 'DRAFT_CREATED',
  VALIDATED_DRAFT_CREATED: 'VALIDATED_DRAFT_CREATED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PROMOTION_SUCCESS: 'PROMOTION_SUCCESS',
  PROMOTION_VALIDATION_FAILED: 'PROMOTION_VALIDATION_FAILED',
  PRODUCTION_SLUG_EXISTS: 'PRODUCTION_SLUG_EXISTS',
  PROMOTION_CANNIBALIZATION_REJECTED: 'PROMOTION_CANNIBALIZATION_REJECTED',
  PROMOTION_UNSAFE_PATH: 'PROMOTION_UNSAFE_PATH',
  PROMOTION_UNSAFE_FILENAME: 'PROMOTION_UNSAFE_FILENAME',
  PROMOTION_FILE_NOT_FOUND: 'PROMOTION_FILE_NOT_FOUND',
  PROMOTION_VERIFICATION_FAILED: 'PROMOTION_VERIFICATION_FAILED',
});

/**
 * SEO Autopilot Configuration for Free Gender Predictor
 */
export const autopilotConfig = {
  // Site Metadata & Domain
  site: {
    domain: 'https://freegenderpredictor.com',
    name: 'Free Gender Predictor',
    trailingSlash: 'never',
    defaultLocale: 'en_US',
  },

  // Directory Structure & Paths
  paths: {
    projectRoot: PROJECT_ROOT,
    productionBlogDir: path.join(PROJECT_ROOT, 'src', 'content', 'blog'),
    draftsDir: path.join(PROJECT_ROOT, 'scripts', 'autopilot', 'drafts'),
    pagesDir: path.join(PROJECT_ROOT, 'src', 'pages'),
    dataDir: path.join(PROJECT_ROOT, 'data'),
    topicSeedsFile: path.join(PROJECT_ROOT, 'data', 'topic-seeds.json'),
    auditLogFile: path.join(PROJECT_ROOT, 'data', 'autopilot-log.json'),
  },

  // AI Generation Provider Settings
  ai: {
    primaryProvider: 'gemini',
    fallbackProvider: 'groq',
    gemini: {
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      apiVersion: 'v1beta',
    },
    groq: {
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    },
    generationTarget: {
      wordCount: {
        min: 1800,
        max: 2500,
        target: 2000,
      },
      minInternalLinks: 4,
      faqs: {
        min: 4,
        max: 8,
      },
    },
  },

  // Approved Content Categories (matches existing site taxonomy)
  approvedCategories: [
    'Chinese Gender Predictor',
    'Chinese Gender Calendar',
    'Mayan Gender Predictor',
    'Baby Gender Prediction Methods',
    'Gender Prediction Myths',
    'Gender Prediction',
  ],

  // Article Quality & Length Standards
  articleRules: {
    wordCount: {
      min: 1200,
      max: 2500,
      target: 1600,
    },
    readingTimeMinutes: {
      min: 5,
      max: 12,
    },
    faqs: {
      min: 4,
      max: 8,
      required: true,
    },
    headings: {
      minH2: 4,
      maxH2: 8,
      h3Allowed: true,
    },
  },

  // Internal Linking Requirements
  internalLinking: {
    minLinks: 4,
    maxLinks: 6,
    requireAnchorContext: true,
    prioritizeCoreTools: true,
    coreRoutes: [
      { path: '/', label: 'Chinese Gender Predictor Tool' },
      { path: '/blog', label: 'Pregnancy & Gender Prediction Guides' },
      { path: '/faq', label: 'Frequently Asked Questions' },
      { path: '/medical-disclaimer', label: 'Medical Disclaimer' },
    ],
  },

  // Duplicate Content & Cannibalization Prevention Thresholds
  cannibalizationThresholds: {
    exactMatch: 1.0, // 100% token or slug match -> REJECT
    highSimilarity: 0.75, // >= 75% topical overlap -> REJECT
    mediumSimilarity: 0.50, // >= 50% topical overlap -> CAUTION (needs manual review / angle change)
    safeSimilarity: 0.49, // < 50% -> SAFE
  },

  // Hero Image Strategy (Configured for local fallback, no external downloading)
  heroImageStrategy: {
    strategy: 'local-fallback',
    defaultHeroImage: '/logo.svg',
    defaultHeroAlt: 'Free Gender Predictor - Baby Gender Prediction Guide',
    categoryFallbacks: {
      'Chinese Gender Predictor': {
        heroImage: '/logo.svg',
        altSuffix: 'Chinese Gender Prediction Chart and Guide',
      },
      'Chinese Gender Calendar': {
        heroImage: '/logo.svg',
        altSuffix: 'Traditional Chinese Lunar Calendar and Pregnancy Months',
      },
      'Mayan Gender Predictor': {
        heroImage: '/logo.svg',
        altSuffix: 'Mayan Gender Predictor and Lunar Math Guide',
      },
      'Baby Gender Prediction Methods': {
        heroImage: '/logo.svg',
        altSuffix: 'Baby Gender Prediction Traditional vs Medical Methods',
      },
      'Gender Prediction Myths': {
        heroImage: '/logo.svg',
        altSuffix: 'Gender Prediction Myths and Scientific Realities',
      },
      'Gender Prediction': {
        heroImage: '/logo.svg',
        altSuffix: 'Baby Gender Prediction Research and Information',
      },
    },
  },

  // Astro Content Layer Schema Fields (Required & Optional)
  schema: {
    requiredFrontmatter: [
      'title',
      'description',
      'pubDate',
      'category',
      'heroImage',
      'heroImageAlt',
      'excerpt',
    ],
    optionalFrontmatter: [
      'seoTitle',
      'updatedDate',
      'author',
      'authorRole',
      'authorAvatar',
      'tags',
      'featured',
      'faqs',
    ],
    defaults: {
      author: 'Free Gender Predictor Editorial Team',
      authorRole: 'Medical & Cultural Research Specialist',
      authorAvatar: '/logo.svg',
      featured: false,
      tags: [],
    },
  },

  resultStates: RESULT_STATES,
};

export default autopilotConfig;
