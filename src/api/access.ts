// Cloudflare Access: verifies the Cf-Access-Jwt-Assertion header with WebCrypto (RS256).
// https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

interface Jwk extends JsonWebKey {
  kid?: string;
}

interface AccessConfig {
  teamDomain: string;
  aud: string;
}

/** The Access settings, or null when either is missing (the export route then answers 404). */
export function accessConfig(env: { TEAM_DOMAIN?: string; ACCESS_AUD?: string }): AccessConfig | null {
  const teamDomain = (env.TEAM_DOMAIN ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const aud = (env.ACCESS_AUD ?? '').trim();
  return teamDomain && aud ? { teamDomain, aud } : null;
}

const CACHE_MS = 10 * 60 * 1000;
let cached: { url: string; keys: Jwk[]; at: number } | null = null;

/** For tests: forget the cached signing keys. */
export function clearKeyCache() {
  cached = null;
}

async function signingKeys(teamDomain: string, refresh: boolean): Promise<Jwk[]> {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  if (!refresh && cached && cached.url === url && Date.now() - cached.at < CACHE_MS) return cached.keys;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`certs ${response.status}`);
  const { keys } = (await response.json()) as { keys?: Jwk[] };
  cached = { url, keys: Array.isArray(keys) ? keys : [], at: Date.now() };
  return cached.keys;
}

function base64UrlBytes(part: string): Uint8Array<ArrayBuffer> {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlJson(part: string): Record<string, unknown> {
  const value = JSON.parse(new TextDecoder().decode(base64UrlBytes(part)));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
  return value as Record<string, unknown>;
}

/** True only for a well-formed, unexpired RS256 token signed by the team's Access keys for this application. */
export async function verifyAccessJwt(token: string | null, config: AccessConfig, now = Date.now()): Promise<boolean> {
  if (!token || token.length > 8192) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const header = base64UrlJson(parts[0]);
    const payload = base64UrlJson(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false;

    let jwk = (await signingKeys(config.teamDomain, false)).find(key => key.kid === header.kid);
    // Access rotates its keys: one refresh when the key id is new to us.
    if (!jwk) jwk = (await signingKeys(config.teamDomain, true)).find(key => key.kid === header.kid);
    if (!jwk || jwk.kty !== 'RSA') return false;
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlBytes(parts[2]), signed))) return false;

    const seconds = now / 1000;
    const leeway = 60;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(config.aud)) return false;
    if (payload.iss !== `https://${config.teamDomain}`) return false;
    if (typeof payload.exp !== 'number' || payload.exp + leeway < seconds) return false;
    if (typeof payload.nbf === 'number' && payload.nbf - leeway > seconds) return false;
    return true;
  } catch {
    return false;
  }
}
