// Shared settings for the /api/* routes. The contract is docs/waitlist-contract.md.

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Turnstile secret key (Worker secret). */
  TURNSTILE_SECRET?: string;
  /** Salt for hashing client IP addresses in the rate limiter (Worker secret). */
  IP_HASH_SALT?: string;
  /** Cloudflare Access team domain, e.g. "yourteam.cloudflareaccess.com". Empty: /api/export.csv is 404. */
  TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application that protects /api/export.csv. */
  ACCESS_AUD?: string;
  /** Optional comma-separated override of the site allowlist. Empty: DEFAULT_SITES. */
  ALLOWED_SITES?: string;
}

export const DEFAULT_SITES = [
  'classroomlabs.org',
  'earthsciencelab.org',
  'interactiveperiodictable.net',
  'thebiologylab.org',
  'thephysicslab.org',
  'theastronomylab.com',
  'geometrylab.net',
  'cellbycell.app',
] as const;

export const ROLES = ['teacher', 'school_leader', 'district', 'other'] as const;
export const INTERESTS = ['class_results', 'editable_worksheets', 'answer_keys', 'quiz_banks', 'all_labs_licence'] as const;
export const SCHOOL_BUYS = ['yes', 'no', 'not_sure'] as const;
export const SOURCES = ['teachers_page', 'after_share', 'hub'] as const;

/** Submissions allowed per client in one window. */
export const RATE_LIMIT = 5;
export const RATE_WINDOW_MS = 10 * 60 * 1000;
/** Signups are deleted this many days after they were first made. */
export const RETENTION_DAYS = 365;
/** Largest request body accepted, in bytes. A full form is well under 2 KB. */
export const MAX_BODY_BYTES = 16 * 1024;

export function allowedSites(env: Pick<Env, 'ALLOWED_SITES'>): string[] {
  const custom = (env.ALLOWED_SITES ?? '')
    .split(',')
    .map(site => site.trim().toLowerCase())
    .filter(Boolean);
  return custom.length ? custom : [...DEFAULT_SITES];
}

/** Origins allowed to call the API: https://<site> and https://www.<site>. */
export function allowedOrigins(env: Pick<Env, 'ALLOWED_SITES'>): Set<string> {
  return new Set(allowedSites(env).flatMap(site => [`https://${site}`, `https://www.${site}`]));
}

const NO_TRAILING_SLASH = new Set(['interactiveperiodictable.net', 'cellbycell.app']);

/** Each site's teachers page, where a no-JavaScript post lands when `return` is missing or not allowed. */
export function teachersPage(site: string): string {
  // Interactive Periodic Table and Cell by Cell use URLs without a trailing slash; the other sites use one.
  return NO_TRAILING_SLASH.has(site) ? `https://${site}/teachers` : `https://${site}/teachers/`;
}
