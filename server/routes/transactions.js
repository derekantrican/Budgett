const router = require('express').Router();
const { getTransactionsByDateRange, createTransaction,
  createSplit, getSplitsByTransaction, deleteSplitsByTransaction,
  getIncompleteTransactions } = require('../db/queries');

// GET /api/transactions?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
router.get('/', (req, res) => {
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date and end_date required' });
  }

  const rows = getTransactionsByDateRange(start_date, end_date);

  // Group splits by transaction
  const transactionsMap = new Map();
  for (const row of rows) {
    if (!transactionsMap.has(row.id)) {
      transactionsMap.set(row.id, {
        ...row,
        splits: [],
      });
    }
    if (row.category_id) {
      transactionsMap.get(row.id).splits.push({
        category_id: row.category_id,
        category_name: row.category_name,
        amount: row.split_amount,
        notes: row.split_notes,
      });
    }
  }

  res.json(Array.from(transactionsMap.values()));
});

// GET /api/transactions/search?query=...
router.get('/search', (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'query parameter required' });
  }

  const { all } = require('../db/queries');
  const rows = all(
    `SELECT t.*, a.name as account_name, ts.category_id, ts.notes as split_notes, ts.amount as split_amount, c.name as category_name
     FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
     LEFT JOIN categories c ON ts.category_id = c.id
     WHERE t.is_removed = 0
     AND (t.merchant LIKE ? OR EXISTS (
       SELECT 1 FROM transaction_splits ts2 WHERE ts2.transaction_id = t.id AND ts2.notes LIKE ?
     ))
     ORDER BY t.date DESC LIMIT 500`,
    [`%${query}%`, `%${query}%`]
  );

  // Group splits by transaction
  const transactionsMap = new Map();
  for (const row of rows) {
    if (!transactionsMap.has(row.id)) {
      transactionsMap.set(row.id, { ...row, splits: [] });
    }
    if (row.category_id) {
      transactionsMap.get(row.id).splits.push({
        category_id: row.category_id,
        category_name: row.category_name,
        amount: row.split_amount,
        notes: row.split_notes,
      });
    }
  }

  res.json(Array.from(transactionsMap.values()));
});

// GET /api/transactions/incomplete
router.get('/incomplete', (req, res) => {
  const rows = getIncompleteTransactions();
  res.json(rows);
});

// POST /api/transactions (manual transaction entry)
router.post('/', (req, res) => {
  const { date, merchant, amount, account_id, splits } = req.body;

  if (!date || amount === undefined) {
    return res.status(400).json({ error: 'date and amount required' });
  }

  const result = createTransaction(
    null, null, account_id || null, date, merchant || null, amount, 0, null, null
  );

  const txnId = result.lastInsertRowid;

  if (splits && splits.length > 0) {
    for (const split of splits) {
      createSplit(txnId, split.category_id || null, split.amount, split.notes || null);
    }
  }

  res.status(201).json({ id: txnId });
});

// PUT /api/transactions/:id/splits
router.put('/:id/splits', (req, res) => {
  const { id } = req.params;
  const { splits } = req.body;

  if (!splits || !Array.isArray(splits)) {
    return res.status(400).json({ error: 'splits array required' });
  }

  deleteSplitsByTransaction(id);
  for (const split of splits) {
    createSplit(id, split.category_id || null, split.amount, split.notes || null);
  }

  const updated = getSplitsByTransaction(id);
  res.json(updated);
});

// PUT /api/transactions/:id (update transaction fields + optionally assign category)
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { merchant, notes, account_id, category_id, date } = req.body;
  const { run } = require('../db/queries');

  // Update transaction fields
  const updates = [];
  const params = [];
  if (merchant !== undefined) {
    updates.push('merchant = ?'); params.push(merchant || null); 
  }
  if (date !== undefined) {
    updates.push('date = ?'); params.push(date || null); 
  }
  if (notes !== undefined) {
    updates.push('notes = ?'); params.push(notes || null); 
  }
  if (account_id !== undefined) {
    updates.push('account_id = ?'); params.push(account_id || null); 
  }
  
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(id);
    run(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  // If category_id provided and no splits exist, create one
  if (category_id) {
    const { all: allFn } = require('../db/queries');
    const existing = allFn('SELECT id FROM transaction_splits WHERE transaction_id = ?', [id]);
    if (existing.length === 0) {
      const txn = allFn('SELECT amount FROM transactions WHERE id = ?', [id]);
      if (txn.length > 0) {
        createSplit(id, category_id, txn[0].amount, null);
      }
    }
  }

  res.json({ success: true });
});

module.exports = router;
