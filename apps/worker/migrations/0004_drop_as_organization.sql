-- Migration number: 0004 	 2026-10-09
-- Data minimization: the visitor's network operator (ISP) is no longer collected or
-- shown, so its column goes away with every value already stored.
-- Migrations run just before the new worker is deployed: for those few seconds, the old
-- worker cannot record scans (redirects keep working; the failure is only logged).

ALTER TABLE scans DROP COLUMN as_organization;
