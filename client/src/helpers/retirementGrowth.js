export const DEFAULT_RETURN_RATE = 7;
export const DEFAULT_SCENARIO_SPREAD = 3;

// Decimal age (e.g. 34.2) as of `asOfDate` (defaults to now) for a 'YYYY-MM-DD' birth date -
// more precise than a whole-number age, and it stays accurate on its own as time passes
// rather than going stale the way a stored age would.
export function calculateAge(birthDateStr, asOfDate = new Date()) {
  const [y, m, d] = birthDateStr.split('-').map(Number);
  const birthDate = new Date(y, m - 1, d);
  return (asOfDate - birthDate) / (1000 * 60 * 60 * 24 * 365.25);
}

// Projects a single balance (with optional monthly contributions) from now until retirement
// age, applying one fixed annual return, compounded monthly - the building block used for
// each asset and for the contribution stream in computeRetirementPlan below.
function projectBalance({
  startingBalance,
  monthlyContribution = 0,
  annualContributionIncrease = 0,
  employerMatch = null,
  annualReturnRate,
  currentAge,
  retirementAge,
}) {
  const monthsToRetirement = Math.max(Math.round((retirementAge - currentAge) * 12), 0);
  const monthlyRate = (annualReturnRate / 100) / 12;
  const employerMonthly = employerMatch?.enabled ? Number(employerMatch.monthlyAmount) || 0 : 0;

  const now = new Date();
  const schedule = [{
    month: 0,
    date: now.toISOString().slice(0, 10),
    age: currentAge,
    balance: startingBalance,
    contribution: 0,
    employerMatch: 0,
    growth: 0,
  }];

  let balance = startingBalance;
  let contribution = monthlyContribution;

  for (let month = 1; month <= monthsToRetirement; month++) {
    if (annualContributionIncrease > 0 && (month - 1) % 12 === 0 && month > 1) {
      contribution *= 1 + annualContributionIncrease / 100;
    }

    const growth = balance * monthlyRate;
    balance += growth + contribution + employerMonthly;

    const date = new Date(now.getFullYear(), now.getMonth() + month, 1);
    schedule.push({
      month,
      date: date.toISOString().slice(0, 10),
      age: currentAge + month / 12,
      balance,
      contribution,
      employerMatch: employerMonthly,
      growth,
    });
  }

  return { schedule, monthsToRetirement };
}

// Sums several same-length schedules (one per asset, plus the contribution stream) into a
// single combined schedule - they all share the same dates/ages since they're all computed
// over the same currentAge -> retirementAge span.
function sumSchedules(schedules) {
  return schedules[0].map((row, i) => ({
    month: row.month,
    date: row.date,
    age: row.age,
    balance: schedules.reduce((sum, s) => sum + s[i].balance, 0),
    contribution: schedules.reduce((sum, s) => sum + s[i].contribution, 0),
    employerMatch: schedules.reduce((sum, s) => sum + s[i].employerMatch, 0),
    growth: schedules.reduce((sum, s) => sum + s[i].growth, 0),
  }));
}

// Year-by-year checkpoints (the schedule row on each birthday) for a summary table, so
// users aren't scrolling through hundreds of monthly rows.
function yearlyCheckpoints(schedule, monthsToRetirement) {
  const yearly = [];
  for (let year = 0; year <= Math.ceil(monthsToRetirement / 12); year++) {
    const row = schedule[Math.min(year * 12, monthsToRetirement)];
    if (row) {
      yearly.push(row);
    }
  }

  return yearly;
}

// Projects retirement growth across multiple assets, each with its own expected annual
// return (e.g. a BTC-tracking 401k assumed higher than a savings account), plus one ongoing
// contribution stream (monthly contribution + optional employer match, optionally increasing
// each year) with its own rate. Produces three scenarios - below/average/above - by shifting
// every rate by -spread/0/+spread, so a mixed portfolio's "underperforming market" scenario
// applies the same relative pessimism to each asset rather than one blended guess.
export function computeRetirementPlan({
  assets,
  monthlyContribution = 0,
  annualContributionIncrease = 0,
  contributionReturnRate,
  employerMatch = null,
  scenarioSpread = DEFAULT_SCENARIO_SPREAD,
  currentAge,
  retirementAge,
}) {
  const scenarios = {};

  for (const [key, delta] of [['below', -scenarioSpread], ['average', 0], ['above', scenarioSpread]]) {
    const schedules = assets.map(asset => projectBalance({
      startingBalance: asset.balance,
      annualReturnRate: asset.returnRate + delta,
      currentAge,
      retirementAge,
    }).schedule);

    const contributionResult = projectBalance({
      startingBalance: 0,
      monthlyContribution,
      annualContributionIncrease,
      employerMatch,
      annualReturnRate: contributionReturnRate + delta,
      currentAge,
      retirementAge,
    });
    schedules.push(contributionResult.schedule);

    const schedule = sumSchedules(schedules);
    scenarios[key] = {
      schedule,
      yearlySchedule: yearlyCheckpoints(schedule, contributionResult.monthsToRetirement),
      endingBalance: schedule[schedule.length - 1].balance,
      totalContributions: schedule.reduce((sum, r) => sum + r.contribution, 0),
      totalEmployerMatch: schedule.reduce((sum, r) => sum + r.employerMatch, 0),
      totalGrowth: schedule.reduce((sum, r) => sum + r.growth, 0),
    };
  }

  return {
    monthsToRetirement: scenarios.average.schedule.length - 1,
    retirementDate: scenarios.average.schedule[scenarios.average.schedule.length - 1]?.date,
    scenarios,
  };
}
