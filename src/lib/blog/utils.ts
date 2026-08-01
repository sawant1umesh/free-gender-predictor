import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function unslugify(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function calculateReadingTime(content: string | undefined): number {
  const wordsPerMinute = 200;
  const cleanContent = (content || '').replace(/<[^>]*>/g, '').replace(/#|\*|`|-/g, '');
  const wordCount = cleanContent.trim().split(/\s+/).filter(Boolean).length;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);
  return readingTime > 0 ? readingTime : 1;
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog');
  return posts.sort(
    (a, b) => new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime()
  );
}

export async function getFeaturedPost(): Promise<BlogPost | null> {
  const posts = await getAllPosts();
  if (posts.length === 0) return null;
  const explicitFeatured = posts.find((post) => post.data.featured);
  return explicitFeatured || posts[0];
}

export async function getRelatedPosts(
  currentPost: BlogPost,
  limit = 3
): Promise<BlogPost[]> {
  const posts = await getAllPosts();
  const candidates = posts.filter((post) => post.id !== currentPost.id);

  const scored = candidates.map((post) => {
    let score = 0;
    if (slugify(post.data.category) === slugify(currentPost.data.category)) {
      score += 5;
    }
    const currentTags = currentPost.data.tags.map(slugify);
    const postTags = post.data.tags.map(slugify);
    const overlappingTags = postTags.filter((tag) => currentTags.includes(tag));
    score += overlappingTags.length * 2;
    return { post, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.post.data.pubDate).getTime() - new Date(a.post.data.pubDate).getTime();
  });

  return scored.slice(0, limit).map((item) => item.post);
}

export async function getAllCategories(): Promise<{ name: string; slug: string; count: number }[]> {
  const posts = await getAllPosts();
  const categoryMap = new Map<string, { name: string; count: number }>();

  posts.forEach((post) => {
    const name = post.data.category;
    const slug = slugify(name);
    if (categoryMap.has(slug)) {
      categoryMap.get(slug)!.count += 1;
    } else {
      categoryMap.set(slug, { name, count: 1 });
    }
  });

  return Array.from(categoryMap.entries()).map(([slug, { name, count }]) => ({
    name,
    slug,
    count,
  }));
}

export async function getAllTags(): Promise<{ name: string; slug: string; count: number }[]> {
  const posts = await getAllPosts();
  const tagMap = new Map<string, { name: string; count: number }>();

  posts.forEach((post) => {
    post.data.tags.forEach((tag) => {
      const slug = slugify(tag);
      if (tagMap.has(slug)) {
        tagMap.get(slug)!.count += 1;
      } else {
        tagMap.set(slug, { name: tag, count: 1 });
      }
    });
  });

  return Array.from(tagMap.entries()).map(([slug, { name, count }]) => ({
    name,
    slug,
    count,
  }));
}

export async function getPostsByCategory(categorySlug: string): Promise<BlogPost[]> {
  const posts = await getAllPosts();
  return posts.filter((post) => slugify(post.data.category) === slugify(categorySlug));
}

export async function getPostsByTag(tagSlug: string): Promise<BlogPost[]> {
  const posts = await getAllPosts();
  return posts.filter((post) =>
    post.data.tags.map(slugify).includes(slugify(tagSlug))
  );
}

export async function getAdjacentPosts(currentSlug: string): Promise<{
  prevPost: BlogPost | null;
  nextPost: BlogPost | null;
}> {
  const posts = await getAllPosts();
  const currentIndex = posts.findIndex((post) => slugify(post.id) === slugify(currentSlug));

  if (currentIndex === -1) {
    return { prevPost: null, nextPost: null };
  }

  const nextPost = currentIndex > 0 ? posts[currentIndex - 1] : null;
  const prevPost = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null;

  return { prevPost, nextPost };
}
