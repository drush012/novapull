import { defineCollection, z } from 'astro:content';

// One collection for every post; the language and category live on each entry
// so a single template renders both /zh and /en without duplicated logic.
const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    lang: z.enum(['zh', 'en']),
    category: z.enum(['monetize', 'tools', 'ai']),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    cover: z.string().optional(),
    draft: z.boolean().default(false)
  })
});

export const collections = { posts };
