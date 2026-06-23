// Format amount as -$1.23 (expense) or $4.56 (income/refund)
function formatAmount(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

module.exports = { formatAmount };
