-- Migration number: 0003 	 2026-10-09
-- Operator blocks move to their own column. `status` now only holds the owner's choice
-- (active/disabled): a block no longer overwrites it, unblocking restores it, and owner
-- updates can be guarded atomically with `WHERE blocked_at IS NULL`.
-- 'blocked' stays allowed by the CHECK constraint (SQLite cannot alter it in place) but is
-- no longer written. Existing blocks keep their effect; their owner status was lost, so
-- it becomes 'active' (what unblocking used to restore).

ALTER TABLE links ADD COLUMN blocked_at TEXT;

UPDATE links SET blocked_at = updated_at, status = 'active' WHERE status = 'blocked';
