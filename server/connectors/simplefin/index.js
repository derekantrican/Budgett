// SimpleFIN connector. SimpleFIN has no webhooks and no change feed: it returns every transaction
// in a date window, so this is a 'snapshot'-mode connector (core diffs it, see services/snapshot.js).
//
// One SimpleFIN access URL (stored in connector_credentials) covers every bank the user linked in
// SimpleFIN Bridge. Each Bridge "connection" (conn_id) becomes one Budgett institution, with
// external_id "<connector credential id>:<conn_id>". A single /accounts request serves all of a
// credential's institutions; ./sync.js does that fan-out on a schedule.
const { getConnectorCredentialById, getInstitutionsByConnectorCredential, deleteConnectorCredential,
  updateConnectorCredentialSyncState } = require('../../db/queries');
const { parseJson } = require('../parseJson');
const client = require('./client');

const ID = 'simplefin';
const MAX_RANGE_DAYS = 90; // SimpleFIN Bridge's per-request limit
const BALANCE_CACHE_MS = 15 * 60 * 1000; // SimpleFIN data only refreshes ~daily; spare the 24/day quota
const DAY_SECONDS = 24 * 60 * 60;

const institutionExternalId = (credentialId, connId) => `${credentialId}:${connId}`;
const connIdOf = (institution) => institution.external_id.slice(institution.external_id.indexOf(':') + 1);

function accessUrlOf(credential) {
  const { access_url: accessUrl } = parseJson(credential.credentials_json, {});
  if (!accessUrl) {
    throw new Error(`SimpleFIN credential ${credential.id} has no access URL`);
  }

  return accessUrl;
}

function credentialFor(institution) {
  const credential = institution.connector_credential_id && getConnectorCredentialById(institution.connector_credential_id);
  if (!credential) {
    throw new Error(`SimpleFIN institution ${institution.id} has no SimpleFIN credential`);
  }

  return credential;
}

// --- Response shape (protocol v2, with a fallback for v1's per-account `org` object) ---

const orgKey = (org) => (org && (org.id || org.domain || org.name)) || 'unknown';
const accountConnId = (acct) => acct.conn_id || orgKey(acct.org);

// [{ connId, name, orgId, orgUrl }]
function connectionsOf(data) {
  if (Array.isArray(data.connections) && data.connections.length > 0) {
    return data.connections.map(c => ({ connId: c.conn_id, name: c.name || c.org_name || null, orgId: c.org_id || null, orgUrl: c.org_url || null }));
  }

  const byId = new Map();
  for (const acct of data.accounts || []) {
    const connId = accountConnId(acct);
    if (!byId.has(connId)) {
      byId.set(connId, { connId, name: acct.org?.name || acct.org?.domain || acct.conn_name || null, orgId: acct.org?.id || acct.org?.domain || null, orgUrl: acct.org?.url || null });
    }
  }

  return [...byId.values()];
}

const toNumber = (value) => (value === undefined || value === null || value === '' ? null : Math.round(Number(value) * 100) / 100);

// Dates are taken in the server's local time zone, the same way the rest of Budgett treats them
function unixToDateString(seconds) {
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dateStringToUnix = (dateString) => Math.floor(new Date(`${dateString}T00:00:00`).getTime() / 1000);

function normalizeAccount(acct) {
  return {
    externalId: acct.id,
    name: acct.name,
    officialName: null,
    type: null, // SimpleFIN doesn't classify accounts
    subtype: null,
    mask: null,
    currentBalance: toNumber(acct.balance),
    availableBalance: toNumber(acct['available-balance']),
  };
}

function normalizeTransaction(txn, accountExternalId) {
  // `posted` may be 0 while pending; prefer when it actually happened
  const when = txn.transacted_at || (txn.posted > 0 ? txn.posted : null);
  const description = (txn.description || '').trim();
  const payee = (txn.payee || '').trim(); // not in the spec, but some servers send it
  return {
    externalId: txn.id,
    externalPendingId: null, // SimpleFIN doesn't link a posted transaction to its pending one
    externalAccountId: accountExternalId,
    date: when ? unixToDateString(when) : unixToDateString(Date.now() / 1000),
    description,
    merchantName: payee || null,
    merchant: payee || description,
    amount: toNumber(txn.amount), // SimpleFIN already uses Budgett's sign: negative = money out
    pending: !!txn.pending,
    providerCategory: null,
    providerCategoryDetailed: null,
    raw: txn,
  };
}

// Clamp a 'YYYY-MM-DD' window to what one request may cover. Returns the covered window too, so
// core never treats pending transactions outside it as gone.
function requestRange({ startDate, endDate }) {
  const endUnix = dateStringToUnix(endDate) + DAY_SECONDS; // end-date is exclusive
  const startUnix = Math.max(dateStringToUnix(startDate), endUnix - MAX_RANGE_DAYS * DAY_SECONDS);
  return { startUnix, endUnix, window: { startDate: unixToDateString(startUnix), endDate } };
}

// The slice of one /accounts response that belongs to one connection, as a core snapshot.
// `skipAccountIds`: accounts the server reported errors for; leaving them out of `accounts`
// tells core their missing transactions don't mean anything.
function snapshotForConnection(data, connId, window, { skipAccountIds = new Set() } = {}) {
  const accounts = (data.accounts || []).filter(a => accountConnId(a) === connId && !skipAccountIds.has(a.id));
  return {
    accounts: accounts.map(normalizeAccount),
    transactions: accounts.flatMap(a => (a.transactions || []).map(t => normalizeTransaction(t, a.id))),
    window,
  };
}

// --- Fetching (cached per credential, so N institutions don't cost N requests) ---

const balanceCache = new Map(); // credential id -> { at, data }

async function fetchWindow(credential, window) {
  const { startUnix, endUnix, window: covered } = requestRange(window);
  const data = await client.getAccounts(accessUrlOf(credential), { startDate: startUnix, endDate: endUnix, pending: true });
  balanceCache.set(credential.id, { at: Date.now(), data });
  return { data, window: covered };
}

async function fetchBalances(credential) {
  const cached = balanceCache.get(credential.id);
  if (cached && Date.now() - cached.at < BALANCE_CACHE_MS) {
    return cached.data;
  }

  const data = await client.getAccounts(accessUrlOf(credential), { balancesOnly: true, pending: false });
  balanceCache.set(credential.id, { at: Date.now(), data });
  return data;
}

module.exports = {
  id: ID,
  displayName: 'SimpleFIN',
  capabilities: { webhooks: false, syncMode: 'snapshot', candidateSearch: false },

  async fetchAccounts(institution) {
    const data = await fetchBalances(credentialFor(institution));
    const connId = connIdOf(institution);
    return (data.accounts || []).filter(a => accountConnId(a) === connId).map(normalizeAccount);
  },

  // Normally ./sync.js fetches once per credential and ingests each institution's share; this
  // single-institution path exists so the generic syncInstitution also works.
  async fetchSnapshot(institution, window) {
    const { data, window: covered } = await fetchWindow(credentialFor(institution), window);
    return snapshotForConnection(data, connIdOf(institution), covered);
  },

  classifyError(err) {
    if (err?.status === 403) {
      return { loginRequired: true, code: 'gen.auth', message: err.message };
    }

    if (err?.status === 402) {
      return { loginRequired: true, code: 'payment_required', message: err.message };
    }

    return { loginRequired: false, code: err?.status ? String(err.status) : null, message: err?.message || String(err) };
  },

  // SimpleFIN would recreate a deleted bank on the next poll, so remember it as ignored. Deleting
  // a credential's last bank disconnects SimpleFIN entirely (the access URL is discarded; linking
  // again needs a new setup token).
  afterInstitutionDeleted(institution) {
    const credential = institution.connector_credential_id && getConnectorCredentialById(institution.connector_credential_id);
    if (!credential) {
      return;
    }

    // Keep the credential while other banks are still waiting for review
    const state = parseJson(credential.sync_state_json, {});
    if (getInstitutionsByConnectorCredential(credential.id).length === 0 && !(state.pendingConnections || []).length) {
      deleteConnectorCredential(credential.id);
      balanceCache.delete(credential.id);
      return;
    }

    const ignored = new Set(state.ignoredConnIds || []);
    ignored.add(connIdOf(institution));
    updateConnectorCredentialSyncState(JSON.stringify({ ...state, ignoredConnIds: [...ignored] }), credential.id);
  },

  // For ./sync.js and ./routes.js
  client, accessUrlOf, connectionsOf, accountConnId, snapshotForConnection, fetchWindow, fetchBalances,
  institutionExternalId, connIdOf, requestRange,
};
