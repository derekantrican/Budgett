// SimpleFIN-specific HTTP flows, mounted at /api/connectors/simplefin.
const router = require('express').Router();
const { createConnectorCredential, getConnectorCredentialsByProvider } = require('../../db/queries');
const { syncCredential, holdAllForReview, listPendingConnections, reviewPendingConnections } = require('./sync');
const logger = require('../../helpers/logger');
const simplefin = require('.');

const MIN_MANUAL_SYNC_GAP_MS = 15 * 60 * 1000; // manual syncs share Bridge's ~24/day quota

// POST /api/connectors/simplefin/connections { setup_token }
// Claims the one-time setup token for an access URL and stores it. Nothing is imported yet: every
// bank linked in SimpleFIN Bridge is held for review (with any that look already linked, e.g.
// through Plaid, flagged), and the user picks which to import via POST /pending/review.
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

  try {
    await holdAllForReview(credentialId);
  }
  catch (err) {
    const { message } = simplefin.classifyError(err);
    logger.error('simplefin_sync_failed', `SimpleFIN credential ${credentialId}: ${message}`);
    return res.status(201).json({ id: credentialId, pending: [], warning: `Connected, but couldn't list your banks yet: ${message}` });
  }

  res.status(201).json({ id: credentialId, pending: listPendingConnections().filter(p => p.credential_id === credentialId) });
});

// GET /api/connectors/simplefin/pending - banks held for review (see sync.js)
router.get('/pending', (req, res) => {
  res.json(listPendingConnections());
});

// POST /api/connectors/simplefin/pending/review { credential_id, import: [conn_id], ignore: [conn_id] }
router.post('/pending/review', async (req, res) => {
  const { credential_id: credentialId, import: importConnIds = [], ignore: ignoreConnIds = [] } = req.body || {};
  if (!credentialId || !Array.isArray(importConnIds) || !Array.isArray(ignoreConnIds)) {
    return res.status(400).json({ error: 'credential_id, import and ignore are required' });
  }

  const result = await reviewPendingConnections(Number(credentialId), { importConnIds, ignoreConnIds }, req.io);
  if (result.error === 'not found') {
    return res.status(404).json({ error: 'SimpleFIN connection not found' });
  }

  if (result.error) {
    return res.status(502).json({ error: `Saved your choices, but the sync failed: ${result.error}` });
  }

  res.json(result);
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
