// The /api/* routes of the classroomlabs.org Worker:
//   POST /api/waitlist   teacher-plan waitlist signups (docs/waitlist-contract.md), OPTIONS for CORS preflight
//   GET  /api/health     "ok"
//   GET  /api/export.csv all signups as CSV, only behind Cloudflare Access (404 until it is configured)
// Everything else under /api/ is 404. Nothing here logs an email address, a token or an IP address.
import { accessConfig, verifyAccessJwt } from './access';
import { allowedOrigins, allowedSites, MAX_BODY_BYTES, teachersPage, type Env } from './config';
import { signupsCsv } from './csv';
import { allowSubmission, hashIp } from './ratelimit';
import { allSignups, upsertSignup } from './store';
import { verifyTurnstile } from './turnstile';
import { fromForm, fromJson, isBot, safeReturn, validate, type RawSubmission } from './validate';

export type WaitlistResult =
  | 'ok'
  | 'invalid_email'
  | 'invalid_field'
  | 'consent_required'
  | 'turnstile_failed'
  | 'bad_origin'
  | 'rate_limited'
  | 'server_error';

const STATUS: Record<WaitlistResult, number> = {
  ok: 200,
  invalid_email: 400,
  invalid_field: 400,
  consent_required: 400,
  turnstile_failed: 403,
  bad_origin: 403,
  rate_limited: 429,
  server_error: 500,
};

const NO_STORE = { 'Cache-Control': 'no-store' };

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE } });
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/waitlist') {
    if (request.method === 'POST') return waitlist(request, env);
    if (request.method === 'OPTIONS') return preflight(request, env);
    return notFound();
  }
  if (pathname === '/api/health' && (request.method === 'GET' || request.method === 'HEAD')) {
    return new Response(request.method === 'HEAD' ? null : 'ok', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE } });
  }
  if (pathname === '/api/export.csv' && request.method === 'GET') return exportCsv(request, env);
  return notFound();
}

/** The request's Origin when it may call the API: an allowlisted site, or the Worker's own origin. */
function callerOrigin(request: Request, env: Env): string | null {
  let origin = request.headers.get('Origin');
  // A browser always sends Origin with a POST; Referer is the fallback for the rare client that does not.
  if (!origin) {
    try {
      origin = new URL(request.headers.get('Referer') ?? '').origin;
    } catch {
      return null;
    }
  }
  if (!origin || origin === 'null') return null;
  return allowedOrigins(env).has(origin) || origin === new URL(request.url).origin ? origin : null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function preflight(request: Request, env: Env): Response {
  const origin = request.headers.get('Origin');
  const allowed = origin && origin !== 'null' && (allowedOrigins(env).has(origin) || origin === new URL(request.url).origin);
  if (!allowed) return new Response(null, { status: 403, headers: { Vary: 'Origin', ...NO_STORE } });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

type BodyKind = 'json' | 'form';

async function readBody(request: Request): Promise<{ kind: BodyKind; raw: RawSubmission | null }> {
  const type = (request.headers.get('Content-Type') ?? '').toLowerCase();
  const kind: BodyKind = type.startsWith('application/json') ? 'json' : 'form';
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > MAX_BODY_BYTES) return { kind, raw: null };
  try {
    if (kind === 'json') {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return { kind, raw: null };
      return { kind, raw: fromJson(JSON.parse(text)) };
    }
    if (type.startsWith('application/x-www-form-urlencoded')) {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return { kind, raw: null };
      return { kind, raw: fromForm(urlencodedForm(text)) };
    }
    if (type.startsWith('multipart/form-data')) return { kind, raw: fromForm(await request.formData()) };
  } catch {
    // Malformed body: answered as invalid_field below.
  }
  return { kind, raw: null };
}

function urlencodedForm(text: string): FormData {
  const form = new FormData();
  for (const [name, value] of new URLSearchParams(text)) form.append(name, value);
  return form;
}

async function waitlist(request: Request, env: Env): Promise<Response> {
  const sites = allowedSites(env);
  const origin = callerOrigin(request, env);
  const { kind, raw } = await readBody(request);

  const respond = (result: WaitlistResult): Response => {
    if (kind === 'form') {
      const site = typeof raw?.site === 'string' && sites.includes(raw.site.trim().toLowerCase()) ? raw.site.trim().toLowerCase() : sites[0];
      const target = safeReturn(raw?.return, sites) ?? new URL(teachersPage(site));
      target.searchParams.set('waitlist', result);
      return new Response(null, { status: 303, headers: { Location: target.href, ...corsHeaders(origin), ...NO_STORE } });
    }
    const body = result === 'ok' ? { ok: true } : { ok: false, error: result };
    return new Response(JSON.stringify(body), {
      status: STATUS[result],
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin), ...NO_STORE },
    });
  };

  if (!origin) return respond('bad_origin');
  if (!raw) return respond('invalid_field');
  // Honeypot: a person never sees the "website" field. Answer as if it worked, store nothing.
  if (isBot(raw)) return respond('ok');

  const checked = validate(raw, sites);
  if (!checked.ok) return respond(checked.error);

  if (!env.IP_HASH_SALT) {
    console.error('[waitlist] IP_HASH_SALT is not set');
    return respond('server_error');
  }
  const ip = request.headers.get('CF-Connecting-IP');
  try {
    const ipHash = await hashIp(ip ?? 'unknown', env.IP_HASH_SALT);
    if (!(await allowSubmission(env.DB, ipHash))) return respond('rate_limited');
    if (!(await verifyTurnstile(raw['cf-turnstile-response'], env.TURNSTILE_SECRET, ip))) return respond('turnstile_failed');
    await upsertSignup(env.DB, checked.signup);
  } catch (error) {
    console.error('[waitlist] storage failed:', error instanceof Error ? error.name : 'unknown');
    return respond('server_error');
  }
  return respond('ok');
}

async function exportCsv(request: Request, env: Env): Promise<Response> {
  const config = accessConfig(env);
  if (!config) return notFound();
  if (!(await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), config))) {
    return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE } });
  }
  const csv = signupsCsv(await allSignups(env.DB));
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="waitlist-${day}.csv"`,
      ...NO_STORE,
    },
  });
}
