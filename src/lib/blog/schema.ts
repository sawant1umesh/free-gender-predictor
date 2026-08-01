import type { BlogPost } from './utils';

function absoluteUrl(url: string, siteUrl: string): string {
  return url.startsWith('http')
    ? url
    : `${siteUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function generateArticleSchema(post: BlogPost, siteUrl: string) {
  const canonicalUrl = `${siteUrl}/blog/${post.id}`;
  const heroImageUrl = absoluteUrl(post.data.heroImage, siteUrl);

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    headline: post.data.seoTitle || post.data.title,
    description: post.data.description,
    image: [heroImageUrl],
    datePublished: new Date(post.data.pubDate).toISOString(),
    dateModified: new Date(post.data.updatedDate || post.data.pubDate).toISOString(),
    author: {
      '@type': 'Organization',
      name: post.data.author,
      url: siteUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Free Gender Predictor',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/logo-header.webp`,
      },
    },
    articleSection: post.data.category,
    keywords: post.data.tags.join(', '),
  });
}

export function generateBreadcrumbSchema(
  items: { name: string; url: string }[],
  siteUrl: string
) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url, siteUrl),
    })),
  });
}

export function generateFAQSchema(faqs: { question: string; answer: string }[]) {
  if (!faqs || faqs.length === 0) return null;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  });
}
