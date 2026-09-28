-- Migration number: 0001 	 2026-09-28
-- Initial schema: links, scans, salts, rate_limits.
-- Timestamps are ISO-8601 UTC strings; booleans are INTEGER 0/1.

CREATE TABLE links (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  target_url  TEXT NOT NULL,
  label       TEXT,
  secret_hash TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE scans (
  id              INTEGER PRIMARY KEY,
  link_id         INTEGER NOT NULL REFERENCES links (id) ON DELETE CASCADE,
  scanned_at      TEXT NOT NULL,
  country         TEXT,
  region          TEXT,
  city            TEXT,
  timezone        TEXT,
  as_organization TEXT,
  device_type     TEXT NOT NULL DEFAULT 'other',
  os              TEXT,
  browser         TEXT,
  language        TEXT,
  is_bot          INTEGER NOT NULL DEFAULT 0,
  visitor_hash    TEXT NOT NULL
);

CREATE INDEX idx_scans_link_time ON scans (link_id, scanned_at);

CREATE TABLE salts (
  day  TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);

CREATE TABLE rate_limits (
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
