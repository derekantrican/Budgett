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
  type TEXT, -- checking, savings, credit, etc.
  subtype TEXT,
  mask TEXT, -- last 4 digits
  current_balance REAL,
  available_balance REAL,
  online_banking_url TEXT,
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
  include_in_summary INTEGER NOT NULL DEFAULT 1,
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
  is_hidden INTEGER NOT NULL DEFAULT 0, -- gift hiding (future)
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
  amount REAL NOT NULL,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

-- Webhook Payloads (raw Plaid webhook storage)
CREATE TABLE IF NOT EXISTS webhook_payloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  type TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

-- App Settings (key-value configuration)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default settings
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('date_format', 'MMM D, YYYY');
