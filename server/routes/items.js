const router = require('express').Router();
const { createItem, createAccount, getItemsByUser, getAccountsByItem } = require('../db/queries');
const { plaidClient } = require('./link');
const { syncTransactions } = require('../webhookHandlers/transactionSync');

// GET /api/items - return all items with accounts
router.get('/', (req, res) => {
  const { all } = require('../db/queries');
  const items = all('SELECT * FROM items');
  for (const item of items) {
    item.accounts = getAccountsByItem(item.id);
  }
  res.json(items);
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
    console.error('Item exchange error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

module.exports = router;
