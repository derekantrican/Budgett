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
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(req.session.userId) },
      client_name: 'Budgett',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      webhook: process.env.WEBHOOK_URL ? `${process.env.WEBHOOK_URL}/api/webhook` : undefined,
    });

    res.json({ link_token: response.data.link_token });
  }
  catch (err) {
    console.error('Link token error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

module.exports = router;
module.exports.plaidClient = plaidClient;
