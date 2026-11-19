// Build-time settings from PUBLIC_* environment variables (see src/lib/site.mjs and .env.example).
const clean = (value: string | undefined) => (value ?? '').trim();

export const gaId = clean(import.meta.env.PUBLIC_GA_ID);
export const turnstileSiteKey = clean(import.meta.env.PUBLIC_TURNSTILE_SITE_KEY);
export const contactEmail = clean(import.meta.env.PUBLIC_CONTACT_EMAIL);
/** The waitlist form renders only once there is a Turnstile site key: the API refuses signups without a token. */
export const waitlistEnabled = Boolean(turnstileSiteKey);
