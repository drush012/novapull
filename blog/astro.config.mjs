import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The site is served from its own subdomain, kept separate from the download
// tool so the content stays AdSense-eligible (no download functionality here).
export default defineConfig({
  site: 'https://blog.qike.ccwu.cc',
  integrations: [sitemap()],
  build: { format: 'directory' }
});
