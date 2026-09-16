import React, { useState, useEffect } from 'react';
import { Button, Form, Modal, Spinner, Badge } from 'react-bootstrap';
import { getIncome, createIncomeApi, updateIncomeApi, toggleIncomeArchived, deleteIncomeApi, getSettings } from '../services/api';
import IncomeSourceCard from '../components/income/IncomeSourceCard';
import CurrencyInput from '../components/CurrencyInput';
import {
  INCOME_TYPES, PAY_PERIODS, WEEKDAYS, computeIncomeAmounts,
} from '../helpers/income';
import { formatCurrency, setCurrencySettings } from '../utils/currency';

const emptyForm = {
  name: '', type: 'salary', amount: '', quantity_per_period: '', unit_label: '',
  pay_period: 'biweekly', payday_weekday: '', reference_pay_date: '', adjustments: [],
};

function Income() {
  const [incomeList, setIncomeList] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [dateFormat, setDateFormat] = useState('MMM D, YYYY');

  useEffect(() => {
    loadData();
    getSettings().then(s => {
      if (s.date_format) {
        setDateFormat(s.date_format);
      }

      setCurrencySettings(s);
    });
  }, []);

  const loadData = async () => {
    const income = await getIncome();
    setIncomeList(income);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDeleteConfirm(false);
    setShowModal(true);
  };

  const openEdit = (source) => {
    setForm({
      name: source.name,
      type: source.type,
      amount: source.amount ?? '',
      quantity_per_period: source.quantity_per_period ?? '',
      unit_label: source.unit_label || '',
      pay_period: source.pay_period || 'biweekly',
      payday_weekday: source.payday_weekday ?? '',
      reference_pay_date: source.reference_pay_date || '',
      adjustments: source.adjustments || [],
    });
    setEditingId(source.id);
    setDeleteConfirm(false);
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const addAdjustment = () => setForm({ ...form, adjustments: [...form.adjustments, { name: '', kind: 'fixed', value: '' }] });
  const removeAdjustment = (i) => setForm({ ...form, adjustments: form.adjustments.filter((_, idx) => idx !== i) });
  const updateAdjustment = (i, field, value) =>
    setForm({ ...form, adjustments: form.adjustments.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)) });

  const handleSave = async () => {
    const payload = {
      name: form.name,
      type: form.type,
      amount: form.amount === '' ? null : Number(form.amount),
      quantity_per_period: form.quantity_per_period === '' ? null : form.quantity_per_period,
      unit_label: form.type === 'commission' ? (form.unit_label || null) : null,
      pay_period: form.pay_period,
      payday_weekday: form.pay_period === 'weekly' ? (form.payday_weekday === '' ? null : Number(form.payday_weekday)) : null,
      reference_pay_date: form.pay_period === 'biweekly' ? (form.reference_pay_date || null) : null,
      adjustments: form.adjustments.filter(a => a.name).map(a => ({ name: a.name, kind: a.kind, value: Number(a.value) || 0 })),
    };

    if (editingId) {
      await updateIncomeApi(editingId, payload);
    }
    else {
      await createIncomeApi(payload);
    }

    closeModal();
    loadData();
  };

  const handleDelete = async () => {
    await deleteIncomeApi(editingId);
    closeModal();
    loadData();
  };

  const handleArchiveToggle = async () => {
    const current = incomeList.find(s => s.id === editingId);
    await toggleIncomeArchived(editingId, !current?.is_archived);
    closeModal();
    loadData();
  };

  if (!incomeList) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="light" style={{ width: 60, height: 60 }} />
      </div>
    );
  }

  const activeSources = incomeList.filter(s => !s.is_archived);
  const archivedSources = incomeList.filter(s => s.is_archived);
  const editingSource = editingId ? incomeList.find(s => s.id === editingId) : null;

  const totalMonthlyNet = activeSources.reduce((sum, s) => sum + computeIncomeAmounts(s).monthlyNet, 0);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h2 className="mb-0">Income</h2>
        <Button variant="primary" onClick={openAdd}>+ Add Income Source</Button>
      </div>

      <div className="mb-3" style={{ color: 'var(--text-secondary)' }}>
        Total Monthly Net Income:{' '}
        <strong style={{ color: totalMonthlyNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(totalMonthlyNet)}</strong>
      </div>

      {activeSources.length === 0 ? (
        <p className="text-muted">No income sources yet. Click "+ Add Income Source" to get started.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {activeSources.map(source => (
            <IncomeSourceCard key={source.id} source={source} dateFormat={dateFormat} onClick={() => openEdit(source)} />
          ))}
        </div>
      )}

      {/* Archived Income Sources */}
      {archivedSources.length > 0 && (
        <div className="mt-4">
          <Button
            variant="link"
            style={{ color: 'var(--text-secondary)', padding: 0, fontSize: '0.9em' }}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? '▾' : '▸'} Archived income sources ({archivedSources.length})
          </Button>
          {showArchived && (
            <div className="mt-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {archivedSources.map(source => (
                <Badge
                  key={source.id}
                  bg="secondary"
                  style={{ cursor: 'pointer', fontSize: '0.85em' }}
                  onClick={() => openEdit(source)}
                  title="Click to edit"
                >
                  {source.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Income Source Modal */}
      <Modal show={showModal} onHide={closeModal} data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingId ? (deleteConfirm ? `Delete: ${form.name}` : `Edit: ${form.name}`) : 'New Income Source'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!deleteConfirm && (
            <>
              <Form.Group className="mb-3">
                <Form.Label>Name</Form.Label>
                <Form.Control
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Name"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Type</Form.Label>
                <Form.Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {INCOME_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              {form.type === 'salary' && (
                <Form.Group className="mb-3">
                  <Form.Label>Annual Salary</Form.Label>
                  <CurrencyInput
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </Form.Group>
              )}

              {form.type === 'fixed' && (
                <Form.Group className="mb-3">
                  <Form.Label>Amount per Paycheck</Form.Label>
                  <CurrencyInput
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </Form.Group>
              )}

              {form.type === 'hourly' && (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Hourly Rate</Form.Label>
                    <CurrencyInput
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Estimated Hours per Pay Period</Form.Label>
                    <Form.Control
                      value={form.quantity_per_period}
                      onChange={(e) => setForm({ ...form, quantity_per_period: e.target.value })}
                      placeholder="e.g. 36 or =4*mondays"
                    />
                    <Form.Text style={{ color: 'var(--text-secondary)' }}>
                      Prefix with = to use a formula. Variables: sundays, mondays, ..., saturdays, days, weeks
                    </Form.Text>
                  </Form.Group>
                </>
              )}

              {form.type === 'commission' && (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Unit label</Form.Label>
                    <Form.Control
                      value={form.unit_label}
                      onChange={(e) => setForm({ ...form, unit_label: e.target.value })}
                      placeholder="e.g. lesson, sale"
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Rate per {form.unit_label || 'Unit'}</Form.Label>
                    <CurrencyInput
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Estimated {form.unit_label || 'Unit'}s per Pay Period</Form.Label>
                    <Form.Control
                      value={form.quantity_per_period}
                      onChange={(e) => setForm({ ...form, quantity_per_period: e.target.value })}
                      placeholder="e.g. 36 or =1325.56/36"
                    />
                    <Form.Text style={{ color: 'var(--text-secondary)' }}>
                      Prefix with = to use a formula. Variables: sundays, mondays, ..., saturdays, days, weeks
                    </Form.Text>
                  </Form.Group>
                </>
              )}

              <Form.Group className="mb-3">
                <Form.Label>Pay Period</Form.Label>
                <Form.Select value={form.pay_period} onChange={(e) => setForm({ ...form, pay_period: e.target.value })}>
                  {PAY_PERIODS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              {form.pay_period === 'weekly' && (
                <Form.Group className="mb-3">
                  <Form.Label>Payday</Form.Label>
                  <Form.Select
                    value={form.payday_weekday}
                    onChange={(e) => setForm({ ...form, payday_weekday: e.target.value })}
                  >
                    <option value="">— Choose day —</option>
                    {WEEKDAYS.map(w => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </Form.Select>
                  <Form.Text style={{ color: 'var(--text-secondary)' }}>
                    Lets us tell you how many paychecks land in a given month — some months have 5 instead of 4.
                  </Form.Text>
                </Form.Group>
              )}

              {form.pay_period === 'biweekly' && (
                <Form.Group className="mb-3">
                  <Form.Label>Reference Payday</Form.Label>
                  <Form.Control
                    type="date"
                    value={form.reference_pay_date}
                    onChange={(e) => setForm({ ...form, reference_pay_date: e.target.value })}
                  />
                  <Form.Text style={{ color: 'var(--text-secondary)' }}>
                    Any date you were (or will be) paid. Since biweekly pay alternates which week it lands on, a single
                    reference date lets us tell you exactly how many paychecks land in a given month (usually 2, occasionally 3).
                  </Form.Text>
                </Form.Group>
              )}

              <Form.Group className="mb-3">
                <Form.Label>Paycheck Extras (deductions/additions)</Form.Label>
                {form.adjustments.map((adj, i) => (
                  <div key={i} className="d-flex gap-2 mb-2">
                    <Form.Control
                      placeholder="Name"
                      value={adj.name}
                      onChange={(e) => updateAdjustment(i, 'name', e.target.value)}
                    />
                    <Form.Select style={{ maxWidth: 90 }} value={adj.kind} onChange={(e) => updateAdjustment(i, 'kind', e.target.value)}>
                      <option value="fixed">$</option>
                      <option value="percent">%</option>
                    </Form.Select>
                    {adj.kind === 'percent' ? (
                      <Form.Control
                        type="number"
                        step="0.01"
                        style={{ maxWidth: 110 }}
                        value={adj.value}
                        onChange={(e) => updateAdjustment(i, 'value', e.target.value)}
                      />
                    ) : (
                      <CurrencyInput
                        style={{ maxWidth: 110 }}
                        value={adj.value}
                        onChange={(e) => updateAdjustment(i, 'value', e.target.value)}
                      />
                    )}
                    <Button variant="outline-danger" onClick={() => removeAdjustment(i)}>×</Button>
                  </div>
                ))}
                <Button variant="outline-secondary" size="sm" onClick={addAdjustment}>+ Add adjustment</Button>
                <Form.Text style={{ color: 'var(--text-secondary)', display: 'block' }}>
                  Applied per pay period. Use negative values for deductions (taxes, 401k, etc), positive for extras.
                </Form.Text>
              </Form.Group>
            </>
          )}
          {deleteConfirm && (
            <p>
              Delete <strong>{form.name}</strong>? This cannot be undone.
              Consider archiving instead if you want to keep it for future reference.
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          {deleteConfirm ? (
            <>
              <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>Back</Button>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </>
          ) : (
            <>
              {editingId && <Button variant="danger" className="me-auto" onClick={() => setDeleteConfirm(true)}>Delete</Button>}
              {editingId && (
                <Button variant="outline-warning" onClick={handleArchiveToggle}>
                  {editingSource?.is_archived ? 'Unarchive' : 'Archive'}
                </Button>
              )}
              <Button variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button variant="primary" onClick={handleSave}>Save</Button>
            </>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default Income;
