const router = require('express').Router();
const { getAllAccounts, getAllInstitutions, getAccountsByInstitution, updateAccountBalance, updateInstitutionStatus, run } = require('../db/queries');
const { getConnectorFor } = require('../connectors');

// GET /api/accounts
router.get('/', (req, res) => {
  res.json(getAllAccounts());
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
  const institutions = getAllInstitutions();
  const results = [];

  for (const institution of institutions) {
    const connector = getConnectorFor(institution);
    const institutionIds = {
      provider: institution.provider,
      institution_external_id: institution.external_id,
    };

    try {
      const accounts = getAccountsByInstitution(institution.id);
      for (const acct of await connector.fetchAccounts(institution, { live: true })) {
        const dbAccount = accounts.find(a => a.external_id === acct.externalId);
        if (dbAccount) {
          const oldCurrent = dbAccount.current_balance;
          const oldAvailable = dbAccount.available_balance;
          updateAccountBalance(dbAccount.id, acct);
          results.push({
            institution: institution.display_name || institution.name,
            ...institutionIds,
            account: dbAccount.display_name || dbAccount.name,
            account_external_id: dbAccount.external_id,
            old_current: oldCurrent,
            new_current: acct.currentBalance,
            old_available: oldAvailable,
            new_available: acct.availableBalance,
          });
        }
      }
    }
    catch (e) {
      const { loginRequired, code, message } = connector.classifyError(e);
      if (loginRequired) {
        updateInstitutionStatus('login_required', institution.id);
      }

      results.push({
        institution: institution.display_name || institution.name,
        ...institutionIds,
        error: code || message,
      });
    }
  }

  res.json(results);
});

module.exports = router;
