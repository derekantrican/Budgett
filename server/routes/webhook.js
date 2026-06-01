const router = require('express').Router();
const { createWebhookPayload, createLog, getItemByPlaidId, updateItemStatus } = require('../db/queries');
const { syncTransactions } = require('../webhookHandlers/transactionSync');

// POST /api/webhook (Plaid webhook - unauthenticated)
router.post('/', async (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;

  createWebhookPayload(`${webhook_type}.${webhook_code}`, JSON.stringify(req.body));
  createLog('info', 'webhook_received', `${webhook_type}.${webhook_code} for item ${item_id}`);

  if (webhook_type === 'TRANSACTIONS') {
    if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      const item = getItemByPlaidId(item_id);
      if (item) {
        await syncTransactions(item.plaid_item_id, item.plaid_access_token, item.transaction_cursor, req.io);
      }
    }
  }

  if (webhook_type === 'ITEM') {
    if (webhook_code === 'ERROR') {
      const item = getItemByPlaidId(item_id);
      if (item) {
        updateItemStatus('login_required', item.id);
        createLog('warn', 'item_login_required', `Item ${item_id} requires re-authentication`);
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
