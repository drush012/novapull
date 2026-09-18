import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { UI } from '../consts';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('posts', p => !p.data.draft))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  return rss({
    title: UI.zh.siteName,
    description: UI.zh.tagline,
    site: context.site!,
    items: posts.map(p => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate,
      link: `/${p.data.lang}/${p.slug.replace(/^(zh|en)\//, '')}/`
    }))
  });
}
