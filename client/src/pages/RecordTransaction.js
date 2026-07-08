import React, { useState, useEffect, useCallback } from 'react';
import { getCategories, getAccounts, createTransaction, updateTransaction, updateSplits, getTemplates, createTemplateApi, getTransactionByPlaidId } from '../services/api';
import CategorySelect from '../components/CategorySelect';

const styles = {
  container: {
    maxWidth: '600px',
    margin: 'auto',
    padding: '20px',
    backgroundColor: '#212529',
    borderRadius: '10px',
    boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)',
    color: '#f5f5fa',
    fontFamily: 'Arial, sans-serif',
    overflow: 'hidden',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  label: {
    fontWeight: 'bold',
    color: '#a0a0b3',
    minWidth: '70px',
    fontSize: '14px',
  },
  input: {
    padding: '10px',
    borderRadius: '5px',
    flex: 1,
    border: '1px solid #3a3a4f',
    backgroundColor: 'black',
    color: '#f5f5fa',
    fontSize: '14px',
  },
  select: {
    padding: '10px',
    borderRadius: '5px',
    flex: 1,
    border: '1px solid #3a3a4f',
    backgroundColor: 'black',
    color: '#f5f5fa',
    fontSize: '14px',
  },
  textarea: {
    padding: '10px',
    borderRadius: '5px',
    border: '1px solid #3a3a4f',
    backgroundColor: 'black',
    color: '#f5f5fa',
    fontSize: '14px',
    resize: 'vertical',
    minHeight: '50px',
    flex: 1,
  },
  button: {
    padding: '12px',
    borderRadius: '5px',
    backgroundColor: '#4e89ff',
    color: '#f5f5fa',
    fontWeight: 'bold',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    width: '100%',
    transition: 'background-color 0.3s',
  },
  applyButton: {
    padding: '10px 12px',
    borderRadius: '5px',
    backgroundColor: '#4e89ff',
    color: '#f5f5fa',
    fontWeight: 'bold',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  hr: {
    border: 'none',
    height: '1px',
    backgroundColor: '#3a3a4f',
    margin: '14px 0',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  recorded: {
    padding: '12px',
    borderRadius: '5px',
    backgroundColor: 'rgba(40, 167, 69, 0.7)',
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: '16px',
  },
};

function RecordTransaction() {
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ date: today(), merchant: '', notes: '', category_id: '', account_id: '', amount: '', plaidid: '' });
  const [existingTxnId, setExistingTxnId] = useState(null);
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

    const params = new URLSearchParams(window.location.search);
    const prefill = {};
    if (params.get('date')) {
      prefill.date = params.get('date');
    }

    if (params.get('merchant') || params.get('where')) {
      prefill.merchant = params.get('merchant') || params.get('where');
    }

    if (params.get('notes')) {
      prefill.notes = params.get('notes');
    }

    if (params.get('amount')) {
      prefill.amount = params.get('amount');
    }

    if (params.get('plaidid')) {
      prefill.plaidid = params.get('plaidid');
    }

    if (params.get('category')) {
      const match = cats.find(c => c.name.toLowerCase() === params.get('category').toLowerCase());
      if (match) {
        prefill.category_id = match.id;
      }
    }

    if (params.get('account') || params.get('paymentmethod')) {
      const name = params.get('account') || params.get('paymentmethod');
      const match = accts.find(a =>
        (a.display_name || a.name).toLowerCase() === name.toLowerCase() ||
        a.name.toLowerCase() === name.toLowerCase()
      );
      if (match) {
        prefill.account_id = match.id;
      }
    }

    if (Object.keys(prefill).length > 0) {
      setForm(f => ({ ...f, ...prefill }));
    }

    if (params.get('plaidid')) {
      try {
        const txn = await getTransactionByPlaidId(params.get('plaidid'));
        setExistingTxnId(txn.id);
        if (!params.get('category') && txn.splits && txn.splits.length > 0) {
          setForm(f => ({ ...f, category_id: txn.splits[0].category_id || '' }));
        }
      }
      catch (e) {
        // Transaction not found — will create new
      }
    }
  }, []);

  useEffect(() => {
    loadData(); 
  }, [loadData]);

  const applyTemplate = (e) => {
    const t = templates.find(tpl => tpl.id === Number(e.target.value));
    if (t) {
      setForm(f => ({
        ...f,
        merchant: t.merchant || '',
        notes: t.notes || '',
        category_id: t.category_id || '',
        ...(t.account_id ? { account_id: String(t.account_id) } : {}),
        ...(t.amount ? { amount: String(t.amount) } : {}),
      }));
    }
  };

  const handleRecord = async () => {
    if (!form.amount) {
      return;
    }

    setSaving(true);
    try {
      const amount = parseFloat(form.amount);
      const splits = form.category_id
        ? [{ category_id: Number(form.category_id), amount, notes: form.notes || null }]
        : [];

      if (existingTxnId) {
        await updateTransaction(existingTxnId, { merchant: form.merchant || null, notes: form.notes || null });
        await updateSplits(existingTxnId, splits);
      }
      else {
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
      setTimeout(() => setRecorded(''), 2500);
    }
    catch (e) {
      alert('Error: ' + e.message);
    }

    setSaving(false);
  };

  const handleInputChange = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div style={styles.container}>
      <h2 style={{ margin: '0 0 4px', fontSize: '1.4em' }}>Record Transaction</h2>
      <hr style={styles.hr} />

      {/* Template */}
      {templates.length > 0 && (
        <>
          <div style={styles.row}>
            <label style={styles.label}>Template:</label>
            <select id="templateSelect" style={styles.select} defaultValue="">
              <option value="" disabled>— select —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button style={styles.applyButton}
              onMouseOver={e => {
                e.target.style.backgroundColor = '#3a6de5'; 
              }}
              onMouseOut={e => {
                e.target.style.backgroundColor = '#4e89ff'; 
              }}
              onClick={() => {
                const sel = document.getElementById('templateSelect');
                if (sel.value) {
                  applyTemplate({ target: { value: sel.value } });
                }
              }}
            >Apply</button>
          </div>
          <hr style={styles.hr} />
        </>
      )}

      {/* Form fields */}
      <div style={styles.formGroup}>
        <div style={styles.row}>
          <label style={styles.label}>Date:</label>
          <input type="date" value={form.date} onChange={handleInputChange('date')} style={styles.input} />
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Where:</label>
          <input type="text" value={form.merchant} onChange={handleInputChange('merchant')} style={styles.input} />
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Notes:</label>
          <textarea
            value={form.notes}
            onChange={handleInputChange('notes')}
            style={styles.textarea}
            placeholder="Supports **bold**, *italic*"
          />
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Category:</label>
          <div style={{ flex: 1 }}>
            <CategorySelect
              categories={categories}
              value={form.category_id}
              onChange={(val) => setForm({ ...form, category_id: val })}
            />
          </div>
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Amount:</label>
          <input type="number" step="0.01" value={form.amount} onChange={handleInputChange('amount')} style={styles.input} />
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Account:</label>
          <select value={form.account_id} onChange={handleInputChange('account_id')} style={styles.select}>
            <option value=""></option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.display_name || a.name}</option>)}
          </select>
        </div>

        <hr style={styles.hr} />

        {/* Save as template */}
        <div style={styles.checkboxRow}>
          <input type="checkbox" style={styles.checkbox} checked={saveAsTemplate}
            onChange={() => setSaveAsTemplate(!saveAsTemplate)} id="saveTemplate" />
          <label htmlFor="saveTemplate" style={{ ...styles.label, minWidth: 0 }}>Save as Template</label>
        </div>
        {saveAsTemplate && (
          <input type="text" placeholder="Template name" value={templateName}
            onChange={e => setTemplateName(e.target.value)} style={styles.input} />
        )}

        {/* Record/Update button */}
        {!recorded ? (
          <button
            style={{ ...styles.button, opacity: saving || !form.amount ? 0.6 : 1 }}
            disabled={saving || !form.amount}
            onClick={handleRecord}
            onMouseOver={e => {
              if (!saving) {
                e.target.style.backgroundColor = '#3a6de5';
              } 
            }}
            onMouseOut={e => {
              e.target.style.backgroundColor = '#4e89ff'; 
            }}
          >
            {saving ? 'Saving…' : existingTxnId ? 'Update' : 'Record'}
          </button>
        ) : (
          <div style={styles.recorded}>{recorded}</div>
        )}
      </div>
    </div>
  );
}

export default RecordTransaction;
