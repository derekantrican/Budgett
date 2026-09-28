// Emergency fund math shared by the full Planning view (EmergencyFundView.js) and the
// dashboard's emergency fund tiles, so both read from one source of truth.
import { evaluateBudgetExpression } from './budgetFormula';

// Projects a fund's balance depleting at a constant monthly need (essential spend + margin - additional income), for the fund
// alone and (if configured) combined with backup accounts - runs exactly up to the month the
// longer-lasting of the two hits $0, so the chart doesn't trail off with a flat line past
// depletion.
function buildChartData(fundBalance, backupBalance, monthlyNeed, hasBackup) {
  const monthsFromFund = monthlyNeed > 0 ? fundBalance / monthlyNeed : null;
  const monthsWithBackup = hasBackup && monthlyNeed > 0
    ? (fundBalance + backupBalance) / monthlyNeed
    : null;

  const monthsUntilDepleted = hasBackup ? monthsWithBackup : monthsFromFund;
  const projectionMonths = monthlyNeed > 0
    ? Math.min(240, Math.max(1, Math.ceil(monthsUntilDepleted || 0)))
    : 0;

  const now = new Date();
  return Array.from({ length: projectionMonths + 1 }, (_, m) => ({
    date: new Date(now.getFullYear(), now.getMonth() + m, 1).toISOString().slice(0, 10),
    fundBalance: Math.max(fundBalance - monthlyNeed * m, 0),
    withBackupBalance: hasBackup ? Math.max(fundBalance + backupBalance - monthlyNeed * m, 0) : undefined,
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
  // Income that would keep coming in during an emergency (e.g. a partner's paycheck, rental
  // income) offsets what the fund itself has to cover each month. Subtracted after the margin,
  // so the margin pads the full essential spend rather than just the uncovered remainder.
  const additionalMonthlyIncome = Math.max(0, Number(config.additionalMonthlyIncome) || 0);
  const monthlyNeed = Math.max(0, monthlyEssentialTotal * (1 + marginPercent / 100) - additionalMonthlyIncome);
  const targetAmount = monthlyNeed * monthsOfCoverage;

  const fundAccounts = (accounts || []).filter(a => fundAccountIds.includes(a.id));
  const backupAccounts = (accounts || []).filter(a => backupAccountIds.includes(a.id));
  const fundBalance = fundAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
  const backupBalance = backupAccounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

  const percentFunded = fundAccountIds.length > 0 && targetAmount > 0
    ? Math.min(100, Math.max(0, (fundBalance / targetAmount) * 100))
    : null;
  const monthsFromFund = monthlyNeed > 0 && fundAccountIds.length > 0
    ? fundBalance / monthlyNeed
    : null;
  const monthsWithBackup = monthlyNeed > 0 && backupAccountIds.length > 0
    ? (fundBalance + backupBalance) / monthlyNeed
    : null;

  const showChart = monthlyNeed > 0 && fundAccounts.length > 0;
  const chartData = showChart
    ? buildChartData(fundBalance, backupBalance, monthlyNeed, backupAccounts.length > 0)
    : [];

  return {
    isConfigured: true,
    essentialCategories,
    monthlyBudgetFor,
    percentFor,
    monthsOfCoverage,
    marginPercent,
    additionalMonthlyIncome,
    monthlyEssentialTotal,
    monthlyNeed,
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
