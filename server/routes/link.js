const router = require('express').Router();
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

const plaidEnv = process.env.PLAID_ENV || 'sandbox';
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[plaidEnv],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': plaidEnv === 'sandbox'
        ? process.env.PLAID_SECRET_SANDBOX
        : process.env.PLAID_SECRET_PRODUCTION,
    },
  },
});

const plaidClient = new PlaidApi(plaidConfig);

// GET /api/link/token
router.get('/token', async (req, res) => {
  try {
    const { getSetting } = require('../db/queries');
    const baseUrl = getSetting('base_url') || process.env.WEBHOOK_URL;
    const webhookUrl = baseUrl ? `${baseUrl}/api/webhook` : undefined;
    const itemId = req.query.item_id;

    const linkParams = {
      user: { client_user_id: 'budgett-user' }, // Any string — Plaid requires it but doesn't validate it
      client_name: 'Budgett',
      country_codes: ['US'],
      language: 'en',
      webhook: webhookUrl,
    };

    if (itemId) {
      // Re-authentication mode — look up access_token from DB
      const { get } = require('../db/queries');
      const item = get('SELECT plaid_access_token FROM items WHERE id = ?', [itemId]);
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      linkParams.access_token = item.plaid_access_token;
      // Without this, update mode only lets the user fix credentials/MFA — deselecting
      // accounts in the Link UI won't actually change the Item's authorized account set
      // for non-OAuth institutions (OAuth institutions with their own picker ignore this
      // and always allow account selection).
      linkParams.update = { account_selection_enabled: true };
    }
    else {
      // New connection mode
      linkParams.products = ['transactions'];
    }

    const response = await plaidClient.linkTokenCreate(linkParams);

    res.json({ link_token: response.data.link_token });
  }
  catch (err) {
    const logger = require('../helpers/logger');
    logger.error('link_token_failed', err.response?.data?.error_message || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

module.exports = router;
module.exports.plaidClient = plaidClient;
