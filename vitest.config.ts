import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      // The /api/* Worker: handlers run in Node against a D1 stand-in over node:sqlite (tests/api/d1.ts).
      { test: { name: 'api', include: ['tests/api/**/*.test.ts'] } },
      // The hub site: lab data, the waitlist form and the built pages (vitest.site.config.ts).
      './vitest.site.config.ts',
    ],
  },
});
