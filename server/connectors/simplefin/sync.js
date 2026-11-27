// SimpleFIN polling: SimpleFIN can't push, so Budgett pulls each credential on a schedule (about
// every 12h; Bridge expects <= 24 requests/day). One /accounts request per credential is split
// per Bridge connection and handed to core as one snapshot per institution.
const { getConnectorCredentialById, getConnectorCredentialsByProvider, getInstitutionsByConnectorCredential,
  getInstitutionByExternalId, getInstitutionById, createInstitution, updateInstitutionStatus,
  updateConnectorCredentialStatus, markConnectorCredentialSynced, updateConnectorCredentialSyncState,
  deleteConnectorCredential, getSetting } = require('../../db/queries');
const { computeSnapshotWindow, planSnapshotWindow } = require('../../services/snapshot');
const { ingestSnapshot } = require('../../services/sync');
const { findLinkedDuplicates } = require('../../services/duplicates');
const { sendNotifications } = require('../../helpers/notifications');
const { parseJson } = require('../parseJson');
const logger = require('../../helpers/logger');
const simplefin = require('.');

const POLL_INTERVAL_HOURS = Number(process.env.SIMPLEFIN_POLL_HOURS) || 12;
const CHECK_EVERY_MS = 60 * 60 * 1000;

const inFlight = new Set(); // credential ids currently syncing

// The earliest window any of the credential's institutions needs (one request serves them all).
// `fullWindow` asks for a new institution's initial history too (a bank approved after review).
function windowFor(credential, { fullWindow = false } = {}) {
  const windows = getInstitutionsByConnectorCredential(credential.id).map(i => planSnapshotWindow(i));
  if (fullWindow) {
    windows.push(computeSnapshotWindow({}));
  }

  if (windows.length === 0) {
    return computeSnapshotWindow({});
  }

  return {
    startDate: windows.reduce((min, w) => (w.startDate < min ? w.startDate : min), windows[0].startDate),
    endDate: windows.reduce((max, w) => (w.endDate > max ? w.endDate : max), windows[0].endDate),
  };
}

// Per-credential state (connector_credentials.sync_state_json):
//   ignoredConnIds     banks the user deleted or chose not to import; never imported again
//   pendingConnections banks held for the user to review before importing: every bank when
//                      SimpleFIN is first connected, and later-added banks that look like accounts
//                      already linked (e.g. through Plaid), which would otherwise duplicate every
//                      transaction. [{ connId, name, accounts: [{ name, currentBalance }], heldAt }]
//   approvedConnIds    banks the user reviewed and chose to import (skip the duplicate check)
const stateOf = (credential) => parseJson(credential.sync_state_json, {});
const saveState = (credentialId, state) => updateConnectorCredentialSyncState(JSON.stringify(state), credentialId);

function accountsForConnection(data, connId) {
  return (data.accounts || [])
    .filter(a => simplefin.accountConnId(a) === connId)
    .map(a => ({ name: a.name, currentBalance: a.balance == null || a.balance === '' ? null : Number(a.balance) }));
}

function holdConnection(state, connection, accounts) {
  state.pendingConnections = (state.pendingConnections || []).filter(p => p.connId !== connection.connId);
  state.pendingConnections.push({ connId: connection.connId, name: connection.name, accounts, heldAt: new Date().toISOString() });
}

const settingsLink = () => `${getSetting('base_url') || 'http://localhost:3000'}/settings`;
const nameOf = (institution) => institution.display_name || institution.name || 'SimpleFIN bank';

async function setInstitutionStatus(institution, status) {
  if (institution.status === status) {
    return;
  }

  updateInstitutionStatus(status, institution.id);
  if (status === 'login_required') {
    logger.warn('item_login_required', `SimpleFIN connection for ${nameOf(institution)} needs attention in SimpleFIN Bridge`);
    await sendNotifications('item_login_required', { institution: nameOf(institution), settings_link: settingsLink() });
  }
  else if (status === 'ok' && institution.status === 'login_required') {
    logger.info('item_login_repaired', `SimpleFIN connection for ${nameOf(institution)} is working again`);
    await sendNotifications('item_login_repaired', { institution: nameOf(institution) });
  }
}

// Pull one credential and ingest every bank it covers. Returns a summary; doesn't throw for
// provider errors (they're recorded on the credential / institutions instead).
async function syncCredential(credentialId, io, options = {}) {
  if (inFlight.has(credentialId)) {
    return { skipped: 'already syncing' };
  }

  inFlight.add(credentialId);
  try {
    return await syncCredentialNow(getConnectorCredentialById(credentialId), io, options);
  }
  finally {
    inFlight.delete(credentialId);
  }
}

async function syncCredentialNow(credential, io, { fullWindow = false } = {}) {
  if (!credential) {
    return { skipped: 'credential not found' };
  }

  let data;
  let window;
  try {
    ({ data, window } = await simplefin.fetchWindow(credential, windowFor(credential, { fullWindow })));
  }
  catch (err) {
    const { loginRequired, code, message } = simplefin.classifyError(err);
    updateConnectorCredentialStatus(loginRequired ? 'login_required' : 'error', message, credential.id);
    logger.error('simplefin_sync_failed', `SimpleFIN credential ${credential.id}: ${code || ''} ${message}`.trim());
    if (loginRequired) {
      for (const institution of getInstitutionsByConnectorCredential(credential.id)) {
        await setInstitutionStatus(institution, 'login_required');
      }
    }

    return { error: message };
  }

  updateConnectorCredentialStatus('ok', null, credential.id);

  // errlist (v2) entries may name a connection or account; `errors` (v1, strings) can't be placed
  const errlist = Array.isArray(data.errlist) ? data.errlist : [];
  for (const e of errlist.filter(e => !e.conn_id && !e.account_id)) {
    logger.warn('simplefin_error', `SimpleFIN: ${e.code}: ${e.msg}`);
  }

  for (const msg of (Array.isArray(data.errors) ? data.errors : [])) {
    logger.warn('simplefin_error', `SimpleFIN: ${msg}`);
  }

  const state = stateOf(credential);
  const ignored = new Set(state.ignoredConnIds || []);
  const approved = new Set(state.approvedConnIds || []);
  const summary = { institutions: [], held: [], window };
  let stateChanged = false;

  for (const connection of simplefin.connectionsOf(data)) {
    if (ignored.has(connection.connId)) {
      continue;
    }

    if ((state.pendingConnections || []).some(p => p.connId === connection.connId)) {
      summary.held.push(connection.name || connection.connId);
      continue;
    }

    const externalId = simplefin.institutionExternalId(credential.id, connection.connId);
    let institution = getInstitutionByExternalId(simplefin.id, externalId);
    if (!institution && !approved.has(connection.connId)) {
      // A bank added in SimpleFIN Bridge since the last poll. Hold it for review if it looks like
      // a bank that's already linked, rather than importing every transaction a second time.
      const accounts = accountsForConnection(data, connection.connId);
      const duplicates = findLinkedDuplicates(connection.name, accounts);
      if (duplicates.length > 0) {
        holdConnection(state, connection, accounts);
        stateChanged = true;
        summary.held.push(connection.name || connection.connId);
        const described = duplicates.map(d => `${d.account.name} ~ ${d.matches[0].institution_name} ${d.matches[0].account_name}`);
        logger.warn('possible_duplicate_held', `SimpleFIN bank ${connection.name || connection.connId} looks already linked `
          + `(${described.join('; ')}); not imported until reviewed in Settings`);
        continue;
      }
    }

    if (!institution) {
      const id = createInstitution(simplefin.id, externalId, '{}', connection.name, connection.orgId, credential.id).lastInsertRowid;
      institution = getInstitutionById(id);
      logger.info('institution_added', `New SimpleFIN bank: ${connection.name || connection.connId}`);
    }

    const connErrors = errlist.filter(e => e.conn_id === connection.connId && !e.account_id);
    const authError = connErrors.find(e => String(e.code).startsWith('con.auth'));
    for (const e of connErrors) {
      logger.warn('simplefin_error', `SimpleFIN ${nameOf(institution)}: ${e.code}: ${e.msg}`);
    }

    if (authError) {
      // Bridge can't reach this bank; whatever data came back may be stale or partial, so don't
      // let it remove anything
      await setInstitutionStatus(institution, 'login_required');
      summary.institutions.push({ id: institution.id, name: nameOf(institution), status: 'login_required' });
      continue;
    }

    const failedAccountIds = new Set(errlist.filter(e => e.account_id).map(e => e.account_id));
    for (const e of errlist.filter(e => e.account_id)) {
      logger.warn('simplefin_error', `SimpleFIN account ${e.account_id}: ${e.code}: ${e.msg}`);
    }

    const snapshot = simplefin.snapshotForConnection(data, connection.connId, window, { skipAccountIds: failedAccountIds });
    const changes = await ingestSnapshot(institution, snapshot, io);
    await setInstitutionStatus(getInstitutionById(institution.id), 'ok');
    summary.institutions.push({
      id: institution.id, name: nameOf(institution), status: 'ok',
      added: changes.added.length, modified: changes.modified.length, removed: changes.removed.length,
    });
  }

  if (stateChanged) {
    saveState(credential.id, state);
  }

  markConnectorCredentialSynced(credential.id);
  return summary;
}

// When SimpleFIN is first connected: hold every bank it has for review instead of importing
// straight away, so the user can see which ones look already linked and skip them.
async function holdAllForReview(credentialId) {
  const credential = getConnectorCredentialById(credentialId);
  const data = await simplefin.fetchBalances(credential);
  const state = stateOf(credential);
  for (const connection of simplefin.connectionsOf(data)) {
    holdConnection(state, connection, accountsForConnection(data, connection.connId));
  }

  saveState(credentialId, state);
}

// Banks waiting for review, across every SimpleFIN credential, with what they look like
function listPendingConnections() {
  return getConnectorCredentialsByProvider(simplefin.id).flatMap(credential =>
    (stateOf(credential).pendingConnections || []).map(p => ({
      credential_id: credential.id,
      conn_id: p.connId,
      name: p.name,
      held_at: p.heldAt,
      accounts: p.accounts.map(a => ({ name: a.name, current_balance: a.currentBalance })),
      duplicates: findLinkedDuplicates(p.name, p.accounts),
    })));
}

// Import (`importConnIds`) or ignore (`ignoreConnIds`) banks held for review
async function reviewPendingConnections(credentialId, { importConnIds = [], ignoreConnIds = [] }, io) {
  const credential = getConnectorCredentialById(credentialId);
  if (!credential) {
    return { error: 'not found' };
  }

  const state = stateOf(credential);
  const decided = new Set([...importConnIds, ...ignoreConnIds]);
  state.pendingConnections = (state.pendingConnections || []).filter(p => !decided.has(p.connId));
  state.approvedConnIds = [...new Set([...(state.approvedConnIds || []), ...importConnIds])];
  state.ignoredConnIds = [...new Set([...(state.ignoredConnIds || []), ...ignoreConnIds])];
  saveState(credentialId, state);
  if (ignoreConnIds.length > 0) {
    logger.info('simplefin_banks_ignored', `SimpleFIN credential ${credentialId}: not importing ${ignoreConnIds.join(', ')}`);
  }

  if (importConnIds.length > 0) {
    const result = await syncCredential(credentialId, io, { fullWindow: true });
    if (result.error) {
      return { error: result.error };
    }
  }

  // Nothing imported and nothing left to decide: SimpleFIN isn't in use, so drop the access URL
  if (getInstitutionsByConnectorCredential(credentialId).length === 0 && state.pendingConnections.length === 0) {
    deleteConnectorCredential(credentialId);
    logger.info('simplefin_disconnected', `SimpleFIN credential ${credentialId} removed (no banks imported)`);
    return { disconnected: true };
  }

  return {};
}

const isDue = (credential, now = Date.now()) =>
  !credential.last_synced_at
  || now - new Date(`${credential.last_synced_at.replace(' ', 'T')}Z`).getTime() >= POLL_INTERVAL_HOURS * 60 * 60 * 1000;

async function syncDueCredentials(io) {
  for (const credential of getConnectorCredentialsByProvider(simplefin.id).filter(c => isDue(c))) {
    try {
      await syncCredential(credential.id, io);
    }
    catch (err) {
      logger.error('simplefin_sync_error', `SimpleFIN credential ${credential.id}: ${err.message}`);
    }
  }
}

// Check hourly for credentials whose last sync is POLL_INTERVAL_HOURS old. Checking (rather than
// a fixed 12h timer) means restarts don't reset or skip the schedule. The first check runs a
// random few minutes after startup, as Bridge asks clients not to all fetch at the same moment.
function startScheduler(io) {
  const run = () => syncDueCredentials(io).catch(err => logger.error('simplefin_sync_error', err.message));
  setTimeout(() => {
    run();
    setInterval(run, CHECK_EVERY_MS).unref();
  }, (1 + Math.random() * 9) * 60 * 1000).unref();
}

module.exports = { syncCredential, syncDueCredentials, startScheduler, isDue, holdAllForReview, listPendingConnections,
  reviewPendingConnections };
