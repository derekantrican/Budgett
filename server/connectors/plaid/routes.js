// Plaid-specific HTTP flows: Link token creation, public token exchange, and Plaid's webhook.
const router = require('express').Router();
const { getSetting, getInstitutionById, getInstitutionByExternalId, updateInstitutionStatus,
  createWebhookPayload } = require('../../db/queries');
const { addInstitution } = require('../../services/institutions');
const { syncInstitution } = require('../../services/sync');
const { sendNotifications } = require('../../helpers/notifications');
const logger = require('../../helpers/logger');
const plaid = require('.');

const { plaidClient, accessTokenOf } = plaid;

// GET /api/connectors/plaid/link-token[?institution_id=N]
// With institution_id, creates an update-mode token to re-authenticate an existing institution.
router.get('/link-token', async (req, res) => {
  try {
    const baseUrl = getSetting('base_url') || process.env.WEBHOOK_URL;
    const webhookUrl = baseUrl ? `${baseUrl}/api/webhook` : undefined;
    const institutionId = req.query.institution_id;

    const linkParams = {
      user: { client_user_id: 'budgett-user' }, // Any string — Plaid requires it but doesn't validate it
      client_name: 'Budgett',
      country_codes: ['US'],
      language: 'en',
      webhook: webhookUrl,
    };

    if (institutionId) {
      // Re-authentication mode
      const institution = getInstitutionById(institutionId);
      if (!institution || institution.provider !== plaid.id) {
        return res.status(404).json({ error: 'Institution not found' });
      }

      linkParams.access_token = accessTokenOf(institution);
      // Without this, update mode only lets the user fix credentials/MFA — deselecting
      // accounts in the Link UI won't actually change the Item's authorized account set
      // for non-OAuth institutions (OAuth institutions with their own picker ignore this
      // and always allow account selection).
      linkParams.update = { account_selection_enabled: true };
    }
    else {
      // New institution mode
      linkParams.products = ['transactions'];
    }

    const response = await plaidClient.linkTokenCreate(linkParams);

    res.json({ link_token: response.data.link_token });
  }
  catch (err) {
    logger.error('link_token_failed', plaid.classifyError(err).message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// POST /api/connectors/plaid/institutions (exchange public token after Link flow)
router.post('/institutions', async (req, res) => {
  // `link_institution` is Plaid Link's onSuccess metadata ({ name, institution_id: 'ins_...' }),
  // not one of our institution rows.
  const { public_token, link_institution: linkInstitution } = req.body;

  try {
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;
    const credentials = { access_token };

    const accounts = await plaid.fetchAccounts({ credentials_json: JSON.stringify(credentials) });
    const institution = await addInstitution({
      provider: plaid.id,
      externalId: item_id,
      credentials,
      name: linkInstitution?.name || null,
      providerInstitutionId: linkInstitution?.institution_id || null,
      accounts,
    }, req.io);

    res.status(201).json({ id: institution.id });
  }
  catch (err) {
    logger.error('item_exchange_failed', plaid.classifyError(err).message);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

// POST /api/webhook — Plaid's webhook (unauthenticated; see middleware/auth.js). Mounted at the
// original /api/webhook path rather than under /api/connectors/plaid, because that URL is
// registered on every existing Plaid item.
const webhookRouter = require('express').Router();
webhookRouter.post('/', async (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;

  try {
    createWebhookPayload(`${webhook_type}.${webhook_code}`, JSON.stringify(req.body));
    logger.info('webhook_received', `${webhook_type}.${webhook_code} for item ${item_id}`);
  }
  catch (e) {
    console.error('Error logging webhook:', e.message);
    // Can't use logger here — createLog may be what's failing
  }

  try {
    const institution = item_id ? getInstitutionByExternalId(plaid.id, item_id) : null;

    if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE' && institution) {
      await syncInstitution(institution, req.io);
    }

    if (webhook_type === 'ITEM' && institution
      && (webhook_code === 'ERROR' || webhook_code === 'PENDING_EXPIRATION' || webhook_code === 'LOGIN_REPAIRED')) {
      if (webhook_code === 'LOGIN_REPAIRED') {
        updateInstitutionStatus('ok', institution.id);
        logger.info('item_login_repaired', `Item ${item_id} login repaired`);
        await sendNotifications('item_login_repaired', {
          institution: institution.display_name || institution.name,
        });
      }
      else {
        updateInstitutionStatus('login_required', institution.id);
        logger.warn('item_login_required', `Item ${item_id} requires re-authentication`);
        const baseUrl = getSetting('base_url') || 'http://localhost:3000';
        await sendNotifications('item_login_required', {
          institution: institution.display_name || institution.name,
          settings_link: `${baseUrl}/settings`,
        });
      }
    }
  }
  catch (err) {
    logger.error('webhook_error', `${webhook_type}.${webhook_code}: ${err.message}`);
  }

  res.json({ received: true });
});

module.exports = { router, webhookRouter };
