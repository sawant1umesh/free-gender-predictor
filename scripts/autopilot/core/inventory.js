import fs from 'node:fs';
import path from 'node:path';
import { autopilotConfig } from './config.js';

/**
 * URL-friendly slug generator matching src/lib/blog/utils.ts
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Safely parse YAML frontmatter from markdown content without third-party dependencies.
 * @param {string} content
 * @returns {{ frontmatter: Record<string, any>, body: string }}
 */
export function parseMarkdownWithFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  const rawYaml = match[1];
  const body = match[2].trim();
  const frontmatter = {};

  const lines = rawYaml.split(/\r?\n/);
  let inFaqs = false;
  let currentFaq = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle FAQ list parsing
    if (inFaqs) {
      const qMatch = line.match(/^\s*-\s*question:\s*["']?(.*?)["']?$/);
      const aMatch = line.match(/^\s*answer:\s*["']?(.*?)["']?$/);

      if (qMatch) {
        if (currentFaq) frontmatter.faqs.push(currentFaq);
        currentFaq = { question: qMatch[1], answer: '' };
        continue;
      } else if (aMatch && currentFaq) {
        currentFaq.answer = aMatch[1];
        continue;
      } else if (!line.startsWith(' ') && !line.startsWith('\t') && line.includes(':')) {
        // End of faqs section
        if (currentFaq) frontmatter.faqs.push(currentFaq);
        inFaqs = false;
        currentFaq = null;
      }
    }

    if (line.trim().startsWith('faqs:')) {
      inFaqs = true;
      frontmatter.faqs = [];
      continue;
    }

    // Top-level key: value
    const topLevelMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (topLevelMatch) {
      const key = topLevelMatch[1].trim();
      let val = topLevelMatch[2].trim();

      // Inline array: [ "item1", "item2" ]
      if (val.startsWith('[') && val.endsWith(']')) {
        const items = val
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        frontmatter[key] = items;
        continue;
      }

      // Boolean values
      if (val.toLowerCase() === 'true') {
        frontmatter[key] = true;
        continue;
      }
      if (val.toLowerCase() === 'false') {
        frontmatter[key] = false;
        continue;
      }

      // Stripped string
      val = val.replace(/^["']|["']$/g, '');
      frontmatter[key] = val;
    }
  }

  if (inFaqs && currentFaq) {
    frontmatter.faqs.push(currentFaq);
  }

  return { frontmatter, body };
}

/**
 * Scan static pages in src/pages to discover base internal site routes.
 * @param {string} pagesDir
 * @returns {Array<{ path: string, source: string, type: string }>}
 */
export function discoverPageRoutes(pagesDir) {
  const routes = [];
  if (!fs.existsSync(pagesDir)) return routes;

  const entries = fs.readdirSync(pagesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name);
      const name = path.basename(entry.name, ext);

      // Skip 404 and dynamic route templates
      if (['.astro', '.ts', '.js'].includes(ext)) {
        if (name === '404') continue;
        if (name.startsWith('[') && name.endsWith(']')) continue;

        if (name === 'index') {
          routes.push({ path: '/', source: 'src/pages/index.astro', type: 'core' });
        } else if (name === 'rss.xml') {
          routes.push({ path: '/rss.xml', source: `src/pages/${entry.name}`, type: 'feed' });
        } else {
          routes.push({ path: `/${name}`, source: `src/pages/${entry.name}`, type: 'core' });
        }
      }
    } else if (entry.isDirectory() && entry.name === 'blog') {
      const blogSub = path.join(pagesDir, 'blog');
      if (fs.existsSync(path.join(blogSub, 'index.astro'))) {
        routes.push({ path: '/blog', source: 'src/pages/blog/index.astro', type: 'hub' });
      }
    }
  }

  return routes;
}

/**
 * Scans the production blog directory and discovers all published articles,
 * categories, tags, and valid internal linking routes.
 * Never modifies any files.
 * @returns {Promise<{
 *   articles: Array<any>,
 *   categories: Array<{ name: string, slug: string, count: number }>,
 *   tags: Array<{ name: string, slug: string, count: number }>,
 *   routes: Array<{ path: string, type: string, label: string }>,
 *   stats: Record<string, number>
 * }>}
 */
export async function scanInventory() {
  const blogDir = autopilotConfig.paths.productionBlogDir;
  const pagesDir = autopilotConfig.paths.pagesDir;

  if (!fs.existsSync(blogDir)) {
    throw new Error(`Production blog directory does not exist: ${blogDir}`);
  }

  const files = fs.readdirSync(blogDir).filter((file) => file.endsWith('.md') || file.endsWith('.mdx'));
  const articles = [];
  const categoryMap = new Map();
  const tagMap = new Map();

  for (const filename of files) {
    const filePath = path.join(blogDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    const slug = filename.replace(/\.(md|mdx)$/, '');
    const { frontmatter, body } = parseMarkdownWithFrontmatter(content);

    // Compute basic word count and reading time
    const cleanBody = body.replace(/<[^>]*>/g, '').replace(/#|\*|`|-/g, '');
    const words = cleanBody.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // Extract first 150 words of body for richer topical similarity scoring
    // This improves pre-generation gap analysis beyond title+description+tags alone
    const bodyExcerpt = words.slice(0, 150).join(' ');

    const category = frontmatter.category || 'Uncategorized';
    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

    // Tally categories
    const catSlug = slugify(category);
    if (!categoryMap.has(catSlug)) {
      categoryMap.set(catSlug, { name: category, slug: catSlug, count: 0 });
    }
    categoryMap.get(catSlug).count += 1;

    // Tally tags
    for (const tag of tags) {
      const tSlug = slugify(tag);
      if (!tagMap.has(tSlug)) {
        tagMap.set(tSlug, { name: tag, slug: tSlug, count: 0 });
      }
      tagMap.get(tSlug).count += 1;
    }

    articles.push({
      slug,
      filename,
      filePath,
      route: `/blog/${slug}`,
      title: frontmatter.title || slug,
      seoTitle: frontmatter.seoTitle || frontmatter.title || slug,
      description: frontmatter.description || '',
      pubDate: frontmatter.pubDate || '',
      updatedDate: frontmatter.updatedDate || null,
      category,
      categorySlug: catSlug,
      tags,
      heroImage: frontmatter.heroImage || autopilotConfig.heroImageStrategy.defaultHeroImage,
      heroImageAlt: frontmatter.heroImageAlt || '',
      excerpt: frontmatter.excerpt || '',
      featured: Boolean(frontmatter.featured),
      faqsCount: Array.isArray(frontmatter.faqs) ? frontmatter.faqs.length : 0,
      wordCount,
      readingTime,
      bodyExcerpt, // first 150 words of body — used by gap-analyzer for richer similarity scoring
    });
  }

  // Sort articles by publication date descending (or slug if missing)
  articles.sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime());

  // Aggregate categories and tags
  const categories = Array.from(categoryMap.values()).sort((a, b) => b.count - a.count);
  const tags = Array.from(tagMap.values()).sort((a, b) => b.count - a.count);

  // Discover all valid routes
  const baseRoutes = discoverPageRoutes(pagesDir);
  const routes = [
    ...baseRoutes.map((r) => ({ path: r.path, type: r.type, label: r.path })),
    ...articles.map((a) => ({ path: a.route, type: 'article', label: a.title })),
    ...categories.map((c) => ({
      path: `/blog/category/${c.slug}`,
      type: 'category',
      label: `Category: ${c.name}`,
    })),
    ...tags.map((t) => ({
      path: `/blog/tag/${t.slug}`,
      type: 'tag',
      label: `Tag: ${t.name}`,
    })),
  ];

  // Build lookup sets for existing production assets
  const existingSlugs = new Set(articles.map((a) => a.slug.toLowerCase()));
  const existingFilenames = new Set([
    ...articles.map((a) => a.filename.toLowerCase()),
    ...articles.map((a) => `${a.slug.toLowerCase()}.md`),
    ...articles.map((a) => `${a.slug.toLowerCase()}.mdx`),
  ]);
  const existingTitles = new Set(articles.map((a) => a.title.toLowerCase().trim()));

  return {
    articles,
    categories,
    tags,
    routes,
    existingSlugs,
    existingFilenames,
    existingTitles,
    stats: {
      totalArticles: articles.length,
      totalCategories: categories.length,
      totalTags: tags.length,
      totalRoutes: routes.length,
      totalWords: articles.reduce((sum, a) => sum + a.wordCount, 0),
      avgWordCount: Math.round(
        articles.reduce((sum, a) => sum + a.wordCount, 0) / Math.max(1, articles.length)
      ),
    },
  };
}

export default {
  scanInventory,
  slugify,
  parseMarkdownWithFrontmatter,
  discoverPageRoutes,
};
