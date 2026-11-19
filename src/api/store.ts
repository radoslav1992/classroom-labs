// D1 queries for signups: upsert, export and retention.
import { RATE_WINDOW_MS, RETENTION_DAYS } from './config';
import type { Signup } from './validate';

/** Adds a signup, or updates the answers of an existing (email, site) pair. created_at is kept. */
export async function upsertSignup(db: D1Database, signup: Signup, now = new Date()): Promise<void> {
  const at = now.toISOString();
  await db
    .prepare(
      `INSERT INTO signups (email, role, subjects, grades, interests_json, school_buys, site, source, consent_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?9)
       ON CONFLICT (email, site) DO UPDATE SET
         role = excluded.role,
         subjects = excluded.subjects,
         grades = excluded.grades,
         interests_json = excluded.interests_json,
         school_buys = excluded.school_buys,
         source = excluded.source,
         consent_at = excluded.consent_at,
         updated_at = excluded.updated_at`,
    )
    .bind(signup.email, signup.role, signup.subjects, signup.grades, JSON.stringify(signup.interests), signup.school_buys, signup.site, signup.source, at)
    .run();
}

export interface SignupRow {
  email: string;
  role: string;
  subjects: string | null;
  grades: string | null;
  interests_json: string;
  school_buys: string;
  site: string;
  source: string;
  consent_at: string;
  created_at: string;
  updated_at: string;
}

export async function allSignups(db: D1Database): Promise<SignupRow[]> {
  const { results } = await db
    .prepare('SELECT email, role, subjects, grades, interests_json, school_buys, site, source, consent_at, created_at, updated_at FROM signups ORDER BY created_at, id')
    .all<SignupRow>();
  return results;
}

/** Deletes signups made more than RETENTION_DAYS ago and rate-limit windows that have ended. */
export async function runRetention(db: D1Database, now = new Date()): Promise<{ signups: number; rateLimits: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [signups, rateLimits] = await db.batch([
    db.prepare('DELETE FROM signups WHERE created_at < ?1').bind(cutoff),
    db.prepare('DELETE FROM rate_limits WHERE window_start <= ?1').bind(now.getTime() - RATE_WINDOW_MS),
  ]);
  return { signups: signups.meta.changes ?? 0, rateLimits: rateLimits.meta.changes ?? 0 };
}
