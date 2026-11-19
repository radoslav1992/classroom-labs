// classroomlabs.org Worker. Only /api/* and the two pages with the waitlist form run this code
// (wrangler.jsonc → assets.run_worker_first); every other path is a static file from ./dist.
// The daily Cron Trigger deletes signups older than 365 days and ended rate-limit windows.
import { handleApi } from './api/router';
import { runRetention } from './api/store';
import { servePage } from './notice';
import type { Env } from './api/config';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return handleApi(request, env);
    return servePage(request, env.ASSETS);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runRetention(env.DB, new Date(controller.scheduledTime)).then(
        result => console.log('[retention]', JSON.stringify(result)),
        error => console.error('[retention] failed', error instanceof Error ? error.message : error),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
