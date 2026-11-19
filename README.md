# Classroom Labs

The home of the Classroom Labs series at **https://classroomlabs.org**: a small static site that introduces the
eight free labs (Interactive Periodic Table, Physics Lab, Biology Lab, Earth Science Lab, Astronomy Lab, Geometry
Lab, KidsCode and Fiction & Fact Library) and the coming teacher plan, plus the **teacher-plan waitlist API** that
every lab's form posts to.

One Cloudflare Worker (`classroom-labs`) serves both:

| Path | Served by |
| --- | --- |
| `/api/*` | `src/worker.ts` → `src/api/` (the waitlist API, D1) |
| `/` and `/teachers/` | `src/worker.ts` → `src/notice.ts`: the static page, plus the result message of a no-JavaScript form post |
| everything else | static files in `dist/` (Workers static assets), never touching the Worker |

## Pages

| URL | Title |
| --- | --- |
| `/` | Classroom Labs: Free Interactive Labs for Every Classroom |
| `/teachers/` | For Teachers: Free Labs, Activities and Answer Keys |
| `/about/` | About Classroom Labs: Free Learning Sites for Class |
| `/privacy/` | Privacy Policy \| Classroom Labs |
| `/contact/` | Contact Classroom Labs |
| 404 | Page Not Found \| Classroom Labs (noindex) |

The lab cards come from `src/lib/labs.mjs`. Names, colors, marks and home URLs come from `src/lib/learning-apps.mjs`
(a copy of the list every lab carries; keep it in sync). What each card says (what students do, grade band, main
tools, teachers page) was checked against each lab's own pages; check the lab again before changing it. Every lab
link must be the lab's canonical URL: Interactive Periodic Table has no trailing slash, the other labs do.
`npm run check` fails on any other link to a lab. KidsCode's pages could not be checked when the hub was built, so
its card uses only its home page and the description from `learning-apps.mjs`, with no grade band or tools.

Copy rules: only what is true, American spelling, no em dashes, no usage numbers, school names, testimonials, prices
or dates. `npm run check` catches em dashes and "licence" in page copy.

## Develop

Node 22.23 or newer (`.nvmrc`).

```sh
npm install
npm run dev            # Astro dev server for the pages (no API)
npm test               # API tests and site tests (vitest)
npm run build          # static pages into dist/
npm run check          # post-build checks on dist/
npm run typecheck      # astro check + tsc for the Worker
```

To run the pages and the API together, locally, against a local D1:

```sh
cp .dev.vars.example .dev.vars           # Turnstile test secret + a local salt
npm run db:migrate:local
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
npx wrangler dev
```

`1x00000000000000000000AA` (site key) and `1x0000000000000000000000000000000AA` (secret) are Turnstile's test keys:
every token passes.

After changing titles, descriptions or the lab list: `npm run build && npm run llms && npm run build` (regenerates
`public/llms.txt`). After changing the look of the card or the labs: `npm run og-image` (Playwright, not a
dependency; see the script).

### Build settings (`.env.example`)

| Variable | Empty (default) | Set |
| --- | --- | --- |
| `PUBLIC_GA_ID` | no Google tag, no cookies, no cookie banner | GA4 tag behind Consent Mode, banner for EEA/UK/CH |
| `PUBLIC_TURNSTILE_SITE_KEY` | the Teacher plan section shows the pitch but no form | the waitlist form and the Turnstile script (only on `/` and `/teachers/`) |
| `PUBLIC_CONTACT_EMAIL` | contact page says the address is being set up | shown on the contact, about and privacy pages and in the footer |

## Analytics events

GA4, only when `PUBLIC_GA_ID` is set, behind the same Consent Mode defaults and banner as the labs
(`src/components/ConsentDefaults.astro`, `ConsentBanner.astro`). Never an email address or free text.

| Event | Parameters | When |
| --- | --- | --- |
| `waitlist_signup` | `site`, `role`, `source` | the waitlist form was accepted (JavaScript path) |
| `lab_click` | `lab` (`chemistry`, `physics`, `biology`, `earth`, `astronomy`, `geometry`, `kids`, `reading`) | any link to a lab |

## The waitlist API

The contract shared with the labs is [`docs/waitlist-contract.md`](docs/waitlist-contract.md). Do not change it on
one side only.

- `POST /api/waitlist`: JSON (fetch) or a form post (`application/x-www-form-urlencoded`, also multipart).
  Order of checks: origin (CORS allowlist: `https://<site>` and `https://www.<site>` for the seven sites, plus the
  Worker's own origin) → body → honeypot (`website` filled: answer ok, store nothing) → validation → rate limit →
  Turnstile (`siteverify` with `TURNSTILE_SECRET` and the client IP) → upsert on `(email, site)`. JSON gets
  `200 {"ok":true}` or `4xx {"ok":false,"error":…}`; a form post gets a `303` to `return` (only an https URL on an
  allowlisted origin, otherwise the site's teachers page) with `?waitlist=<result>`. A missing `IP_HASH_SALT`
  answers `500 server_error` (a deploy mistake, not in the contract). `OPTIONS` answers the preflight.
- `GET /api/health`: `200 ok`.
- `GET /api/export.csv`: every signup as CSV (UTF-8 with BOM, formula-looking cells prefixed with `'`), only with a
  valid Cloudflare Access token (`Cf-Access-Jwt-Assertion`, RS256, checked against
  `https://<TEAM_DOMAIN>/cdn-cgi/access/certs`, `aud` = `ACCESS_AUD`, `iss`, `exp`, `nbf`). 404 while
  `TEAM_DOMAIN` or `ACCESS_AUD` is empty; 403 for a missing or bad token.
- Anything else under `/api/` is 404. Nothing logs an email address, a token or an IP address.
- **Rate limit**: 5 submissions per client per 10 minutes, counted in D1 under a salted SHA-256 of the IP
  (`IP_HASH_SALT`), never the IP itself.
- **Retention**: a daily Cron Trigger (03:17 UTC) deletes signups whose `created_at` is more than 365 days old and
  rate-limit windows that have ended. A repeat signup updates the answers but keeps `created_at`.
- **Schema**: `migrations/0001_init.sql` (`signups` with `UNIQUE(email, site)`, and `rate_limits`).

Tests (`tests/api/`) run the Worker's handlers in Node against a D1 stand-in over `node:sqlite` with the real
migration, with `fetch` mocked for Turnstile and the Access certs: valid JSON and form signups, upsert, honeypot,
every validation error, Turnstile failures, bad origins, CORS preflight, rate limit, 303 targets, export (404, bad
tokens, a valid token), CSV escaping, retention, the cron handler and the no-JavaScript message routing.
Site tests (`tests/site/`) check the lab data and render the form with the Astro container.

## Set up in Cloudflare and Google Analytics (owner, in this order)

1. **D1**: `npx wrangler d1 create classroom-labs` (or Dashboard → Storage & Databases → D1 → Create, named
   `classroom-labs`). Put the printed `database_id` in `wrangler.jsonc` in place of the all-zero placeholder and
   commit it.
2. **Migration**: `npm run db:migrate:remote` (`wrangler d1 migrations apply classroom-labs --remote`).
3. **Turnstile**: Dashboard → Turnstile → Add widget. Hostnames: `classroomlabs.org`, `earthsciencelab.org`,
   `interactiveperiodictable.net`, `thebiologylab.org`, `thephysicslab.org`, `theastronomylab.com`,
   `geometrylab.net`. Mode: Managed. The **site key** goes into `PUBLIC_TURNSTILE_SITE_KEY` here and in each lab's
   build settings; the **secret key** goes into step 4.
4. **Secrets** (never in the repo or in chat), from this folder:
   `npx wrangler secret put TURNSTILE_SECRET` (the Turnstile secret key) and
   `npx wrangler secret put IP_HASH_SALT` (any long random string, e.g. `openssl rand -hex 32`).
5. **Workers Builds**: Workers & Pages → Create → Import a repository → this repository. Build command
   `npm run build`, deploy command `npx wrangler deploy`. Under Settings → Build → Variables, add
   `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_CONTACT_EMAIL` and, after step 8, `PUBLIC_GA_ID`; then redeploy.
6. **Domain**: Worker → Settings → Domains & Routes → add the custom domain `classroomlabs.org` (and
   `www.classroomlabs.org` with a redirect to the apex if wanted). On the zone, turn on SSL/TLS → Edge
   Certificates → **Always Use HTTPS**. Check `https://classroomlabs.org/api/health` answers `ok`.
7. **Export behind Access**: Zero Trust → Access → Applications → Add → Self-hosted, domain
   `classroomlabs.org`, path `api/export.csv`, identity provider Google, policy "Allow" for the owner's email.
   Copy the application's **AUD tag** into `ACCESS_AUD` and the team domain (`<team>.cloudflareaccess.com`) into
   `TEAM_DOMAIN` in `wrangler.jsonc` → `vars` (they are not secrets), commit, deploy. Until both are set,
   `/api/export.csv` is 404.
8. **Google Analytics** (optional): create a GA4 property and a web data stream for `https://classroomlabs.org`,
   copy the measurement ID (`G-…`) into `PUBLIC_GA_ID`, redeploy. In GA, register `lab` and `role`, `site`,
   `source` as event-scoped custom dimensions to see them in reports.
9. Turn on the labs' forms: set `PUBLIC_WAITLIST_ENDPOINT=https://classroomlabs.org/api/waitlist` and
   `PUBLIC_TURNSTILE_SITE_KEY` in each lab's build settings.
10. Submit `https://classroomlabs.org/sitemap-index.xml` in Google Search Console and Bing Webmaster Tools.

## Privacy

We store the email and answers to contact the teacher about the teacher plan; Cloudflare stores and processes it
(D1, Turnstile); signups are deleted 12 months after they were made (sooner on request: email the contact address
on the site); no student data is collected. The IP address is only kept as a salted hash, for at most a day, for
the rate limit. The privacy page (`/privacy/`) says the same.

**Deleting one person's data** (replace the address; `--remote` for production):

```sh
npx wrangler d1 execute classroom-labs --remote --command "DELETE FROM signups WHERE email = lower('teacher@example.org')"
```

To see what is held first, use `SELECT * FROM signups WHERE email = lower('teacher@example.org')`.

## Fonts

Headings are Fraunces (700) and text is Atkinson Hyperlegible, from Google Fonts with `display=swap`. `global.css`
defines local fallback faces with `size-adjust` so text keeps its line breaks when the web fonts arrive: Arial for
Atkinson Hyperlegible (98.5% regular, 98.9% italic, 99.6% bold) and Georgia (96.8%) or Times New Roman (115.6%) for
Fraunces. The values are the web font's width divided by the local font's, measured in Chromium on this site's
own headings and text, against Liberation Sans and Liberation Serif (Arial's and Times New Roman's widths) and
Gelasio (Georgia's widths). If a font or a weight changes, measure again.

## Headers

`public/_headers` sets HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, a minimal `Permissions-Policy` and
long immutable caching for `/_astro/*`. They also apply to `/` and `/teachers/`, which the Worker serves from the
assets binding.
