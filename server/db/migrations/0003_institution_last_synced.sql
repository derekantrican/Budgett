-- When Budgett last finished syncing each institution (UTC, 'YYYY-MM-DD HH:MM:SS'). Core-owned,
-- unlike sync_state_json: snapshot-mode connectors (no cursor) use it to decide how far back
-- to fetch, and it's useful to show in the UI for every connector.
ALTER TABLE institutions ADD COLUMN last_synced_at TEXT;
