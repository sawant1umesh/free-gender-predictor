import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blogCollection = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    seoTitle: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('Free Gender Predictor Editorial Team'),
    authorRole: z.string().default('Medical & Cultural Research Specialist'),
    authorAvatar: z.string().default('/logo-header.webp'),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    heroImage: z.string(),
    heroImageAlt: z.string(),
    featured: z.boolean().default(false),
    excerpt: z.string(),
    faqs: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .optional(),
  }),
});

export const collections = {
  blog: blogCollection,
};
