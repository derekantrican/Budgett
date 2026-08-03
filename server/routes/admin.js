const router = require('express').Router();
const { getRecentLogs, getWebhookPayloads, getIncompleteTransactions, getMoneyMovement } = require('../db/queries');

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

// GET /api/admin/money-movement?days=30
router.get('/money-movement', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const rows = getMoneyMovement(days);
  const movements = rows.map(r => ({
    id: r.id,
    date: r.date,
    amount: Math.abs(r.amount),
    from: {
      name: r.from_name,
      mask: r.from_mask,
      icon_url: r.from_icon_url,
      logo: r.from_logo,
      color: r.from_color,
    },
    to: {
      id: r.to_id,
      name: r.to_name,
      mask: r.to_mask,
      icon_url: r.to_icon_url,
      logo: r.to_logo,
      color: r.to_color,
    },
  }));
  res.json(movements);
});

module.exports = router;
