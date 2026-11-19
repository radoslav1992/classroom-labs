-- Teacher-plan waitlist (contract: docs/waitlist-contract.md).
-- Signups: one row per (email, site); a repeat signup updates the row and keeps created_at.
-- Timestamps are ISO 8601 UTC strings (new Date().toISOString()), so they sort and compare as text.
CREATE TABLE signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,                -- trimmed and lowercased
  role TEXT NOT NULL CHECK (role IN ('teacher', 'school_leader', 'district', 'other')),
  subjects TEXT,                      -- free text, at most 200 characters
  grades TEXT,                        -- free text, at most 100 characters
  interests_json TEXT NOT NULL DEFAULT '[]',
  school_buys TEXT NOT NULL CHECK (school_buys IN ('yes', 'no', 'not_sure')),
  site TEXT NOT NULL,                 -- hostname of the site the form was on
  source TEXT NOT NULL CHECK (source IN ('teachers_page', 'after_share', 'hub')),
  consent_at TEXT NOT NULL,           -- when the consent box was last ticked
  created_at TEXT NOT NULL,           -- first signup; retention counts 365 days from here
  updated_at TEXT NOT NULL,
  UNIQUE (email, site)
);

CREATE INDEX signups_created_at ON signups (created_at);

-- Rate limiting: one fixed window per client. The key is a salted SHA-256 of the IP address, never the address.
CREATE TABLE rate_limits (
  ip_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,      -- Unix time in milliseconds
  count INTEGER NOT NULL
);

CREATE INDEX rate_limits_window_start ON rate_limits (window_start);
