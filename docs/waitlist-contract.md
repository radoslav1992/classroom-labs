# Teacher-plan waitlist: shared contract (service ↔ lab sites)

Two pieces are built in parallel against this contract. Do not change it on one side only.

## Endpoint

`POST https://classroomlabs.org/api/waitlist`. The service is the `/api/*` part of the classroomlabs.org Worker
(repo `radoslav1992/classroom-labs`), which also serves the hub site. The lab sites read the endpoint from
`PUBLIC_WAITLIST_ENDPOINT` at build time (value `https://classroomlabs.org/api/waitlist` once live). Other routes:
`GET /api/health`, `GET /api/export.csv` (behind Cloudflare Access).

Accepts `application/x-www-form-urlencoded` (no-JavaScript form post) and `application/json` (fetch).

| Field | Rule |
| --- | --- |
| `email` | required, valid address, ≤ 254 chars, stored lowercased and trimmed |
| `role` | one of `teacher`, `school_leader`, `district`, `other` |
| `subjects` | optional free text ≤ 200 |
| `grades` | optional free text ≤ 100 |
| `interests` | zero or more of `class_results`, `editable_worksheets`, `answer_keys`, `quiz_banks`, `all_labs_licence` (repeated form field `interests`, or a JSON array) |
| `school_buys` | one of `yes`, `no`, `not_sure` |
| `site` | required, hostname in the allowlist: `classroomlabs.org`, `earthsciencelab.org`, `interactiveperiodictable.net`, `thebiologylab.org`, `thephysicslab.org`, `theastronomylab.com`, `geometrylab.net`, `cellbycell.app` |
| `source` | `teachers_page`, `after_share` or `hub` |
| `consent` | must be `yes` (unticked checkbox the teacher ticks; links the privacy page) |
| `cf-turnstile-response` | required Turnstile token, verified server-side |
| `website` | honeypot: must be empty; if filled, respond as success and store nothing |
| `return` | optional, for no-JS posts: absolute https URL whose origin is one of the allowlisted sites (`https://<site>`), otherwise ignored |

Responses:
- JSON request: `200 {"ok":true}` on success (also for a repeat signup: upsert, never reveal whether an email
  exists). Errors: `400 {"ok":false,"error":"invalid_email"|"invalid_field"|"consent_required"}`,
  `403 {"ok":false,"error":"turnstile_failed"|"bad_origin"}`, `429 {"ok":false,"error":"rate_limited"}`.
- Form request: `303` redirect to `return` with `?waitlist=ok` or `?waitlist=<error>` appended (fallback: the
  site's `/teachers` page). The sites show a message based on that query parameter.
- CORS: only the allowlisted origins (`https://<site>`, and `https://www.<site>`); `OPTIONS` preflight handled.

## Analytics (sites only)

`track('waitlist_signup', { site, role, source })` on success. Never the email or free text.

## Where the form appears (sites)

Only on the teachers page and as a small prompt after a "Share to Google Classroom" click that links to the
teachers page section (`#teacher-plan`). Never on student pages. The Turnstile script loads only on the teachers
page. If `PUBLIC_WAITLIST_ENDPOINT` or `PUBLIC_TURNSTILE_SITE_KEY` is empty, nothing renders (safe to merge before
the service exists), and the privacy page shows its waitlist paragraph only when the form is enabled.

## Privacy text (both sides must agree)

We store the email and answers to contact the teacher about the teacher plan; Cloudflare stores and processes it;
signups are deleted 12 months after they were made (sooner on request: email the contact address on the site);
no student data is collected.
