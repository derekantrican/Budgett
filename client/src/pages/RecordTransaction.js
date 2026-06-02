import React, { useState, useEffect, useCallback } from 'react';
import { Form, Button } from 'react-bootstrap';
import { getCategories, getAccounts, createTransaction, updateSplits, getTemplates, createTemplateApi, getTransactionByPlaidId } from '../services/api';

function RecordTransaction() {
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ date: today(), merchant: '', notes: '', category_id: '', account_id: '', amount: '', plaidid: '' });
  const [existingTxnId, setExistingTxnId] = useState(null); // set when plaidid matches existing txn
  const [saving, setSaving] = useState(false);
  const [recorded, setRecorded] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  const loadData = useCallback(async () => {
    const [cats, accts, tmpls] = await Promise.all([getCategories(), getAccounts(), getTemplates()]);
    setCategories(cats.filter(c => !c.is_hidden));
    setAccounts(accts);
    setTemplates(tmpls);

    // Check URL params for pre-population
    const params = new URLSearchParams(window.location.search);
    const prefill = {};
    if (params.get('date')) prefill.date = params.get('date');
    if (params.get('merchant') || params.get('where')) prefill.merchant = params.get('merchant') || params.get('where');
    if (params.get('notes')) prefill.notes = params.get('notes');
    if (params.get('amount')) prefill.amount = params.get('amount');
    if (params.get('plaidid')) prefill.plaidid = params.get('plaidid');
    if (params.get('category')) {
      const match = cats.find(c => c.name.toLowerCase() === params.get('category').toLowerCase());
      if (match) prefill.category_id = match.id;
    }
    if (params.get('account') || params.get('paymentmethod')) {
      const name = params.get('account') || params.get('paymentmethod');
      const match = accts.find(a =>
        (a.display_name || a.name).toLowerCase() === name.toLowerCase() ||
        a.name.toLowerCase() === name.toLowerCase()
      );
      if (match) prefill.account_id = match.id;
    }
    if (Object.keys(prefill).length > 0) {
      setForm(f => ({ ...f, ...prefill }));
    }

    // If plaidid is provided, look up existing transaction
    if (params.get('plaidid')) {
      try {
        const txn = await getTransactionByPlaidId(params.get('plaidid'));
        setExistingTxnId(txn.id);
        // Pre-fill category from existing splits if not already set via URL
        if (!params.get('category') && txn.splits && txn.splits.length > 0) {
          setForm(f => ({ ...f, category_id: txn.splits[0].category_id || '' }));
        }
      } catch (e) {
        // Transaction not found by plaid ID — will create new
      }
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const applyTemplate = (id) => {
    const t = templates.find(tpl => tpl.id === Number(id));
    if (t) {
      setForm(f => ({
        ...f,
        merchant: t.merchant || '',
        notes: t.notes || '',
        category_id: t.category_id || '',
        account_id: t.account_id || '',
        amount: t.amount != null ? String(t.amount) : '',
      }));
    }
  };

  const handleRecord = async () => {
    if (!form.amount) return;
    setSaving(true);
    try {
      const amount = parseFloat(form.amount);
      const splits = form.category_id
        ? [{ category_id: Number(form.category_id), amount, notes: form.notes || null }]
        : [];

      if (existingTxnId) {
        // Update existing transaction's splits
        await updateSplits(existingTxnId, splits);
      } else {
        // Create new manual transaction
        await createTransaction({
          date: form.date || today(),
          merchant: form.merchant || null,
          amount,
          account_id: form.account_id ? Number(form.account_id) : null,
          plaid_transaction_id: form.plaidid || null,
          splits,
        });
      }

      if (saveAsTemplate && templateName.trim()) {
        await createTemplateApi({
          name: templateName.trim(),
          merchant: form.merchant || null,
          notes: form.notes || null,
          category_id: form.category_id ? Number(form.category_id) : null,
          account_id: form.account_id ? Number(form.account_id) : null,
          amount: amount || null,
        });
        setTemplates(await getTemplates());
        setSaveAsTemplate(false);
        setTemplateName('');
      }

      setRecorded(existingTxnId ? 'Updated!' : 'Recorded!');
      setForm({ date: today(), merchant: '', notes: '', category_id: '', account_id: '', amount: '', plaidid: '' });
      setExistingTxnId(null);
      setTimeout(() => setRecorded(''), 2000);
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <div className="record-txn-container">
      <h5 className="mb-2">Record Transaction</h5>

      {/* Template selector */}
      {templates.length > 0 && (
        <div className="d-flex gap-2 mb-2">
          <Form.Select size="sm" onChange={e => applyTemplate(e.target.value)} defaultValue="">
            <option value="" disabled>Template…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Form.Select>
        </div>
      )}

      {/* Form */}
      <div className="d-flex gap-2 mb-2">
        <Form.Control size="sm" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ flex: 1 }} />
        <Form.Control size="sm" type="number" step="0.01" placeholder="Amount" value={form.amount}
          onChange={e => setForm({ ...form, amount: e.target.value })} style={{ flex: 1 }} />
      </div>

      <Form.Control size="sm" className="mb-2" placeholder="Where / Merchant" value={form.merchant}
        onChange={e => setForm({ ...form, merchant: e.target.value })} />

      <Form.Control size="sm" className="mb-2" placeholder="Notes" value={form.notes}
        onChange={e => setForm({ ...form, notes: e.target.value })} />

      <div className="d-flex gap-2 mb-2">
        <Form.Select size="sm" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} style={{ flex: 1 }}>
          <option value="">Category</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Form.Select>
        <Form.Select size="sm" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} style={{ flex: 1 }}>
          <option value="">Account</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.display_name || a.name}</option>)}
        </Form.Select>
      </div>

      {/* Save as template */}
      <div className="d-flex align-items-center gap-2 mb-2">
        <Form.Check type="checkbox" label="Save template" checked={saveAsTemplate}
          onChange={e => setSaveAsTemplate(e.target.checked)} style={{ fontSize: '0.85em' }} />
        {saveAsTemplate && (
          <Form.Control size="sm" placeholder="Template name" value={templateName}
            onChange={e => setTemplateName(e.target.value)} style={{ flex: 1 }} />
        )}
      </div>

      {/* Record button */}
      <Button
        variant="primary"
        className="w-100"
        disabled={saving || !form.amount}
        onClick={handleRecord}
      >
        {saving ? 'Saving…' : existingTxnId ? 'Update' : 'Record'}
      </Button>

      {recorded && <div className="mt-2 text-center text-success fw-bold">{recorded}</div>}
    </div>
  );
}

export default RecordTransaction;
