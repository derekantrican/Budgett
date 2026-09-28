import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Modal, ProgressBar, Table } from 'react-bootstrap';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { updatePlanningView, deletePlanningView } from '../../services/api';
import { computeEmergencyFundPlan } from '../../helpers/emergencyFund';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { InfoTable, AccountChip, AccountMultiSelect } from './shared';

function EmergencyFundView({ view, accounts, categories, dateFormat, onUpdated, onDeleted }) {
  const config = view.config || {};
  const essentialCategoryIds = config.essentialCategoryIds || [];
  const monthsOfCoverage = config.monthsOfCoverage || 6;
  const fundAccountIds = config.fundAccountIds || [];
  const backupAccountIds = config.backupAccountIds || [];
  const isConfigured = essentialCategoryIds.length > 0;

  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    essentialCategoryIds,
    monthsOfCoverage,
    fundAccountIds,
    backupAccountIds,
    additionalMonthlyIncome: config.additionalMonthlyIncome ?? 0,
  });

  // Per-category rationing percentage (e.g. "we'd only really need 70% of our normal grocery
  // budget"), keyed by category id. Kept as local state so typing in a cell doesn't wait on a
  // round-trip, and persisted on blur - same pattern as the loan amortization payment ledger.
  const [localPercentages, setLocalPercentages] = useState(config.categoryPercentages || {});
  // Extra safety buffer on top of the essential total (e.g. "add 10% margin"), same local-state-
  // then-commit pattern as the rationing percentages above.
  const [localMargin, setLocalMargin] = useState(config.marginPercent ?? 0);

  useEffect(() => {
    setLocalPercentages(config.categoryPercentages || {});
    setLocalMargin(config.marginPercent ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id]);

  const visibleCategories = useMemo(
    () => (categories || []).filter(c => !c.is_hidden),
    [categories]
  );

  // Reflects in-progress (not-yet-committed) percentage/margin edits immediately, same as the
  // uncommitted local state they're drawn from.
  const effectiveConfig = useMemo(
    () => ({ ...view.config, categoryPercentages: localPercentages, marginPercent: localMargin }),
    [view.config, localPercentages, localMargin]
  );
  const plan = useMemo(() => computeEmergencyFundPlan(effectiveConfig, categories, accounts), [effectiveConfig, categories, accounts]);

  const {
    essentialCategories = [], monthlyBudgetFor, monthlyEssentialTotal = 0,
    monthlyNeed = 0, additionalMonthlyIncome = 0,
    targetAmount = 0, fundAccounts = [], backupAccounts = [], fundBalance = 0,
    percentFunded, monthsFromFund, monthsWithBackup, showChart, chartData = [],
  } = plan;

  const setPercentage = (catId, value) => {
    setLocalPercentages(prev => ({ ...prev, [catId]: value }));
  };

  const commitPercentages = (percentagesSnapshot) => {
    const normalized = {};
    for (const [catId, val] of Object.entries(percentagesSnapshot)) {
      normalized[catId] = Math.min(100, Math.max(0, Number(val) || 0));
    }

    updatePlanningView(view.id, { name: view.name, config: { ...config, categoryPercentages: normalized } });
  };

  const commitMargin = (value) => {
    updatePlanningView(view.id, { name: view.name, config: { ...config, marginPercent: Math.max(0, Number(value) || 0) } });
  };

  const openEdit = () => {
    setForm({
      essentialCategoryIds,
      monthsOfCoverage,
      fundAccountIds,
      backupAccountIds,
      additionalMonthlyIncome: config.additionalMonthlyIncome ?? 0,
    });
    setConfirmDelete(false);
    setShowEdit(true);
  };

  const toggleCategory = (id) => {
    setForm(f => ({
      ...f,
      essentialCategoryIds: f.essentialCategoryIds.includes(id)
        ? f.essentialCategoryIds.filter(cid => cid !== id)
        : [...f.essentialCategoryIds, id],
    }));
  };

  const toggleFundAccount = (id) => {
    setForm(f => ({
      ...f,
      fundAccountIds: f.fundAccountIds.includes(id)
        ? f.fundAccountIds.filter(aid => aid !== id)
        : [...f.fundAccountIds, id],
      // An account can't be both the fund and its own backup.
      backupAccountIds: f.backupAccountIds.filter(aid => aid !== id),
    }));
  };

  const toggleBackupAccount = (id) => {
    setForm(f => ({
      ...f,
      backupAccountIds: f.backupAccountIds.includes(id)
        ? f.backupAccountIds.filter(aid => aid !== id)
        : [...f.backupAccountIds, id],
      fundAccountIds: f.fundAccountIds.filter(aid => aid !== id),
    }));
  };

  const handleSave = async () => {
    await updatePlanningView(view.id, {
      name: view.name,
      config: {
        // Keep the inline-edited settings (rationing percentages, margin) - they aren't part of this form.
        ...config,
        essentialCategoryIds: form.essentialCategoryIds,
        monthsOfCoverage: Number(form.monthsOfCoverage) || 0,
        fundAccountIds: form.fundAccountIds,
        backupAccountIds: form.backupAccountIds,
        additionalMonthlyIncome: Math.max(0, Number(form.additionalMonthlyIncome) || 0),
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

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
        <h5 className="mb-0">{view.name}</h5>
        <Button size="sm" variant="outline-light" onClick={openEdit}>Edit</Button>
      </div>

      {!isConfigured ? (
        <div className="text-center" style={{ padding: '48px 16px' }}>
          <p className="text-muted">This view isn’t set up yet.</p>
          <Button variant="primary" onClick={openEdit}>Configure Emergency Fund</Button>
        </div>
      ) : (
        <>
          <div className="d-flex flex-wrap" style={{ gap: 32 }}>
            <div style={{ flex: '0 1 340px', minWidth: 280 }}>
              <InfoTable
                title="Emergency Fund"
                rows={[
                  { key: 'essential-spend', label: 'Essential Monthly Spend', value: formatCurrency(monthlyEssentialTotal) },
                  {
                    key: 'margin',
                    label: 'Margin',
                    value: (
                      <div className="d-flex align-items-center justify-content-end" style={{ gap: 4 }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="percentage-cell-input"
                          value={localMargin}
                          onChange={(e) => setLocalMargin(e.target.value)}
                          onBlur={() => commitMargin(localMargin)}
                        />
                        <span className="text-muted">%</span>
                      </div>
                    ),
                  },
                  ...(additionalMonthlyIncome > 0
                    ? [
                      { key: 'additional-income', label: 'Additional Monthly Income', value: `−${formatCurrency(additionalMonthlyIncome)}` },
                      { key: 'monthly-need', label: 'Net Monthly Need', value: formatCurrency(monthlyNeed) },
                    ]
                    : []),
                  { key: 'months-of-coverage', label: 'Months of Coverage', value: monthsOfCoverage },
                  { key: 'target-amount', label: 'Target Fund Amount', value: formatCurrency(targetAmount) },
                  ...(fundAccounts.length > 0
                    ? [
                      ...fundAccounts.map(a => ({
                        key: `fund-${a.id}`,
                        label: <AccountChip account={a} />,
                        value: formatCurrency(a.current_balance || 0),
                      })),
                      { key: 'fund-balance', label: 'Current Fund Balance', value: formatCurrency(fundBalance) },
                      { key: 'still-needed', label: 'Still Needed', value: formatCurrency(Math.max(targetAmount - fundBalance, 0)) },
                      { key: 'months-covered', label: 'Months Covered', value: monthsFromFund !== null ? monthsFromFund.toFixed(1) : '—' },
                    ]
                    : []),
                ]}
              />

              {percentFunded !== null && (
                <ProgressBar
                  now={percentFunded}
                  label={`${percentFunded.toFixed(0)}%`}
                  variant={percentFunded >= 100 ? 'success' : 'primary'}
                />
              )}

              {backupAccounts.length > 0 && (
                <div className="mt-3">
                  <InfoTable
                    title="Backup Coverage"
                    rows={[
                      ...backupAccounts.map(a => ({
                        key: `backup-${a.id}`,
                        label: <AccountChip account={a} />,
                        value: formatCurrency(a.current_balance || 0),
                      })),
                      { key: 'months-covered-backup', label: 'Months Covered (with backup)', value: monthsWithBackup !== null ? monthsWithBackup.toFixed(1) : '—' },
                    ]}
                  />
                </div>
              )}
            </div>

            <div style={{ flex: '1 1 320px', minWidth: 260 }}>
              <Table striped hover variant="dark" size="sm" className="mb-0">
                <thead>
                  <tr>
                    <th>Essential Category</th>
                    <th className="text-end">Monthly Budget</th>
                    <th className="text-end">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {essentialCategories.map(c => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="text-end">{formatCurrency(monthlyBudgetFor(c))}</td>
                      <td className="text-end">
                        <div className="d-flex align-items-center justify-content-end" style={{ gap: 4 }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            className="percentage-cell-input"
                            value={localPercentages[c.id] ?? 100}
                            onChange={(e) => setPercentage(c.id, e.target.value)}
                            onBlur={() => commitPercentages(localPercentages)}
                          />
                          <span className="text-muted">%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>

          {showChart && (
            <div style={{ width: '100%', height: 320, marginTop: 24 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, 'MMM YYYY')} minTickGap={40} stroke="var(--text-secondary)" fontSize={12} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} width={90} stroke="var(--text-secondary)" fontSize={12} />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    labelFormatter={(d) => formatDate(d, dateFormat)}
                    contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="fundBalance" name="Emergency Fund" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  {backupAccounts.length > 0 && (
                    <Line type="monotone" dataKey="withBackupBalance" name="With Backup" stroke="var(--success)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      <Modal show={showEdit} onHide={() => setShowEdit(false)} data-bs-theme="dark" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>{confirmDelete ? `Delete "${view.name}"?` : 'Emergency Fund Settings'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {confirmDelete ? (
            <p>This removes the view and its configuration. This cannot be undone.</p>
          ) : (
            <>
              <Form.Group className="mb-3">
                <Form.Label>Essential Categories</Form.Label>
                <Form.Text className="text-muted d-block mb-2">
                  Choose the categories you’d still need to cover if you had to live entirely off of this fund.
                </Form.Text>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
                  {visibleCategories.map(c => (
                    <Form.Check
                      key={c.id}
                      type="checkbox"
                      id={`essential-cat-${c.id}`}
                      label={c.name}
                      checked={form.essentialCategoryIds.includes(c.id)}
                      onChange={() => toggleCategory(c.id)}
                    />
                  ))}
                </div>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Months of Coverage</Form.Label>
                <Form.Control
                  type="number"
                  min="1"
                  value={form.monthsOfCoverage}
                  onChange={(e) => setForm({ ...form, monthsOfCoverage: e.target.value })}
                />
                <Form.Text className="text-muted">How many months of essential spending should this fund cover?</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Additional Monthly Income</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.additionalMonthlyIncome}
                  onChange={(e) => setForm({ ...form, additionalMonthlyIncome: e.target.value })}
                />
                <Form.Text className="text-muted">Optional — income you'd still receive during an emergency (e.g. a partner's paycheck or a side hobby). Reduces the essential monthly spend the fund needs to cover.</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Emergency Fund Account(s)</Form.Label>
                <Form.Text className="text-muted d-block mb-2">
                  Accounts that make up your emergency fund. Their balances are added together.
                </Form.Text>
                <AccountMultiSelect idPrefix="fund-account" accounts={accounts} selectedIds={form.fundAccountIds} onToggle={toggleFundAccount} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Additional Backup Account(s)</Form.Label>
                <Form.Text className="text-muted d-block mb-2">
                  Optional — other accounts (e.g. general savings) you'd dip into next if the emergency fund itself ran out. Shown as extra months of coverage, separate from the fund's own target.
                </Form.Text>
                <AccountMultiSelect idPrefix="backup-account" accounts={accounts} selectedIds={form.backupAccountIds} onToggle={toggleBackupAccount} />
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

export default EmergencyFundView;
