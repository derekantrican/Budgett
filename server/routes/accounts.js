const router = require('express').Router();
const { getAllAccounts, run } = require('../db/queries');

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

module.exports = router;
