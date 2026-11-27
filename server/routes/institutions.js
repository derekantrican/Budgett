// Generic institution management. Connector-specific flows such as creating
// an institution live under /api/connectors/<id> (see connectors/<id>/routes.js).
const router = require('express').Router();
const {
  createAccount, getAccountsByInstitution, getAllInstitutions, getInstitutionById, deleteInstitution,
  run, getAccountTransactionCount, removeAccounts,
} = require('../db/queries');
const { getConnectorFor, toPublicInstitution } = require('../connectors');
const logger = require('../helpers/logger');
const { findLinkedDuplicates } = require('../services/duplicates');

// Credentials/sync state never go to the client - the credentials grant ongoing access to the bank data
const listPublicInstitutions = () => getAllInstitutions().map(institution => ({
  ...toPublicInstitution(institution),
  accounts: getAccountsByInstitution(institution.id),
}));

// GET /api/institutions - return all institutions with accounts
router.get('/', (req, res) => {
  res.json(listPublicInstitutions());
});

// POST /api/institutions/possible-duplicates { institution_name, accounts: [{ name, mask?, current_balance? }] }
// Checks accounts about to be linked against the ones already linked (any connector), so the
// client can warn before the same bank account is linked twice.
router.post('/possible-duplicates', (req, res) => {
  const { institution_name: institutionName, accounts } = req.body || {};
  const candidates = (Array.isArray(accounts) ? accounts : []).map(a => ({
    name: a.name, mask: a.mask, currentBalance: a.current_balance ?? null,
  }));
  res.json({ duplicates: findLinkedDuplicates(institutionName, candidates) });
});

// PATCH /api/institutions/:id
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
    run(`UPDATE institutions SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  res.json({ success: true });
});

// GET /api/institutions/:id/account-diff - compare the connector's current account list against
// what's stored locally (used after reconnecting, e.g. via Plaid Link update mode, where the user
// may have deselected accounts). Newly-provided accounts are added automatically; removed
// accounts are only reported here so the caller can decide what to do with their transactions.
router.get('/:id/account-diff', async (req, res) => {
  const institution = getInstitutionById(req.params.id);
  if (!institution) {
    return res.status(404).json({ error: 'Institution not found' });
  }

  const connector = getConnectorFor(institution);

  try {
    const remoteAccounts = await connector.fetchAccounts(institution);
    const remoteIds = new Set(remoteAccounts.map(a => a.externalId));

    const dbAccounts = getAccountsByInstitution(institution.id);
    const dbIds = new Set(dbAccounts.map(a => a.external_id));

    const removed = dbAccounts.filter(a => !remoteIds.has(a.external_id));
    const added = remoteAccounts.filter(a => !dbIds.has(a.externalId));

    for (const acct of added) {
      createAccount(institution.id, acct);
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
    logger.error('account_diff_failed', connector.classifyError(err).message);
    res.status(500).json({ error: 'Failed to check account changes' });
  }
});

// POST /api/institutions/:id/remove-accounts - resolve accounts reported by account-diff as removed
router.post('/:id/remove-accounts', (req, res) => {
  const { account_ids, delete_transactions } = req.body;

  try {
    removeAccounts(account_ids || [], !!delete_transactions);
    res.json({ success: true });
  }
  catch (err) {
    logger.error('remove_accounts_failed', err.message);
    res.status(500).json({ error: 'Failed to remove accounts' });
  }
});

// DELETE /api/institutions/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const deleteTransactions = req.query.delete_transactions === 'true';

  try {
    const institution = getInstitutionById(id);
    deleteInstitution(id, deleteTransactions);
    if (institution) {
      getConnectorFor(institution).afterInstitutionDeleted?.(institution);
    }

    logger.info('institution_deleted', `Deleted institution ${id} (transactions ${deleteTransactions ? 'deleted' : 'kept'})`);
    res.json({ success: true });
  }
  catch (err) {
    logger.error('institution_delete_failed', err.message);
    res.status(500).json({ error: 'Failed to delete institution' });
  }
});

module.exports = router;
