const router = require('express').Router();
const { getAccountsByUser } = require('../db/queries');

// GET /api/accounts
router.get('/', (req, res) => {
  const accounts = getAccountsByUser(req.session.userId);
  res.json(accounts);
});

module.exports = router;
