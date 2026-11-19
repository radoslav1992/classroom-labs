// Server-side check of a Cloudflare Turnstile token.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** True only when Cloudflare confirms the token. A missing secret, a network error or a timeout all fail. */
export async function verifyTurnstile(token: unknown, secret: string | undefined, ip: string | null): Promise<boolean> {
  if (!secret || typeof token !== 'string' || !token || token.length > 2048) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const response = await fetch(SITEVERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
