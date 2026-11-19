// Per-client rate limit in D1: a fixed window per salted SHA-256 hash of the client IP.
// The raw IP address is never stored or logged.
import { RATE_LIMIT, RATE_WINDOW_MS } from './config';

export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}\u0000${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Counts one submission for this client and returns true while it is within the limit.
 * One statement, so two requests at once cannot both read the old count.
 */
export async function allowSubmission(db: D1Database, ipHash: string, now = Date.now()): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (ip_hash, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (ip_hash) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start <= ?3 THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start <= ?3 THEN ?2 ELSE rate_limits.window_start END
       RETURNING count`,
    )
    .bind(ipHash, now, now - RATE_WINDOW_MS)
    .first<{ count: number }>();
  return (row?.count ?? Infinity) <= RATE_LIMIT;
}
