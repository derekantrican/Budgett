import React, { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computeEmergencyFundPlan } from '../../../helpers/emergencyFund';
import { AccountChip } from '../../planning/shared';
import { formatCurrency } from '../../../utils/currency';
import { formatDate } from '../../../utils/date';

function useEmergencyFundPlan(ctx, config) {
  const view = (ctx.planningViews || []).find(v => v.type === 'emergency_fund' && v.id === config.viewId)
    || (ctx.planningViews || []).find(v => v.type === 'emergency_fund');

  return useMemo(() => {
    if (!view) {
      return { view: null, plan: { isConfigured: false } };
    }

    return { view, plan: computeEmergencyFundPlan(view.config || {}, ctx.categories, ctx.accounts) };
  }, [view, ctx.categories, ctx.accounts]);
}

function NotConfigured({ view }) {
  return (
    <div className="text-muted text-center" style={{ padding: '32px 8px' }}>
      {view ? 'This emergency fund view isn’t set up yet.' : 'No emergency fund view is set up. Add one from the Planning tab first.'}
    </div>
  );
}

export function EmergencyFundGraphTile({ ctx, config }) {
  const { view, plan } = useEmergencyFundPlan(ctx, config);

  if (!plan.isConfigured || !plan.showChart) {
    return <NotConfigured view={view} />;
  }

  const hasBackup = plan.backupAccounts.length > 0;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={plan.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, 'MMM YYYY')} minTickGap={40} stroke="var(--text-secondary)" fontSize={11} />
        <YAxis tickFormatter={(v) => formatCurrency(v)} width={80} stroke="var(--text-secondary)" fontSize={11} />
        <Tooltip
          formatter={(value) => formatCurrency(value)}
          labelFormatter={(d) => formatDate(d, ctx.dateFormat)}
          contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="fundBalance" name="Emergency Fund" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
        {hasBackup && (
          <Line type="monotone" dataKey="withBackupBalance" name="With Backup" stroke="var(--success)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function EmergencyFundTableTile({ ctx, config }) {
  const { view, plan } = useEmergencyFundPlan(ctx, config);

  if (!plan.isConfigured) {
    return <NotConfigured view={view} />;
  }

  return (
    <table className="planning-info-table mb-0">
      <thead><tr><th colSpan={2}>{view.name}</th></tr></thead>
      <tbody>
        <tr><td className="info-label">Target Fund Amount</td><td className="info-value">{formatCurrency(plan.targetAmount)}</td></tr>
        {plan.fundAccounts.map(a => (
          <tr key={`fund-${a.id}`}>
            <td className="info-label"><AccountChip account={a} wrap /></td>
            <td className="info-value">{formatCurrency(a.current_balance || 0)}</td>
          </tr>
        ))}
        <tr><td className="info-label">Current Fund Balance</td><td className="info-value">{formatCurrency(plan.fundBalance)}</td></tr>
        <tr><td className="info-label">Months Covered</td><td className="info-value">{plan.monthsFromFund !== null ? plan.monthsFromFund.toFixed(1) : '—'}</td></tr>
        {plan.backupAccounts.map(a => (
          <tr key={`backup-${a.id}`}>
            <td className="info-label"><AccountChip account={a} wrap /> (backup)</td>
            <td className="info-value">{formatCurrency(a.current_balance || 0)}</td>
          </tr>
        ))}
        {plan.backupAccounts.length > 0 && (
          <tr><td className="info-label">Months Covered (with backup)</td><td className="info-value">{plan.monthsWithBackup !== null ? plan.monthsWithBackup.toFixed(1) : '—'}</td></tr>
        )}
      </tbody>
    </table>
  );
}
