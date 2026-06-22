const router = require('express').Router();
const { getTransactionsByDateRange, createTransaction, getTransactionByPlaidId,
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

    if (row.split_amount !== null) {
      transactionsMap.get(row.id).splits.push({
        category_id: row.category_id || null,
        category_name: row.category_name || 'Uncategorized',
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
    `SELECT t.*, COALESCE(a.display_name, a.name) as account_name, ts.category_id, ts.notes as split_notes, ts.amount as split_amount, c.name as category_name
     FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
     LEFT JOIN categories c ON ts.category_id = c.id
     WHERE t.is_removed = 0
     AND (a.hide_from_transactions = 0 OR a.hide_from_transactions IS NULL)
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

    if (row.split_amount !== null) {
      transactionsMap.get(row.id).splits.push({
        category_id: row.category_id || null,
        category_name: row.category_name || 'Uncategorized',
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

// GET /api/transactions/by-plaid-id/:plaidId
router.get('/by-plaid-id/:plaidId', (req, res) => {
  const txn = getTransactionByPlaidId(req.params.plaidId);
  if (!txn) 
    return res.status(404).json({ error: 'Transaction not found' });
  const splits = getSplitsByTransaction(txn.id);
  res.json({ ...txn, splits });
});

// POST /api/transactions (manual transaction entry)
router.post('/', (req, res) => {
  const { date, merchant, amount, account_id, plaid_transaction_id, splits } = req.body;

  if (!date || amount === undefined) {
    return res.status(400).json({ error: 'date and amount required' });
  }

  const result = createTransaction(
    plaid_transaction_id || null, null, account_id || null, date, merchant || null, amount, 0, null, null
  );

  const txnId = result.lastInsertRowid;

  if (splits && splits.length > 0) {
    for (const split of splits) {
      createSplit(txnId, split.category_id || null, split.amount, split.notes || null);
    }
  }

  res.status(201).json({ id: txnId });
});

// PUT /api/transactions/merge-and-link-plaid
// Merges multiple sibling transactions into one, preserving splits, and links a Plaid ID
router.put('/merge-and-link-plaid', (req, res) => {
  const { transaction_ids, plaid_transaction_id } = req.body;
  if (!transaction_ids || transaction_ids.length < 2 || !plaid_transaction_id) {
    return res.status(400).json({ error: 'transaction_ids (array, >=2) and plaid_transaction_id required' });
  }

  const { run, get: getOne, all: allFn } = require('../db/queries');

  // Use the first transaction as the primary
  const primaryId = transaction_ids[0];
  const otherIds = transaction_ids.slice(1);

  // Calculate total amount
  const txns = transaction_ids.map(tid => getOne('SELECT * FROM transactions WHERE id = ?', [tid])).filter(Boolean);
  const totalAmount = txns.reduce((sum, t) => sum + t.amount, 0);

  // Move splits from other transactions to the primary
  for (const otherId of otherIds) {
    const splits = allFn('SELECT * FROM transaction_splits WHERE transaction_id = ?', [otherId]);
    if (splits.length > 0) {
      for (const s of splits) {
        run('UPDATE transaction_splits SET transaction_id = ? WHERE id = ?', [primaryId, s.id]);
      }
    }
    else {
      // If the other transaction has no split row, create one from its amount/notes
      const otherTxn = getOne('SELECT * FROM transactions WHERE id = ?', [otherId]);
      if (otherTxn) {
        createSplit(primaryId, null, otherTxn.amount, otherTxn.notes);
      }
    }

    // Soft-delete the merged transaction
    run("UPDATE transactions SET is_removed = 1, updated_at = datetime('now') WHERE id = ?", [otherId]);
  }

  // If the primary also has no splits, create one from its original amount/notes
  const primarySplits = allFn('SELECT * FROM transaction_splits WHERE transaction_id = ?', [primaryId]);
  if (primarySplits.length === 0) {
    const primary = getOne('SELECT * FROM transactions WHERE id = ?', [primaryId]);
    if (primary) {
      createSplit(primaryId, null, primary.amount, primary.notes);
    }
  }

  // Update primary with total amount and plaid ID
  run(
    "UPDATE transactions SET amount = ?, plaid_transaction_id = ?, updated_at = datetime('now') WHERE id = ?",
    [totalAmount, plaid_transaction_id, primaryId]
  );

  res.json({ success: true, primary_id: primaryId });
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
  const { run, createSplit } = require('../db/queries');

  // Update transaction fields
  const updates = [];
  const params = [];
  if (merchant !== undefined) {
    updates.push('merchant = ?'); params.push(merchant || null); 
  }

  if (date !== undefined) {
    updates.push('date = ?'); params.push(date || null); 
  }

  if (account_id !== undefined) {
    updates.push('account_id = ?'); params.push(account_id || null); 
  }
  
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(id);
    run(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  // If category_id or notes provided and no splits exist, create one
  if (category_id !== undefined || notes !== undefined) {
    const { all: allFn } = require('../db/queries');
    const existing = allFn('SELECT id FROM transaction_splits WHERE transaction_id = ?', [id]);
    if (existing.length === 0) {
      const txn = allFn('SELECT amount FROM transactions WHERE id = ?', [id]);
      if (txn.length > 0) {
        createSplit(id, category_id || null, txn[0].amount, notes || null);
      }
    }
    else {
      // Update the first split
      const splitUpdates = [];
      const splitParams = [];
      if (category_id !== undefined) {
        splitUpdates.push('category_id = ?'); splitParams.push(category_id || null);
      }

      if (notes !== undefined) {
        splitUpdates.push('notes = ?'); splitParams.push(notes || null);
      }

      if (splitUpdates.length > 0) {
        splitParams.push(existing[0].id);
        run(`UPDATE transaction_splits SET ${splitUpdates.join(', ')} WHERE id = ?`, splitParams);
      }
    }
  }

  res.json({ success: true });
});

// GET /api/transactions/:id/plaid-candidates
// Query Plaid API for transactions near the date of an incomplete transaction
router.get('/:id/plaid-candidates', async (req, res) => {
  const { id } = req.params;
  const { amount_override, start_date, end_date } = req.query;
  const { get: getOne, all: allFn } = require('../db/queries');

  const txn = getOne('SELECT t.*, a.plaid_account_id, a.item_id FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.id = ?', [id]);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (!txn.plaid_account_id) {
    return res.status(400).json({ error: 'Transaction has no linked account with a Plaid account ID' });
  }

  // Get the item's access token
  const item = getOne('SELECT plaid_access_token FROM items WHERE id = ?', [txn.item_id]);
  if (!item) {
    return res.status(400).json({ error: 'No Plaid item found for this account' });
  }

  // Use provided date range or default +-7 day window
  const fmtDate = (d) => d.toISOString().split('T')[0];
  let startDateStr, endDateStr;
  if (start_date && end_date) {
    startDateStr = start_date;
    endDateStr = end_date;
  }
  else {
    const date = new Date(txn.date + 'T12:00:00');
    const sd = new Date(date); sd.setDate(date.getDate() - 7);
    const ed = new Date(date); ed.setDate(date.getDate() + 7);
    startDateStr = fmtDate(sd);
    endDateStr = fmtDate(ed);
  }

  try {
    const { plaidClient } = require('./link');
    const response = await plaidClient.transactionsGet({
      access_token: item.plaid_access_token,
      start_date: startDateStr,
      end_date: endDateStr,
      options: {
        account_ids: [txn.plaid_account_id],
        count: 100,
      },
    });

    const plaidTxns = response.data.transactions;

    // Check which plaid IDs are already claimed in our DB
    const claimedIds = new Set(
      allFn('SELECT plaid_transaction_id FROM transactions WHERE plaid_transaction_id IS NOT NULL')
        .map(r => r.plaid_transaction_id)
    );

    // Score candidates
    const matchAmount = amount_override !== undefined ? parseFloat(amount_override) : txn.amount;
    const txnDate = new Date(txn.date + 'T12:00:00');
    const candidates = plaidTxns.map(pt => {
      let score = 0;
      // Amount match (Plaid uses positive for debits, we use negative)
      if (Math.abs((-pt.amount) - matchAmount) < 0.01) 
        score += 100;
      else if (Math.abs((-pt.amount) - matchAmount) < 1.00) 
        score += 50;
      // Date match
      if (pt.date === txn.date) 
        score += 30;
      else {
        const dayDiff = Math.abs((new Date(pt.date) - txnDate) / 86400000);
        if (dayDiff <= 1) 
          score += 20;
        else if (dayDiff <= 3) 
          score += 10;
      }

      // Fuzzy merchant match
      if (txn.merchant && pt.name) {
        const a = txn.merchant.toLowerCase();
        const b = pt.name.toLowerCase();
        if (a === b) 
          score += 40;
        else if (b.includes(a) || a.includes(b)) 
          score += 25;
        else {
          const words = a.split(/\s+/);
          const matchedWords = words.filter(w => b.includes(w));
          if (matchedWords.length > 0) 
            score += Math.min(15, matchedWords.length * 5);
        }
      }

      return {
        plaid_transaction_id: pt.transaction_id,
        name: pt.name,
        merchant_name: pt.merchant_name,
        amount: -pt.amount,
        date: pt.date,
        category: pt.personal_finance_category?.primary || null,
        is_claimed: claimedIds.has(pt.transaction_id),
        score,
      };
    });

    // Sort by score descending, unclaimed first
    candidates.sort((a, b) => {
      if (a.is_claimed !== b.is_claimed) 
        return a.is_claimed ? 1 : -1;
      return b.score - a.score;
    });

    res.json({ transaction: { id: txn.id, date: txn.date, merchant: txn.merchant, amount: matchAmount }, candidates });
  }
  catch (err) {
    const logger = require('../helpers/logger');
    logger.error('plaid_candidates_failed', err.response?.data?.error_message || err.message);
    res.status(500).json({ error: 'Failed to fetch Plaid transactions' });
  }
});

// PUT /api/transactions/:id/link-plaid
router.put('/:id/link-plaid', (req, res) => {
  const { id } = req.params;
  const { plaid_transaction_id } = req.body;
  if (!plaid_transaction_id) {
    return res.status(400).json({ error: 'plaid_transaction_id required' });
  }

  const { run } = require('../db/queries');
  run("UPDATE transactions SET plaid_transaction_id = ?, updated_at = datetime('now') WHERE id = ?", [plaid_transaction_id, id]);
  res.json({ success: true });
});

// DELETE /api/transactions/:id - only allowed for transactions without a plaid_id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { get, deleteTransaction } = require('../db/queries');
  const txn = get('SELECT plaid_transaction_id FROM transactions WHERE id = ?', [id]);

  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (txn.plaid_transaction_id) {
    return res.status(400).json({ error: 'Cannot delete a transaction linked to Plaid' });
  }

  deleteTransaction(id);
  res.json({ success: true });
});

module.exports = router;
