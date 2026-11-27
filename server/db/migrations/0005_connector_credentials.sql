-- Credentials that a connector holds above the institution level, for providers where one login
-- feeds several banks. SimpleFIN: one access URL (one SimpleFIN Bridge account) returns every bank
-- the user linked in Bridge, and each of those becomes its own row in `institutions`, pointing
-- back here via connector_credential_id. Plaid doesn't use this (an Item is one bank, so its
-- access token stays in institutions.credentials_json).
CREATE TABLE connector_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL, -- connector id, e.g. 'simplefin'
  credentials_json TEXT NOT NULL, -- connector-owned secret(s); never sent to the client
  sync_state_json TEXT, -- connector-owned state (e.g. SimpleFIN: banks the user deleted in Budgett)
  status TEXT NOT NULL DEFAULT 'ok', -- ok, login_required, error
  last_error TEXT,
  last_synced_at TEXT, -- UTC 'YYYY-MM-DD HH:MM:SS'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE institutions ADD COLUMN connector_credential_id INTEGER REFERENCES connector_credentials(id);
