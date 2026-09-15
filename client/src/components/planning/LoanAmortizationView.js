import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Modal, Table } from 'react-bootstrap';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { updatePlanningView, deletePlanningView } from '../../services/api';
import { computeAmortizationSchedule, simulateFlatPayment } from '../../helpers/loanAmortization';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import ScenariosModal from './ScenariosModal';
import { InfoTable, AccountChip, AccountSelect } from './shared';
import CurrencyInput from '../CurrencyInput';

const emptyForm = {
  loanAmount: '',
  interestRate: '',
  termMonths: 360,
  startingMonth: 1,
  startDate: new Date().toISOString().split('T')[0],
  linkedAccountId: '',
  pmi: { enabled: false, monthlyAmount: '', removalType: 'none', removalMonth: '', originalLoanAmount: '', removalPercent: 80 },
  propertyTax: { monthlyAmount: '', adjustments: [] },
};

const SCENARIO_COLORS = ['var(--warning)', 'var(--success)', 'var(--danger)', '#20c997', '#e879f9', '#fd7e14'];

function scenarioLabel(amount) {
  return `${formatCurrency(Number(amount)).replace(/\.00$/, '')}/mo`;
}

function mergeConfigIntoForm(config, name) {
  return {
    ...emptyForm,
    ...config,
    name,
    pmi: { ...emptyForm.pmi, ...(config.pmi || {}) },
    propertyTax: {
      ...emptyForm.propertyTax,
      ...(config.propertyTax || {}),
      adjustments: config.propertyTax?.adjustments
        ? config.propertyTax.adjustments.map(a => ({
          effectiveMonth: a.effectiveMonth,
          amount: a.amount !== undefined ? a.amount : a.monthlyAmount,
        }))
        : [],
    },
  };
}

function LoanAmortizationView({ view, accounts, dateFormat, onUpdated, onDeleted }) {
  const config = view.config || {};
  const startingMonth = config.startingMonth || 1;
  const isConfigured = !!config.loanAmount && !!config.interestRate && !!config.termMonths && !!config.startDate;

  const [showEdit, setShowEdit] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);
  const [form, setForm] = useState(mergeConfigIntoForm(config, view.name));
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The recorded payment ledger (date paid / amount paid / notes per loan month). Kept as
  // local state so typing in a cell doesn't wait on a round-trip, and persisted on blur.
  const [localPayments, setLocalPayments] = useState(config.payments || {});

  useEffect(() => {
    setLocalPayments(config.payments || {});
    // Only reset when switching to a different view - not on every config change - so an
    // in-flight edit isn't clobbered by a re-render triggered by that same edit's save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id]);

  const schedule = useMemo(() => {
    if (!isConfigured) {
      return null;
    }

    return computeAmortizationSchedule({
      loanAmount: Number(config.loanAmount),
      interestRate: Number(config.interestRate),
      termMonths: Number(config.termMonths),
      startingMonth,
      startDate: config.startDate,
      pmi: config.pmi,
      propertyTax: config.propertyTax,
      payments: localPayments,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.config, localPayments]);

  // The same schedule with no recorded actuals applied - i.e. what the balance would be
  // if every payment had been exactly the scheduled amount - so the chart can show how far
  // ahead of (or behind) that baseline the real, recorded balance actually is.
  const scheduledOnlySchedule = useMemo(() => {
    if (!isConfigured) {
      return null;
    }

    return computeAmortizationSchedule({
      loanAmount: Number(config.loanAmount),
      interestRate: Number(config.interestRate),
      termMonths: Number(config.termMonths),
      startingMonth,
      startDate: config.startDate,
      pmi: config.pmi,
      propertyTax: config.propertyTax,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.config]);

  const linkedAccount = config.linkedAccountId
    ? accounts.find(a => String(a.id) === String(config.linkedAccountId))
    : null;

  const currentRow = useMemo(() => {
    if (!schedule) {
      return null;
    }

    const todayKey = new Date().toISOString().split('T')[0].slice(0, 7);
    return schedule.schedule.find(r => r.scheduledDate.slice(0, 7) >= todayKey) || schedule.schedule[schedule.schedule.length - 1];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  // "What if I paid $X/month from the loan's starting balance" projections, each plotted
  // as its own line, for comparison against the same starting point as the main schedule.
  const scenarioSchedules = useMemo(() => {
    if (!isConfigured || !config.scenarios?.length) {
      return [];
    }

    return config.scenarios.map(amount => ({
      amount,
      ...simulateFlatPayment({
        startBalance: Number(config.loanAmount),
        startMonth: startingMonth,
        startDate: config.startDate,
        interestRate: Number(config.interestRate),
        monthlyPayment: Number(amount),
        pmi: config.pmi,
        propertyTax: config.propertyTax,
        loanAmount: Number(config.loanAmount),
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, view.config]);

  const chartData = useMemo(() => {
    if (!schedule) {
      return [];
    }

    const base = schedule.schedule.map((row, i) => ({
      scheduledDate: row.scheduledDate,
      balance: row.balance,
      scheduledBalance: scheduledOnlySchedule?.schedule[i]?.balance,
    }));

    const byDate = new Map(base.map(entry => [entry.scheduledDate, entry]));
    for (const scenario of scenarioSchedules) {
      for (const row of scenario.schedule) {
        const entry = byDate.get(row.date);
        if (entry) {
          entry[`scenario_${scenario.amount}`] = row.balance;
        }
      }
    }

    return base;
  }, [schedule, scheduledOnlySchedule, scenarioSchedules]);

  const infoRowRef = useRef(null);
  const tableWrapRef = useRef(null);
  const [tableHeight, setTableHeight] = useState(400);

  useEffect(() => {
    if (!isConfigured) {
      return undefined;
    }

    // A mobile media query (see index.css) forcibly overrides this with `!important` to
    // `height: auto; overflow: visible`, so the table renders at full height there instead
    // of nesting a scrollable table inside an already-scrolling page - no need to special
    // case it here too.
    const updateHeight = () => {
      if (tableWrapRef.current) {
        const top = tableWrapRef.current.getBoundingClientRect().top;
        setTableHeight(Math.max(200, window.innerHeight - top - 24));
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);

    // Also react to the info/chart row above changing height on its own (e.g. a label
    // wrapping onto another line), not just window resizes.
    const resizeObserver = new ResizeObserver(updateHeight);
    if (infoRowRef.current) {
      resizeObserver.observe(infoRowRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      resizeObserver.disconnect();
    };
  }, [isConfigured, schedule]);

  const [focusedPaymentMonth, setFocusedPaymentMonth] = useState(null);
  const [focusedDateMonth, setFocusedDateMonth] = useState(null);
  const [focusedTaxMonth, setFocusedTaxMonth] = useState(null);

  const setPaymentField = (month, field, value) => {
    setLocalPayments(prev => ({ ...prev, [month]: { ...(prev[month] || {}), [field]: value } }));
  };

  // Saves are chained one at a time (rather than fired concurrently) so that editing two
  // cells in quick succession can't have their save requests complete out of order over the
  // network - which would otherwise let an earlier, less-complete snapshot silently
  // overwrite a later edit that actually reached the server first.
  const saveQueueRef = useRef(Promise.resolve());

  const commitPayments = (paymentsSnapshot) => {
    saveQueueRef.current = saveQueueRef.current
      .then(() => updatePlanningView(view.id, { name: view.name, config: { ...config, payments: paymentsSnapshot } }))
      .catch(err => console.error('Failed to save loan payment ledger:', err));
  };

  // Updates and commits a field in one shot, computed straight from the event rather than
  // the `localPayments` closure - a native date picker can fire change and blur back-to-back
  // in the same tick, so an onBlur reading `localPayments` can race ahead of onChange's
  // update and commit a stale snapshot. Only safe for fields (like a date) whose onChange
  // always carries a complete, final value - unlike text/number typing, which still commits
  // on blur to avoid a request per keystroke.
  const setAndCommitPaymentField = (month, field, value) => {
    setLocalPayments(prev => {
      const next = { ...prev, [month]: { ...(prev[month] || {}), [field]: value } };
      commitPayments(next);
      return next;
    });
  };

  const openEdit = () => {
    setForm(mergeConfigIntoForm(config, view.name));
    setConfirmDelete(false);
    setShowEdit(true);
  };

  const addAdjustment = () => {
    setForm(f => ({ ...f, propertyTax: { ...f.propertyTax, adjustments: [...f.propertyTax.adjustments, { effectiveMonth: '', amount: '' }] } }));
  };

  const updateAdjustment = (idx, field, value) => {
    setForm(f => {
      const adjustments = [...f.propertyTax.adjustments];
      adjustments[idx] = { ...adjustments[idx], [field]: value };
      return { ...f, propertyTax: { ...f.propertyTax, adjustments } };
    });
  };

  const removeAdjustment = (idx) => {
    setForm(f => ({ ...f, propertyTax: { ...f.propertyTax, adjustments: f.propertyTax.adjustments.filter((_, i) => i !== idx) } }));
  };

  const handleSave = async () => {
    const { name } = form;
    await updatePlanningView(view.id, {
      name: name || 'Loan Amortization',
      config: {
        loanAmount: Number(form.loanAmount) || 0,
        interestRate: Number(form.interestRate) || 0,
        termMonths: Number(form.termMonths) || 0,
        startingMonth: Number(form.startingMonth) || 1,
        startDate: form.startDate,
        linkedAccountId: form.linkedAccountId || null,
        pmi: form.pmi.enabled
          ? {
            enabled: true,
            monthlyAmount: Number(form.pmi.monthlyAmount) || 0,
            removalType: form.pmi.removalType,
            removalMonth: Number(form.pmi.removalMonth) || 0,
            originalLoanAmount: Number(form.pmi.originalLoanAmount) || 0,
            removalPercent: Number(form.pmi.removalPercent) || 0,
          }
          : { enabled: false },
        propertyTax: {
          monthlyAmount: Number(form.propertyTax.monthlyAmount) || 0,
          adjustments: form.propertyTax.adjustments
            .filter(a => a.effectiveMonth !== '' && a.amount !== '')
            .map(a => ({ effectiveMonth: Number(a.effectiveMonth), amount: Number(a.amount) })),
        },
        payments: config.payments || {},
        scenarios: config.scenarios || [],
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

  const handleSaveScenarios = async (newScenarios) => {
    await updatePlanningView(view.id, { name: view.name, config: { ...config, scenarios: newScenarios } });
    onUpdated();
  };

  const escrowRows = [];
  if (currentRow && config.propertyTax?.monthlyAmount) {
    escrowRows.push({ key: 'tax', label: 'Property Tax (current)', value: formatCurrency(currentRow.propertyTax) });
  }

  if (currentRow && config.pmi?.enabled) {
    escrowRows.push({ key: 'pmi', label: 'PMI (current)', value: currentRow.pmi > 0 ? formatCurrency(currentRow.pmi) : 'Removed' });
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
        <h5 className="mb-0">{view.name}</h5>
        <div className="d-flex" style={{ gap: 8 }}>
          {isConfigured && (
            <Button size="sm" variant="outline-light" onClick={() => setShowScenarios(true)}>Scenarios</Button>
          )}
          <Button size="sm" variant="outline-light" onClick={openEdit}>Edit</Button>
        </div>
      </div>

      {!isConfigured ? (
        <div className="text-center" style={{ padding: '48px 16px' }}>
          <p className="text-muted">This view isn’t set up yet.</p>
          <Button variant="primary" onClick={openEdit}>Configure Loan</Button>
        </div>
      ) : (
        <>
          <div ref={infoRowRef} className="d-flex flex-wrap" style={{ gap: 32 }}>
            <div style={{ flex: '0 1 300px', minWidth: 280 }}>
              <InfoTable
                title="Loan Info"
                className="wide-value-column"
                rows={[
                  { key: 'balance-at-start', label: 'Loan Balance at Start', value: formatCurrency(Number(config.loanAmount)) },
                  { key: 'rate', label: 'Interest Rate', value: `${Number(config.interestRate)}%` },
                  { key: 'term', label: 'Term', value: `${config.termMonths} months (starting at #${startingMonth})` },
                  { key: 'first-payment', label: 'First Payment Date', value: formatDate(config.startDate, dateFormat) },
                  { key: 'current-balance', label: 'Current Balance', value: formatCurrency(currentRow.balance) },
                  { key: 'months-remaining', label: 'Months Remaining', value: Math.max((startingMonth + schedule.payoffMonths - 1) - currentRow.month + 1, 0) },
                  ...(linkedAccount
                    ? [{ key: 'linked-account', label: 'Linked Account', value: <AccountChip account={linkedAccount} extra={formatCurrency(linkedAccount.current_balance || 0)} wrap /> }]
                    : []),
                ]}
              />
            </div>

            <div style={{ flex: '0 1 220px', minWidth: 200 }}>
              {escrowRows.length > 0 && <InfoTable title="Escrow" rows={escrowRows} />}
              <InfoTable
                title="Totals"
                rows={[
                  { key: 'base-payment', label: 'Base Payment (P&I)', value: formatCurrency(schedule.monthlyPayment) },
                  { key: 'full-payment', label: 'Full Payment (incl. tax/PMI)', value: formatCurrency(currentRow.scheduledPayment) },
                  { key: 'total-interest', label: 'Total Interest', value: formatCurrency(schedule.totalInterest) },
                  { key: 'total-paid', label: 'Total Paid', value: formatCurrency(schedule.totalPaid) },
                  { key: 'payoff-date', label: 'Payoff Date', value: formatDate(schedule.payoffDate, dateFormat) },
                ]}
              />
            </div>

            <div style={{ flex: '1 1 320px', minWidth: 260, height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="loanBalanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="scheduledDate" tickFormatter={(d) => formatDate(d, 'MMM YYYY')} minTickGap={40} stroke="var(--text-secondary)" fontSize={12} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} width={90} stroke="var(--text-secondary)" fontSize={12} />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    labelFormatter={(d) => formatDate(d, dateFormat)}
                    contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="balance" name="Actual Balance" stroke="var(--accent)" fill="url(#loanBalanceFill)" strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="scheduledBalance" name="Scheduled Balance" stroke="var(--text-secondary)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  {scenarioSchedules.map((s, i) => (
                    <Line
                      key={s.amount}
                      type="monotone"
                      dataKey={`scenario_${s.amount}`}
                      name={scenarioLabel(s.amount)}
                      stroke={SCENARIO_COLORS[i % SCENARIO_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            ref={tableWrapRef}
            className="amortization-table-wrap"
            style={{ height: tableHeight, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}
          >
            <Table striped hover variant="dark" size="sm" className="amortization-table mb-0">
              <thead className="amortization-table-head" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th className="col-month">#</th>
                  <th>Scheduled Date</th>
                  <th>Date Paid</th>
                  <th>Payment</th>
                  <th>Property Taxes</th>
                  <th>Mortgage Insurance</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Principal +<br />Interest</th>
                  <th>Principal</th>
                  <th>Interest</th>
                  <th>Remaining Balance</th>
                  <th className="col-notes">Notes</th>
                </tr>
              </thead>
              <tbody>
                {schedule.schedule.map(row => (
                  <tr
                    key={row.month}
                    className={row.noPaymentNeeded ? 'row-no-payment' : undefined}
                    style={row === currentRow ? { outline: '2px solid var(--accent)', outlineOffset: '-2px' } : undefined}
                  >
                    <td className="col-month">{row.month}</td>
                    <td>{formatDate(row.scheduledDate, dateFormat)}</td>
                    <td>
                      {row.noPaymentNeeded ? '—' : (
                        <input
                          type="date"
                          className="inline-cell-input"
                          value={
                            localPayments[row.month]?.actualDate ??
                            (focusedDateMonth === row.month ? row.scheduledDate : '')
                          }
                          onFocus={() => setFocusedDateMonth(row.month)}
                          onChange={(e) => setPaymentField(row.month, 'actualDate', e.target.value)}
                          onBlur={(e) => {
                            const value = e.target.value;
                            setFocusedDateMonth(null);
                            if (value) {
                              setAndCommitPaymentField(row.month, 'actualDate', value);
                            }
                          }}
                        />
                      )}
                    </td>
                    <td className="col-money">
                      {row.noPaymentNeeded ? '—' : (
                        <input
                          type={focusedPaymentMonth === row.month ? 'number' : 'text'}
                          step="0.01"
                          className="inline-cell-input"
                          style={{ textAlign: 'right', color: localPayments[row.month]?.actualAmount ? undefined : 'var(--text-secondary)' }}
                          placeholder={row.scheduledPayment.toFixed(2)}
                          value={
                            focusedPaymentMonth === row.month
                              ? localPayments[row.month]?.actualAmount ?? ''
                              : formatCurrency(row.payment)
                          }
                          onFocus={() => setFocusedPaymentMonth(row.month)}
                          onChange={(e) => setPaymentField(row.month, 'actualAmount', e.target.value)}
                          onBlur={() => {
                            commitPayments(localPayments);
                            setFocusedPaymentMonth(null);
                          }}
                        />
                      )}
                    </td>
                    <td className="col-money">
                      {row.noPaymentNeeded ? '—' : (
                        <input
                          type={focusedTaxMonth === row.month ? 'number' : 'text'}
                          step="0.01"
                          className="inline-cell-input"
                          style={{ textAlign: 'right', color: localPayments[row.month]?.actualPropertyTax ? undefined : 'var(--text-secondary)' }}
                          placeholder={row.scheduledPropertyTax.toFixed(2)}
                          value={
                            focusedTaxMonth === row.month
                              ? localPayments[row.month]?.actualPropertyTax ?? ''
                              : formatCurrency(row.propertyTax)
                          }
                          onFocus={() => setFocusedTaxMonth(row.month)}
                          onChange={(e) => setPaymentField(row.month, 'actualPropertyTax', e.target.value)}
                          onBlur={() => {
                            commitPayments(localPayments);
                            setFocusedTaxMonth(null);
                          }}
                        />
                      )}
                    </td>
                    <td className="col-money">{row.noPaymentNeeded ? '—' : formatCurrency(row.pmi)}</td>
                    <td className="col-money">{row.noPaymentNeeded ? '—' : formatCurrency(row.principal + row.interest)}</td>
                    <td className="col-money">{row.noPaymentNeeded ? '—' : formatCurrency(row.principal)}</td>
                    <td className="col-money">{row.noPaymentNeeded ? '—' : formatCurrency(row.interest)}</td>
                    <td className="col-money" style={row.noPaymentNeeded ? { textDecoration: 'none', color: 'var(--text-secondary)' } : undefined}>
                      {formatCurrency(row.balance)}
                    </td>
                    <td className="col-notes">
                      <input
                        type="text"
                        className="inline-cell-input"
                        placeholder="Add a note"
                        value={localPayments[row.month]?.notes ?? ''}
                        onChange={(e) => setPaymentField(row.month, 'notes', e.target.value)}
                        onBlur={() => commitPayments(localPayments)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}

      <Modal show={showEdit} onHide={() => setShowEdit(false)} data-bs-theme="dark" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>{confirmDelete ? `Delete "${view.name}"?` : 'Loan Amortization Settings'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {confirmDelete ? (
            <p>This removes the view, its configuration, and any recorded payments. This cannot be undone.</p>
          ) : (
            <>
              <Form.Group className="mb-3">
                <Form.Label>View Name</Form.Label>
                <Form.Control value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Loan Balance at Starting Month</Form.Label>
                <CurrencyInput value={form.loanAmount} onChange={(e) => setForm({ ...form, loanAmount: e.target.value })} placeholder="e.g. 532232.35" />
                <Form.Text className="text-muted">The remaining principal balance as of the Starting Month below (or the original loan amount if Starting Month is 1).</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Interest Rate (%)</Form.Label>
                <Form.Control type="number" step="0.001" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} placeholder="e.g. 3.375" />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Term (months)</Form.Label>
                <Form.Control type="number" value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: e.target.value })} placeholder="e.g. 360 for a 30-year loan" />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Starting Month #</Form.Label>
                <Form.Control type="number" min="1" value={form.startingMonth} onChange={(e) => setForm({ ...form, startingMonth: e.target.value })} />
                <Form.Text className="text-muted">Tracking an existing loan partway through? Enter which payment number this schedule begins at (e.g. 35). Otherwise leave as 1.</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Date of Starting Month’s Payment</Form.Label>
                <Form.Control type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Linked Account</Form.Label>
                <div className="d-flex gap-2 align-items-start">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <AccountSelect
                      idPrefix="loan-linked-account"
                      accounts={accounts}
                      selectedId={form.linkedAccountId}
                      onChange={(accountId) => setForm({ ...form, linkedAccountId: accountId })}
                    />
                  </div>
                  {form.linkedAccountId && (
                    <Button size="sm" variant="outline-secondary" onClick={() => setForm({ ...form, linkedAccountId: '' })}>Clear</Button>
                  )}
                </div>
                <Form.Text className="text-muted">Optional — shows the live balance alongside the projected schedule.</Form.Text>
              </Form.Group>

              <hr />
              <h6>PMI (Mortgage Insurance)</h6>
              <Form.Check
                type="checkbox"
                label="Include PMI"
                checked={form.pmi.enabled}
                onChange={(e) => setForm({ ...form, pmi: { ...form.pmi, enabled: e.target.checked } })}
                className="mb-3"
              />
              {form.pmi.enabled && (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Monthly PMI Amount</Form.Label>
                    <CurrencyInput value={form.pmi.monthlyAmount} onChange={(e) => setForm({ ...form, pmi: { ...form.pmi, monthlyAmount: e.target.value } })} />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Removal Rule</Form.Label>
                    <Form.Select value={form.pmi.removalType} onChange={(e) => setForm({ ...form, pmi: { ...form.pmi, removalType: e.target.value } })}>
                      <option value="none">Never remove automatically</option>
                      <option value="after_months">After a set number of months from loan start</option>
                      <option value="percent">Once balance falls to a % of original balance</option>
                    </Form.Select>
                  </Form.Group>
                  {form.pmi.removalType === 'after_months' && (
                    <Form.Group className="mb-3">
                      <Form.Label>Remove PMI After Month #</Form.Label>
                      <Form.Control type="number" value={form.pmi.removalMonth} onChange={(e) => setForm({ ...form, pmi: { ...form.pmi, removalMonth: e.target.value } })} placeholder="e.g. 132" />
                      <Form.Text className="text-muted">Counted from month 1 of the original loan (not the Starting Month above) — e.g. 132 if PMI drops off 11 years in.</Form.Text>
                    </Form.Group>
                  )}
                  {form.pmi.removalType === 'percent' && (
                    <>
                      <Form.Group className="mb-3">
                        <Form.Label>Original Loan Amount</Form.Label>
                        <CurrencyInput value={form.pmi.originalLoanAmount} onChange={(e) => setForm({ ...form, pmi: { ...form.pmi, originalLoanAmount: e.target.value } })} placeholder="Basis for the % threshold" />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Remove at % of Original Balance</Form.Label>
                        <Form.Control type="number" value={form.pmi.removalPercent} onChange={(e) => setForm({ ...form, pmi: { ...form.pmi, removalPercent: e.target.value } })} placeholder="e.g. 80" />
                      </Form.Group>
                    </>
                  )}
                </>
              )}

              <hr />
              <h6>Property Tax</h6>
              <Form.Group className="mb-3">
                <Form.Label>Monthly Property Tax</Form.Label>
                <CurrencyInput value={form.propertyTax.monthlyAmount} onChange={(e) => setForm({ ...form, propertyTax: { ...form.propertyTax, monthlyAmount: e.target.value } })} />
              </Form.Group>
              <Form.Group className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Form.Label className="mb-0">Adjustments</Form.Label>
                  <Button size="sm" variant="outline-light" onClick={addAdjustment}>+ Add</Button>
                </div>
                {form.propertyTax.adjustments.map((adj, idx) => (
                  <div key={idx} className="d-flex gap-2 mb-2 align-items-center">
                    <Form.Control type="number" placeholder="Effective month #" value={adj.effectiveMonth} onChange={(e) => updateAdjustment(idx, 'effectiveMonth', e.target.value)} />
                    <CurrencyInput placeholder="Amount to add" value={adj.amount} onChange={(e) => updateAdjustment(idx, 'amount', e.target.value)} />
                    <Button size="sm" variant="outline-danger" onClick={() => removeAdjustment(idx)}>✕</Button>
                  </div>
                ))}
                <Form.Text className="text-muted">Each adjustment adds to the running total (base + every prior adjustment) starting at its effective month — e.g. an annual escrow analysis adds $35/mo starting at month 45.</Form.Text>
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

      {isConfigured && (
        <ScenariosModal
          show={showScenarios}
          onClose={() => setShowScenarios(false)}
          scenarios={config.scenarios || []}
          onSave={handleSaveScenarios}
          startBalance={Number(config.loanAmount)}
          startMonth={startingMonth}
          startDate={config.startDate}
          interestRate={Number(config.interestRate)}
          pmi={config.pmi}
          propertyTax={config.propertyTax}
          loanAmount={Number(config.loanAmount)}
        />
      )}
    </div>
  );
}

export default LoanAmortizationView;
