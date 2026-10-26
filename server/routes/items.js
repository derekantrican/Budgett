const router = require('express').Router();
const {
  createItem, createAccount, getAccountsByItem, deleteItem, run, get,
  getAccountTransactionCount, removeAccounts,
} = require('../db/queries');
const { plaidClient } = require('./link');
const { syncTransactions } = require('../webhookHandlers/transactionSync');

// GET /api/items - return all items with accounts
router.get('/', (req, res) => {
  const { all } = require('../db/queries');
  // Don't send the Plaid access token to the client - it grants ongoing access to the bank data
  const items = all('SELECT * FROM items').map(({ plaid_access_token, ...item }) => ({
    ...item,
    accounts: getAccountsByItem(item.id),
  }));

  res.json(items);
});

// PATCH /api/items/:id
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { display_name, display_icon_url, display_color, status } = req.body;
  const updates = [];
  const params = [];
  if (display_name !== undefined) {
    updates.push('display_name = ?'); params.push(display_name || null);
  }

  if (display_icon_url !== undefined) {
    updates.push('display_icon_url = ?'); params.push(display_icon_url || null);
  }

  if (display_color !== undefined) {
    updates.push('display_color = ?'); params.push(display_color || null);
  }

  if (status !== undefined) {
    updates.push('status = ?'); params.push(status);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(id);
    run(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  res.json({ success: true });
});

// GET /api/items/:id/account-diff - compare Plaid's currently-selected accounts against
// what's stored locally (used after reconnecting via Link update mode, where the user may
// have deselected accounts). Newly-selected accounts are added automatically; removed
// accounts are only reported here so the caller can decide what to do with their transactions.
router.get('/:id/account-diff', async (req, res) => {
  const { id } = req.params;

  try {
    const item = get('SELECT * FROM items WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const plaidRes = await plaidClient.accountsGet({ access_token: item.plaid_access_token });
    const plaidAccounts = plaidRes.data.accounts;
    const plaidAccountIds = new Set(plaidAccounts.map(a => a.account_id));

    const dbAccounts = getAccountsByItem(item.id);
    const dbPlaidIds = new Set(dbAccounts.map(a => a.plaid_account_id));

    const removed = dbAccounts.filter(a => !plaidAccountIds.has(a.plaid_account_id));
    const added = plaidAccounts.filter(a => !dbPlaidIds.has(a.account_id));

    for (const acct of added) {
      createAccount(
        item.id, acct.account_id, acct.name, acct.official_name,
        acct.type, acct.subtype, acct.mask,
        acct.balances.current, acct.balances.available
      );
    }

    res.json({
      removed: removed.map(a => ({
        id: a.id,
        name: a.display_name || a.name,
        mask: a.mask,
        transaction_count: getAccountTransactionCount(a.id),
      })),
      added_count: added.length,
    });
  }
  catch (err) {
    const logger = require('../helpers/logger');
    logger.error('account_diff_failed', err.response?.data?.error_message || err.message);
    res.status(500).json({ error: 'Failed to check account changes' });
  }
});

// POST /api/items/:id/remove-accounts - resolve accounts reported by account-diff as removed
router.post('/:id/remove-accounts', (req, res) => {
  const { account_ids, delete_transactions } = req.body;

  try {
    removeAccounts(account_ids || [], !!delete_transactions);
    res.json({ success: true });
  }
  catch (err) {
    const logger = require('../helpers/logger');
    logger.error('remove_accounts_failed', err.message);
    res.status(500).json({ error: 'Failed to remove accounts' });
  }
});

// DELETE /api/items/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const deleteTransactions = req.query.delete_transactions === 'true';

  try {
    deleteItem(id, deleteTransactions);
    const logger = require('../helpers/logger');
    logger.info('item_deleted', `Deleted institution ${id} (transactions ${deleteTransactions ? 'deleted' : 'kept'})`);
    res.json({ success: true });
  }
  catch (err) {
    const logger = require('../helpers/logger');
    logger.error('item_delete_failed', err.message);
    res.status(500).json({ error: 'Failed to delete institution' });
  }
});

// POST /api/items (exchange public token after Link flow)
router.post('/', async (req, res) => {
  const { public_token, institution } = req.body;

  try {
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    const result = createItem(
      item_id, access_token,
      institution?.name || null, institution?.institution_id || null
    );

    const itemDbId = result.lastInsertRowid;

    // Fetch and store accounts
    const accountsRes = await plaidClient.accountsGet({ access_token });
    for (const acct of accountsRes.data.accounts) {
      createAccount(
        itemDbId, acct.account_id, acct.name, acct.official_name,
        acct.type, acct.subtype, acct.mask,
        acct.balances.current, acct.balances.available
      );
    }

    // Trigger initial transaction sync
    await syncTransactions(item_id, access_token, null, req.io);

    res.status(201).json({ id: itemDbId, item_id });
  }
  catch (err) {
    const logger = require('../helpers/logger');
    logger.error('item_exchange_failed', err.response?.data?.error_message || err.message);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

module.exports = router;
