import React from 'react';
import { Card, Badge } from 'react-bootstrap';
import { InfoTable } from '../planning/shared';
import { INCOME_TYPES, PAY_PERIODS, computeIncomeAmounts, paydayLabel } from '../../helpers/income';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';

const payPeriodLabel = (value) => PAY_PERIODS.find(p => p.value === value)?.label || value;
const typeLabel = (value) => INCOME_TYPES.find(t => t.value === value)?.label || value;
// Quantities (hours/units) can come out fractional (e.g. an "=" formula) - trim to 2 decimals
// without showing trailing zeros for whole numbers.
const formatQuantity = (n) => (Number.isInteger(n) ? n : n.toFixed(2));

function buildDetailRows(source, amounts, dateFormat) {
  const rows = [];
  if (source.type === 'salary') {
    rows.push({ key: 'amount', label: 'Annual Salary', value: formatCurrency(source.amount || 0) });
  }
  else if (source.type === 'fixed') {
    rows.push({ key: 'amount', label: 'Amount per Paycheck', value: formatCurrency(source.amount || 0) });
  }
  else if (source.type === 'hourly') {
    rows.push({ key: 'amount', label: 'Hourly Rate', value: formatCurrency(source.amount || 0) });
    rows.push({ key: 'qty', label: 'Hours per Period', value: formatQuantity(amounts.resolvedQuantity) });
  }
  else {
    const unit = source.unit_label || 'Unit';
    rows.push({ key: 'amount', label: `Rate per ${unit}`, value: formatCurrency(source.amount || 0) });
    rows.push({ key: 'qty', label: `${unit}s per Period`, value: formatQuantity(amounts.resolvedQuantity) });
  }

  rows.push({ key: 'period', label: 'Pay Period', value: payPeriodLabel(source.pay_period) });

  const payday = paydayLabel(source);
  if (payday) {
    // Weekly only has a weekday (any given Tuesday); biweekly is anchored to one specific
    // date, so show that date (in the user's configured format) alongside the weekday.
    const paydayValue = source.pay_period === 'biweekly' && source.reference_pay_date
      ? `${payday} (${formatDate(source.reference_pay_date, dateFormat)})`
      : payday;
    rows.push({ key: 'payday', label: 'Payday', value: paydayValue });
    rows.push({ key: 'thisMonth', label: 'Paychecks This Month', value: amounts.paychecksThisMonth });
  }

  return rows;
}

const buildComputedRows = (amounts) => [
  { key: 'grossPeriod', label: 'Gross per Paycheck', value: formatCurrency(amounts.grossPerPeriod) },
  { key: 'netPeriod', label: 'Net per Paycheck', value: formatCurrency(amounts.netPerPeriod) },
  { key: 'grossMonth', label: 'Monthly Gross', value: formatCurrency(amounts.monthlyGross) },
];

const buildAdjustmentRows = (amounts) => amounts.resolvedAdjustments.map((a, i) => ({
  key: i,
  label: a.name,
  value: <span style={{ color: a.resolved >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(a.resolved)}</span>,
}));

// One income source's summary card - shown both on the Income tab (grid of every active
// source) and the dashboard's income tile (a chosen subset).
function IncomeSourceCard({ source, dateFormat = 'MMM D, YYYY', onClick, style }) {
  const amounts = computeIncomeAmounts(source);

  return (
    <Card style={{ width: 340, cursor: onClick ? 'pointer' : undefined, ...style }} onClick={onClick}>
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start mb-2" style={{ gap: 8 }}>
          <div>
            <Card.Title className="mb-1">{source.name}</Card.Title>
            <Badge bg="secondary">{typeLabel(source.type)}</Badge>
          </div>
          <div className="text-end">
            <div style={{ fontSize: '0.75em', color: 'var(--text-secondary)' }}>Monthly Net</div>
            <div style={{ fontWeight: 'bold', fontSize: '1.15em', color: amounts.monthlyNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatCurrency(amounts.monthlyNet)}
            </div>
          </div>
        </div>
        <InfoTable title="Details" rows={[...buildDetailRows(source, amounts, dateFormat), ...buildComputedRows(amounts)]} />
        {amounts.resolvedAdjustments.length > 0 && (
          <InfoTable title="Paycheck Extras" rows={buildAdjustmentRows(amounts)} className="mt-2" />
        )}
      </Card.Body>
    </Card>
  );
}

export default IncomeSourceCard;
