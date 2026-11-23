import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../src/worker';
import type { Env } from '../../src/api/config';
import { hashIp } from '../../src/api/ratelimit';
import { SITEVERIFY_URL } from '../../src/api/turnstile';
import { FakeD1 } from './d1';

const URL_ = 'https://classroomlabs.org/api/waitlist';
const ORIGIN = 'https://earthsciencelab.org';

let db: FakeD1;
let env: Env;
let siteverify: ReturnType<typeof vi.fn>;
let assets: ReturnType<typeof vi.fn>;

const valid = {
  email: '  Ms.Rivera@School.EDU ',
  role: 'teacher',
  subjects: 'Earth science',
  grades: '6-8',
  interests: ['class_results', 'answer_keys'],
  school_buys: 'not_sure',
  site: 'earthsciencelab.org',
  source: 'teachers_page',
  consent: 'yes',
  'cf-turnstile-response': 'token-123',
  website: '',
};

function json(body: unknown, { origin = ORIGIN as string | null, ip = '203.0.113.7', headers = {} as Record<string, string> } = {}) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...headers };
  if (origin) h.Origin = origin;
  return new Request(URL_, { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

function form(fields: Record<string, string | string[]>, { origin = ORIGIN as string | null, ip = '203.0.113.7' } = {}) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) params.append(name, item);
  const h: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip };
  if (origin) h.Origin = origin;
  return new Request(URL_, { method: 'POST', headers: h, body: params.toString() });
}

const formValid = { ...valid, interests: ['class_results', 'answer_keys'], return: 'https://earthsciencelab.org/teachers/#teacher-plan' };

async function call(request: Request) {
  return worker.fetch(request as never, env, {} as ExecutionContext);
}

async function body(response: Response) {
  return JSON.parse(await response.text());
}

beforeEach(() => {
  db = new FakeD1();
  assets = vi.fn(async () => new Response('page'));
  env = {
    DB: db.asD1(),
    ASSETS: { fetch: assets } as unknown as Fetcher,
    TURNSTILE_SECRET: 'secret-xyz',
    IP_HASH_SALT: 'pepper',
    TEAM_DOMAIN: '',
    ACCESS_AUD: '',
    ALLOWED_SITES: '',
  };
  siteverify = vi.fn(async () => Response.json({ success: true }));
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === SITEVERIFY_URL) return siteverify(url, init);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/waitlist with JSON', () => {
  it('stores a valid signup and answers 200 {"ok":true} with CORS headers', async () => {
    const response = await call(json(valid));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(response.headers.get('Vary')).toContain('Origin');
    const rows = db.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: 'ms.rivera@school.edu',
      role: 'teacher',
      subjects: 'Earth science',
      grades: '6-8',
      interests_json: '["class_results","answer_keys"]',
      school_buys: 'not_sure',
      site: 'earthsciencelab.org',
      source: 'teachers_page',
    });
    expect(rows[0].created_at).toBe(rows[0].consent_at);
  });

  it('verifies the Turnstile token with the secret and the client IP', async () => {
    await call(json(valid));
    expect(siteverify).toHaveBeenCalledOnce();
    const sent = siteverify.mock.calls[0][1].body as FormData;
    expect(sent.get('secret')).toBe('secret-xyz');
    expect(sent.get('response')).toBe('token-123');
    expect(sent.get('remoteip')).toBe('203.0.113.7');
  });

  it('accepts optional fields left out, and a single interest as a string', async () => {
    const { subjects, grades, interests, ...rest } = valid;
    expect((await call(json(rest))).status).toBe(200);
    expect((await call(json({ ...valid, email: 'b@school.org', interests: 'quiz_banks' }))).status).toBe(200);
    const rows = db.rows();
    expect(rows[0]).toMatchObject({ subjects: null, grades: null, interests_json: '[]' });
    expect(rows[1]).toMatchObject({ interests_json: '["quiz_banks"]' });
  });

  it('upserts on (email, site): a repeat signup updates the answers and keeps created_at', async () => {
    await call(json(valid));
    const first = db.rows()[0];
    await new Promise(resolve => setTimeout(resolve, 5));
    const again = await call(json({ ...valid, email: 'MS.RIVERA@school.edu', role: 'school_leader', interests: [], source: 'after_share' }));
    expect(again.status).toBe(200);
    expect(await body(again)).toEqual({ ok: true });
    const rows = db.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: 'school_leader', interests_json: '[]', source: 'after_share', created_at: first.created_at });
    expect(rows[0].updated_at > first.updated_at).toBe(true);
    // The same teacher on another site is a separate signup.
    await call(json({ ...valid, site: 'geometrylab.net' }, { origin: 'https://geometrylab.net' }));
    expect(db.rows()).toHaveLength(2);
  });

  it('honeypot: answers ok, stores nothing and does not call Turnstile', async () => {
    const response = await call(json({ ...valid, website: 'http://spam.example' }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true });
    expect(db.rows()).toHaveLength(0);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it.each([
    ['missing email', { email: undefined }, 'invalid_email'],
    ['email without a domain dot', { email: 'teacher@school' }, 'invalid_email'],
    ['email with a space', { email: 'a b@school.org' }, 'invalid_email'],
    ['email over 254 characters', { email: `${'a'.repeat(60)}@${'b'.repeat(190)}.org` }, 'invalid_email'],
    ['email as a number', { email: 42 }, 'invalid_email'],
    ['unknown role', { role: 'student' }, 'invalid_field'],
    ['missing role', { role: undefined }, 'invalid_field'],
    ['subjects over 200 characters', { subjects: 'x'.repeat(201) }, 'invalid_field'],
    ['grades over 100 characters', { grades: 'x'.repeat(101) }, 'invalid_field'],
    ['unknown interest', { interests: ['class_results', 'free_pizza'] }, 'invalid_field'],
    ['unknown school_buys', { school_buys: 'maybe' }, 'invalid_field'],
    ['missing school_buys', { school_buys: undefined }, 'invalid_field'],
    ['site not in the allowlist', { site: 'example.com' }, 'invalid_field'],
    ['missing site', { site: undefined }, 'invalid_field'],
    ['unknown source', { source: 'newsletter' }, 'invalid_field'],
    ['consent unticked', { consent: undefined }, 'consent_required'],
    ['consent not "yes"', { consent: 'on' }, 'consent_required'],
  ])('rejects %s', async (_name, change, error) => {
    const response = await call(json({ ...valid, ...change }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ ok: false, error });
    expect(db.rows()).toHaveLength(0);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it('accepts 200-character subjects and 100-character grades', async () => {
    expect((await call(json({ ...valid, subjects: 'x'.repeat(200), grades: 'y'.repeat(100) }))).status).toBe(200);
  });

  it('rejects malformed and oversized bodies as invalid_field', async () => {
    for (const request of [json('{not json'), json('[1,2]'), json({ ...valid, subjects: 'x'.repeat(20_000) })]) {
      const response = await call(request);
      expect(response.status).toBe(400);
      expect(await body(response)).toEqual({ ok: false, error: 'invalid_field' });
    }
  });

  it('answers 403 turnstile_failed when Cloudflare rejects the token, it is missing, or the check fails', async () => {
    siteverify.mockResolvedValueOnce(Response.json({ success: false, 'error-codes': ['invalid-input-response'] }));
    let response = await call(json(valid));
    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ ok: false, error: 'turnstile_failed' });

    response = await call(json({ ...valid, 'cf-turnstile-response': undefined }, { ip: '198.51.100.1' }));
    expect(await body(response)).toEqual({ ok: false, error: 'turnstile_failed' });

    siteverify.mockRejectedValueOnce(new Error('network'));
    response = await call(json(valid, { ip: '198.51.100.2' }));
    expect(await body(response)).toEqual({ ok: false, error: 'turnstile_failed' });

    env.TURNSTILE_SECRET = '';
    response = await call(json(valid, { ip: '198.51.100.3' }));
    expect(await body(response)).toEqual({ ok: false, error: 'turnstile_failed' });
    expect(db.rows()).toHaveLength(0);
  });

  it('answers 403 bad_origin for other origins, http, "null" and a missing Origin and Referer', async () => {
    for (const origin of ['https://evil.example', 'http://earthsciencelab.org', 'https://earthsciencelab.org.evil.example', 'null', null]) {
      const response = await call(json(valid, { origin }));
      expect(response.status).toBe(403);
      expect(await body(response)).toEqual({ ok: false, error: 'bad_origin' });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(db.rows()).toHaveLength(0);
  });

  it('accepts www origins, the Worker’s own origin, and a Referer when Origin is missing', async () => {
    expect((await call(json(valid, { origin: 'https://www.earthsciencelab.org' }))).status).toBe(200);
    expect((await call(json(valid, { origin: 'https://classroomlabs.org' }))).status).toBe(200);
    expect((await call(json(valid, { origin: null, headers: { Referer: 'https://thephysicslab.org/teachers/' } }))).status).toBe(200);
  });

  it('accepts Cell by Cell (cellbycell.app) as a site and an origin, with CORS for it', async () => {
    const response = await call(json({ ...valid, site: 'cellbycell.app', subjects: 'Computer applications' }, { origin: 'https://cellbycell.app' }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://cellbycell.app');
    expect(db.rows()).toHaveLength(1);
    expect(db.rows()[0]).toMatchObject({ site: 'cellbycell.app' });
    expect((await call(json({ ...valid, site: 'cellbycell.app', email: 'b@school.org' }, { origin: 'https://www.cellbycell.app' }))).status).toBe(200);
    const preflight = await call(new Request(URL_, { method: 'OPTIONS', headers: { Origin: 'https://cellbycell.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }));
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://cellbycell.app');
    // A look-alike host is still refused.
    expect(await body(await call(json({ ...valid, site: 'cellbycell.app' }, { origin: 'https://cellbycell.app.evil.example' })))).toEqual({ ok: false, error: 'bad_origin' });
  });

  it('honors an ALLOWED_SITES override', async () => {
    env.ALLOWED_SITES = 'kidscode.dev, classroomlabs.org';
    expect((await call(json({ ...valid, site: 'kidscode.dev' }, { origin: 'https://kidscode.dev' }))).status).toBe(200);
    expect(await body(await call(json(valid)))).toEqual({ ok: false, error: 'bad_origin' });
  });

  it('rate limits each client to 5 submissions per 10 minutes, keyed by a salted hash', async () => {
    for (let i = 0; i < 5; i++) expect((await call(json({ ...valid, email: `t${i}@school.org` }))).status).toBe(200);
    const sixth = await call(json({ ...valid, email: 't6@school.org' }));
    expect(sixth.status).toBe(429);
    expect(await body(sixth)).toEqual({ ok: false, error: 'rate_limited' });
    // Another client is not affected.
    expect((await call(json(valid, { ip: '192.0.2.44' }))).status).toBe(200);

    const limits = db.rows('SELECT * FROM rate_limits');
    expect(limits.map(row => row.ip_hash)).toContain(await hashIp('203.0.113.7', 'pepper'));
    expect(JSON.stringify(limits)).not.toContain('203.0.113.7');

    // Once the window has passed, the client may submit again.
    db.sqlite.exec(`UPDATE rate_limits SET window_start = window_start - ${11 * 60 * 1000}`);
    expect((await call(json({ ...valid, email: 't7@school.org' }))).status).toBe(200);
  });

  it('answers server_error and stores nothing when IP_HASH_SALT is missing', async () => {
    env.IP_HASH_SALT = undefined;
    const response = await call(json(valid));
    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({ ok: false, error: 'server_error' });
    expect(db.rows()).toHaveLength(0);
  });

  it('never logs the email, the token or the IP address', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    db.sqlite.exec('DROP TABLE signups');
    await call(json(valid));
    const printed = JSON.stringify([...log.mock.calls, ...(console.error as unknown as ReturnType<typeof vi.fn>).mock.calls]);
    expect(printed).not.toMatch(/rivera|token-123|203\.0\.113\.7/i);
  });
});

describe('POST /api/waitlist as a form (no JavaScript)', () => {
  it('stores the signup and 303-redirects to return with ?waitlist=ok, keeping the hash', async () => {
    const response = await call(form(formValid));
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://earthsciencelab.org/teachers/?waitlist=ok#teacher-plan');
    const rows = db.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'ms.rivera@school.edu', interests_json: '["class_results","answer_keys"]' });
  });

  it('accepts multipart form posts too', async () => {
    const data = new FormData();
    for (const [name, value] of Object.entries(formValid)) for (const item of [value].flat()) data.append(name, item);
    const request = new Request(URL_, { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': '203.0.113.9' }, body: data });
    const response = await call(request);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toContain('waitlist=ok');
    expect(db.rows()).toHaveLength(1);
  });

  it('appends the error code and keeps the existing query', async () => {
    const response = await call(form({ ...formValid, consent: '', return: 'https://classroomlabs.org/?ref=x#teacher-plan' }));
    expect(response.headers.get('Location')).toBe('https://classroomlabs.org/?ref=x&waitlist=consent_required#teacher-plan');
    const bad = await call(form({ ...formValid, email: 'nope', return: 'https://classroomlabs.org/?waitlist=ok' }));
    expect(bad.headers.get('Location')).toBe('https://classroomlabs.org/?waitlist=invalid_email');
  });

  it('only redirects to allowlisted https origins; otherwise to the site’s teachers page', async () => {
    const cases: [string, string, string][] = [
      ['https://evil.example/teachers/', 'earthsciencelab.org', 'https://earthsciencelab.org/teachers/?waitlist=ok'],
      ['http://earthsciencelab.org/teachers/', 'earthsciencelab.org', 'https://earthsciencelab.org/teachers/?waitlist=ok'],
      ['https://earthsciencelab.org.evil.example/', 'earthsciencelab.org', 'https://earthsciencelab.org/teachers/?waitlist=ok'],
      ['https://user:pw@earthsciencelab.org/', 'earthsciencelab.org', 'https://earthsciencelab.org/teachers/?waitlist=ok'],
      ['/teachers/', 'thephysicslab.org', 'https://thephysicslab.org/teachers/?waitlist=ok'],
      ['javascript:alert(1)', 'interactiveperiodictable.net', 'https://interactiveperiodictable.net/teachers?waitlist=ok'],
      ['', 'classroomlabs.org', 'https://classroomlabs.org/teachers/?waitlist=ok'],
      ['https://geometrylab.net/teachers/#teacher-plan', 'earthsciencelab.org', 'https://geometrylab.net/teachers/?waitlist=ok#teacher-plan'],
      ['https://cellbycell.app/teachers#teacher-plan', 'cellbycell.app', 'https://cellbycell.app/teachers?waitlist=ok#teacher-plan'],
      ['https://evil.example/', 'cellbycell.app', 'https://cellbycell.app/teachers?waitlist=ok'],
    ];
    let n = 0;
    for (const [target, site, expected] of cases) {
      const response = await call(form({ ...formValid, site, return: target }, { ip: `192.0.2.${++n}` }));
      expect(response.status, target).toBe(303);
      expect(response.headers.get('Location'), target).toBe(expected);
    }
  });

  it('redirects every error: bad origin, Turnstile and rate limit', async () => {
    let response = await call(form(formValid, { origin: 'https://evil.example' }));
    expect(response.headers.get('Location')).toBe('https://earthsciencelab.org/teachers/?waitlist=bad_origin#teacher-plan');
    siteverify.mockResolvedValueOnce(Response.json({ success: false }));
    response = await call(form(formValid));
    expect(response.headers.get('Location')).toContain('waitlist=turnstile_failed');
    for (let i = 0; i < 4; i++) await call(form(formValid));
    response = await call(form(formValid));
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toContain('waitlist=rate_limited');
  });

  it('honeypot redirects with ok and stores nothing', async () => {
    const response = await call(form({ ...formValid, website: 'spam' }));
    expect(response.headers.get('Location')).toContain('waitlist=ok');
    expect(db.rows()).toHaveLength(0);
  });
});

describe('CORS preflight', () => {
  const preflight = (origin: string) =>
    new Request(URL_, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });

  it('allows the allowlisted origins and their www hosts', async () => {
    for (const origin of ['https://thebiologylab.org', 'https://www.theastronomylab.com', 'https://classroomlabs.org']) {
      const response = await call(preflight(origin));
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toMatch(/content-type/i);
    }
  });

  it('refuses other origins', async () => {
    for (const origin of ['https://evil.example', 'http://thebiologylab.org', 'https://kidscode.dev']) {
      const response = await call(preflight(origin));
      expect(response.status).toBe(403);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
  });
});

describe('other routes', () => {
  it('GET /api/health answers ok', async () => {
    const response = await call(new Request('https://classroomlabs.org/api/health'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('answers 404 for unknown /api paths and other methods', async () => {
    for (const [method, path] of [['GET', '/api/'], ['GET', '/api/nope'], ['GET', '/api/waitlist'], ['DELETE', '/api/waitlist'], ['POST', '/api/health'], ['POST', '/api/export.csv']]) {
      const response = await call(new Request(`https://classroomlabs.org${path}`, { method }));
      expect(response.status, `${method} ${path}`).toBe(404);
    }
  });

  it('passes every other path to the static assets', async () => {
    const response = await call(new Request('https://classroomlabs.org/teachers/'));
    expect(await response.text()).toBe('page');
    expect(assets).toHaveBeenCalledOnce();
  });
});
