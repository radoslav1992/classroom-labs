// Vitest project for tests/site/: compiles .astro components so their HTML can be checked.
import { getViteConfig } from 'astro/config';

export default getViteConfig(
  { test: { name: 'site', include: ['tests/site/**/*.test.{ts,mjs}'] } } as never,
  { configFile: false, site: 'https://classroomlabs.org', trailingSlash: 'always', logLevel: 'warn' },
);
