-- Generalize the Plaid-specific schema so other financial connectors (SimpleFIN, statement
-- import, ...) can share it. A row in `institutions` is one bank as Budgett sees it; which
-- connector feeds it is `provider`.
--
--   items                     -> institutions (+ provider; connector-owned credentials/sync state as JSON)
--     plaid_item_id           -> external_id        (the connector's key for this row; Plaid item_id)
--     plaid_access_token      -> credentials_json   ({"access_token": "..."} for Plaid)
--     transaction_cursor      -> sync_state_json    ({"cursor": "..."} for Plaid)
--     institution_name        -> name
--     institution_id          -> provider_institution_id (Plaid's ins_... id)
--     institution_color       -> color
--     institution_logo        -> logo
--   accounts.item_id          -> institution_id
--   accounts.plaid_account_id -> external_id
--   transactions.plaid_transaction_id   -> external_id
--   transactions.pending_transaction_id -> external_pending_id
--   transactions.plaid_category         -> provider_category
--   transactions.plaid_raw_json         -> raw_json

-- Rename first, so accounts' foreign key is rewritten to point at "institutions"...
ALTER TABLE items RENAME TO institutions;

-- ...then rebuild it with the new columns (the JSON columns can't come from a simple rename).
CREATE TABLE institutions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL, -- connector id, e.g. 'plaid'
  external_id TEXT NOT NULL, -- the connector's own id for this institution (Plaid item_id)
  credentials_json TEXT NOT NULL, -- connector-owned secret(s); never sent to the client
  name TEXT,
  provider_institution_id TEXT, -- the provider's id for the bank itself (Plaid ins_...)
  color TEXT,
  logo TEXT, -- base64 PNG
  display_name TEXT,
  display_icon_url TEXT,
  display_color TEXT,
  online_banking_url TEXT,
  sync_state_json TEXT, -- connector-owned sync checkpoint (Plaid cursor); never sent to the client
  status TEXT NOT NULL DEFAULT 'ok', -- ok, login_required, error
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, external_id)
);

INSERT INTO institutions_new (
  id, provider, external_id, credentials_json,
  name, provider_institution_id, color, logo,
  display_name, display_icon_url, display_color, online_banking_url,
  sync_state_json, status, created_at, updated_at
)
SELECT
  id, 'plaid', plaid_item_id, json_object('access_token', plaid_access_token),
  institution_name, institution_id, institution_color, institution_logo,
  display_name, display_icon_url, display_color, online_banking_url,
  CASE WHEN transaction_cursor IS NULL THEN NULL ELSE json_object('cursor', transaction_cursor) END,
  status, created_at, updated_at
FROM institutions;

DROP TABLE institutions;
ALTER TABLE institutions_new RENAME TO institutions;

ALTER TABLE accounts RENAME COLUMN item_id TO institution_id;
ALTER TABLE accounts RENAME COLUMN plaid_account_id TO external_id;

ALTER TABLE transactions RENAME COLUMN plaid_transaction_id TO external_id;
ALTER TABLE transactions RENAME COLUMN pending_transaction_id TO external_pending_id;
ALTER TABLE transactions RENAME COLUMN plaid_category TO provider_category;
ALTER TABLE transactions RENAME COLUMN plaid_raw_json TO raw_json;
