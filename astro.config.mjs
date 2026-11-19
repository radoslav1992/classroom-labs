import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { site } from './src/lib/site.mjs';

export default defineConfig({
  site: site.url,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The 404 page stays out of the sitemap; every other page is indexable.
  integrations: [sitemap({ filter: page => !/\/404(?:\/|\.html)?$/.test(page) })],
});
