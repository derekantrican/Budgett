-- Budgett SQLite Schema

PRAGMA foreign_keys = ON;

-- Plaid Items (linked institutions)
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plaid_item_id TEXT NOT NULL UNIQUE,
  plaid_access_token TEXT NOT NULL,
  institution_name TEXT,
  institution_id TEXT,
  institution_color TEXT,
  institution_logo TEXT,
  display_name TEXT,
  display_icon_url TEXT,
  online_banking_url TEXT,
  transaction_cursor TEXT,
  status TEXT NOT NULL DEFAULT 'ok', -- ok, login_required, error
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Accounts (replaces "payment methods")
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  plaid_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  official_name TEXT,
  display_name TEXT,
  type TEXT, -- checking, savings, credit, etc.
  subtype TEXT,
  mask TEXT, -- last 4 digits
  current_balance REAL,
  available_balance REAL,
  online_banking_url TEXT,
  hide_from_transactions INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0, -- soft delete for historical display
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT,
  budgeted_amount_expression TEXT, -- formula like "125 * sundays" or plain number
  reset_on_new_month INTEGER NOT NULL DEFAULT 1,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plaid_transaction_id TEXT UNIQUE,
  pending_transaction_id TEXT,
  account_id INTEGER REFERENCES accounts(id),
  group_id TEXT, -- for grouping multiple Plaid txns into one logical entry
  date TEXT NOT NULL,
  merchant TEXT,
  amount REAL NOT NULL, -- negative = expense, positive = income
  is_pending INTEGER NOT NULL DEFAULT 0,
  is_removed INTEGER NOT NULL DEFAULT 0, -- soft delete (Plaid removed)
  is_hidden INTEGER NOT NULL DEFAULT 0, -- hidden from main views (auth charges, transfers)
  is_auth INTEGER NOT NULL DEFAULT 0, -- auth charge (auto-delete when both removed)
  is_transfer INTEGER NOT NULL DEFAULT 0, -- account transfer
  linked_transaction_id INTEGER REFERENCES transactions(id), -- paired counterpart
  matched_manual_id INTEGER REFERENCES transactions(id), -- links Plaid txn to manual
  notes TEXT, -- user-provided notes
  plaid_category TEXT, -- Plaid's own category (raw)
  plaid_raw_json TEXT, -- full Plaid transaction object for debugging
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Transaction Splits (user-assigned categories/notes per transaction)
CREATE TABLE IF NOT EXISTS transaction_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  category_id INTEGER REFERENCES categories(id),
  amount REAL NOT NULL, -- resolved numeric value; always kept in sync with amount_formula when one is set
  amount_formula TEXT, -- raw formula text (e.g. "=CEILING(amount/2, 0.01)"), preserved so it can be edited again later
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Income Sources
CREATE TABLE IF NOT EXISTS income_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- salary, hourly, commission
  amount REAL, -- annual salary, hourly rate, or per-commission
  pay_period TEXT, -- weekly, biweekly, twice_monthly, monthly
  adjustments_json TEXT, -- JSON array of {name, amount OR percentage}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rules (auto-categorization)
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL, -- regex pattern to match merchant name
  condition TEXT, -- optional condition like "{AMOUNT} % 30 = 0"
  category_id INTEGER REFERENCES categories(id),
  merchant_template TEXT, -- output merchant name (can use {DATE}, {AMOUNT})
  notes_template TEXT, -- output notes
  amount_expression TEXT, -- optional amount formula like "=CEILING({AMOUNT}/2, 0.01)"
  payment_method TEXT, -- output payment method/account name
  is_split INTEGER NOT NULL DEFAULT 0, -- if true, this rule produces multiple splits
  split_json TEXT, -- JSON array of split definitions
  expires_at TEXT, -- nullable, self-destruct date
  is_auto_created INTEGER NOT NULL DEFAULT 0, -- created automatically from repeated manual renames, not by the user
  is_disabled INTEGER NOT NULL DEFAULT 0, -- turned off without deleting; also prevents an auto-created rule from being re-created
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Log of manual merchant renames (old -> new), used to detect repeated renames
-- and auto-create a Rule once the same fuzzy-matched rename happens often enough.
CREATE TABLE IF NOT EXISTS merchant_rename_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER REFERENCES transactions(id),
  original_merchant TEXT NOT NULL,
  new_merchant TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Log of manual merchant -> category assignments, used the same way as
-- merchant_rename_log but for auto-creating (or extending) a Rule's category_id.
CREATE TABLE IF NOT EXISTS merchant_category_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER REFERENCES transactions(id),
  merchant TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notification Endpoints (generalized webhooks)
CREATE TABLE IF NOT EXISTS notification_endpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  body_template TEXT, -- template with {{variable}} placeholders
  event_types_json TEXT, -- JSON array of event types to subscribe to
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  level TEXT NOT NULL DEFAULT 'info', -- info, warn, error
  action TEXT NOT NULL,
  detail TEXT
);

-- Webhook Payloads (incoming from Plaid + outgoing notifications)
CREATE TABLE IF NOT EXISTS webhook_payloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  direction TEXT NOT NULL DEFAULT 'incoming', -- 'incoming' or 'outgoing'
  type TEXT NOT NULL,
  destination TEXT, -- URL for outgoing, null for incoming
  raw_json TEXT NOT NULL
);

-- Planning tab views (user-added views like Loan Amortization, Retirement, etc.)
CREATE TABLE IF NOT EXISTS planning_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- e.g. 'loan_amortization'
  name TEXT NOT NULL,
  config_json TEXT, -- JSON blob of view-type-specific configuration
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- App Settings (key-value configuration)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default settings
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('date_format', 'MMM D, YYYY');
