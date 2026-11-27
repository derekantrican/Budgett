// Plaid connector. Plaid pushes "updates available" webhooks and serves incremental changes
// (added/modified/removed) behind an opaque cursor, so this is a 'changes'-mode connector.
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

const plaidEnv = process.env.PLAID_ENV || 'sandbox';
const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[plaidEnv],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': plaidEnv === 'sandbox'
        ? process.env.PLAID_SECRET_SANDBOX
        : process.env.PLAID_SECRET_PRODUCTION,
    },
  },
}));

function accessTokenOf(institution) {
  const { access_token: accessToken } = JSON.parse(institution.credentials_json || '{}');
  if (!accessToken) {
    throw new Error(`Plaid institution ${institution.id} has no access token`);
  }

  return accessToken;
}

function normalizeAccount(acct) {
  return {
    externalId: acct.account_id,
    name: acct.name,
    officialName: acct.official_name,
    type: acct.type,
    subtype: acct.subtype,
    mask: acct.mask,
    currentBalance: acct.balances.current,
    availableBalance: acct.balances.available,
  };
}

function normalizeTransaction(txn) {
  return {
    externalId: txn.transaction_id,
    externalPendingId: txn.pending_transaction_id || null,
    externalAccountId: txn.account_id,
    date: txn.date,
    description: txn.name,
    merchantName: txn.merchant_name || null,
    merchant: txn.merchant_name || txn.name,
    amount: -txn.amount, // Plaid: positive = money out. Budgett: negative = expense.
    pending: !!txn.pending,
    providerCategory: txn.personal_finance_category?.primary || null,
    providerCategoryDetailed: txn.personal_finance_category?.detailed || null,
    raw: txn,
  };
}

async function fetchAccounts(institution, { live = false } = {}) {
  const accessToken = accessTokenOf(institution);
  // accountsBalanceGet forces a real-time balance pull from the institution (slower, and
  // billed separately); accountsGet returns Plaid's cached balances.
  const response = live
    ? await plaidClient.accountsBalanceGet({ access_token: accessToken })
    : await plaidClient.accountsGet({ access_token: accessToken });
  return response.data.accounts.map(normalizeAccount);
}

async function fetchChanges(institution) {
  const accessToken = accessTokenOf(institution);
  let cursor = JSON.parse(institution.sync_state_json || '{}').cursor || undefined;
  const added = [], modified = [], removed = [];

  let hasMore = true;
  while (hasMore) {
    const response = await plaidClient.transactionsSync({ access_token: accessToken, cursor });
    const data = response.data;

    added.push(...data.added.map(normalizeTransaction));
    modified.push(...data.modified.map(normalizeTransaction));
    removed.push(...data.removed.map(r => ({ externalId: r.transaction_id })));

    hasMore = data.has_more;
    cursor = data.next_cursor;
  }

  return { added, modified, removed, syncState: { cursor } };
}

async function searchTransactions(institution, externalAccountId, startDate, endDate) {
  const response = await plaidClient.transactionsGet({
    access_token: accessTokenOf(institution),
    start_date: startDate,
    end_date: endDate,
    options: { account_ids: [externalAccountId], count: 100 },
  });
  return response.data.transactions.map(normalizeTransaction);
}

function classifyError(err) {
  const plaidError = err.response?.data;
  return {
    loginRequired: plaidError?.error_code === 'ITEM_LOGIN_REQUIRED',
    code: plaidError?.error_code || null,
    message: plaidError?.error_message || err.message,
  };
}

module.exports = {
  id: 'plaid',
  displayName: 'Plaid',
  capabilities: { webhooks: true, syncMode: 'changes', candidateSearch: true },
  fetchAccounts,
  fetchChanges,
  searchTransactions,
  classifyError,
  // Plaid-only internals, used by connectors/plaid/routes.js and scripts/migrate_webhooks.js
  plaidClient,
  accessTokenOf,
};
