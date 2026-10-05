-- Migration number: 0002 	 2026-10-05
-- Abuse reports sent by anyone through the web app's "Report a QR code" page.
-- No reporter identity is stored (the rate limiter only keeps a daily-salted IP hash).

CREATE TABLE abuse_reports (
  id         INTEGER PRIMARY KEY,
  link_id    INTEGER NOT NULL REFERENCES links (id) ON DELETE CASCADE,
  reason     TEXT NOT NULL CHECK (reason IN ('phishing', 'malware', 'spam', 'illegal', 'other')),
  details    TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_abuse_reports_link ON abuse_reports (link_id);
CREATE INDEX idx_abuse_reports_created ON abuse_reports (created_at);
