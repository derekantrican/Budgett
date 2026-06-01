const { getDb, saveDb } = require('./init');

// Helper: run a query that modifies data, returns { lastInsertRowid, changes }
function run(sql, params = []) {
  const db = getDbSync();
  db.run(sql, params);
  const result = db.exec("SELECT last_insert_rowid() as id, changes() as changes");
  saveDb();
  return {
    lastInsertRowid: result[0]?.values[0][0],
    changes: result[0]?.values[0][1],
  };
}

// Helper: get one row
function get(sql, params = []) {
  const db = getDbSync();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// Helper: get all rows
function all(sql, params = []) {
  const db = getDbSync();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Sync access to the db (must be initialized first)
let _db = null;
function getDbSync() {
  if (!_db) 
    throw new Error('Database not initialized. Call initQueries() first.');
  return _db;
}

async function initQueries() {
  _db = await getDb();
}

// --- Query functions ---

// Items
const createItem = (plaidItemId, accessToken, instName, instId) =>
  run('INSERT INTO items (plaid_item_id, plaid_access_token, institution_name, institution_id) VALUES (?, ?, ?, ?)',
    [plaidItemId, accessToken, instName, instId]);
const getAllItems = () =>
  all('SELECT * FROM items');
const getItemByPlaidId = (plaidItemId) =>
  get('SELECT * FROM items WHERE plaid_item_id = ?', [plaidItemId]);
const updateItemCursor = (cursor, itemId) => {
  run("UPDATE items SET transaction_cursor = ?, updated_at = datetime('now') WHERE id = ?", [cursor, itemId]);
};
const updateItemStatus = (status, itemId) => {
  run("UPDATE items SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, itemId]);
};

// Accounts
const createAccount = (itemId, plaidAcctId, name, officialName, type, subtype, mask, currentBal, availBal) =>
  run('INSERT INTO accounts (item_id, plaid_account_id, name, official_name, type, subtype, mask, current_balance, available_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [itemId, plaidAcctId, name, officialName, type, subtype, mask, currentBal, availBal]);
const getAccountsByItem = (itemId) =>
  all('SELECT * FROM accounts WHERE item_id = ? AND is_deleted = 0', [itemId]);
const getAllAccounts = () =>
  all('SELECT * FROM accounts WHERE is_deleted = 0');
const getAccountByPlaidId = (plaidAccountId) =>
  get('SELECT * FROM accounts WHERE plaid_account_id = ?', [plaidAccountId]);
const updateAccountBalance = (currentBal, availBal, id) => {
  run("UPDATE accounts SET current_balance = ?, available_balance = ?, updated_at = datetime('now') WHERE id = ?", [currentBal, availBal, id]);
};

// Transactions
const createTransaction = (plaidTxnId, pendingTxnId, accountId, date, merchant, amount, isPending, plaidCategory, rawJson) =>
  run('INSERT INTO transactions (plaid_transaction_id, pending_transaction_id, account_id, date, merchant, amount, is_pending, plaid_category, plaid_raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [plaidTxnId, pendingTxnId, accountId, date, merchant, amount, isPending, plaidCategory, rawJson]);
const getTransactionByPlaidId = (plaidTxnId) =>
  get('SELECT * FROM transactions WHERE plaid_transaction_id = ?', [plaidTxnId]);
const getTransactionByPendingId = (pendingId) =>
  get('SELECT * FROM transactions WHERE pending_transaction_id = ?', [pendingId]);
const getTransactionsByDateRange = (startDate, endDate) =>
  all(`SELECT t.*, a.name as account_name, ts.category_id, ts.notes as split_notes, ts.amount as split_amount, c.name as category_name
       FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
       LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
       LEFT JOIN categories c ON ts.category_id = c.id
       WHERE t.date >= ? AND t.date <= ? AND t.is_removed = 0 ORDER BY t.date ASC`, [startDate, endDate]);
const softRemoveTransaction = (plaidTxnId) => {
  run("UPDATE transactions SET is_removed = 1, updated_at = datetime('now') WHERE plaid_transaction_id = ?", [plaidTxnId]);
};
const restoreTransaction = (plaidTxnId) => {
  run("UPDATE transactions SET is_removed = 0, updated_at = datetime('now') WHERE plaid_transaction_id = ?", [plaidTxnId]);
};
const getIncompleteTransactions = () =>
  all(`SELECT t.*, a.name as account_name,
       (SELECT ts2.category_id FROM transaction_splits ts2 WHERE ts2.transaction_id = t.id LIMIT 1) as split_category_id,
       (SELECT c.name FROM transaction_splits ts2 JOIN categories c ON ts2.category_id = c.id WHERE ts2.transaction_id = t.id LIMIT 1) as category_name,
       CASE WHEN t.plaid_transaction_id IS NULL THEN 1 ELSE 0 END as missing_plaid_id,
       CASE WHEN t.merchant IS NULL OR t.merchant = '' THEN 1 ELSE 0 END as missing_merchant,
       CASE WHEN t.account_id IS NULL THEN 1 ELSE 0 END as missing_account,
       CASE WHEN NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id) THEN 1 ELSE 0 END as missing_category
     FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.is_removed = 0 AND (
       t.plaid_transaction_id IS NULL
       OR t.merchant IS NULL OR t.merchant = ''
       OR t.account_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
     )
     ORDER BY t.date DESC`);
const updateTransactionFromPending = (plaidTxnId, amount, merchant, date, plaidCategory, rawJson, id) => {
  run(`UPDATE transactions SET plaid_transaction_id = ?, pending_transaction_id = NULL, is_pending = 0,
       amount = ?, merchant = ?, date = ?, plaid_category = ?, plaid_raw_json = ?, updated_at = datetime('now') WHERE id = ?`,
  [plaidTxnId, amount, merchant, date, plaidCategory, rawJson, id]);
};
const updateTransactionPlaidData = (amount, merchant, date, plaidCategory, rawJson, plaidTxnId) => {
  run(`UPDATE transactions SET amount = ?, merchant = ?, date = ?, plaid_category = ?, plaid_raw_json = ?, updated_at = datetime('now')
       WHERE plaid_transaction_id = ?`, [amount, merchant, date, plaidCategory, rawJson, plaidTxnId]);
};

// Transaction Splits
const createSplit = (txnId, categoryId, amount, notes) =>
  run('INSERT INTO transaction_splits (transaction_id, category_id, amount, notes) VALUES (?, ?, ?, ?)',
    [txnId, categoryId, amount, notes]);
const getSplitsByTransaction = (txnId) =>
  all(`SELECT ts.*, c.name as category_name, c.color as category_color
       FROM transaction_splits ts LEFT JOIN categories c ON ts.category_id = c.id WHERE ts.transaction_id = ?`, [txnId]);
const deleteSplitsByTransaction = (txnId) => {
  run('DELETE FROM transaction_splits WHERE transaction_id = ?', [txnId]);
};

// Categories
const getAllCategories = () =>
  all('SELECT * FROM categories ORDER BY is_hidden ASC, sort_order ASC');
const createCategory = (name, color, expr, resetOnNew, sortOrder) =>
  run('INSERT INTO categories (name, color, budgeted_amount_expression, reset_on_new_month, sort_order) VALUES (?, ?, ?, ?, ?)',
    [name, color, expr, resetOnNew, sortOrder]);
const updateCategory = (name, color, expr, resetOnNew, sortOrder, id) => {
  run("UPDATE categories SET name = ?, color = ?, budgeted_amount_expression = ?, reset_on_new_month = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?",
    [name, color, expr, resetOnNew, sortOrder, id]);
};
const toggleCategoryHidden = (id, isHidden) => {
  run("UPDATE categories SET is_hidden = ?, updated_at = datetime('now') WHERE id = ?", [isHidden ? 1 : 0, id]);
};

// Rules
const getAllRules = () =>
  all(`SELECT r.*, c.name as category_name FROM rules r LEFT JOIN categories c ON r.category_id = c.id
      WHERE r.expires_at IS NULL OR r.expires_at > datetime('now') ORDER BY r.created_at DESC`);
const createRule = (pattern, categoryId, notesTemplate, expiresAt) =>
  run('INSERT INTO rules (pattern, category_id, notes_template, expires_at) VALUES (?, ?, ?, ?)',
    [pattern, categoryId, notesTemplate, expiresAt]);

// Logs
const createLog = (level, action, detail) =>
  run('INSERT INTO logs (level, action, detail) VALUES (?, ?, ?)', [level, action, detail]);
const getRecentLogs = (limit) =>
  all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?', [limit]);

// Webhook Payloads
const createWebhookPayload = (type, rawJson, direction = 'incoming', destination = null) =>
  run('INSERT INTO webhook_payloads (type, raw_json, direction, destination) VALUES (?, ?, ?, ?)', [type, rawJson, direction, destination]);
const getWebhookPayloads = (limit, direction = null) =>
  direction
    ? all('SELECT * FROM webhook_payloads WHERE direction = ? ORDER BY timestamp DESC LIMIT ?', [direction, limit])
    : all('SELECT * FROM webhook_payloads ORDER BY timestamp DESC LIMIT ?', [limit]);

// Notification Endpoints
const getAllEndpoints = () =>
  all('SELECT * FROM notification_endpoints');
const createEndpoint = (name, url, method, bodyTemplate, eventTypesJson) =>
  run('INSERT INTO notification_endpoints (name, url, method, body_template, event_types_json) VALUES (?, ?, ?, ?, ?)',
    [name, url, method, bodyTemplate, eventTypesJson]);

// Income Sources
const getAllIncome = () =>
  all('SELECT * FROM income_sources');
const createIncome = (name, type, amount, payPeriod, adjustmentsJson) =>
  run('INSERT INTO income_sources (name, type, amount, pay_period, adjustments_json) VALUES (?, ?, ?, ?, ?)',
    [name, type, amount, payPeriod, adjustmentsJson]);

// App Settings
const getSettings = () => all('SELECT key, value FROM app_settings');
const getSetting = (key) => {
  const row = get('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row ? row.value : null;
};
const setSetting = (key, value) =>
  run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, value]);

module.exports = {
  initQueries, run, get, all,
  // Items
  createItem, getAllItems, getItemByPlaidId, updateItemCursor, updateItemStatus,
  // Accounts
  createAccount, getAccountsByItem, getAllAccounts, getAccountByPlaidId, updateAccountBalance,
  // Transactions
  createTransaction, getTransactionByPlaidId, getTransactionByPendingId,
  getTransactionsByDateRange, softRemoveTransaction, restoreTransaction,
  getIncompleteTransactions, updateTransactionFromPending, updateTransactionPlaidData,
  // Splits
  createSplit, getSplitsByTransaction, deleteSplitsByTransaction,
  // Categories
  getAllCategories, createCategory, updateCategory, toggleCategoryHidden,
  // Rules
  getAllRules, createRule,
  // Logs
  createLog, getRecentLogs,
  // Webhooks
  createWebhookPayload, getWebhookPayloads,
  // Notifications
  getAllEndpoints, createEndpoint,
  // Income
  getAllIncome, createIncome,
  // Settings
  getSettings, getSetting, setSetting,
};
