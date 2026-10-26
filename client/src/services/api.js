const API_BASE = '/api';

// Only bundled into the demo build - process.env.REACT_APP_DEMO is inlined at build time, so
// webpack drops the require (and the seed data with it) from normal builds. This has to test
// process.env directly rather than IS_DEMO, since an imported constant isn't folded.
const demoApi = process.env.REACT_APP_DEMO === 'true' ? require('../demo/mockApi') : null;

async function request(path, options = {}) {
  if (demoApi) {
    return demoApi.handleDemoRequest(path, options);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

// Transactions
export const getTransactions = (startDate, endDate) =>
  request(`/transactions?start_date=${startDate}&end_date=${endDate}`);
export const searchTransactions = (query) =>
  request(`/transactions/search?query=${encodeURIComponent(query)}`);
export const createTransaction = (data) =>
  request('/transactions', { method: 'POST', body: JSON.stringify(data) });
export const updateTransaction = (id, data) =>
  request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTransaction = (id) =>
  request(`/transactions/${id}`, { method: 'DELETE' });
export const updateSplits = (txnId, splits) =>
  request(`/transactions/${txnId}/splits`, { method: 'PUT', body: JSON.stringify({ splits }) });
export const getTransactionByPlaidId = (plaidId) =>
  request(`/transactions/by-plaid-id/${encodeURIComponent(plaidId)}`);
export const getPlaidCandidates = (txnId, amountOverride, startDate, endDate) => {
  const params = new URLSearchParams();
  if (amountOverride !== undefined) {
    params.set('amount_override', amountOverride);
  }

  if (startDate) {
    params.set('start_date', startDate);
  }

  if (endDate) {
    params.set('end_date', endDate);
  }

  const qs = params.toString() ? `?${params.toString()}` : '';
  return request(`/transactions/${txnId}/plaid-candidates${qs}`);
};

export const linkPlaidId = (txnId, plaidTransactionId) =>
  request(`/transactions/${txnId}/link-plaid`, { method: 'PUT', body: JSON.stringify({ plaid_transaction_id: plaidTransactionId }) });
export const mergeAndLinkPlaid = (transactionIds, plaidTransactionId) =>
  request('/transactions/merge-and-link-plaid', { method: 'PUT', body: JSON.stringify({ transaction_ids: transactionIds, plaid_transaction_id: plaidTransactionId }) });
export const getHiddenTransactions = (startDate, endDate) =>
  request(`/transactions/hidden?start_date=${startDate}&end_date=${endDate}`);
export const getCounterpartCandidates = (txnId) =>
  request(`/transactions/${txnId}/counterpart-candidates`);
export const linkCounterpart = (txnId, counterpartId, linkType, hideSelf, hideCounterpart) =>
  request(`/transactions/${txnId}/link-counterpart`, { method: 'POST', body: JSON.stringify({ counterpart_id: counterpartId, link_type: linkType, hide_self: hideSelf, hide_counterpart: hideCounterpart }) });
export const unlinkCounterpart = (txnId) =>
  request(`/transactions/${txnId}/unlink-counterpart`, { method: 'POST' });
export const getTransaction = (id) =>
  request(`/transactions/${id}`);

// Categories
export const getCategories = () => request('/categories');
export const createCategory = (data) =>
  request('/categories', { method: 'POST', body: JSON.stringify(data) });
export const updateCategoryApi = (id, data) =>
  request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const toggleCategoryHidden = (id, isHidden) =>
  request(`/categories/${id}/toggle-hidden`, { method: 'PATCH', body: JSON.stringify({ is_hidden: isHidden }) });
export const reorderCategory = (id, position) =>
  request(`/categories/${id}/reorder`, { method: 'PATCH', body: JSON.stringify({ position }) });
export const getCategoryUsage = (id) => request(`/categories/${id}/usage`);
export const deleteCategoryApi = (id) => request(`/categories/${id}`, { method: 'DELETE' });
export const mergeCategoryApi = (id, targetId) =>
  request(`/categories/${id}/merge`, { method: 'POST', body: JSON.stringify({ targetId }) });
export const disassociateCategoryApi = (id) =>
  request(`/categories/${id}/disassociate`, { method: 'POST' });

// Items / Accounts
export const getItems = () => request('/items');
export const updateItem = (id, data) =>
  request(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteItem = (id, deleteTransactions) =>
  request(`/items/${id}?delete_transactions=${deleteTransactions}`, { method: 'DELETE' });
export const exchangeToken = (publicToken, institution) =>
  request('/items', { method: 'POST', body: JSON.stringify({ public_token: publicToken, institution }) });
export const getAccountDiff = (itemId) => request(`/items/${itemId}/account-diff`);
export const removeAccountsApi = (itemId, accountIds, deleteTransactions) =>
  request(`/items/${itemId}/remove-accounts`, { method: 'POST', body: JSON.stringify({ account_ids: accountIds, delete_transactions: deleteTransactions }) });
export const getAccounts = () => request('/accounts');
export const updateAccount = (id, data) =>
  request(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// Link
export const getLinkToken = (itemId) =>
  request(itemId ? `/link/token?item_id=${encodeURIComponent(itemId)}` : '/link/token');

// Rules
export const getRules = () => request('/rules');
export const createRule = (data) =>
  request('/rules', { method: 'POST', body: JSON.stringify(data) });
export const updateRule = (id, data) =>
  request(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRule = (id) =>
  request(`/rules/${id}`, { method: 'DELETE' });
export const toggleRuleDisabled = (id, isDisabled) =>
  request(`/rules/${id}/toggle-disabled`, { method: 'PATCH', body: JSON.stringify({ is_disabled: isDisabled }) });

// Admin
export const getLogs = (limit = 100) => request(`/admin/logs?limit=${limit}`);
export const getWebhooks = (limit = 50) => request(`/admin/webhooks?limit=${limit}`);
export const getIncompleteTransactions = () => request('/admin/incomplete-transactions');
export const getMoneyMovement = (days = 30) => request(`/admin/money-movement?days=${days}`);

// Extensions
export const getExtensions = () => request('/extensions');
export const rescanExtensions = () => request('/extensions/rescan', { method: 'POST' });

// Settings
export const getSettings = () => request('/settings');
export const updateSettings = (data) =>
  request('/settings', { method: 'PUT', body: JSON.stringify(data) });

// Record Templates
export const getTemplates = () => request('/templates');
export const createTemplateApi = (data) =>
  request('/templates', { method: 'POST', body: JSON.stringify(data) });
export const updateTemplateApi = (id, data) =>
  request(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTemplateApi = (id) =>
  request(`/templates/${id}`, { method: 'DELETE' });

// Income
export const getIncome = () => request('/income');
export const createIncomeApi = (data) =>
  request('/income', { method: 'POST', body: JSON.stringify(data) });
export const updateIncomeApi = (id, data) =>
  request(`/income/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const toggleIncomeArchived = (id, isArchived) =>
  request(`/income/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ is_archived: isArchived }) });
export const deleteIncomeApi = (id) => request(`/income/${id}`, { method: 'DELETE' });

// Planning Views
export const getPlanningViews = () => request('/planning-views');
export const createPlanningView = (data) =>
  request('/planning-views', { method: 'POST', body: JSON.stringify(data) });
export const updatePlanningView = (id, data) =>
  request(`/planning-views/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePlanningView = (id) =>
  request(`/planning-views/${id}`, { method: 'DELETE' });

// Dashboard Tiles
export const getDashboardTiles = () => request('/dashboard-tiles');
export const createDashboardTile = (data) =>
  request('/dashboard-tiles', { method: 'POST', body: JSON.stringify(data) });
export const updateDashboardTile = (id, data) =>
  request(`/dashboard-tiles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const updateDashboardTilesLayout = (tiles) =>
  request('/dashboard-tiles/layout', { method: 'PUT', body: JSON.stringify({ tiles }) });
export const deleteDashboardTile = (id) =>
  request(`/dashboard-tiles/${id}`, { method: 'DELETE' });
