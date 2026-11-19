import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../src/worker';
import { clearKeyCache } from '../../src/api/access';
import type { Env } from '../../src/api/config';
import { csvField, signupsCsv } from '../../src/api/csv';
import { runRetention, upsertSignup } from '../../src/api/store';
import { FakeD1 } from './d1';

const TEAM = 'classroomlabs.cloudflareaccess.com';
const AUD = 'aud-1234567890';
const EXPORT = 'https://classroomlabs.org/api/export.csv';

let keys: CryptoKeyPair;
let otherKeys: CryptoKeyPair;
let jwks: { keys: JsonWebKey[] };
let db: FakeD1;
let env: Env;
let certs: ReturnType<typeof vi.fn>;

const b64url = (data: string | ArrayBuffer) =>
  Buffer.from(typeof data === 'string' ? Buffer.from(data) : new Uint8Array(data)).toString('base64url');

async function jwt(claims: Record<string, unknown>, { key = keys.privateKey, kid = 'key-1', alg = 'RS256' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, email: 'owner@example.com', iat: now, nbf: now, exp: now + 600, ...claims }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(signature)}`;
}

const algorithm = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])) as CryptoKeyPair;
  otherKeys = (await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  jwks = { keys: [{ ...publicJwk, kid: 'key-1', alg: 'RS256', use: 'sig' } as JsonWebKey] };
});

beforeEach(() => {
  clearKeyCache();
  db = new FakeD1();
  env = { DB: db.asD1(), ASSETS: {} as Fetcher, TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, IP_HASH_SALT: 's', TURNSTILE_SECRET: 't' };
  certs = vi.fn(async () => Response.json(jwks));
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `https://${TEAM}/cdn-cgi/access/certs`) return certs();
    throw new Error(`unexpected fetch ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const get = (token?: string) =>
  worker.fetch(new Request(EXPORT, { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} }) as never, env, {} as ExecutionContext);

const signup = {
  email: 'a@school.org',
  role: 'teacher' as const,
  subjects: 'Physics, "AP" level',
  grades: '=1+2',
  interests: ['class_results' as const, 'quiz_banks' as const],
  school_buys: 'yes' as const,
  site: 'thephysicslab.org',
  source: 'teachers_page' as const,
};

describe('GET /api/export.csv', () => {
  it('is 404 while TEAM_DOMAIN or ACCESS_AUD is unset', async () => {
    for (const change of [{ TEAM_DOMAIN: '' }, { ACCESS_AUD: '' }, { TEAM_DOMAIN: undefined, ACCESS_AUD: undefined }]) {
      Object.assign(env, change);
      expect((await get(await jwt({}))).status).toBe(404);
      env.TEAM_DOMAIN = TEAM;
      env.ACCESS_AUD = AUD;
    }
    expect(certs).not.toHaveBeenCalled();
  });

  it('returns every signup as CSV with a BOM for a valid Access token', async () => {
    await upsertSignup(db.asD1(), signup, new Date('2026-11-01T10:00:00Z'));
    await upsertSignup(db.asD1(), { ...signup, email: 'b@school.org', subjects: null, grades: null, interests: [] }, new Date('2026-11-02T10:00:00Z'));
    const response = await get(await jwt({}));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename="waitlist-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = (await response.text()).replace(/^﻿/, '');
    expect(text.split('\r\n')).toEqual([
      'email,role,subjects,grades,interests,school_buys,site,source,consent_at,created_at,updated_at',
      'a@school.org,teacher,"Physics, ""AP"" level",\'=1+2,class_results; quiz_banks,yes,thephysicslab.org,teachers_page,2026-11-01T10:00:00.000Z,2026-11-01T10:00:00.000Z,2026-11-01T10:00:00.000Z',
      'b@school.org,teacher,,,,yes,thephysicslab.org,teachers_page,2026-11-02T10:00:00.000Z,2026-11-02T10:00:00.000Z,2026-11-02T10:00:00.000Z',
      '',
    ]);
  });

  it('accepts a team domain written as a URL and a string aud', async () => {
    env.TEAM_DOMAIN = `https://${TEAM}/`;
    expect((await get(await jwt({ aud: AUD }))).status).toBe(200);
  });

  it('rejects a missing, malformed, expired, foreign or forged token with 403', async () => {
    const now = Math.floor(Date.now() / 1000);
    const tokens = [
      undefined,
      'not.a.jwt',
      'a.b',
      await jwt({ exp: now - 3600 }),
      await jwt({ nbf: now + 3600 }),
      await jwt({ aud: ['another-app'] }),
      await jwt({ iss: 'https://evil.cloudflareaccess.com' }),
      await jwt({}, { key: otherKeys.privateKey }),
      await jwt({}, { kid: 'unknown-key' }),
      await jwt({}, { alg: 'HS256' }),
    ];
    for (const token of tokens) {
      const response = await get(token);
      expect(response.status, String(token)).toBe(403);
      expect(await response.text()).toBe('Forbidden');
    }
    // A token whose payload was edited after signing.
    const good = await jwt({});
    const [h, , s] = good.split('.');
    const edited = `${h}.${b64url(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, exp: now + 9999, email: 'x@evil.example' }))}.${s}`;
    expect((await get(edited)).status).toBe(403);
  });

  it('refuses when the certs cannot be fetched', async () => {
    certs.mockResolvedValue(new Response('down', { status: 500 }));
    expect((await get(await jwt({}))).status).toBe(403);
  });

  it('caches the signing keys and refreshes once for an unknown key id', async () => {
    await get(await jwt({}));
    await get(await jwt({}));
    expect(certs).toHaveBeenCalledTimes(1);
    await get(await jwt({}, { kid: 'rotated' }));
    expect(certs).toHaveBeenCalledTimes(2);
  });
});

describe('CSV escaping', () => {
  it('quotes commas, quotes and line breaks, and defuses formulas', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField(null)).toBe('');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-2')).toBe("'-2");
    expect(csvField('@sum')).toBe("'@sum");
    expect(csvField('Grades 6–8, ciencias')).toBe('"Grades 6–8, ciencias"');
  });

  it('writes a header even with no rows', () => {
    expect(signupsCsv([])).toBe('﻿email,role,subjects,grades,interests,school_buys,site,source,consent_at,created_at,updated_at\r\n');
  });
});

describe('retention', () => {
  it('deletes only signups made more than 365 days ago, and ended rate-limit windows', async () => {
    const now = new Date('2026-11-19T03:17:00Z');
    const day = 24 * 60 * 60 * 1000;
    await upsertSignup(db.asD1(), { ...signup, email: 'old@school.org' }, new Date(now.getTime() - 366 * day));
    await upsertSignup(db.asD1(), { ...signup, email: 'edge@school.org' }, new Date(now.getTime() - 364 * day));
    await upsertSignup(db.asD1(), { ...signup, email: 'new@school.org' }, new Date(now.getTime() - day));
    // A repeat signup does not restart the clock: retention counts from the first signup.
    await upsertSignup(db.asD1(), { ...signup, email: 'old@school.org', role: 'other' }, new Date(now.getTime() - 10 * day));
    db.sqlite.exec(`INSERT INTO rate_limits VALUES ('stale', ${now.getTime() - 11 * 60 * 1000}, 3), ('live', ${now.getTime() - 60 * 1000}, 2)`);

    expect(await runRetention(db.asD1(), now)).toEqual({ signups: 1, rateLimits: 1 });
    expect(db.rows().map(row => row.email).sort()).toEqual(['edge@school.org', 'new@school.org']);
    expect(db.rows('SELECT ip_hash FROM rate_limits').map(row => row.ip_hash)).toEqual(['live']);
  });

  it('runs from the scheduled handler', async () => {
    await upsertSignup(db.asD1(), { ...signup, email: 'old@school.org' }, new Date('2020-01-01T00:00:00Z'));
    const waits: Promise<unknown>[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await worker.scheduled({ scheduledTime: Date.parse('2026-11-19T03:17:00Z'), cron: '17 3 * * *' } as ScheduledController, env, {
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    } as unknown as ExecutionContext);
    await Promise.all(waits);
    expect(db.rows()).toHaveLength(0);
    expect(log).toHaveBeenCalledWith('[retention]', JSON.stringify({ signups: 1, rateLimits: 0 }));
    log.mockRestore();
  });
});
