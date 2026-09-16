// Emergency fund math shared by the full Planning view (EmergencyFundView.js) and the
// dashboard's emergency fund tiles, so both read from one source of truth.
import { evaluateBudgetExpression } from './budgetFormula';

// Projects a fund's balance depleting at a constant monthly essential spend, for the fund
// alone and (if configured) combined with backup accounts - runs exactly up to the month the
// longer-lasting of the two hits $0, so the chart doesn't trail off with a flat line past
// depletion.
function buildChartData(fundBalance, backupBalance, monthlyEssentialWithMargin, hasBackup) {
  const monthsFromFund = monthlyEssentialWithMargin > 0 ? fundBalance / monthlyEssentialWithMargin : null;
  const monthsWithBackup = hasBackup && monthlyEssentialWithMargin > 0
    ? (fundBalance + backupBalance) / monthlyEssentialWithMargin
    : null;

  const monthsUntilDepleted = hasBackup ? monthsWithBackup : monthsFromFund;
  const projectionMonths = monthlyEssentialWithMargin > 0
    ? Math.min(240, Math.max(1, Math.ceil(monthsUntilDepleted || 0)))
    : 0;

  const now = new Date();
  return Array.from({ length: projectionMonths + 1 }, (_, m) => ({
    date: new Date(now.getFullYear(), now.getMonth() + m, 1).toISOString().slice(0, 10),
    fundBalance: Math.max(fundBalance - monthlyEssentialWithMargin * m, 0),
    withBackupBalance: hasBackup ? Math.max(fundBalance + backupBalance - monthlyEssentialWithMargin * m, 0) : undefined,
  }));
}

// Computes everything EmergencyFundView.js and the dashboard tiles need from a planning
// view's config plus the current categories/accounts: target amount, current fund/backup
// balances, months of coverage, and (if a fund is linked) a depletion-projection chart.
export function computeEmergencyFundPlan(config, categories, accounts) {
  const essentialCategoryIds = config.essentialCategoryIds || [];
  const monthsOfCoverage = config.monthsOfCoverage || 6;
  const fundAccountIds = config.fundAccountIds || [];
  const backupAccountIds = config.backupAccountIds || [];
  const isConfigured = essentialCategoryIds.length > 0;

  if (!isConfigured) {
    return { isConfigured: false };
  }

  const now = new Date();
  const visibleCategories = (categories || []).filter(c => !c.is_hidden);
  const essentialCategories = visibleCategories.filter(c => essentialCategoryIds.includes(c.id));

  // Category budgets are stored as negative (expense) amounts - use magnitude since this
  // deals entirely in "how much would we need to spend", not signed cash flow.
  const monthlyBudgetFor = (c) => Math.abs(evaluateBudgetExpression(c.budgeted_amount_expression, now.getFullYear(), now.getMonth()));
  const percentFor = (c) => {
    const raw = (config.categoryPercentages || {})[c.id];
    const num = raw === undefined || raw === '' ? 100 : Number(raw);
    return isFinite(num) ? num : 100;
  };

  const rationedAmountFor = (c) => monthlyBudgetFor(c) * (percentFor(c) / 100);
  const monthlyEssentialTotal = essentialCategories.reduce((sum, c) => sum + rationedAmountFor(c), 0);

  const marginPercent = Number(config.marginPercent) || 0;
  const monthlyEssentialWithMargin = monthlyEssentialTotal * (1 + marginPercent / 100);
  const targetAmount = monthlyEssentialWithMargin * monthsOfCoverage;

  const fundAccounts = (accounts || []).filter(a => fundAccountIds.includes(a.id));
  const backupAccounts = (accounts || []).filter(a => backupAccountIds.includes(a.id));
  const fundBalance = fundAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
  const backupBalance = backupAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

  const percentFunded = fundAccountIds.length > 0 && targetAmount > 0
    ? Math.min(100, Math.max(0, (fundBalance / targetAmount) * 100))
    : null;
  const monthsFromFund = monthlyEssentialWithMargin > 0 && fundAccountIds.length > 0
    ? fundBalance / monthlyEssentialWithMargin
    : null;
  const monthsWithBackup = monthlyEssentialWithMargin > 0 && backupAccountIds.length > 0
    ? (fundBalance + backupBalance) / monthlyEssentialWithMargin
    : null;

  const showChart = monthlyEssentialWithMargin > 0 && fundAccounts.length > 0;
  const chartData = showChart
    ? buildChartData(fundBalance, backupBalance, monthlyEssentialWithMargin, backupAccounts.length > 0)
    : [];

  return {
    isConfigured: true,
    essentialCategories,
    monthlyBudgetFor,
    percentFor,
    monthsOfCoverage,
    marginPercent,
    monthlyEssentialTotal,
    monthlyEssentialWithMargin,
    targetAmount,
    fundAccounts,
    backupAccounts,
    fundBalance,
    backupBalance,
    percentFunded,
    monthsFromFund,
    monthsWithBackup,
    showChart,
    chartData,
  };
}
