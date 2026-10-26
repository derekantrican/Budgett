// In-browser stand-in for the Express API, used only by the GitHub Pages demo build. Mirrors the
// request/response shapes of server/routes/*.js against a plain-object "database" seeded from
// demo/seed.js and persisted to localStorage, so a visitor's edits survive a page refresh (but
// stay in their own browser). Anything that needs Plaid or the server itself (linking banks,
// logs, webhooks, extensions) throws DEMO_DISABLED_MESSAGE instead.

import { buildSeed } from './seed';
import { DEMO_DISABLED_MESSAGE } from './isDemo';

const STORAGE_KEY = 'budgett-demo-db-v1';

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  }
  catch {
    // Unavailable/corrupt storage - fall through to a fresh seed
  }

  return buildSeed();
}

let db = loadDb();

function saveDb() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
  catch {
    // Storage full or blocked - edits still work for this page load, they just won't persist
  }
}

export function resetDemoData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  }
  catch {
    // Ignore - the reload below re-seeds either way
  }

  db = buildSeed();
}

// --- Helpers ---

const timestamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const nextId = (table) => db[table].reduce((max, r) => Math.max(max, r.id), 0) + 1;
const findById = (table, id) => db[table].find(r => r.id === Number(id)) || null;

function insert(table, row) {
  const now = timestamp();
  const full = { id: nextId(table), created_at: now, updated_at: now, ...row };
  db[table].push(full);
  return full;
}

function touch(row, fields) {
  Object.assign(row, fields, { updated_at: timestamp() });
}

function httpError(message) {
  return new Error(message);
}

const accountName = (accountId) => {
  const a = findById('accounts', accountId);
  return a ? (a.display_name || a.name) : null;
};

const isAccountHidden = (accountId) => !!findById('accounts', accountId)?.hide_from_transactions;
const categoryName = (categoryId) => findById('categories', categoryId)?.name || null;
const splitsFor = (txnId) => db.transaction_splits.filter(s => s.transaction_id === Number(txnId));

// The joined-row shape the server's transaction list endpoints return: the transaction plus
// account_name, a `splits` array, and the first split's columns flattened onto the top level.
function withSplits(t) {
  const splits = splitsFor(t.id).map(s => ({
    category_id: s.category_id || null,
    category_name: categoryName(s.category_id),
    amount: s.amount,
    amount_formula: s.amount_formula || null,
    notes: s.notes,
  }));
  const first = splits[0];
  return {
    ...t,
    account_name: accountName(t.account_id),
    category_id: first?.category_id ?? null,
    split_notes: first?.notes ?? null,
    split_amount: first?.amount ?? null,
    split_amount_formula: first?.amount_formula ?? null,
    category_name: first?.category_name ?? null,
    splits,
  };
}

// getSplitsByTransaction's shape: ts.* plus category name/color.
const fullSplitsFor = (txnId) => splitsFor(txnId).map(s => {
  const c = findById('categories', s.category_id);
  return { ...s, category_name: c?.name || null, category_color: c?.color || null };
});

const byDateAsc = (a, b) => a.date.localeCompare(b.date) || a.id - b.id;
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || b.id - a.id;

function createSplit(txnId, categoryId, amount, notes, amountFormula = null) {
  insert('transaction_splits', {
    transaction_id: Number(txnId), category_id: categoryId ? Number(categoryId) : null, amount,
    amount_formula: amountFormula, notes,
  });
}

const findByPlaidOrPendingId = (plaidId) =>
  db.transactions.find(t => t.plaid_transaction_id === plaidId)
  || db.transactions.find(t => t.pending_transaction_id === plaidId)
  || null;

const dayDiff = (a, b) => Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000);

const parseConfig = (row) => ({ ...row, config: row.config_json ? JSON.parse(row.config_json) : {} });

function categoryTransactionCount(categoryId) {
  const id = Number(categoryId);
  const txnIds = new Set(db.transaction_splits.filter(s => s.category_id === id).map(s => s.transaction_id));
  return db.transactions.filter(t => txnIds.has(t.id) && !t.is_removed).length;
}

function clearCategoryReferences(categoryId, replacementId = null) {
  for (const r of db.rules) {
    if (r.category_id === categoryId) {
      r.category_id = replacementId;
    }
  }

  for (const t of db.record_templates) {
    if (t.category_id === categoryId) {
      t.category_id = replacementId;
    }
  }
}

function deleteTransactionsForAccounts(accountIds) {
  const txnIds = new Set(db.transactions.filter(t => accountIds.includes(t.account_id)).map(t => t.id));
  db.transaction_splits = db.transaction_splits.filter(s => !txnIds.has(s.transaction_id));
  db.transactions = db.transactions.filter(t => !txnIds.has(t.id));
}

// --- Routes ---

const routes = [];

function route(method, pattern, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  }) + '$');
  routes.push({ method, regex, keys, handler });
}

const disabled = () => {
  throw httpError(DEMO_DISABLED_MESSAGE);
};

// Transactions
route('GET', '/transactions', ({ query }) => {
  if (!query.start_date || !query.end_date) {
    throw httpError('start_date and end_date required');
  }

  return db.transactions
    .filter(t => t.date >= query.start_date && t.date <= query.end_date && !t.is_removed && !t.is_hidden && !isAccountHidden(t.account_id))
    .sort(byDateAsc)
    .map(withSplits);
});

route('GET', '/transactions/search', ({ query }) => {
  if (!query.query) {
    throw httpError('query parameter required');
  }

  const q = query.query.toLowerCase();
  return db.transactions
    .filter(t => !t.is_removed && !t.is_hidden && !isAccountHidden(t.account_id))
    .filter(t => (t.merchant || '').toLowerCase().includes(q) || splitsFor(t.id).some(s => (s.notes || '').toLowerCase().includes(q)))
    .sort(byDateDesc)
    .slice(0, 500)
    .map(withSplits);
});

route('GET', '/transactions/hidden', ({ query }) => {
  if (!query.start_date || !query.end_date) {
    throw httpError('start_date and end_date required');
  }

  return db.transactions
    .filter(t => t.date >= query.start_date && t.date <= query.end_date && !t.is_removed && (t.is_hidden || isAccountHidden(t.account_id)))
    .sort(byDateAsc)
    .map(withSplits);
});

route('GET', '/transactions/by-plaid-id/:plaidId', ({ params }) => {
  const txn = findByPlaidOrPendingId(decodeURIComponent(params.plaidId));
  if (!txn) {
    throw httpError('Transaction not found');
  }

  return { ...txn, splits: fullSplitsFor(txn.id) };
});

route('POST', '/transactions', ({ body }) => {
  const { date, merchant, amount, account_id, plaid_transaction_id, splits } = body;
  if (!date || amount === undefined) {
    throw httpError('date and amount required');
  }

  if (plaid_transaction_id) {
    const existing = findByPlaidOrPendingId(plaid_transaction_id);
    if (existing) {
      throw httpError(`Transaction with Plaid id ${plaid_transaction_id} already exists (#${existing.id})`);
    }
  }

  const txn = insert('transactions', {
    plaid_transaction_id: plaid_transaction_id || null, pending_transaction_id: null,
    account_id: account_id ? Number(account_id) : null, group_id: null, date, merchant: merchant || null,
    amount: Number(amount), is_pending: 0, is_removed: 0, is_hidden: 0, is_auth: 0, is_transfer: 0,
    linked_transaction_id: null, matched_manual_id: null, notes: null, plaid_category: null, plaid_raw_json: null,
  });

  for (const split of splits || []) {
    createSplit(txn.id, split.category_id, split.amount, split.notes || null, split.amount_formula || null);
  }

  return { id: txn.id };
});

route('PUT', '/transactions/merge-and-link-plaid', ({ body }) => {
  const { transaction_ids, plaid_transaction_id } = body;
  if (!transaction_ids || transaction_ids.length < 2 || !plaid_transaction_id) {
    throw httpError('transaction_ids (array, >=2) and plaid_transaction_id required');
  }

  const [primaryId, ...otherIds] = transaction_ids.map(Number);
  const txns = transaction_ids.map(id => findById('transactions', id)).filter(Boolean);
  const totalAmount = txns.reduce((sum, t) => sum + t.amount, 0);

  for (const otherId of otherIds) {
    const otherSplits = splitsFor(otherId);
    if (otherSplits.length > 0) {
      otherSplits.forEach(s => {
        s.transaction_id = primaryId;
      });
    }
    else {
      const other = findById('transactions', otherId);
      if (other) {
        createSplit(primaryId, null, other.amount, other.notes);
      }
    }

    const other = findById('transactions', otherId);
    if (other) {
      touch(other, { is_removed: 1 });
    }
  }

  const primary = findById('transactions', primaryId);
  if (primary && splitsFor(primaryId).length === 0) {
    createSplit(primaryId, null, primary.amount, primary.notes);
  }

  if (primary) {
    touch(primary, { amount: totalAmount, plaid_transaction_id });
  }

  return { success: true, primary_id: primaryId };
});

route('PUT', '/transactions/:id/splits', ({ params, body }) => {
  if (!Array.isArray(body.splits)) {
    throw httpError('splits array required');
  }

  const id = Number(params.id);
  db.transaction_splits = db.transaction_splits.filter(s => s.transaction_id !== id);
  for (const split of body.splits) {
    createSplit(id, split.category_id, split.amount, split.notes || null, split.amount_formula || null);
  }

  return { splits: fullSplitsFor(id), auto_rules_created: [] };
});

route('GET', '/transactions/:id/plaid-candidates', disabled);

route('PUT', '/transactions/:id/link-plaid', ({ params, body }) => {
  if (!body.plaid_transaction_id) {
    throw httpError('plaid_transaction_id required');
  }

  const txn = findById('transactions', params.id);
  if (txn) {
    touch(txn, { plaid_transaction_id: body.plaid_transaction_id });
  }

  return { success: true };
});

route('GET', '/transactions/:id/counterpart-candidates', ({ params }) => {
  const txn = findById('transactions', params.id);
  if (!txn) {
    throw httpError('Transaction not found');
  }

  return db.transactions
    .filter(t => t.id !== txn.id && !t.is_removed && !t.linked_transaction_id
      && Math.abs(t.amount + txn.amount) < 0.005 && dayDiff(t.date, txn.date) <= 7)
    .sort((a, b) => dayDiff(a.date, txn.date) - dayDiff(b.date, txn.date))
    .slice(0, 20)
    .map(t => ({ ...t, account_name: accountName(t.account_id) }));
});

route('POST', '/transactions/:id/link-counterpart', ({ params, body }) => {
  const { counterpart_id, link_type, hide_self, hide_counterpart } = body;
  if (!counterpart_id || !link_type) {
    throw httpError('counterpart_id and link_type required');
  }

  const txn = findById('transactions', params.id);
  const counterpart = findById('transactions', counterpart_id);
  if (!txn || !counterpart) {
    throw httpError('Transaction not found');
  }

  const flags = { is_auth: link_type === 'auth' ? 1 : 0, is_transfer: link_type === 'transfer' ? 1 : 0 };
  touch(txn, { ...flags, linked_transaction_id: counterpart.id, is_hidden: hide_self ? 1 : 0 });
  touch(counterpart, { ...flags, linked_transaction_id: txn.id, is_hidden: hide_counterpart ? 1 : 0 });
  return { success: true };
});

route('POST', '/transactions/:id/unlink-counterpart', ({ params }) => {
  const txn = findById('transactions', params.id);
  if (!txn) {
    throw httpError('Transaction not found');
  }

  const cleared = { linked_transaction_id: null, is_auth: 0, is_transfer: 0, is_hidden: 0 };
  const counterpart = findById('transactions', txn.linked_transaction_id);
  if (counterpart) {
    touch(counterpart, cleared);
  }

  touch(txn, cleared);
  return { success: true };
});

route('GET', '/transactions/:id', ({ params }) => {
  const txn = findById('transactions', params.id);
  if (!txn) {
    throw httpError('Transaction not found');
  }

  return withSplits(txn);
});

route('PUT', '/transactions/:id', ({ params, body }) => {
  const { merchant, notes, account_id, category_id, date, is_hidden } = body;
  const txn = findById('transactions', params.id);
  if (!txn) {
    throw httpError('Transaction not found');
  }

  const updates = {};
  if (merchant !== undefined) {
    updates.merchant = merchant || null;
  }

  if (date !== undefined) {
    updates.date = date || null;
  }

  if (account_id !== undefined) {
    updates.account_id = account_id ? Number(account_id) : null;
  }

  if (is_hidden !== undefined) {
    updates.is_hidden = is_hidden ? 1 : 0;
  }

  if (Object.keys(updates).length > 0) {
    touch(txn, updates);
  }

  if (category_id !== undefined || notes !== undefined) {
    const existing = splitsFor(txn.id);
    if (existing.length === 0) {
      createSplit(txn.id, category_id, txn.amount, notes || null);
    }
    else {
      const splitUpdates = {};
      if (category_id !== undefined) {
        splitUpdates.category_id = category_id ? Number(category_id) : null;
      }

      if (notes !== undefined) {
        splitUpdates.notes = notes || null;
      }

      touch(existing[0], splitUpdates);
    }
  }

  return { success: true, auto_rules_created: [] };
});

route('DELETE', '/transactions/:id', ({ params }) => {
  const id = Number(params.id);
  const txn = findById('transactions', id);
  if (!txn) {
    throw httpError('Transaction not found');
  }

  if (txn.plaid_transaction_id) {
    throw httpError('Cannot delete a transaction linked to Plaid');
  }

  db.transaction_splits = db.transaction_splits.filter(s => s.transaction_id !== id);
  for (const t of db.transactions) {
    if (t.linked_transaction_id === id) {
      t.linked_transaction_id = null;
    }

    if (t.matched_manual_id === id) {
      t.matched_manual_id = null;
    }
  }

  db.transactions = db.transactions.filter(t => t.id !== id);
  return { success: true };
});

// Categories
route('GET', '/categories', () => [...db.categories].sort((a, b) => a.sort_order - b.sort_order));

route('POST', '/categories', ({ body }) => {
  const { name, color, budgeted_amount_expression, reset_on_new_month, sort_order } = body;
  if (!name) {
    throw httpError('name required');
  }

  const palette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
  const row = insert('categories', {
    name,
    color: color || palette[Math.floor(Math.random() * palette.length)],
    budgeted_amount_expression: budgeted_amount_expression || null,
    reset_on_new_month: reset_on_new_month !== undefined ? (reset_on_new_month ? 1 : 0) : 1,
    is_hidden: 0,
    sort_order: sort_order || 0,
  });
  return { id: row.id };
});

route('PUT', '/categories/:id', ({ params, body }) => {
  const { name, color, budgeted_amount_expression, reset_on_new_month, sort_order } = body;
  const row = findById('categories', params.id);
  if (row) {
    touch(row, {
      name,
      color: color || null,
      budgeted_amount_expression: budgeted_amount_expression || null,
      ...(reset_on_new_month === undefined ? {} : { reset_on_new_month: reset_on_new_month ? 1 : 0 }),
      ...(sort_order === undefined ? {} : { sort_order }),
    });
  }

  return { id: Number(params.id), name, color, budgeted_amount_expression, reset_on_new_month, sort_order };
});

route('PATCH', '/categories/:id/toggle-hidden', ({ params, body }) => {
  const row = findById('categories', params.id);
  if (row) {
    touch(row, { is_hidden: body.is_hidden ? 1 : 0 });
  }

  return { success: true };
});

route('PATCH', '/categories/:id/reorder', ({ params, body }) => {
  const cats = [...db.categories].sort((a, b) => a.sort_order - b.sort_order);
  const fromIndex = cats.findIndex(c => c.id === Number(params.id));
  if (fromIndex !== -1) {
    const [moved] = cats.splice(fromIndex, 1);
    const toIndex = Math.max(0, Math.min(Number(body.position) - 1, cats.length));
    cats.splice(toIndex, 0, moved);
    cats.forEach((c, i) => touch(c, { sort_order: i }));
  }

  return { success: true };
});

route('GET', '/categories/:id/usage', ({ params }) => ({ transactionCount: categoryTransactionCount(params.id) }));

route('DELETE', '/categories/:id', ({ params }) => {
  const id = Number(params.id);
  if (categoryTransactionCount(id) > 0) {
    throw httpError('Category still has associated transactions');
  }

  clearCategoryReferences(id);
  db.categories = db.categories.filter(c => c.id !== id);
  return { success: true };
});

route('POST', '/categories/:id/merge', ({ params, body }) => {
  const fromId = Number(params.id);
  const toId = Number(body.targetId);
  if (!toId || toId === fromId) {
    throw httpError('A different target category is required');
  }

  for (const s of db.transaction_splits) {
    if (s.category_id === fromId) {
      s.category_id = toId;
    }
  }

  clearCategoryReferences(fromId, toId);
  db.categories = db.categories.filter(c => c.id !== fromId);
  return { success: true };
});

route('POST', '/categories/:id/disassociate', ({ params }) => {
  const id = Number(params.id);
  for (const s of db.transaction_splits) {
    if (s.category_id === id) {
      touch(s, { category_id: null });
    }
  }

  clearCategoryReferences(id);
  db.categories = db.categories.filter(c => c.id !== id);
  return { success: true };
});

// Items / Accounts (linking new institutions needs Plaid, so only local edits work)
route('GET', '/items', () => db.items.map(item => ({
  ...item,
  accounts: db.accounts.filter(a => a.item_id === item.id && !a.is_deleted),
})));

route('POST', '/items', disabled);
route('GET', '/items/:id/account-diff', disabled);

route('PATCH', '/items/:id', ({ params, body }) => {
  const item = findById('items', params.id);
  const updates = {};
  for (const key of ['display_name', 'display_icon_url', 'display_color']) {
    if (body[key] !== undefined) {
      updates[key] = body[key] || null;
    }
  }

  if (body.status !== undefined) {
    updates.status = body.status;
  }

  if (item && Object.keys(updates).length > 0) {
    touch(item, updates);
  }

  return { success: true };
});

route('POST', '/items/:id/remove-accounts', ({ body }) => {
  const accountIds = (body.account_ids || []).map(Number);
  if (body.delete_transactions) {
    deleteTransactionsForAccounts(accountIds);
    db.accounts = db.accounts.filter(a => !accountIds.includes(a.id));
  }
  else {
    db.accounts.filter(a => accountIds.includes(a.id)).forEach(a => touch(a, { is_deleted: 1 }));
  }

  return { success: true };
});

route('DELETE', '/items/:id', ({ params, query }) => {
  const itemId = Number(params.id);
  const accountIds = db.accounts.filter(a => a.item_id === itemId).map(a => a.id);
  if (query.delete_transactions === 'true') {
    deleteTransactionsForAccounts(accountIds);
  }
  else {
    db.transactions.filter(t => accountIds.includes(t.account_id)).forEach(t => touch(t, { account_id: null }));
  }

  db.accounts = db.accounts.filter(a => a.item_id !== itemId);
  db.items = db.items.filter(i => i.id !== itemId);
  return { success: true };
});

route('GET', '/accounts', () => db.accounts.filter(a => !a.is_deleted));

route('PATCH', '/accounts/:id', ({ params, body }) => {
  const acct = findById('accounts', params.id);
  const updates = {};
  if (body.hide_from_transactions !== undefined) {
    updates.hide_from_transactions = body.hide_from_transactions ? 1 : 0;
  }

  if (body.display_name !== undefined) {
    updates.display_name = body.display_name || null;
  }

  if (acct && Object.keys(updates).length > 0) {
    touch(acct, updates);
  }

  return { success: true };
});

route('GET', '/link/token', disabled);

// Rules
route('GET', '/rules', () => [...db.rules]
  .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
  .map(r => ({ ...r, category_name: categoryName(r.category_id) })));

function ruleFields(body) {
  const { pattern, category_id, notes_template, amount_condition, rename_to, is_split, split_json } = body;
  if (!pattern) {
    throw httpError('pattern required');
  }

  try {
    new RegExp(pattern);
  }
  catch {
    throw httpError('Invalid regex pattern');
  }

  return {
    pattern, category_id: category_id ? Number(category_id) : null, notes_template: notes_template || null,
    amount_condition: amount_condition || null, rename_to: rename_to || null,
    is_split: is_split ? 1 : 0, split_json: split_json || null,
  };
}

route('POST', '/rules', ({ body }) => {
  const row = insert('rules', {
    condition: null, merchant_template: null, amount_expression: null, payment_method: null, expires_at: null,
    is_auto_created: 0, is_disabled: 0, ...ruleFields(body),
  });
  return { id: row.id };
});

route('PUT', '/rules/:id', ({ params, body }) => {
  const fields = ruleFields(body);
  const row = findById('rules', params.id);
  if (row) {
    Object.assign(row, fields);
  }

  return { success: true };
});

route('DELETE', '/rules/:id', ({ params }) => {
  db.rules = db.rules.filter(r => r.id !== Number(params.id));
  return { success: true };
});

route('PATCH', '/rules/:id/toggle-disabled', ({ params, body }) => {
  const row = findById('rules', params.id);
  if (row) {
    touch(row, { is_disabled: body.is_disabled ? 1 : 0 });
  }

  return { success: true };
});

// Admin - logs and webhook payloads only exist on a real server
route('GET', '/admin/logs', () => []);
route('GET', '/admin/webhooks', () => []);

route('GET', '/admin/incomplete-transactions', () => db.transactions
  .filter(t => !t.is_removed && !t.is_hidden)
  .map(t => {
    const splits = splitsFor(t.id);
    // Prefer the uncategorized split, when there is one, so "Fix" targets the actual problem
    const shown = [...splits].sort((a, b) => (b.category_id == null) - (a.category_id == null))[0];
    return {
      ...t,
      account_name: accountName(t.account_id),
      split_category_id: shown?.category_id ?? null,
      category_name: categoryName(shown?.category_id),
      notes: shown?.notes ?? null,
      missing_plaid_id: t.plaid_transaction_id ? 0 : 1,
      missing_merchant: t.merchant ? 0 : 1,
      missing_account: t.account_id ? 0 : 1,
      missing_category: splits.length === 0 || splits.some(s => s.category_id == null) ? 1 : 0,
    };
  })
  .filter(t => (t.missing_plaid_id || t.missing_merchant || t.missing_account || t.missing_category)
    && (!t.plaid_transaction_id || !isAccountHidden(t.account_id)))
  .sort(byDateDesc));

route('GET', '/admin/money-movement', ({ query }) => {
  const days = parseInt(query.days) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const side = (accountId) => {
    const acct = findById('accounts', accountId);
    const item = acct ? findById('items', acct.item_id) : null;
    return {
      name: acct ? (acct.display_name || acct.name) : null,
      mask: acct?.mask || null,
      icon_url: item?.display_icon_url || null,
      logo: item?.institution_logo || null,
      color: item?.institution_color || null,
    };
  };

  return db.transactions
    .filter(t => t.is_transfer && t.amount < 0 && !t.is_removed && t.date >= sinceIso)
    .map(t => ({ t, lt: findById('transactions', t.linked_transaction_id) }))
    .filter(({ lt }) => lt && !lt.is_removed)
    .sort((a, b) => byDateDesc(a.t, b.t))
    .map(({ t, lt }) => ({
      id: t.id,
      date: t.date,
      amount: Math.abs(t.amount),
      from: side(t.account_id),
      to: { id: lt.id, ...side(lt.account_id) },
    }));
});

// Extensions - they're loaded from the server's disk, so there are none in the demo
route('GET', '/extensions', () => []);
route('POST', '/extensions/rescan', disabled);

// Settings
route('GET', '/settings', () => ({ ...db.app_settings }));

route('PUT', '/settings', ({ body }) => {
  for (const [key, value] of Object.entries(body)) {
    db.app_settings[key] = String(value);
  }

  return { success: true };
});

// Record Templates
route('GET', '/templates', () => [...db.record_templates]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(t => ({ ...t, category_name: categoryName(t.category_id) })));

function templateFields(body) {
  const { name, merchant, notes, category_id, account_id, amount } = body;
  if (!name) {
    throw httpError('name is required');
  }

  return {
    name, merchant: merchant || null, notes: notes || null, category_id: category_id ? Number(category_id) : null,
    account_id: account_id ? Number(account_id) : null, amount: amount || null,
  };
}

route('POST', '/templates', ({ body }) => ({ id: insert('record_templates', templateFields(body)).id }));

route('PUT', '/templates/:id', ({ params, body }) => {
  const fields = templateFields(body);
  const row = findById('record_templates', params.id);
  if (row) {
    Object.assign(row, fields);
  }

  return { success: true };
});

route('DELETE', '/templates/:id', ({ params }) => {
  db.record_templates = db.record_templates.filter(t => t.id !== Number(params.id));
  return { success: true };
});

// Income
const parseIncome = (row) => ({ ...row, adjustments: row.adjustments_json ? JSON.parse(row.adjustments_json) : [] });

function incomeFields(body) {
  const { name, type, amount, quantity_per_period, unit_label, pay_period, payday_weekday, reference_pay_date, adjustments } = body;
  if (!name || !type) {
    throw httpError('name and type required');
  }

  return {
    name, type, amount: amount ?? null, quantity_per_period: quantity_per_period ?? null, unit_label: unit_label || null,
    pay_period: pay_period || null, payday_weekday: payday_weekday ?? null, reference_pay_date: reference_pay_date || null,
    adjustments_json: JSON.stringify(adjustments || []),
  };
}

route('GET', '/income', () => [...db.income_sources]
  .sort((a, b) => a.is_archived - b.is_archived || a.id - b.id)
  .map(parseIncome));

route('POST', '/income', ({ body }) => ({ id: insert('income_sources', { ...incomeFields(body), is_archived: 0 }).id }));

route('PUT', '/income/:id', ({ params, body }) => {
  const fields = incomeFields(body);
  const row = findById('income_sources', params.id);
  if (row) {
    touch(row, fields);
  }

  return { success: true };
});

route('PATCH', '/income/:id/archive', ({ params, body }) => {
  const row = findById('income_sources', params.id);
  if (row) {
    touch(row, { is_archived: body.is_archived ? 1 : 0 });
  }

  return { success: true };
});

route('DELETE', '/income/:id', ({ params }) => {
  db.income_sources = db.income_sources.filter(s => s.id !== Number(params.id));
  return { success: true };
});

// Planning Views
route('GET', '/planning-views', () => [...db.planning_views]
  .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  .map(parseConfig));

route('POST', '/planning-views', ({ body }) => {
  if (!body.type || !body.name) {
    throw httpError('type and name are required');
  }

  const row = insert('planning_views', { type: body.type, name: body.name, config_json: JSON.stringify(body.config || {}), sort_order: 0 });
  return { id: row.id };
});

route('PUT', '/planning-views/:id', ({ params, body }) => {
  if (!body.name) {
    throw httpError('name is required');
  }

  const row = findById('planning_views', params.id);
  if (row) {
    touch(row, { name: body.name, config_json: JSON.stringify(body.config || {}) });
  }

  return { success: true };
});

route('DELETE', '/planning-views/:id', ({ params }) => {
  db.planning_views = db.planning_views.filter(v => v.id !== Number(params.id));
  return { success: true };
});

// Dashboard Tiles
route('GET', '/dashboard-tiles', () => [...db.dashboard_tiles]
  .sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id)
  .map(parseConfig));

route('POST', '/dashboard-tiles', ({ body }) => {
  const { type, config, x, y, w, h } = body;
  if (!type) {
    throw httpError('type is required');
  }

  const row = insert('dashboard_tiles', { type, config_json: JSON.stringify(config || {}), x: x || 0, y: y || 0, w: w || 4, h: h || 4 });
  return { id: row.id };
});

route('PUT', '/dashboard-tiles/layout', ({ body }) => {
  if (!Array.isArray(body.tiles)) {
    throw httpError('tiles must be an array');
  }

  for (const t of body.tiles) {
    const row = findById('dashboard_tiles', t.id);
    if (row) {
      touch(row, { x: Number(t.x) || 0, y: Number(t.y) || 0, w: Number(t.w) || 1, h: Number(t.h) || 1 });
    }
  }

  return { success: true };
});

route('PUT', '/dashboard-tiles/:id', ({ params, body }) => {
  const row = findById('dashboard_tiles', params.id);
  if (row) {
    touch(row, { config_json: JSON.stringify(body.config || {}) });
  }

  return { success: true };
});

route('DELETE', '/dashboard-tiles/:id', ({ params }) => {
  db.dashboard_tiles = db.dashboard_tiles.filter(t => t.id !== Number(params.id));
  return { success: true };
});

// --- Entry point (called from services/api.js in place of fetch) ---

export async function handleDemoRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const [pathname, search = ''] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  const body = options.body ? JSON.parse(options.body) : {};

  for (const r of routes) {
    if (r.method !== method) {
      continue;
    }

    const match = pathname.match(r.regex);
    if (!match) {
      continue;
    }

    const params = Object.fromEntries(r.keys.map((key, i) => [key, match[i + 1]]));
    const result = r.handler({ params, query, body });
    if (method !== 'GET') {
      saveDb();
    }

    // Round-trip through JSON like a real response would, so callers can't mutate the db
    return JSON.parse(JSON.stringify(result));
  }

  throw httpError(DEMO_DISABLED_MESSAGE);
}
