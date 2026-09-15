import { autopilotConfig } from './config.js';
import { slugify } from './inventory.js';

// Common English stopwords to filter during topical analysis
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any',
  'are', 'aren', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do', 'does',
  'doing', 'don', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'vs'
]);

/**
 * Tokenize and normalize text into meaningful keyword tokens.
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenize(text) {
  if (!text) return new Set();
  const cleaned = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  return new Set(cleaned);
}

/**
 * Compute Jaccard Similarity between two token sets.
 * |A ∩ B| / |A ∪ B|
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} 0.0 to 1.0
 */
export function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }
  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Compute Overlap Coefficient between two token sets.
 * |A ∩ B| / min(|A|, |B|)
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} 0.0 to 1.0
 */
export function overlapCoefficient(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }
  return intersectionCount / Math.min(setA.size, setB.size);
}

/**
 * Clean comparison string (lower, alphanumeric only)
 * @param {string} str
 * @returns {string}
 */
export function normalizeString(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\w]/g, '')
    .trim();
}

/**
 * Analyze a candidate topic against existing inventory.
 * @param {object} candidate
 * @param {object} inventory
 * @returns {object} Analysis result with SAFE, CAUTION, or REJECT
 */
export function analyzeTopicCandidate(candidate, inventory) {
  const candidateTitle = (candidate.title || '').trim();
  const rawCandidateSlug = (candidate.suggestedSlug || candidate.slug || candidateTitle).replace(/\.(md|mdx)$/i, '');
  const candidateSlug = slugify(rawCandidateSlug);
  const candidateTitleSlug = slugify(candidateTitle);
  const candidateFilename = `${candidateSlug}.md`;

  const candidateTokens = tokenize(`${candidateTitle} ${candidate.primaryKeyword || ''} ${(candidate.secondaryKeywords || []).join(' ')}`);
  const candidateCategory = candidate.category || '';

  // Check if category is approved
  const isApprovedCategory = autopilotConfig.approvedCategories.includes(candidateCategory);

  let highestScore = 0;
  let closestArticle = null;
  let matchType = 'none';

  const articles = inventory.articles || [];

  for (const article of articles) {
    const existingTitleNorm = normalizeString(article.title);
    const candidateTitleNorm = normalizeString(candidateTitle);
    const existingTitleLower = (article.title || '').trim().toLowerCase();
    const candidateTitleLower = candidateTitle.toLowerCase();

    const existingSlug = (article.slug || '').toLowerCase();
    const existingFilename = (article.filename || `${existingSlug}.md`).toLowerCase();

    // 1. Exact title match check
    if (
      existingTitleNorm === candidateTitleNorm ||
      (candidateTitleLower && existingTitleLower === candidateTitleLower)
    ) {
      return {
        candidate,
        decision: 'REJECT',
        score: 1.0,
        closestMatch: article.title,
        closestSlug: article.slug,
        reason: `Exact duplicate title matches existing article '${article.title}'`,
        linkingOpportunities: [],
      };
    }

    // 2. Exact slug / filename collision check
    if (
      candidateSlug === existingSlug ||
      candidateTitleSlug === existingSlug ||
      candidateFilename === existingFilename ||
      candidateSlug === existingFilename ||
      candidateFilename === `${existingSlug}.md`
    ) {
      return {
        candidate,
        decision: 'REJECT',
        score: 1.0,
        closestMatch: article.title,
        closestSlug: article.slug,
        reason: `Exact duplicate title or slug matches existing article '${article.title}'`,
        linkingOpportunities: [],
      };
    }

    // 3. Token overlap & Jaccard comparison
    const articleTokens = tokenize(`${article.title} ${article.description || ''} ${(article.tags || []).join(' ')}`);
    const jaccard = jaccardSimilarity(candidateTokens, articleTokens);
    const overlap = overlapCoefficient(candidateTokens, articleTokens);

    // Blended score weighted towards Jaccard with overlap boost
    const blendedScore = 0.6 * jaccard + 0.4 * overlap;

    if (blendedScore > highestScore) {
      highestScore = blendedScore;
      closestArticle = article;
      matchType = blendedScore >= 0.75 ? 'high' : blendedScore >= 0.50 ? 'moderate' : 'low';
    }
  }

  // Determine decision based on configured thresholds
  let decision = 'SAFE';
  let reason = 'Net-new topic candidate with strong differentiation from existing content';

  if (!isApprovedCategory) {
    decision = 'REJECT';
    reason = `Category '${candidateCategory}' is not in approved site taxonomy`;
  } else if (highestScore >= autopilotConfig.cannibalizationThresholds.highSimilarity) {
    decision = 'REJECT';
    reason = `High keyword cannibalization risk with '${closestArticle?.title}' (${Math.round(highestScore * 100)}% similarity)`;
  } else if (highestScore >= autopilotConfig.cannibalizationThresholds.mediumSimilarity) {
    decision = 'CAUTION';
    reason = `Moderate topical overlap with '${closestArticle?.title}' (${Math.round(highestScore * 100)}% similarity) - requires distinct search angle`;
  }

  // Suggest valid internal linking opportunities
  const linkingOpportunities = [];

  // Always link home tool
  linkingOpportunities.push({
    path: '/',
    label: 'Chinese Gender Predictor Calculator',
    type: 'core',
    reason: 'Primary conversion goal & core site calculator',
  });

  // Link to relevant category hub if exists
  const catRoute = `/blog/category/${slugify(candidateCategory)}`;
  if (inventory.routes.some((r) => r.path === catRoute)) {
    linkingOpportunities.push({
      path: catRoute,
      label: `${candidateCategory} Category Archive`,
      type: 'category',
      reason: 'Topical silo parent hub',
    });
  }

  // Link to complementary articles in same category
  const sameCatArticles = inventory.articles
    .filter((a) => a.category === candidateCategory && a.slug !== closestArticle?.slug)
    .slice(0, 2);

  for (const art of sameCatArticles) {
    linkingOpportunities.push({
      path: art.route,
      label: art.title,
      type: 'article',
      reason: 'Complementary sibling article in same category',
    });
  }

  // If closest article is moderate overlap, link to it as a reference
  if (closestArticle && decision === 'SAFE' && highestScore > 0.3) {
    linkingOpportunities.push({
      path: closestArticle.route,
      label: closestArticle.title,
      type: 'article',
      reason: 'Relevant context anchor',
    });
  }

  return {
    candidate,
    decision,
    score: Math.round(highestScore * 100) / 100,
    closestMatch: closestArticle ? closestArticle.title : null,
    closestSlug: closestArticle ? closestArticle.slug : null,
    matchType,
    reason,
    linkingOpportunities: linkingOpportunities.slice(0, 4),
  };
}

/**
 * Run gap analysis across all topic seeds.
 * @param {Array<object>} seeds
 * @param {object} inventory
 * @returns {Array<object>}
 */
export function analyzeSeeds(seeds, inventory) {
  return seeds.map((seed) => analyzeTopicCandidate(seed, inventory));
}

/**
 * Select the next SAFE topic candidate from a list of candidates against the current inventory.
 * Automatically evaluates candidates in order, skipping duplicates, REJECTs, and CAUTIONs.
 * 
 * @param {Array<object>} candidates - List of candidate seeds/topics
 * @param {object} inventory - Current production blog inventory
 * @param {object} [options]
 * @param {boolean} [options.allowCaution=false] - Whether CAUTION topics are eligible (default false)
 * @param {Set<string>|Array<string>} [options.excludedSlugs] - Slugs to exclude
 * @param {Set<string>|Array<string>} [options.excludedTitles] - Titles to exclude
 * @param {Set<string>|Array<string>} [options.excludedTopicIds] - Topic IDs to exclude
 * @param {boolean} [options.includeTestPriority=false] - Whether to allow priority: 'test'
 * @returns {{
 *   selectedTopic: object|null,
 *   analysis: object|null,
 *   skippedCandidates: Array<{ candidate: object, decision: string, reason: string, score: number, closestMatch?: string }>,
 *   allEvaluations: Array<object>
 * }}
 */
export function selectNextSafeCandidate(candidates = [], inventory, options = {}) {
  const allowCaution = options.allowCaution ?? false;
  const excludedSlugs = new Set(Array.from(options.excludedSlugs || []).map((s) => s.toLowerCase()));
  const excludedTitles = new Set(Array.from(options.excludedTitles || []).map((t) => t.toLowerCase().trim()));
  const excludedTopicIds = new Set(options.excludedTopicIds || []);
  const includeTestPriority = options.includeTestPriority ?? false;

  const skippedCandidates = [];
  const allEvaluations = [];
  let selectedTopic = null;
  let selectedAnalysis = null;

  for (const cand of candidates) {
    if (!cand || typeof cand !== 'object') continue;

    const candId = cand.id || '';
    const candTitle = (cand.title || '').trim();
    const rawSlug = (cand.suggestedSlug || cand.slug || candTitle).replace(/\.(md|mdx)$/i, '');
    const candSlug = slugify(rawSlug);

    // Check exclusion sets
    if (candId && excludedTopicIds.has(candId)) {
      skippedCandidates.push({
        candidate: cand,
        decision: 'EXCLUDED',
        reason: `Topic ID "${candId}" previously attempted or excluded in this run`,
        score: 1.0,
      });
      continue;
    }

    if (candSlug && excludedSlugs.has(candSlug)) {
      skippedCandidates.push({
        candidate: cand,
        decision: 'EXCLUDED',
        reason: `Slug "${candSlug}" previously attempted or excluded in this run`,
        score: 1.0,
      });
      continue;
    }

    if (candTitle && excludedTitles.has(candTitle.toLowerCase())) {
      skippedCandidates.push({
        candidate: cand,
        decision: 'EXCLUDED',
        reason: `Title "${candTitle}" previously attempted or excluded in this run`,
        score: 1.0,
      });
      continue;
    }

    // Skip test priority unless explicitly permitted
    if (cand.priority === 'test' && !includeTestPriority) {
      continue;
    }

    // Direct lookup check against production sets
    if (inventory.existingSlugs && inventory.existingSlugs.has(candSlug)) {
      skippedCandidates.push({
        candidate: cand,
        decision: 'REJECT',
        reason: `Duplicate slug "${candSlug}" matches existing article in production inventory`,
        score: 1.0,
        closestMatch: candSlug,
      });
      continue;
    }

    if (inventory.existingTitles && inventory.existingTitles.has(candTitle.toLowerCase())) {
      skippedCandidates.push({
        candidate: cand,
        decision: 'REJECT',
        reason: `Exact duplicate title "${candTitle}" matches existing article in production inventory`,
        score: 1.0,
        closestMatch: candTitle,
      });
      continue;
    }

    // Analyze candidate against complete production inventory
    const analysis = analyzeTopicCandidate(cand, inventory);
    allEvaluations.push(analysis);

    if (analysis.decision === 'REJECT') {
      skippedCandidates.push({
        candidate: cand,
        decision: 'REJECT',
        reason: analysis.reason,
        score: analysis.score,
        closestMatch: analysis.closestMatch,
      });
      continue;
    }

    if (analysis.decision === 'CAUTION') {
      if (!allowCaution) {
        skippedCandidates.push({
          candidate: cand,
          decision: 'CAUTION',
          reason: analysis.reason,
          score: analysis.score,
          closestMatch: analysis.closestMatch,
        });
        continue;
      }
    }

    // Candidate is SAFE (or CAUTION with allowCaution: true)
    selectedTopic = cand;
    selectedAnalysis = analysis;
    break;
  }

  return {
    selectedTopic,
    analysis: selectedAnalysis,
    skippedCandidates,
    allEvaluations,
  };
}

export default {
  tokenize,
  jaccardSimilarity,
  overlapCoefficient,
  analyzeTopicCandidate,
  analyzeSeeds,
  selectNextSafeCandidate,
};
