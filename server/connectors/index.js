// Financial data connectors (Plaid today; SimpleFIN, statement import, etc. later).
//
// A connector owns everything about talking to one provider: its credentials format, how it
// authenticates, how it fetches accounts/balances/transactions, and how it maps the provider's
// data into Budgett's shape. Core code (services/sync.js, routes/institutions.js, ...) only ever
// works with an `institutions` row plus the normalized shapes below, and never calls a provider
// SDK directly.
//
// Each `institutions` row has a `provider` (the connector id) and two connector-owned JSON blobs:
// `credentials_json` (secrets; never sent to the client) and `sync_state_json` (e.g. a cursor).
//
// Connector interface (see connectors/plaid for the reference implementation):
//
//   id, displayName
//   capabilities: { webhooks, syncMode: 'changes' | 'snapshot', candidateSearch }
//
// Connector-specific HTTP flows (e.g. Plaid Link, Plaid's webhook) live in
// connectors/<id>/routes.js and are mounted by server/index.js under /api/connectors/<id>. They're
// kept out of the connector object itself so core services can require the registry without a
// require cycle (the routes call back into core services).
//
//   fetchAccounts(institution, { live })  -> NormalizedAccount[]
//       `live` asks for freshly-fetched balances where the provider distinguishes them.
//   fetchChanges(institution)             -> { added: NormalizedTxn[], modified: NormalizedTxn[],
//                                            removed: [{ externalId }], syncState }
//       Only for syncMode 'changes'. `syncState` is persisted as the new sync_state_json.
//   fetchSnapshot(institution, { startDate, endDate }) -> { accounts: NormalizedAccount[],
//                                            transactions: NormalizedTxn[],
//                                            window: { startDate, endDate }, syncState? }
//       Only for syncMode 'snapshot': every transaction (pending and posted) in the requested
//       'YYYY-MM-DD' window, plus all accounts with current balances. Core works out what was
//       added/modified/removed (services/snapshot.js). Return the window the data actually
//       covers if the provider capped it; pending transactions inside that window that are
//       missing from the result are treated as gone. `syncState`, if returned, is persisted.
//   searchTransactions(institution, externalAccountId, startDate, endDate) -> NormalizedTxn[]
//       Only if capabilities.candidateSearch (used to find a match for an incomplete txn).
//   classifyError(err)                   -> { loginRequired: boolean, code: string | null, message: string }
//       `code` is the provider's short error code, if it has one; `message` is human-readable.
//
//   NormalizedAccount: { externalId, name, officialName, type, subtype, mask,
//                        currentBalance, availableBalance }
//   NormalizedTxn:     { externalId, externalPendingId, externalAccountId, date ('YYYY-MM-DD'),
//                        description (raw), merchantName (cleaned, may be null),
//                        merchant (best display name), amount (Budgett sign: negative = expense),
//                        pending, providerCategory, providerCategoryDetailed, raw }
const plaid = require('./plaid');

const connectors = new Map([plaid].map(c => [c.id, c]));

function getConnector(id) {
  const connector = connectors.get(id);
  if (!connector) {
    throw new Error(`Unknown connector "${id}"`);
  }

  return connector;
}

const getConnectorFor = (institution) => getConnector(institution.provider);

const listConnectors = () => [...connectors.values()];

// Built-in connectors are registered above; this is for tests (fake connectors)
const registerConnector = (connector) => connectors.set(connector.id, connector);

function parseJson(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  }
  catch {
    return fallback;
  }
}

// Strip connector-owned secrets/state before an institution row goes anywhere near the client.
// eslint-disable-next-line no-unused-vars
const toPublicInstitution = ({ credentials_json, sync_state_json, ...institution }) => institution;

module.exports = { getConnector, getConnectorFor, listConnectors, registerConnector, parseJson, toPublicInstitution };
