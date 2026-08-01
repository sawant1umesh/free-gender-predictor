import rss from '@astrojs/rss';
import { getAllPosts } from '../lib/blog/utils';

export async function GET(context: { site: URL }) {
  const posts = await getAllPosts();
  return rss({
    title: 'Free Gender Predictor Blog',
    description: 'Educational articles and guides on the Chinese Gender Predictor, Mayan prediction methods, pregnancy folklore, and medical facts.',
    site: context.site || 'https://freegenderpredictor.com',
    trailingSlash: false,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: new Date(post.data.pubDate),
      description: post.data.excerpt,
      link: `/blog/${post.id}`,
    })),
    customData: `<language>en-us</language>`,
  });
}
