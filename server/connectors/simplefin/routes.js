// SimpleFIN-specific HTTP flows, mounted at /api/connectors/simplefin.
const router = require('express').Router();
const { createConnectorCredential, getConnectorCredentialsByProvider } = require('../../db/queries');
const { syncCredential } = require('./sync');
const logger = require('../../helpers/logger');
const simplefin = require('.');

const MIN_MANUAL_SYNC_GAP_MS = 15 * 60 * 1000; // manual syncs share Bridge's ~24/day quota

// POST /api/connectors/simplefin/connections { setup_token }
// Claims the one-time setup token for an access URL, stores it, and runs the first sync, which
// creates one institution per bank linked in SimpleFIN Bridge.
router.post('/connections', async (req, res) => {
  const { setup_token: setupToken } = req.body || {};
  if (!setupToken) {
    return res.status(400).json({ error: 'setup_token is required' });
  }

  let accessUrl;
  try {
    accessUrl = await simplefin.client.claimAccessUrl(setupToken);
  }
  catch (err) {
    logger.error('simplefin_claim_failed', err.message);
    return res.status(err.status === 400 || err.status === 403 ? 400 : 502).json({ error: err.message });
  }

  // The setup token is spent now, so keep the access URL even if the first sync fails
  const credentialId = createConnectorCredential(simplefin.id, JSON.stringify({ access_url: accessUrl })).lastInsertRowid;
  logger.info('simplefin_connected', `Connected SimpleFIN credential ${credentialId}`);

  const result = await syncCredential(credentialId, req.io);
  if (result.error) {
    return res.status(201).json({ id: credentialId, institutions: [], warning: `Connected, but the first sync failed: ${result.error}` });
  }

  res.status(201).json({ id: credentialId, institutions: result.institutions });
});

// POST /api/connectors/simplefin/sync - sync every SimpleFIN credential now
router.post('/sync', async (req, res) => {
  const credentials = getConnectorCredentialsByProvider(simplefin.id);
  const recent = credentials.filter(c => c.last_synced_at
    && Date.now() - new Date(`${c.last_synced_at.replace(' ', 'T')}Z`).getTime() < MIN_MANUAL_SYNC_GAP_MS);
  if (credentials.length > 0 && recent.length === credentials.length) {
    return res.status(429).json({ error: 'SimpleFIN synced in the last 15 minutes; try again later (SimpleFIN allows about 24 requests a day)' });
  }

  const results = [];
  for (const credential of credentials.filter(c => !recent.includes(c))) {
    results.push({ id: credential.id, ...(await syncCredential(credential.id, req.io)) });
  }

  res.json({ results });
});

module.exports = { router };
