const router = require('express').Router();
const { getAllAccounts, getAllItems, getAccountsByItem, updateAccountBalance, run } = require('../db/queries');
const { plaidClient } = require('./link');

// GET /api/accounts
router.get('/', (req, res) => {
  const accounts = getAllAccounts();
  res.json(accounts);
});

// PATCH /api/accounts/:id
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { hide_from_transactions, display_name } = req.body;
  const updates = [];
  const params = [];
  if (hide_from_transactions !== undefined) {
    updates.push('hide_from_transactions = ?'); params.push(hide_from_transactions ? 1 : 0); 
  }

  if (display_name !== undefined) {
    updates.push('display_name = ?'); params.push(display_name || null); 
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(id);
    run(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  res.json({ success: true });
});

// GET /api/accounts/refresh-balances
router.get('/refresh-balances', async (req, res) => {
  const items = getAllItems();
  const results = [];

  for (const item of items) {
    try {
      const balanceResponse = await plaidClient.accountsBalanceGet({
        access_token: item.plaid_access_token,
      });

      for (const acct of balanceResponse.data.accounts) {
        const accounts = getAccountsByItem(item.id);
        const dbAccount = accounts.find(a => a.plaid_account_id === acct.account_id);
        if (dbAccount) {
          const oldCurrent = dbAccount.current_balance;
          const oldAvailable = dbAccount.available_balance;
          updateAccountBalance(acct.balances.current, acct.balances.available, dbAccount.id);
          results.push({
            institution: item.display_name || item.institution_name,
            institution_plaid_id: item.plaid_item_id,
            account: dbAccount.display_name || dbAccount.name,
            account_plaid_id: dbAccount.plaid_account_id,
            old_current: oldCurrent,
            new_current: acct.balances.current,
            old_available: oldAvailable,
            new_available: acct.balances.available,
          });
        }
      }
    }
    catch (e) {
      results.push({
        institution: item.display_name || item.institution_name,
        error: e.message,
      });
    }
  }

  res.json(results);
});

module.exports = router;
