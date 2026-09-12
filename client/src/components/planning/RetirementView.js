import React, { useMemo, useState } from 'react';
import { Button, Form, Modal, Table } from 'react-bootstrap';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { updatePlanningView, deletePlanningView } from '../../services/api';
import { calculateAge, computeRetirementPlan, DEFAULT_RETURN_RATE, DEFAULT_SCENARIO_SPREAD } from '../../helpers/retirementGrowth';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { InfoTable, AccountChip, AccountSelect } from './shared';

const emptyForm = {
  birthDate: '',
  retirementAge: 65,
  assets: [],
  monthlyContribution: '',
  annualContributionIncrease: 0,
  contributionReturnRate: DEFAULT_RETURN_RATE,
  scenarioSpread: DEFAULT_SCENARIO_SPREAD,
  employerMatch: { enabled: false, monthlyAmount: '' },
};

const newAssetId = () => `a${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

function mergeConfigIntoForm(config) {
  return {
    ...emptyForm,
    ...config,
    assets: (config.assets || []).map(a => ({ ...a })),
    employerMatch: { ...emptyForm.employerMatch, ...(config.employerMatch || {}) },
  };
}

// Fixed colors per scenario (independent of any selection) so the lines read consistently.
const RATE_COLORS = { below: 'var(--danger)', average: 'var(--accent)', above: 'var(--success)' };

// Custom recharts tooltip so the projected age shows alongside the date and each
// scenario's balance.
function RetirementTooltip({ active, payload, label, dateFormat }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;
  return (
    <div style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 4, fontSize: 12 }}>
      <div>{formatDate(label, dateFormat)}</div>
      <div className="text-muted mb-1">Age {point.age.toFixed(1)}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</div>
      ))}
    </div>
  );
}

function RetirementView({ view, accounts, dateFormat, onUpdated, onDeleted }) {
  const config = view.config || {};
  const assets = config.assets || [];
  const currentAge = config.birthDate ? calculateAge(config.birthDate) : null;
  const isConfigured = currentAge !== null
    && !!config.retirementAge && Number(config.retirementAge) > currentAge
    && assets.length > 0 && assets.every(a => a.returnRate !== undefined && a.returnRate !== '')
    && !!config.contributionReturnRate;

  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState(mergeConfigIntoForm(config));

  // Each asset's live balance - a linked account's current balance (refreshed every time this
  // view loads), or a manual entry's stored value (which only changes when you edit it).
  const resolvedAssets = assets.map(a => {
    if (a.type === 'linked') {
      const account = accounts.find(acc => String(acc.id) === String(a.accountId));
      return { ...a, account, balance: account?.current_balance || 0 };
    }

    return { ...a, balance: Number(a.balance) || 0 };
  });
  const startingBalanceTotal = resolvedAssets.reduce((sum, a) => sum + a.balance, 0);

  const plan = useMemo(() => {
    if (!isConfigured) {
      return null;
    }

    return computeRetirementPlan({
      assets: resolvedAssets.map(a => ({ balance: a.balance, returnRate: Number(a.returnRate) })),
      monthlyContribution: Number(config.monthlyContribution) || 0,
      annualContributionIncrease: Number(config.annualContributionIncrease) || 0,
      contributionReturnRate: Number(config.contributionReturnRate),
      employerMatch: config.employerMatch,
      scenarioSpread: Number(config.scenarioSpread) || DEFAULT_SCENARIO_SPREAD,
      currentAge,
      retirementAge: Number(config.retirementAge),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, startingBalanceTotal, currentAge, view.config]);

  const openEdit = () => {
    setForm(mergeConfigIntoForm(config));
    setConfirmDelete(false);
    setShowEdit(true);
  };

  const addAsset = (type) => {
    setForm(f => ({
      ...f,
      assets: [...f.assets, { id: newAssetId(), type, accountId: '', label: '', balance: '', returnRate: DEFAULT_RETURN_RATE }],
    }));
  };

  const updateAsset = (idx, field, value) => {
    setForm(f => {
      const nextAssets = [...f.assets];
      nextAssets[idx] = { ...nextAssets[idx], [field]: value };
      return { ...f, assets: nextAssets };
    });
  };

  const removeAsset = (idx) => {
    setForm(f => ({ ...f, assets: f.assets.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    await updatePlanningView(view.id, {
      name: view.name,
      config: {
        birthDate: form.birthDate,
        retirementAge: Number(form.retirementAge) || 0,
        assets: form.assets
          .filter(a => a.returnRate !== '' && (a.type === 'linked' ? a.accountId : a.balance !== ''))
          .map(a => ({
            id: a.id,
            type: a.type,
            returnRate: Number(a.returnRate) || 0,
            ...(a.type === 'linked'
              ? { accountId: a.accountId }
              : { label: a.label || 'Manual Asset', balance: Number(a.balance) || 0 }),
          })),
        monthlyContribution: Number(form.monthlyContribution) || 0,
        annualContributionIncrease: Number(form.annualContributionIncrease) || 0,
        contributionReturnRate: Number(form.contributionReturnRate) || DEFAULT_RETURN_RATE,
        scenarioSpread: Number(form.scenarioSpread) || DEFAULT_SCENARIO_SPREAD,
        employerMatch: form.employerMatch.enabled
          ? { enabled: true, monthlyAmount: Number(form.employerMatch.monthlyAmount) || 0 }
          : { enabled: false },
      },
    });
    setShowEdit(false);
    onUpdated();
  };

  const handleDelete = async () => {
    await deletePlanningView(view.id);
    setShowEdit(false);
    onDeleted();
  };

  const showContributionRate = Number(config.monthlyContribution) > 0 || config.employerMatch?.enabled;

  const chartData = plan?.scenarios.average.schedule.map((row, i) => ({
    date: row.date,
    age: row.age,
    balance_below: plan.scenarios.below.schedule[i]?.balance,
    balance_average: row.balance,
    balance_above: plan.scenarios.above.schedule[i]?.balance,
  })) || [];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
        <h5 className="mb-0">{view.name}</h5>
        <Button size="sm" variant="outline-light" onClick={openEdit}>Edit</Button>
      </div>

      {!isConfigured ? (
        <div className="text-center" style={{ padding: '48px 16px' }}>
          <p className="text-muted">This view isn’t set up yet.</p>
          <Button variant="primary" onClick={openEdit}>Configure Retirement</Button>
        </div>
      ) : (
        <>
          <div className="d-flex flex-wrap" style={{ gap: 32 }}>
            <div style={{ flex: '0 1 340px', minWidth: 280 }}>
              <InfoTable
                title="Retirement Plan"
                className="wide-value-column"
                rows={[
                  ...resolvedAssets.map(a => ({
                    key: `asset-${a.id}`,
                    label: a.type === 'linked' && a.account ? <AccountChip account={a.account} wrap /> : (a.label || 'Manual Asset'),
                    value: `${formatCurrency(a.balance)} @ ${a.returnRate}%`,
                  })),
                  { key: 'starting-balance', label: 'Starting Balance', value: formatCurrency(startingBalanceTotal) },
                  { key: 'monthly-contribution', label: 'Monthly Contribution', value: formatCurrency(Number(config.monthlyContribution) || 0) },
                  ...(showContributionRate
                    ? [{ key: 'contribution-rate', label: 'Contribution Growth Rate', value: `${config.contributionReturnRate}%` }]
                    : []),
                  ...(config.annualContributionIncrease > 0
                    ? [{ key: 'annual-increase', label: 'Annual Contribution Increase', value: `${config.annualContributionIncrease}%` }]
                    : []),
                  ...(config.employerMatch?.enabled
                    ? [{ key: 'employer-match', label: 'Employer Match', value: `${formatCurrency(config.employerMatch.monthlyAmount)}/mo` }]
                    : []),
                  { key: 'scenario-spread', label: 'Scenario Spread', value: `±${config.scenarioSpread ?? DEFAULT_SCENARIO_SPREAD}%` },
                  { key: 'current-age', label: 'Current Age', value: currentAge.toFixed(1) },
                  { key: 'retirement-age', label: 'Retirement Age', value: config.retirementAge },
                  { key: 'years-to-go', label: 'Years to Retirement', value: (plan.monthsToRetirement / 12).toFixed(1) },
                ]}
              />
            </div>

            <div style={{ flex: '0 1 260px', minWidth: 220 }}>
              <InfoTable
                title="Projected at Retirement"
                rows={[
                  { key: 'ending-below', label: 'Ending Balance (Below-Avg)', value: formatCurrency(plan.scenarios.below.endingBalance) },
                  { key: 'ending-average', label: 'Ending Balance (Average)', value: formatCurrency(plan.scenarios.average.endingBalance) },
                  { key: 'ending-above', label: 'Ending Balance (Above-Avg)', value: formatCurrency(plan.scenarios.above.endingBalance) },
                  { key: 'total-contributions', label: 'Total Contributions', value: formatCurrency(plan.scenarios.average.totalContributions) },
                  ...(plan.scenarios.average.totalEmployerMatch > 0
                    ? [{ key: 'total-match', label: 'Total Employer Match', value: formatCurrency(plan.scenarios.average.totalEmployerMatch) }]
                    : []),
                  { key: 'retirement-date', label: 'Retirement Date', value: formatDate(plan.retirementDate, dateFormat) },
                ]}
              />
            </div>

            <div style={{ flex: '1 1 320px', minWidth: 260, height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, 'MMM YYYY')} minTickGap={40} stroke="var(--text-secondary)" fontSize={12} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} width={90} stroke="var(--text-secondary)" fontSize={12} />
                  <Tooltip content={<RetirementTooltip dateFormat={dateFormat} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="balance_above" name={`Above-Average (+${config.scenarioSpread ?? DEFAULT_SCENARIO_SPREAD}%)`} stroke={RATE_COLORS.above} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="balance_average" name="Average Market" stroke={RATE_COLORS.average} strokeWidth={3} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="balance_below" name={`Below-Average (−${config.scenarioSpread ?? DEFAULT_SCENARIO_SPREAD}%)`} stroke={RATE_COLORS.below} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <Table striped hover variant="dark" size="sm" className="mt-4 mb-0 mx-auto" style={{ width: 'auto' }}>
            <thead>
              <tr>
                <th>Age</th>
                <th>Year</th>
                <th className="text-end">Contributions (YTD)</th>
                <th className="text-end">Balance (Average)</th>
              </tr>
            </thead>
            <tbody>
              {plan.scenarios.average.yearlySchedule.map(row => (
                <tr key={row.month}>
                  <td>{Math.round(row.age)}</td>
                  <td>{formatDate(row.date, 'YYYY')}</td>
                  <td className="text-end">{formatCurrency(row.contribution + row.employerMatch)}</td>
                  <td className="text-end">{formatCurrency(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      <Modal show={showEdit} onHide={() => setShowEdit(false)} data-bs-theme="dark" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>{confirmDelete ? `Delete "${view.name}"?` : 'Retirement Settings'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {confirmDelete ? (
            <p>This removes the view and its configuration. This cannot be undone.</p>
          ) : (
            <>
              <Form.Group className="mb-3">
                <Form.Label>Birth Date</Form.Label>
                <Form.Control type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Retirement Age</Form.Label>
                <Form.Control type="number" min="0" value={form.retirementAge} onChange={(e) => setForm({ ...form, retirementAge: e.target.value })} />
              </Form.Group>

              <hr />
              <h6>Assets</h6>
              <Form.Text className="text-muted d-block mb-2">
                Add each investment separately so its own expected return applies — e.g. an aggressive 401k vs. a conservative HSA.
              </Form.Text>
              {form.assets.map((asset, idx) => (
                <div key={asset.id} className="d-flex gap-2 mb-2 align-items-center" style={{ flexWrap: 'wrap' }}>
                  {asset.type === 'linked' ? (
                    <div style={{ flex: '1 1 180px' }}>
                      <AccountSelect
                        idPrefix={`retirement-asset-${asset.id}`}
                        accounts={accounts.filter(a => String(a.id) === String(asset.accountId) || !form.assets.some(x => x.type === 'linked' && String(x.accountId) === String(a.id)))}
                        selectedId={asset.accountId}
                        onChange={(accountId) => updateAsset(idx, 'accountId', accountId)}
                      />
                    </div>
                  ) : (
                    <Form.Control style={{ flex: '1 1 180px' }} placeholder="Asset name (e.g. Individual Stocks)" value={asset.label || ''} onChange={(e) => updateAsset(idx, 'label', e.target.value)} />
                  )}
                  {asset.type === 'manual' && (
                    <Form.Control type="number" style={{ flex: '0 1 130px' }} placeholder="Balance" value={asset.balance ?? ''} onChange={(e) => updateAsset(idx, 'balance', e.target.value)} />
                  )}
                  <div className="d-flex align-items-center" style={{ flex: '0 1 90px', gap: 4 }}>
                    <Form.Control type="number" step="0.1" placeholder="7" value={asset.returnRate ?? ''} onChange={(e) => updateAsset(idx, 'returnRate', e.target.value)} />
                    <span className="text-muted">%</span>
                  </div>
                  <Button size="sm" variant="outline-danger" onClick={() => removeAsset(idx)}>✕</Button>
                </div>
              ))}
              <div className="d-flex gap-2 mb-3">
                <Button size="sm" variant="outline-light" onClick={() => addAsset('linked')}>+ Link Account</Button>
                <Button size="sm" variant="outline-light" onClick={() => addAsset('manual')}>+ Manual Asset</Button>
              </div>

              <hr />
              <h6>Future Contributions</h6>
              <Form.Group className="mb-3">
                <Form.Label>Monthly Contribution</Form.Label>
                <Form.Control type="number" value={form.monthlyContribution} onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} placeholder="e.g. 500 (0 if you've stopped contributing)" />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Contribution Growth Rate (%)</Form.Label>
                <Form.Control type="number" step="0.1" value={form.contributionReturnRate} onChange={(e) => setForm({ ...form, contributionReturnRate: e.target.value })} />
                <Form.Text className="text-muted">Expected return applied to future contributions as they land — separate from each asset's own rate above.</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Annual Contribution Increase (%)</Form.Label>
                <Form.Control type="number" min="0" step="0.1" value={form.annualContributionIncrease} onChange={(e) => setForm({ ...form, annualContributionIncrease: e.target.value })} />
                <Form.Text className="text-muted">Optional — models yearly raises by increasing the contribution each year (e.g. 3%).</Form.Text>
              </Form.Group>

              <hr />
              <h6>Employer Match</h6>
              <Form.Check
                type="checkbox"
                label="Include Employer Match"
                checked={form.employerMatch.enabled}
                onChange={(e) => setForm({ ...form, employerMatch: { ...form.employerMatch, enabled: e.target.checked } })}
                className="mb-3"
              />
              {form.employerMatch.enabled && (
                <Form.Group className="mb-3">
                  <Form.Label>Monthly Employer Match Amount</Form.Label>
                  <Form.Control type="number" value={form.employerMatch.monthlyAmount} onChange={(e) => setForm({ ...form, employerMatch: { ...form.employerMatch, monthlyAmount: e.target.value } })} />
                </Form.Group>
              )}

              <hr />
              <h6>Scenarios</h6>
              <Form.Group className="mb-3">
                <Form.Label>Scenario Spread (±%)</Form.Label>
                <Form.Control type="number" min="0" step="0.5" value={form.scenarioSpread} onChange={(e) => setForm({ ...form, scenarioSpread: e.target.value })} />
                <Form.Text className="text-muted">How far the "below-average" and "above-average" lines shift from each asset's own rate (e.g. a 7% asset becomes 4%/10% at a spread of 3).</Form.Text>
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {confirmDelete ? (
            <>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Back</Button>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </>
          ) : (
            <>
              <Button variant="danger" className="me-auto" onClick={() => setConfirmDelete(true)}>Delete View</Button>
              <Button variant="secondary" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSave}>Save</Button>
            </>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default RetirementView;
