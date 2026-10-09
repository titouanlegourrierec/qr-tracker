-- Migration number: 0005 	 2026-10-09
-- Read-only sharing: SHA-256 of an optional second key that opens the statistics but can
-- neither change nor delete the link. NULL while the owner has not created one.

ALTER TABLE links ADD COLUMN view_hash TEXT;
