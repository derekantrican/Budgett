// Income source types and pay periods, plus the math to turn a raw income_sources
// row into the derived per-paycheck/monthly figures shown on its card.

import { evaluateBudgetExpression } from './budgetFormula';

export const INCOME_TYPES = [
  { value: 'salary', label: 'Salary' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'commission', label: 'Per-Unit (commission)' },
  { value: 'fixed', label: 'Fixed Amount (per paycheck)' },
];

export const PAY_PERIODS = [
  { value: 'weekly', label: 'Weekly', periodsPerYear: 52 },
  { value: 'biweekly', label: 'Biweekly', periodsPerYear: 26 },
  { value: 'semimonthly', label: 'Semimonthly', periodsPerYear: 24 },
  { value: 'monthly', label: 'Monthly', periodsPerYear: 12 },
];

export const periodsPerYear = (payPeriod) =>
  PAY_PERIODS.find(p => p.value === payPeriod)?.periodsPerYear || 12;

// Pay periods whose actual paycheck count for a given month can vary (e.g. a weekly
// payday can land 4 or 5 times in a month) - these are the ones that need extra info
// (a weekday, or a reference date) to pin down exactly. Semimonthly/monthly always
// land the same number of times every month.
export const VARIABLE_COUNT_PERIODS = ['weekly', 'biweekly'];

export const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const WEEKDAY_NAMES = WEEKDAYS.map(w => w.label);

// Parse a 'YYYY-MM-DD' string into a UTC-midnight timestamp (ms), avoiding local
// timezone shifting the date by a day.
function parseISODateUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Weekly only needs a day of the week - every week it lands. Biweekly alternates
// which week it lands on, so a plain weekday isn't enough; it needs an actual
// reference_pay_date to anchor the 14-day cycle.
export function paydayLabel(source) {
  if (source.pay_period === 'weekly' && source.payday_weekday != null && source.payday_weekday !== '') {
    return WEEKDAY_NAMES[Number(source.payday_weekday)];
  }

  if (source.pay_period === 'biweekly' && source.reference_pay_date) {
    const utc = parseISODateUTC(source.reference_pay_date);
    return WEEKDAY_NAMES[new Date(utc).getUTCDay()];
  }

  return null;
}

// Counts how many paychecks a weekly/biweekly income source actually pays out in the
// given calendar month. Weekly counts occurrences of payday_weekday; biweekly counts
// occurrences of the 14-day cycle anchored at reference_pay_date. Returns null when
// the period isn't variable-count or the needed info isn't set.
export function countPaychecksInMonth(source, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  if (source.pay_period === 'weekly') {
    if (source.payday_weekday == null || source.payday_weekday === '') {
      return null;
    }

    const weekday = Number(source.payday_weekday);
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, month, d).getDay() === weekday) {
        count++;
      }
    }

    return count;
  }

  if (source.pay_period === 'biweekly') {
    if (!source.reference_pay_date) {
      return null;
    }

    const refUTC = parseISODateUTC(source.reference_pay_date);
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dayUTC = Date.UTC(year, month, d);
      const diffDays = Math.round((dayUTC - refUTC) / 86400000);
      if (((diffDays % 14) + 14) % 14 === 0) {
        count++;
      }
    }

    return count;
  }

  return null;
}

// Resolve one adjustment (a paycheck "extra" like FITWH, 401k, etc.) to a dollar
// amount for a single pay period. Percent adjustments are a percentage of the
// gross pay for that same period.
export function resolveAdjustment(adjustment, grossPerPeriod) {
  const value = Number(adjustment.value) || 0;
  return adjustment.kind === 'percent' ? (value / 100) * grossPerPeriod : value;
}

// Returns { grossPerPeriod, netPerPeriod, monthlyGross, monthlyNet, paychecksThisMonth, resolvedQuantity, resolvedAdjustments }
//
// Monthly Gross/Net use the ACTUAL paycheck count for referenceDate's month when it's knowable
// (weekly/biweekly with a payday set) - e.g. a weekly source paying out 5 times this month shows
// 5x the per-paycheck amount, not the 52/12 = 4.33 average. Falls back to that average (via
// periodsPerYear/12) for semimonthly/monthly, or when no payday has been set yet.
export function computeIncomeAmounts(source, referenceDate = new Date()) {
  const amount = Number(source.amount) || 0;
  // quantity_per_period (hours/units) can be a plain number or an "="-prefixed formula, using
  // the same day-of-week variables and convention as category budget expressions - e.g.
  // "=4*sundays" for a lesson schedule, or "=1325.56/36". Evaluated for referenceDate's month,
  // same as the paycheck-count math below.
  const quantity = evaluateBudgetExpression(
    source.quantity_per_period != null ? String(source.quantity_per_period) : '',
    referenceDate.getFullYear(),
    referenceDate.getMonth()
  );
  const perYear = periodsPerYear(source.pay_period);

  let grossPerPeriod;
  if (source.type === 'salary') {
    grossPerPeriod = amount / perYear;
  }
  else if (source.type === 'fixed') {
    // a flat amount received every pay period, entered directly rather than derived
    grossPerPeriod = amount;
  }
  else {
    // hourly or commission: rate * quantity (hours or units) per pay period
    grossPerPeriod = amount * quantity;
  }

  const adjustments = source.adjustments || [];
  const resolvedAdjustments = adjustments.map(a => ({ ...a, resolved: resolveAdjustment(a, grossPerPeriod) }));
  const netPerPeriod = grossPerPeriod + resolvedAdjustments.reduce((sum, a) => sum + a.resolved, 0);

  const paychecksThisMonth = countPaychecksInMonth(source, referenceDate.getFullYear(), referenceDate.getMonth());
  const monthlyPaycheckCount = paychecksThisMonth != null ? paychecksThisMonth : perYear / 12;

  return {
    grossPerPeriod,
    netPerPeriod,
    monthlyGross: grossPerPeriod * monthlyPaycheckCount,
    monthlyNet: netPerPeriod * monthlyPaycheckCount,
    paychecksThisMonth,
    resolvedQuantity: quantity,
    resolvedAdjustments,
  };
}

// Sums Monthly Gross/Net across every active (non-archived) income source for the given
// calendar month. This is the basis for the income_gross/income_net budget formula
// variables - e.g. a tithing category budgeted as "income_gross*0.1".
export function sumIncomeForMonth(sources, referenceDate = new Date()) {
  return (sources || [])
    .filter(s => !s.is_archived)
    .reduce((totals, s) => {
      const amounts = computeIncomeAmounts(s, referenceDate);
      return { gross: totals.gross + amounts.monthlyGross, net: totals.net + amounts.monthlyNet };
    }, { gross: 0, net: 0 });
}
