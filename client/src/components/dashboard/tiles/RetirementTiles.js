import React, { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { calculateAge, computeRetirementPlan, DEFAULT_SCENARIO_SPREAD } from '../../../helpers/retirementGrowth';
import { formatCurrency } from '../../../utils/currency';
import { formatDate } from '../../../utils/date';

const RATE_COLORS = { below: 'var(--danger)', average: 'var(--accent)', above: 'var(--success)' };

function useRetirementPlan(ctx, config) {
  const view = (ctx.planningViews || []).find(v => v.type === 'retirement' && v.id === config.viewId)
    || (ctx.planningViews || []).find(v => v.type === 'retirement');

  return useMemo(() => {
    if (!view) {
      return { view: null, isConfigured: false };
    }

    const c = view.config || {};
    const assets = c.assets || [];
    const currentAge = c.birthDate ? calculateAge(c.birthDate) : null;
    const isConfigured = currentAge !== null
      && !!c.retirementAge && Number(c.retirementAge) > currentAge
      && assets.length > 0 && assets.every(a => a.returnRate !== undefined && a.returnRate !== '')
      && !!c.contributionReturnRate;

    if (!isConfigured) {
      return { view, isConfigured: false };
    }

    const resolvedAssets = assets.map(a => {
      if (a.type === 'linked') {
        const account = (ctx.accounts || []).find(acc => String(acc.id) === String(a.accountId));
        return { ...a, balance: account?.current_balance || 0 };
      }

      return { ...a, balance: Number(a.balance) || 0 };
    });

    const plan = computeRetirementPlan({
      assets: resolvedAssets.map(a => ({ balance: a.balance, returnRate: Number(a.returnRate) })),
      monthlyContribution: Number(c.monthlyContribution) || 0,
      annualContributionIncrease: Number(c.annualContributionIncrease) || 0,
      contributionReturnRate: Number(c.contributionReturnRate),
      employerMatch: c.employerMatch,
      scenarioSpread: Number(c.scenarioSpread) || DEFAULT_SCENARIO_SPREAD,
      currentAge,
      retirementAge: Number(c.retirementAge),
    });

    return { view, isConfigured: true, plan, scenarioSpread: Number(c.scenarioSpread) || DEFAULT_SCENARIO_SPREAD };
  }, [view, ctx.accounts]);
}

function NotConfigured({ view }) {
  return (
    <div className="text-muted text-center" style={{ padding: '32px 8px' }}>
      {view ? 'This retirement view isn’t set up yet.' : 'No retirement view is set up. Add one from the Planning tab first.'}
    </div>
  );
}

export function RetirementGraphTile({ ctx, config }) {
  const { view, isConfigured, plan, scenarioSpread } = useRetirementPlan(ctx, config);

  if (!isConfigured) {
    return <NotConfigured view={view} />;
  }

  const chartData = plan.scenarios.average.schedule.map((row, i) => ({
    date: row.date,
    balance_below: plan.scenarios.below.schedule[i]?.balance,
    balance_average: row.balance,
    balance_above: plan.scenarios.above.schedule[i]?.balance,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, 'MMM YYYY')} minTickGap={40} stroke="var(--text-secondary)" fontSize={11} />
        <YAxis tickFormatter={(v) => formatCurrency(v)} width={80} stroke="var(--text-secondary)" fontSize={11} />
        <Tooltip
          formatter={(value) => formatCurrency(value)}
          labelFormatter={(d) => formatDate(d, ctx.dateFormat)}
          contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="balance_above" name={`Above-Avg (+${scenarioSpread}%)`} stroke={RATE_COLORS.above} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="balance_average" name="Average" stroke={RATE_COLORS.average} strokeWidth={3} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="balance_below" name={`Below-Avg (−${scenarioSpread}%)`} stroke={RATE_COLORS.below} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RetirementOverviewTile({ ctx, config }) {
  const { view, isConfigured, plan } = useRetirementPlan(ctx, config);

  if (!isConfigured) {
    return <NotConfigured view={view} />;
  }

  return (
    <table className="planning-info-table mb-0">
      <thead><tr><th colSpan={2}>{view.name} - at Retirement</th></tr></thead>
      <tbody>
        <tr><td className="info-label">Below-Average</td><td className="info-value">{formatCurrency(plan.scenarios.below.endingBalance)}</td></tr>
        <tr><td className="info-label">Average</td><td className="info-value">{formatCurrency(plan.scenarios.average.endingBalance)}</td></tr>
        <tr><td className="info-label">Above-Average</td><td className="info-value">{formatCurrency(plan.scenarios.above.endingBalance)}</td></tr>
        <tr><td className="info-label">Retirement Date</td><td className="info-value">{formatDate(plan.retirementDate, ctx.dateFormat)}</td></tr>
      </tbody>
    </table>
  );
}
