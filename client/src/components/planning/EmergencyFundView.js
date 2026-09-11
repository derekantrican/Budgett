import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Form, Modal, ProgressBar, Table } from 'react-bootstrap';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { updatePlanningView, deletePlanningView } from '../../services/api';
import { evaluateBudgetExpression } from '../../helpers/budgetFormula';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';

function InfoTable({ title, rows }) {
  return (
    <table className="planning-info-table mb-3">
      <thead>
        <tr><th colSpan={2}>{title}</th></tr>
      </thead>
      <tbody>
        {rows.map(({ key, label, value }) => (
          <tr key={key}>
            <td className="info-label">{label}</td>
            <td className="info-value">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function sumBalances(accounts, ids) {
  return accounts
    .filter(a => ids.includes(a.id))
    .reduce((sum, a) => sum + (a.current_balance || 0), 0);
}

function AccountChip({ account, extra }) {
  return (
    <span className="account-chip" style={{ backgroundColor: account.institution_color || '#1a73e8' }}>
      {account.display_name || account.name}
      {extra && <span className="account-chip-extra">{extra}</span>}
    </span>
  );
}

function AccountMultiSelect({ idPrefix, accounts, selectedIds, onToggle, placeholder = 'Select account(s)…' }) {
  const selectedAccounts = accounts.filter(a => selectedIds.includes(a.id));

  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle
        id={`${idPrefix}-toggle`}
        variant="outline-light"
        className="account-multiselect-toggle"
      >
        <span className="chip-row">
          {selectedAccounts.length > 0
            ? selectedAccounts.map(a => <AccountChip key={a.id} account={a} />)
            : <span className="text-muted">{placeholder}</span>}
        </span>
        <svg className="toggle-arrow" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
        </svg>
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ maxHeight: 280, overflowY: 'auto', width: '100%' }}>
        {accounts.map(a => (
          <Dropdown.ItemText
            key={a.id}
            className="account-multiselect-item"
            onClick={() => onToggle(a.id)}
          >
            <Form.Check
              type="checkbox"
              id={`${idPrefix}-${a.id}`}
              checked={selectedIds.includes(a.id)}
              onChange={() => onToggle(a.id)}
              onClick={(e) => e.stopPropagation()}
              className="mb-0"
            />
            <AccountChip account={a} extra={formatCurrency(a.current_balance || 0)} />
          </Dropdown.ItemText>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

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

  const now = new Date();
  const essentialCategories = visibleCategories.filter(c => essentialCategoryIds.includes(c.id));
  // Category budgets are stored as negative (expense) amounts - use magnitude since this view
  // deals entirely in "how much would we need to spend", not signed cash flow.
  const monthlyBudgetFor = (c) => Math.abs(evaluateBudgetExpression(c.budgeted_amount_expression, now.getFullYear(), now.getMonth()));
  const percentFor = (c) => {
    const raw = localPercentages[c.id];
    const num = raw === undefined || raw === '' ? 100 : Number(raw);
    return isFinite(num) ? num : 100;
  };

  const rationedAmountFor = (c) => monthlyBudgetFor(c) * (percentFor(c) / 100);
  const monthlyEssentialTotal = essentialCategories.reduce((sum, c) => sum + rationedAmountFor(c), 0);

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

  const marginPercent = Number(localMargin) || 0;
  const monthlyEssentialWithMargin = monthlyEssentialTotal * (1 + marginPercent / 100);

  const commitMargin = (value) => {
    updatePlanningView(view.id, { name: view.name, config: { ...config, marginPercent: Math.max(0, Number(value) || 0) } });
  };

  const targetAmount = monthlyEssentialWithMargin * monthsOfCoverage;
  const fundAccounts = accounts.filter(a => fundAccountIds.includes(a.id));
  const backupAccounts = accounts.filter(a => backupAccountIds.includes(a.id));
  const fundBalance = sumBalances(accounts, fundAccountIds);
  const backupBalance = sumBalances(accounts, backupAccountIds);

  const percentFunded = fundAccountIds.length > 0 && targetAmount > 0
    ? Math.min(100, Math.max(0, (fundBalance / targetAmount) * 100))
    : null;
  const monthsFromFund = monthlyEssentialWithMargin > 0 && fundAccountIds.length > 0
    ? fundBalance / monthlyEssentialWithMargin
    : null;
  const monthsWithBackup = monthlyEssentialWithMargin > 0 && backupAccountIds.length > 0
    ? (fundBalance + backupBalance) / monthlyEssentialWithMargin
    : null;

  // Projected balance if spending the essential amount (with margin) every month, for the
  // fund alone and for the fund plus backup accounts. The chart runs exactly up to the month
  // the longer-lasting of the two (backup, if configured - otherwise the fund alone) hits $0,
  // so it doesn't trail off with a flat line past depletion.
  const showChart = monthlyEssentialWithMargin > 0 && fundAccounts.length > 0;
  const monthsUntilDepleted = backupAccounts.length > 0 ? monthsWithBackup : monthsFromFund;
  const projectionMonths = showChart
    ? Math.min(240, Math.max(1, Math.ceil(monthsUntilDepleted || 0)))
    : 0;

  const chartData = showChart
    ? Array.from({ length: projectionMonths + 1 }, (_, m) => ({
      date: new Date(now.getFullYear(), now.getMonth() + m, 1).toISOString().slice(0, 10),
      fundBalance: Math.max(fundBalance - monthlyEssentialWithMargin * m, 0),
      withBackupBalance: backupAccounts.length > 0
        ? Math.max(fundBalance + backupBalance - monthlyEssentialWithMargin * m, 0)
        : undefined,
    }))
    : [];

  const openEdit = () => {
    setForm({
      essentialCategoryIds,
      monthsOfCoverage,
      fundAccountIds,
      backupAccountIds,
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
        essentialCategoryIds: form.essentialCategoryIds,
        monthsOfCoverage: Number(form.monthsOfCoverage) || 0,
        fundAccountIds: form.fundAccountIds,
        backupAccountIds: form.backupAccountIds,
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
