import React, { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computeAmortizationSchedule } from '../../../helpers/loanAmortization';
import { formatCurrency } from '../../../utils/currency';
import { formatDate } from '../../../utils/date';

// Resolves the bound Planning view (auto-bound if there's only one loan view, or explicitly
// picked via config.viewId when there's more than one) and its computed schedule. Shared by
// the graph and overview tiles below.
function useLoanSchedule(ctx, config) {
  const view = (ctx.planningViews || []).find(v => v.type === 'loan_amortization' && v.id === config.viewId)
    || (ctx.planningViews || []).find(v => v.type === 'loan_amortization');

  return useMemo(() => {
    if (!view) {
      return { view: null, isConfigured: false };
    }

    const c = view.config || {};
    const isConfigured = !!c.loanAmount && !!c.interestRate && !!c.termMonths && !!c.startDate;
    if (!isConfigured) {
      return { view, isConfigured: false };
    }

    const startingMonth = c.startingMonth || 1;
    const schedule = computeAmortizationSchedule({
      loanAmount: Number(c.loanAmount),
      interestRate: Number(c.interestRate),
      termMonths: Number(c.termMonths),
      startingMonth,
      startDate: c.startDate,
      pmi: c.pmi,
      propertyTax: c.propertyTax,
      payments: c.payments || {},
    });

    const todayKey = new Date().toISOString().slice(0, 7);
    const currentRow = schedule.schedule.find(r => r.scheduledDate.slice(0, 7) >= todayKey) || schedule.schedule[schedule.schedule.length - 1];
    const rowsSoFar = schedule.schedule.filter(r => r.scheduledDate.slice(0, 7) <= todayKey);
    const interestPaidSoFar = rowsSoFar.reduce((sum, r) => sum + r.interest, 0);
    const principalPaidSoFar = rowsSoFar.reduce((sum, r) => sum + r.principal, 0);

    return { view, isConfigured: true, schedule, currentRow, interestPaidSoFar, principalPaidSoFar };
  }, [view]);
}

function NotConfigured({ view }) {
  return (
    <div className="text-muted text-center" style={{ padding: '32px 8px' }}>
      {view ? 'This loan view isn’t set up yet.' : 'No loan amortization view is set up. Add one from the Planning tab first.'}
    </div>
  );
}

export function LoanAmortizationGraphTile({ ctx, config }) {
  const { view, isConfigured, schedule } = useLoanSchedule(ctx, config);

  if (!isConfigured) {
    return <NotConfigured view={view} />;
  }

  const chartData = schedule.schedule.map(row => ({ scheduledDate: row.scheduledDate, balance: row.balance }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="dashLoanBalanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="scheduledDate" tickFormatter={(d) => formatDate(d, 'MMM YYYY')} minTickGap={40} stroke="var(--text-secondary)" fontSize={11} />
        <YAxis tickFormatter={(v) => formatCurrency(v)} width={80} stroke="var(--text-secondary)" fontSize={11} />
        <Tooltip
          formatter={(value) => formatCurrency(value)}
          labelFormatter={(d) => formatDate(d, ctx.dateFormat)}
          contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
        />
        <Area type="monotone" dataKey="balance" name="Balance" stroke="var(--accent)" fill="url(#dashLoanBalanceFill)" strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function LoanAmortizationOverviewTile({ ctx, config }) {
  const { view, isConfigured, schedule, currentRow, interestPaidSoFar, principalPaidSoFar } = useLoanSchedule(ctx, config);

  if (!isConfigured) {
    return <NotConfigured view={view} />;
  }

  return (
    <table className="planning-info-table mb-0">
      <thead><tr><th colSpan={2}>{view.name}</th></tr></thead>
      <tbody>
        <tr><td className="info-label">Remaining Balance</td><td className="info-value">{formatCurrency(currentRow.balance)}</td></tr>
        <tr><td className="info-label">Interest Paid So Far</td><td className="info-value">{formatCurrency(interestPaidSoFar)}</td></tr>
        <tr><td className="info-label">Principal Paid So Far</td><td className="info-value">{formatCurrency(principalPaidSoFar)}</td></tr>
        <tr><td className="info-label">Payoff Date</td><td className="info-value">{formatDate(schedule.payoffDate, ctx.dateFormat)}</td></tr>
      </tbody>
    </table>
  );
}
