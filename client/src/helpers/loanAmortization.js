// Adds `months` calendar months to a 'YYYY-MM-DD' date string, returning the same format.
function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1 + months, d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Resolves the property tax amount that applies for a given loan month: the base monthly
// amount plus every adjustment (e.g. from an annual escrow analysis) whose effective month
// has been reached, each one adding to the running total rather than replacing it.
function resolvePropertyTax(month, propertyTax) {
  let amount = Number(propertyTax?.monthlyAmount) || 0;
  const adjustments = propertyTax?.adjustments
    ? [...propertyTax.adjustments].sort((a, b) => Number(a.effectiveMonth) - Number(b.effectiveMonth))
    : [];

  for (const adj of adjustments) {
    if (Number(adj.effectiveMonth) <= month) {
      const adjAmount = adj.amount !== undefined ? adj.amount : adj.monthlyAmount;
      amount += Number(adjAmount) || 0;
    }
  }

  return amount;
}

// Resolves the PMI amount that applies for a given loan month, honoring the configured
// removal rule (never, after month N of the original loan, or once the balance falls to a
// % of the original amount).
function resolvePmi(month, balanceBeforePayment, pmi, loanAmount) {
  if (!pmi?.enabled) {
    return 0;
  }

  const monthlyAmount = Number(pmi.monthlyAmount) || 0;

  if (pmi.removalType === 'after_months') {
    const removalMonth = Number(pmi.removalMonth) || 0;
    return month <= removalMonth ? monthlyAmount : 0;
  }

  if (pmi.removalType === 'percent') {
    const basis = Number(pmi.originalLoanAmount) || loanAmount;
    const threshold = ((Number(pmi.removalPercent) || 0) / 100) * basis;
    return balanceBeforePayment > threshold ? monthlyAmount : 0;
  }

  return monthlyAmount;
}

// Computes an amortization schedule for a fixed-rate loan, starting partway through its
// term if needed, with optional PMI, property tax, and a ledger of actually-recorded
// payments (date paid / amount paid / notes) keyed by loan month number. Recording an
// actual payment higher than the scheduled amount applies the excess to principal;
// recording a lower amount leaves more owed, exactly like editing the real payment log.
export function computeAmortizationSchedule({
  loanAmount,
  interestRate,
  termMonths,
  startingMonth = 1,
  startDate,
  pmi = null,
  propertyTax = null,
  payments = {},
}) {
  const monthlyRate = (interestRate / 100) / 12;
  const remainingTerm = Math.max(termMonths - startingMonth + 1, 1);
  const basePI = monthlyRate > 0
    ? (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remainingTerm))
    : loanAmount / remainingTerm;

  const schedule = [];
  let balance = loanAmount;
  let totalInterest = 0;
  let totalPaid = 0;
  let totalTax = 0;
  let totalPmi = 0;
  let payoffMonth = null;

  for (let month = startingMonth; month <= termMonths; month++) {
    const override = payments[month] || {};

    // Once the balance is paid off (e.g. from overpaying), later months in the term have
    // nothing due - keep the row (so the schedule still runs to the configured term) but
    // mark it inert instead of computing a payment for it.
    if (balance <= 0.005) {
      schedule.push({
        month,
        scheduledDate: addMonths(startDate, month - startingMonth),
        actualDate: null,
        scheduledPayment: 0,
        payment: 0,
        principal: 0,
        interest: 0,
        scheduledPropertyTax: 0,
        propertyTax: 0,
        pmi: 0,
        balance: 0,
        notes: override.notes || '',
        noPaymentNeeded: true,
      });
      continue;
    }

    const interest = balance * monthlyRate;
    const scheduledPropertyTax = resolvePropertyTax(month, propertyTax);
    const hasTaxOverride = override.actualPropertyTax !== undefined && override.actualPropertyTax !== null && override.actualPropertyTax !== '';
    const tax = hasTaxOverride ? Number(override.actualPropertyTax) : scheduledPropertyTax;
    const pmiAmount = resolvePmi(month, balance, pmi, loanAmount);
    const scheduledPayment = basePI + scheduledPropertyTax + pmiAmount;

    const hasOverride = override.actualAmount !== undefined && override.actualAmount !== null && override.actualAmount !== '';
    const payment = hasOverride ? Number(override.actualAmount) : scheduledPayment;

    let principal = (payment - tax - pmiAmount) - interest;
    if (!Number.isFinite(principal)) {
      principal = 0;
    }

    principal = Math.min(principal, balance);
    balance = Math.max(balance - principal, 0);

    totalInterest += interest;
    totalPaid += payment;
    totalTax += tax;
    totalPmi += pmiAmount;
    payoffMonth = month;

    schedule.push({
      month,
      scheduledDate: addMonths(startDate, month - startingMonth),
      actualDate: override.actualDate || null,
      scheduledPayment,
      payment,
      principal,
      interest,
      scheduledPropertyTax,
      propertyTax: tax,
      pmi: pmiAmount,
      balance,
      notes: override.notes || '',
      noPaymentNeeded: false,
    });
  }

  return {
    monthlyPayment: basePI,
    schedule,
    totalInterest,
    totalPaid,
    totalTax,
    totalPmi,
    payoffDate: payoffMonth !== null ? addMonths(startDate, payoffMonth - startingMonth) : startDate,
    payoffMonths: payoffMonth !== null ? (payoffMonth - startingMonth + 1) : 0,
  };
}

// Simulates paying a constant flat total monthly payment (covering P&I, property tax, and
// PMI together) from a given starting balance/month forward - for "what if I paid $X/month"
// scenario exploration. Property tax and PMI still resolve using the loan's normal rules
// (adjustments, removal), keyed off the same absolute loan month numbers as the main
// schedule, so a scenario starting mid-loan still honors an upcoming PMI drop-off, etc.
export function simulateFlatPayment({
  startBalance,
  startMonth,
  startDate,
  interestRate,
  monthlyPayment,
  pmi = null,
  propertyTax = null,
  loanAmount,
  maxMonths = 1200,
}) {
  const monthlyRate = (interestRate / 100) / 12;
  const schedule = [];
  let balance = startBalance;
  let totalInterest = 0;
  let totalTax = 0;
  let totalPmi = 0;
  let totalPrincipal = 0;

  for (let month = startMonth; balance > 0.005 && schedule.length < maxMonths; month++) {
    const interest = balance * monthlyRate;
    const tax = resolvePropertyTax(month, propertyTax);
    const pmiAmount = resolvePmi(month, balance, pmi, loanAmount);
    let principal = monthlyPayment - tax - pmiAmount - interest;

    if (!Number.isFinite(principal) || principal <= 0) {
      break;
    }

    principal = Math.min(principal, balance);
    balance -= principal;

    totalInterest += interest;
    totalTax += tax;
    totalPmi += pmiAmount;
    totalPrincipal += principal;

    schedule.push({ month, date: addMonths(startDate, month - startMonth), balance });
  }

  return {
    schedule,
    months: schedule.length,
    totalInterest,
    totalTax,
    totalPmi,
    totalCost: totalPrincipal + totalInterest + totalTax,
    payoffPossible: balance <= 0.005,
  };
}
