const { getDb } = require('./init');

// Helper: run a query that modifies data, returns { lastInsertRowid, changes }
function run(sql, params = []) {
  const db = getDb();
  const result = db.prepare(sql).run(...params);
  return {
    lastInsertRowid: result.lastInsertRowid,
    changes: result.changes,
  };
}

// Helper: get one row
function get(sql, params = []) {
  const db = getDb();
  return db.prepare(sql).get(...params) || null;
}

// Helper: get all rows
function all(sql, params = []) {
  const db = getDb();
  return db.prepare(sql).all(...params);
}

function initQueries() {
  const db = getDb();
  // Migrations
  const migrations = [
    'ALTER TABLE accounts ADD COLUMN hide_from_transactions INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE accounts ADD COLUMN display_name TEXT',
    'ALTER TABLE items ADD COLUMN display_name TEXT',
    'ALTER TABLE items ADD COLUMN display_icon_url TEXT',
    `CREATE TABLE IF NOT EXISTS record_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      merchant TEXT,
      notes TEXT,
      category_id INTEGER REFERENCES categories(id),
      account_id INTEGER REFERENCES accounts(id),
      amount REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    "ALTER TABLE webhook_payloads ADD COLUMN direction TEXT NOT NULL DEFAULT 'incoming'",
    'ALTER TABLE webhook_payloads ADD COLUMN destination TEXT',
    'ALTER TABLE rules ADD COLUMN amount_condition TEXT',
    'ALTER TABLE rules ADD COLUMN rename_to TEXT',
    'ALTER TABLE transactions ADD COLUMN is_auth INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE transactions ADD COLUMN is_transfer INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE transactions ADD COLUMN linked_transaction_id INTEGER REFERENCES transactions(id)',
    'ALTER TABLE transaction_splits ADD COLUMN amount_formula TEXT',
    'ALTER TABLE rules ADD COLUMN is_auto_created INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE rules ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0',
    `CREATE TABLE IF NOT EXISTS merchant_rename_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER REFERENCES transactions(id),
      original_merchant TEXT NOT NULL,
      new_merchant TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS merchant_category_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER REFERENCES transactions(id),
      merchant TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'ALTER TABLE categories DROP COLUMN include_in_summary',
  ];
  for (const sql of migrations) {
    try {
      db.exec(sql);
    }
    catch (e) { /* column/table already exists */ }
  }

  // Assign random colors to categories that don't have one
  const palette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F1948A', '#82E0AA', '#F8C471', '#AED6F1', '#D2B4DE',
    '#A3E4D7', '#FAD7A0', '#D5DBDB', '#F9E79F', '#A9CCE3',
  ];
  const noColor = db.prepare("SELECT id FROM categories WHERE color IS NULL OR color = ''").all();
  for (const row of noColor) {
    const color = palette[Math.floor(Math.random() * palette.length)];
    db.prepare('UPDATE categories SET color = ? WHERE id = ?').run(color, row.id);
  }
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

const deleteItem = (itemId, deleteTransactions) => {
  const accounts = all('SELECT id FROM accounts WHERE item_id = ?', [itemId]);
  const accountIds = accounts.map(a => a.id);

  if (accountIds.length > 0) {
    const placeholders = accountIds.map(() => '?').join(',');
    if (deleteTransactions) {
      // Delete splits for transactions on these accounts
      run(`DELETE FROM transaction_splits WHERE transaction_id IN (SELECT id FROM transactions WHERE account_id IN (${placeholders}))`, accountIds);
      // Delete transactions
      run(`DELETE FROM transactions WHERE account_id IN (${placeholders})`, accountIds);
    }
    else {
      // Nullify account references so transactions are kept
      run(`UPDATE transactions SET account_id = NULL, updated_at = datetime('now') WHERE account_id IN (${placeholders})`, accountIds);
    }

    // Delete accounts
    run(`DELETE FROM accounts WHERE item_id = ?`, [itemId]);
  }

  // Delete the item
  run('DELETE FROM items WHERE id = ?', [itemId]);
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
const getAccountTransactionCount = (accountId) =>
  get('SELECT COUNT(*) as count FROM transactions WHERE account_id = ? AND is_removed = 0', [accountId]).count;

// Called when an account is deselected via Plaid Link update mode (account is no longer
// accessible, so there's nothing to re-sync — only local cleanup is needed).
const removeAccounts = (accountIds, deleteTransactions) => {
  if (accountIds.length === 0) {
    return;
  }

  const placeholders = accountIds.map(() => '?').join(',');
  if (deleteTransactions) {
    run(`DELETE FROM transaction_splits WHERE transaction_id IN (SELECT id FROM transactions WHERE account_id IN (${placeholders}))`, accountIds);
    run(`DELETE FROM transactions WHERE account_id IN (${placeholders})`, accountIds);
    run(`DELETE FROM accounts WHERE id IN (${placeholders})`, accountIds);
  }
  else {
    // Soft delete — keeps transactions and their account reference intact for historical display.
    run(`UPDATE accounts SET is_deleted = 1, updated_at = datetime('now') WHERE id IN (${placeholders})`, accountIds);
  }
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
  all(`SELECT t.*, COALESCE(a.display_name, a.name) as account_name, ts.category_id, ts.notes as split_notes, ts.amount as split_amount, ts.amount_formula as split_amount_formula, c.name as category_name
       FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
       LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
       LEFT JOIN categories c ON ts.category_id = c.id
       WHERE t.date >= ? AND t.date <= ? AND t.is_removed = 0 AND t.is_hidden = 0
       AND (a.hide_from_transactions = 0 OR a.hide_from_transactions IS NULL)
       ORDER BY t.date ASC`, [startDate, endDate]);
const getTransactionRowsById = (id) =>
  all(`SELECT t.*, COALESCE(a.display_name, a.name) as account_name, ts.category_id, ts.notes as split_notes, ts.amount as split_amount, ts.amount_formula as split_amount_formula, c.name as category_name
       FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
       LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
       LEFT JOIN categories c ON ts.category_id = c.id
       WHERE t.id = ?`, [id]);
const getHiddenTransactionsByDateRange = (startDate, endDate) =>
  all(`SELECT t.*, COALESCE(a.display_name, a.name) as account_name, ts.category_id, ts.notes as split_notes, ts.amount as split_amount, ts.amount_formula as split_amount_formula, c.name as category_name
       FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
       LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
       LEFT JOIN categories c ON ts.category_id = c.id
       WHERE t.date >= ? AND t.date <= ? AND t.is_removed = 0
       AND (t.is_hidden = 1 OR a.hide_from_transactions = 1)
       ORDER BY t.date ASC`, [startDate, endDate]);
const softRemoveTransaction = (plaidTxnId) => {
  return run("UPDATE transactions SET is_removed = 1, updated_at = datetime('now') WHERE plaid_transaction_id = ?", [plaidTxnId]);
};

const restoreTransaction = (plaidTxnId) => {
  run("UPDATE transactions SET is_removed = 0, updated_at = datetime('now') WHERE plaid_transaction_id = ?", [plaidTxnId]);
};

// A transaction counts as missing a category if it has no splits at all, or if any of its
// splits has a null category_id (e.g. after a category is deleted via the "disassociate"
// option). The display subqueries below prefer that null-category split, when one exists,
// over an already-categorized sibling split, so "Fix" shows/edits the actual problem split.
const getIncompleteTransactions = () =>
  all(`SELECT t.*, COALESCE(a.display_name, a.name) as account_name,
       (SELECT ts2.category_id FROM transaction_splits ts2 WHERE ts2.transaction_id = t.id
          ORDER BY (ts2.category_id IS NULL) DESC LIMIT 1) as split_category_id,
       (SELECT c.name FROM transaction_splits ts2 LEFT JOIN categories c ON ts2.category_id = c.id
          WHERE ts2.transaction_id = t.id ORDER BY (ts2.category_id IS NULL) DESC LIMIT 1) as category_name,
       (SELECT ts2.notes FROM transaction_splits ts2 WHERE ts2.transaction_id = t.id
          ORDER BY (ts2.category_id IS NULL) DESC LIMIT 1) as notes,
       CASE WHEN t.plaid_transaction_id IS NULL THEN 1 ELSE 0 END as missing_plaid_id,
       CASE WHEN t.merchant IS NULL OR t.merchant = '' THEN 1 ELSE 0 END as missing_merchant,
       CASE WHEN t.account_id IS NULL THEN 1 ELSE 0 END as missing_account,
       CASE WHEN NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
              OR EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id AND ts.category_id IS NULL)
            THEN 1 ELSE 0 END as missing_category
     FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.is_removed = 0 AND t.is_hidden = 0 AND (
       t.plaid_transaction_id IS NULL
       OR t.merchant IS NULL OR t.merchant = ''
       OR t.account_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
       OR EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id AND ts.category_id IS NULL)
     )
     AND (
       t.plaid_transaction_id IS NULL
       OR a.hide_from_transactions IS NULL
       OR a.hide_from_transactions = 0
     )
     ORDER BY t.date DESC`);

// Transfer pairs (is_transfer=1, linked_transaction_id set on both sides) within the last
// `days` days. The link is bidirectional — both rows point at each other — so anchor on the
// negative (outgoing) leg only, to avoid returning each pair twice. Deliberately does NOT
// filter is_hidden: transfer legs are commonly hidden from the main Transactions view by
// design, and this view exists specifically to surface them anyway.
const getMoneyMovement = (days = 30) =>
  all(`SELECT
      t.id, t.date, t.amount,
      COALESCE(fa.display_name, fa.name) as from_name, fa.mask as from_mask,
      fi.display_icon_url as from_icon_url, fi.institution_logo as from_logo, fi.institution_color as from_color,
      lt.id as to_id,
      COALESCE(ta.display_name, ta.name) as to_name, ta.mask as to_mask,
      ti.display_icon_url as to_icon_url, ti.institution_logo as to_logo, ti.institution_color as to_color
    FROM transactions t
    JOIN transactions lt ON t.linked_transaction_id = lt.id
    LEFT JOIN accounts fa ON t.account_id = fa.id
    LEFT JOIN items fi ON fa.item_id = fi.id
    LEFT JOIN accounts ta ON lt.account_id = ta.id
    LEFT JOIN items ti ON ta.item_id = ti.id
    WHERE t.is_transfer = 1 AND t.amount < 0 AND t.is_removed = 0 AND lt.is_removed = 0
      AND t.date >= date('now', ?)
    ORDER BY t.date DESC`, [`-${days} days`]);

// Note: pending_transaction_id is intentionally kept (not nulled) after promotion, so a
// delayed "remove" webhook for the old pending id can still be reconciled — see
// getTransactionByPendingId's use in processRemovedTransaction.
const updateTransactionFromPending = (plaidTxnId, amount, id) => {
  run(`UPDATE transactions SET plaid_transaction_id = ?, is_pending = 0,
       amount = ?, updated_at = datetime('now') WHERE id = ?`,
  [plaidTxnId, amount, id]);
};

const updateTransactionPlaidData = (amount, merchant, plaidCategory, rawJson, plaidTxnId) => {
  run(`UPDATE transactions SET amount = ?, merchant = ?, plaid_category = ?, plaid_raw_json = ?, updated_at = datetime('now')
       WHERE plaid_transaction_id = ?`, [amount, merchant, plaidCategory, rawJson, plaidTxnId]);
};

// Find incomplete transactions (no plaid_id) matching the given amount, within a
// generous window anchored to the incoming transaction's own date — NOT "now", since
// during a backlogged catch-up sync "now" can be days removed from every transaction
// in the batch, not just delayed ones. Loosely cross-checks merchant name (an
// incomplete entry with no merchant set is treated as a wildcard) to offset the
// false-positive risk the wider window introduces. Spaces are stripped from both
// sides before comparing, since Plaid's raw merchant names often mash words together
// (e.g. "Wsferries") while a manually-typed name naturally has one (e.g. "WS Ferries")
// — without this, an otherwise-perfect amount/date match silently fails to link at
// all, with nothing logged, because the merchant check alone doesn't even try. Returns
// every match, not just the best one — a same-amount collision (e.g. two blank-merchant
// manual entries) is ambiguous, and the caller should refuse to auto-link rather than
// silently guess.
const findIncompleteMatches = (amount, date, merchantName) =>
  all(`SELECT * FROM transactions
       WHERE plaid_transaction_id IS NULL AND is_removed = 0
       AND date >= date(?, '-45 days') AND date <= date(?, '+5 days')
       AND ABS(amount - ?) < 0.005
       AND (
         merchant IS NULL OR merchant = ''
         OR INSTR(REPLACE(LOWER(?), ' ', ''), REPLACE(LOWER(merchant), ' ', '')) > 0
         OR INSTR(REPLACE(LOWER(merchant), ' ', ''), REPLACE(LOWER(?), ' ', '')) > 0
       )
       ORDER BY date DESC`, [date, date, amount, merchantName, merchantName]);

// Link an incomplete transaction to the incoming plaid transaction. Also restores
// is_pending from the incoming transaction — a prior unlink (see unlinkPlaidId) always
// zeroes it, so without this a re-linked transaction would stay permanently invisible
// to findFuzzyPendingMatch even when Plaid still considers it pending.
const linkIncompleteTransaction = (plaidTxnId, isPending, id) =>
  run(`UPDATE transactions SET plaid_transaction_id = ?, is_pending = ?, updated_at = datetime('now') WHERE id = ?`,
    [plaidTxnId, isPending, id]);

// Find a pending transaction that likely matches a posted one
// Matches on: same account, recent date, AND (exact amount OR similar merchant name)
const findFuzzyPendingMatch = (accountId, amount, date, merchantName) =>
  get(`SELECT * FROM transactions
       WHERE is_pending = 1 AND is_removed = 0 AND account_id = ?
       AND date >= date(?, '-5 days') AND date <= date(?, '+2 days')
       AND (ABS(amount - ?) < 0.005 OR INSTR(LOWER(?), LOWER(merchant)) > 0 OR INSTR(LOWER(merchant), LOWER(?)) > 0)
       ORDER BY ABS(amount - ?) ASC LIMIT 1`,
  [accountId, date, date, amount, merchantName, merchantName, amount]);

// Promote a pending transaction to posted: update plaid_id, amount, mark not pending.
// pending_transaction_id is kept (see note on updateTransactionFromPending above).
const promotePendingToPosted = (newPlaidTxnId, amount, id) =>
  run(`UPDATE transactions SET plaid_transaction_id = ?, amount = ?, is_pending = 0,
       updated_at = datetime('now') WHERE id = ?`,
  [newPlaidTxnId, amount, id]);

// Strip plaid_id from a transaction (demotes to incomplete, preserves user data)
const unlinkPlaidId = (id) =>
  run(`UPDATE transactions SET plaid_transaction_id = NULL, pending_transaction_id = NULL,
       is_pending = 0, updated_at = datetime('now') WHERE id = ?`, [id]);

// Transaction Splits
const createSplit = (txnId, categoryId, amount, notes, amountFormula = null) =>
  run('INSERT INTO transaction_splits (transaction_id, category_id, amount, notes, amount_formula) VALUES (?, ?, ?, ?, ?)',
    [txnId, categoryId, amount, notes, amountFormula]);
const getSplitsByTransaction = (txnId) =>
  all(`SELECT ts.*, c.name as category_name, c.color as category_color
       FROM transaction_splits ts LEFT JOIN categories c ON ts.category_id = c.id WHERE ts.transaction_id = ?`, [txnId]);
const deleteSplitsByTransaction = (txnId) => {
  run('DELETE FROM transaction_splits WHERE transaction_id = ?', [txnId]);
};

const deleteTransaction = (txnId) => {
  run('DELETE FROM transaction_splits WHERE transaction_id = ?', [txnId]);
  run('DELETE FROM merchant_rename_log WHERE transaction_id = ?', [txnId]);
  run('DELETE FROM merchant_category_log WHERE transaction_id = ?', [txnId]);
  // Clear any self-referencing FKs from OTHER transactions pointing at this one
  // (e.g. a linked counterpart), so deleting a linked manual transaction doesn't
  // also hit a foreign key violation.
  run('UPDATE transactions SET linked_transaction_id = NULL WHERE linked_transaction_id = ?', [txnId]);
  run('UPDATE transactions SET matched_manual_id = NULL WHERE matched_manual_id = ?', [txnId]);
  run('DELETE FROM transactions WHERE id = ?', [txnId]);
};

// Categories
const getAllCategories = () =>
  all('SELECT * FROM categories ORDER BY sort_order ASC');
const createCategory = (name, color, expr, resetOnNew, sortOrder) =>
  run('INSERT INTO categories (name, color, budgeted_amount_expression, reset_on_new_month, sort_order) VALUES (?, ?, ?, ?, ?)',
    [name, color, expr, resetOnNew, sortOrder]);
// resetOnNew/sortOrder may be null to leave the existing value untouched (e.g. when the
// client's edit form doesn't send them, so it doesn't clobber a value set elsewhere, like reordering)
const updateCategory = (name, color, expr, resetOnNew, sortOrder, id) => {
  run(`UPDATE categories SET name = ?, color = ?, budgeted_amount_expression = ?,
       reset_on_new_month = COALESCE(?, reset_on_new_month),
       sort_order = COALESCE(?, sort_order),
       updated_at = datetime('now') WHERE id = ?`,
    [name, color, expr, resetOnNew, sortOrder, id]);
};

const toggleCategoryHidden = (id, isHidden) => {
  run("UPDATE categories SET is_hidden = ?, updated_at = datetime('now') WHERE id = ?", [isHidden ? 1 : 0, id]);
};

// Count of non-removed transactions currently split into this category, used to decide
// whether deleting it needs the merge/disassociate flow or can happen outright.
const getCategoryTransactionCount = (id) =>
  get(`SELECT COUNT(DISTINCT ts.transaction_id) as count
       FROM transaction_splits ts JOIN transactions t ON t.id = ts.transaction_id
       WHERE ts.category_id = ? AND t.is_removed = 0`, [id]).count;

// Clear a category out of rules/templates/logs that aren't "transactions" but still hold an
// FK to it, so the category row itself can be deleted. Rules/templates just lose the
// reference (category_id is nullable there); the log is purely an internal signal so its
// rows for this category are no longer meaningful once the category is gone.
const clearCategoryReferences = (db, id) => {
  db.prepare('DELETE FROM merchant_category_log WHERE category_id = ?').run(id);
  db.prepare('UPDATE rules SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('UPDATE record_templates SET category_id = NULL WHERE category_id = ?').run(id);
};

// Only safe to call once no transaction_splits reference this category (see the two
// functions below, which clear that out first via merge or disassociate).
const deleteCategory = (id) => {
  if (getCategoryTransactionCount(id) > 0) {
    throw new Error('Category still has associated transactions');
  }

  const db = getDb();
  const del = db.transaction(() => {
    clearCategoryReferences(db, id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });
  del();
};

// Reassign everything referencing `fromId` (splits, rules, templates, log) over to `toId`,
// then delete `fromId`.
const mergeCategory = (fromId, toId) => {
  const db = getDb();
  const merge = db.transaction(() => {
    db.prepare('UPDATE transaction_splits SET category_id = ? WHERE category_id = ?').run(toId, fromId);
    db.prepare('UPDATE rules SET category_id = ? WHERE category_id = ?').run(toId, fromId);
    db.prepare('UPDATE record_templates SET category_id = ? WHERE category_id = ?').run(toId, fromId);
    db.prepare('UPDATE merchant_category_log SET category_id = ? WHERE category_id = ?').run(toId, fromId);
    db.prepare('DELETE FROM categories WHERE id = ?').run(fromId);
  });
  merge();
};

// Strip this category off its transactions by nulling category_id on the affected splits
// (getIncompleteTransactions treats a null-category split the same as a transaction with no
// splits at all, so this surfaces them in Incomplete Transactions), then delete the category.
const disassociateCategory = (id) => {
  const db = getDb();
  const disassociate = db.transaction(() => {
    db.prepare("UPDATE transaction_splits SET category_id = NULL, updated_at = datetime('now') WHERE category_id = ?").run(id);
    clearCategoryReferences(db, id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });
  disassociate();
};

// Move category `id` to 1-indexed `position` among all categories, shifting others to make
// room. A position beyond the end of the list is clamped to the last slot.
const reorderCategory = (id, position) => {
  const db = getDb();
  const reorder = db.transaction(() => {
    const cats = db.prepare('SELECT id FROM categories ORDER BY sort_order ASC').all();
    const fromIndex = cats.findIndex(c => c.id === Number(id));
    if (fromIndex === -1) {
      return;
    }

    const [moved] = cats.splice(fromIndex, 1);
    const toIndex = Math.max(0, Math.min(position - 1, cats.length));
    cats.splice(toIndex, 0, moved);

    const update = db.prepare("UPDATE categories SET sort_order = ?, updated_at = datetime('now') WHERE id = ?");
    cats.forEach((c, i) => update.run(i, c.id));
  });
  reorder();
};

// Rules
const getAllRules = () =>
  all(`SELECT r.*, c.name as category_name FROM rules r LEFT JOIN categories c ON r.category_id = c.id
      ORDER BY r.created_at DESC`);
const createRule = (pattern, categoryId, notesTemplate, amountCondition, renameTo, isSplit, splitJson, isAutoCreated = false) =>
  run('INSERT INTO rules (pattern, category_id, notes_template, amount_condition, rename_to, is_split, split_json, is_auto_created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [pattern, categoryId, notesTemplate, amountCondition, renameTo, isSplit ? 1 : 0, splitJson, isAutoCreated ? 1 : 0]);
const updateRule = (id, pattern, categoryId, notesTemplate, amountCondition, renameTo, isSplit, splitJson) =>
  run('UPDATE rules SET pattern = ?, category_id = ?, notes_template = ?, amount_condition = ?, rename_to = ?, is_split = ?, split_json = ? WHERE id = ?',
    [pattern, categoryId, notesTemplate, amountCondition, renameTo, isSplit ? 1 : 0, splitJson, id]);
const deleteRule = (id) => run('DELETE FROM rules WHERE id = ?', [id]);
const toggleRuleDisabled = (id, isDisabled) => {
  run("UPDATE rules SET is_disabled = ?, updated_at = datetime('now') WHERE id = ?", [isDisabled ? 1 : 0, id]);
};

// Merchant rename tracking (for auto-rule creation from repeated manual renames)
const logMerchantRename = (transactionId, originalMerchant, newMerchant) =>
  run('INSERT INTO merchant_rename_log (transaction_id, original_merchant, new_merchant) VALUES (?, ?, ?)',
    [transactionId, originalMerchant, newMerchant]);
const getDistinctRenameOriginals = (newMerchant) =>
  all('SELECT DISTINCT original_merchant FROM merchant_rename_log WHERE new_merchant = ?', [newMerchant]).map(r => r.original_merchant);
const countRenameEvents = (newMerchant, originals) => {
  if (originals.length === 0) {
    return 0;
  }

  const placeholders = originals.map(() => '?').join(',');
  return all(`SELECT COUNT(*) as c FROM merchant_rename_log WHERE new_merchant = ? AND original_merchant IN (${placeholders})`,
    [newMerchant, ...originals])[0].c;
};

// Merchant categorization tracking (for auto-rule creation from repeated manual categorizations)
const logMerchantCategorization = (transactionId, merchant, categoryId) =>
  run('INSERT INTO merchant_category_log (transaction_id, merchant, category_id) VALUES (?, ?, ?)',
    [transactionId, merchant, categoryId]);
const getDistinctCategorizationMerchants = (categoryId) =>
  all('SELECT DISTINCT merchant FROM merchant_category_log WHERE category_id = ?', [categoryId]).map(r => r.merchant);
const countCategorizationEvents = (categoryId, merchants) => {
  if (merchants.length === 0) {
    return 0;
  }

  const placeholders = merchants.map(() => '?').join(',');
  return all(`SELECT COUNT(*) as c FROM merchant_category_log WHERE category_id = ? AND merchant IN (${placeholders})`,
    [categoryId, ...merchants])[0].c;
};

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

// Record Templates
const getAllTemplates = () =>
  all(`SELECT rt.*, c.name as category_name FROM record_templates rt
       LEFT JOIN categories c ON rt.category_id = c.id ORDER BY rt.name`);
const createTemplate = (name, merchant, notes, categoryId, accountId, amount) =>
  run('INSERT INTO record_templates (name, merchant, notes, category_id, account_id, amount) VALUES (?, ?, ?, ?, ?, ?)',
    [name, merchant, notes, categoryId, accountId, amount]);
const deleteTemplate = (id) =>
  run('DELETE FROM record_templates WHERE id = ?', [id]);
const updateTemplate = (id, name, merchant, notes, categoryId, accountId, amount) =>
  run('UPDATE record_templates SET name = ?, merchant = ?, notes = ?, category_id = ?, account_id = ?, amount = ? WHERE id = ?',
    [name, merchant, notes, categoryId, accountId, amount, id]);

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
  createItem, getAllItems, getItemByPlaidId, updateItemCursor, updateItemStatus, deleteItem,
  // Accounts
  createAccount, getAccountsByItem, getAllAccounts, getAccountByPlaidId, updateAccountBalance,
  getAccountTransactionCount, removeAccounts,
  // Transactions
  createTransaction, getTransactionByPlaidId, getTransactionByPendingId,
  getTransactionsByDateRange, getHiddenTransactionsByDateRange, getTransactionRowsById,
  softRemoveTransaction, restoreTransaction,
  getIncompleteTransactions, getMoneyMovement, updateTransactionFromPending, updateTransactionPlaidData,
  findIncompleteMatches, linkIncompleteTransaction,
  findFuzzyPendingMatch, promotePendingToPosted, unlinkPlaidId,
  // Splits
  createSplit, getSplitsByTransaction, deleteSplitsByTransaction, deleteTransaction,
  // Categories
  getAllCategories, createCategory, updateCategory, toggleCategoryHidden, reorderCategory,
  getCategoryTransactionCount, deleteCategory, mergeCategory, disassociateCategory,
  // Rules
  getAllRules, createRule, updateRule, deleteRule, toggleRuleDisabled,
  logMerchantRename, getDistinctRenameOriginals, countRenameEvents,
  logMerchantCategorization, getDistinctCategorizationMerchants, countCategorizationEvents,
  // Logs
  createLog, getRecentLogs,
  // Webhooks
  createWebhookPayload, getWebhookPayloads,
  // Notifications
  getAllEndpoints, createEndpoint,
  // Income
  getAllIncome, createIncome,
  // Record Templates
  getAllTemplates, createTemplate, deleteTemplate, updateTemplate,
  // Settings
  getSettings, getSetting, setSetting,
};
