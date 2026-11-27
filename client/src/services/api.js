const API_BASE = '/api';

// Only bundled into the demo build - process.env.REACT_APP_DEMO is inlined at build time, so
// webpack drops the require (and the seed data with it) from normal builds. This has to test
// process.env directly rather than IS_DEMO, since an imported constant isn't folded.
const demoApi = process.env.REACT_APP_DEMO === 'true' ? require('../demo/mockApi') : null;

export const UNAUTHORIZED_EVENT = 'budgett:unauthorized';

async function request(path, options = {}) {
  if (demoApi) {
    return demoApi.handleDemoRequest(path, options);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    // Session expired (or was never valid) - App listens for this and swaps in the login page
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

// Auth (basic password login - only enforced when the server has REQUIRE_LOGIN=true)
export const getAuthStatus = () => request('/auth/status');
export const login = (password) =>
  request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
export const logout = () => request('/auth/logout', { method: 'POST' });

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
export const getTransactionByExternalId = (externalId) =>
  request(`/transactions/by-external-id/${encodeURIComponent(externalId)}`);
export const getExternalCandidates = (txnId, amountOverride, startDate, endDate) => {
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
  return request(`/transactions/${txnId}/external-candidates${qs}`);
};

export const linkExternalId = (txnId, externalId) =>
  request(`/transactions/${txnId}/link-external`, { method: 'PUT', body: JSON.stringify({ external_id: externalId }) });
export const mergeAndLinkExternal = (transactionIds, externalId) =>
  request('/transactions/merge-and-link-external', { method: 'PUT', body: JSON.stringify({ transaction_ids: transactionIds, external_id: externalId }) });
export const getHiddenTransactions = (startDate, endDate) =>
  request(`/transactions/hidden?start_date=${startDate}&end_date=${endDate}`);
export const getCounterpartCandidates = (txnId) =>
  request(`/transactions/${txnId}/counterpart-candidates`);
export const linkCounterpart = (txnId, counterpartId, hideSelf, hideCounterpart) =>
  request(`/transactions/${txnId}/link-counterpart`, { method: 'POST', body: JSON.stringify({ counterpart_id: counterpartId, hide_self: hideSelf, hide_counterpart: hideCounterpart }) });
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

// Institutions / Accounts
export const getInstitutions = () => request('/institutions');
export const updateInstitution = (id, data) =>
  request(`/institutions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteInstitution = (id, deleteTransactions) =>
  request(`/institutions/${id}?delete_transactions=${deleteTransactions}`, { method: 'DELETE' });
export const getAccountDiff = (institutionId) => request(`/institutions/${institutionId}/account-diff`);
export const removeAccountsApi = (institutionId, accountIds, deleteTransactions) =>
  request(`/institutions/${institutionId}/remove-accounts`, { method: 'POST', body: JSON.stringify({ account_ids: accountIds, delete_transactions: deleteTransactions }) });
export const getAccounts = () => request('/accounts');
export const updateAccount = (id, data) =>
  request(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// Plaid connector (Link flow)
export const getPlaidLinkToken = (institutionId) =>
  request(institutionId ? `/connectors/plaid/link-token?institution_id=${encodeURIComponent(institutionId)}` : '/connectors/plaid/link-token');
export const exchangePlaidToken = (publicToken, linkInstitution) =>
  request('/connectors/plaid/institutions', { method: 'POST', body: JSON.stringify({ public_token: publicToken, link_institution: linkInstitution }) });

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
