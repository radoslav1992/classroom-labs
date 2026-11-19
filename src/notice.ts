// No-JavaScript result of the waitlist form. A form post to /api/waitlist comes back here as a 303 to the page
// with ?waitlist=<code>. A static page cannot read its query string without JavaScript, so for the pages
// that hold the form the Worker reveals the matching message with HTMLRewriter (and hides the form after
// a signup). With JavaScript on, src/scripts/waitlist.ts does the same in the browser.
import { messageKey } from './lib/waitlist.mjs';

/** Pages with the waitlist form; wrangler.jsonc routes them through the Worker (run_worker_first). */
export const FORM_PAGES = new Set(['/', '/teachers/']);

/** The message to reveal for this request, or null to serve the page untouched. */
export function noticeCode(request: Request): string | null {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (!FORM_PAGES.has(url.pathname)) return null;
  const code = url.searchParams.get('waitlist');
  return code === null ? null : messageKey(code);
}

export async function servePage(request: Request, assets: Fetcher): Promise<Response> {
  const response = await assets.fetch(request);
  const code = noticeCode(request);
  if (!code || !response.ok || !(response.headers.get('Content-Type') ?? '').includes('text/html')) return response;
  const rewritten = new HTMLRewriter()
    .on(`[data-waitlist-message="${code}"]`, { element: element => void element.removeAttribute('hidden') })
    .on('form[data-waitlist-form]', { element: element => void (code === 'ok' && element.setAttribute('hidden', '')) })
    .transform(response);
  const page = new Response(rewritten.body, rewritten);
  page.headers.set('Cache-Control', 'no-store');
  return page;
}
