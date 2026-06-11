const router = require('express').Router();
const { getRecentLogs, getWebhookPayloads, getIncompleteTransactions } = require('../db/queries');

// GET /api/admin/logs?limit=100
router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = getRecentLogs(limit);
  res.json(logs);
});

// GET /api/admin/webhooks?limit=50
router.get('/webhooks', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const payloads = getWebhookPayloads(limit);
  res.json(payloads);
});

// GET /api/admin/incomplete-transactions
router.get('/incomplete-transactions', (req, res) => {
  const txns = getIncompleteTransactions();
  res.json(txns);
});

module.exports = router;
