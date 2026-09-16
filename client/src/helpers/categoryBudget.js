// Category budgeted/spent computation shared by the Categories page and the dashboard's
// categories table tile.

import { evaluateBudgetExpression } from './budgetFormula';
import { sumIncomeForMonth } from './income';

// income_gross/income_net for a given month, for use as extra variables in budget formulas
// (e.g. a tithing category budgeted as "income_gross*0.1").
export function incomeVariablesFor(incomeSources, year, month) {
  const totals = sumIncomeForMonth(incomeSources, new Date(year, month, 1));
  return { income_gross: totals.gross, income_net: totals.net };
}

// Evaluates a category's budgeted amount for a single month, or summed across a whole year
// (income varies month to month - e.g. a 5-paycheck month - so income_gross/income_net are
// recomputed for each one rather than reused).
export function evaluateCategoryBudget(cat, incomeSources, year, month, mode = 'month') {
  if (!cat.budgeted_amount_expression) {
    return 0;
  }

  if (mode === 'year') {
    let total = 0;
    for (let m = 0; m < 12; m++) {
      total += evaluateBudgetExpression(cat.budgeted_amount_expression, year, m, incomeVariablesFor(incomeSources, year, m));
    }

    return total;
  }

  return evaluateBudgetExpression(cat.budgeted_amount_expression, year, month, incomeVariablesFor(incomeSources, year, month));
}

// Sums a category's transaction splits into a single spent total (negative = expense,
// matching the convention used throughout the app).
export function categorySpent(cat, transactions) {
  return transactions
    .filter(t => t.splits?.some(s => s.category_id === cat.id))
    .reduce((sum, t) => {
      const catSplits = t.splits.filter(s => s.category_id === cat.id);
      return sum + catSplits.reduce((s, split) => s + split.amount, 0);
    }, 0);
}
