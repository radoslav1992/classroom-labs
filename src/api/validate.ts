// Parses and validates a waitlist submission (docs/waitlist-contract.md).
import { INTERESTS, ROLES, SCHOOL_BUYS, SOURCES } from './config';

export type Role = (typeof ROLES)[number];
export type Interest = (typeof INTERESTS)[number];
export type SchoolBuys = (typeof SCHOOL_BUYS)[number];
export type Source = (typeof SOURCES)[number];

export interface Signup {
  email: string;
  role: Role;
  subjects: string | null;
  grades: string | null;
  interests: Interest[];
  school_buys: SchoolBuys;
  site: string;
  source: Source;
}

/** The submission as received: every field a string, except `interests`, which may repeat. */
export interface RawSubmission {
  email?: unknown;
  role?: unknown;
  subjects?: unknown;
  grades?: unknown;
  interests?: unknown;
  school_buys?: unknown;
  site?: unknown;
  source?: unknown;
  consent?: unknown;
  website?: unknown;
  return?: unknown;
  'cf-turnstile-response'?: unknown;
}

export type ValidationError = 'invalid_email' | 'invalid_field' | 'consent_required';

export type Validated = { ok: true; signup: Signup } | { ok: false; error: ValidationError };

const FIELDS = ['email', 'role', 'subjects', 'grades', 'school_buys', 'site', 'source', 'consent', 'website', 'return', 'cf-turnstile-response'] as const;

/** Reads a form post (urlencoded or multipart) into a RawSubmission. Unknown fields are ignored. */
export function fromForm(form: FormData): RawSubmission {
  const raw: Record<string, unknown> = {};
  for (const name of FIELDS) {
    const value = form.get(name);
    if (typeof value === 'string') raw[name] = value;
  }
  raw.interests = form.getAll('interests').filter(value => typeof value === 'string');
  return raw as RawSubmission;
}

/** Reads a JSON body into a RawSubmission, or null when it is not a JSON object. */
export function fromJson(body: unknown): RawSubmission | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as RawSubmission;
}

// No spaces, no control characters, one @, a dot in the domain, no dot at either end of either part.
const EMAIL = /^(?!\.)(?!.*\.\.)[^\s@"(),:;<>[\\\]]{1,64}(?<!\.)@(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || CONTROL.test(email) || !EMAIL.test(email)) return null;
  return email;
}

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : null;
}

/** Optional free text: trimmed, empty becomes null; undefined when too long or not text. */
function freeText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length > max || CONTROL.test(text)) return undefined;
  return text || null;
}

function interestList(value: unknown): Interest[] | null {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  const result: Interest[] = [];
  for (const item of list) {
    const interest = oneOf(INTERESTS, item);
    if (!interest) return null;
    if (!result.includes(interest)) result.push(interest);
  }
  return result;
}

/** True when the honeypot field has anything in it: the caller answers "ok" and stores nothing. */
export function isBot(raw: RawSubmission): boolean {
  return typeof raw.website === 'string' ? raw.website.trim() !== '' : raw.website !== undefined && raw.website !== null;
}

export function validate(raw: RawSubmission, sites: readonly string[]): Validated {
  const email = normalizeEmail(raw.email);
  if (!email) return { ok: false, error: 'invalid_email' };

  const role = oneOf(ROLES, raw.role);
  const subjects = freeText(raw.subjects, 200);
  const grades = freeText(raw.grades, 100);
  const interests = interestList(raw.interests);
  const school_buys = oneOf(SCHOOL_BUYS, raw.school_buys);
  const site = typeof raw.site === 'string' ? raw.site.trim().toLowerCase() : '';
  const source = oneOf(SOURCES, raw.source);
  if (!role || subjects === undefined || grades === undefined || !interests || !school_buys || !sites.includes(site) || !source) {
    return { ok: false, error: 'invalid_field' };
  }
  if (raw.consent !== 'yes') return { ok: false, error: 'consent_required' };

  return { ok: true, signup: { email, role, subjects, grades, interests, school_buys, site, source } };
}

/**
 * Where a no-JavaScript post is sent back to: `return` when it is an absolute https URL on one of the
 * allowlisted sites (https://<site>, exactly), otherwise null and the caller falls back to the teachers page.
 */
export function safeReturn(value: unknown, sites: readonly string[]): URL | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!sites.some(site => url.origin === `https://${site}`)) return null;
  return url;
}
