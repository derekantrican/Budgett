const router = require('express').Router();
const { createWebhookPayload, createLog, getItemByPlaidId, updateItemStatus, getSetting } = require('../db/queries');
const { syncTransactions } = require('../webhookHandlers/transactionSync');
const { sendNotifications } = require('../helpers/notifications');

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
    if (webhook_code === 'ERROR' || webhook_code === 'PENDING_EXPIRATION' || webhook_code === 'LOGIN_REPAIRED') {
      const item = getItemByPlaidId(item_id);
      if (item) {
        if (webhook_code === 'LOGIN_REPAIRED') {
          updateItemStatus('ok', item.id);
          createLog('info', 'item_login_repaired', `Item ${item_id} login repaired`);
          await sendNotifications('item_login_repaired', {
            institution: item.display_name || item.institution_name,
          });
        } else {
          updateItemStatus('login_required', item.id);
          createLog('warn', 'item_login_required', `Item ${item_id} requires re-authentication`);
          const baseUrl = getSetting('base_url') || 'http://localhost:3000';
          await sendNotifications('item_login_required', {
            institution: item.display_name || item.institution_name,
            settings_link: `${baseUrl}/settings`,
          });
        }
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
