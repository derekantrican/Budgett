import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Form, Button, Badge, Modal, Spinner } from 'react-bootstrap';
import { getTransactions, searchTransactions, getCategories, getSettings, updateTransaction, updateSplits } from '../services/api';
import { formatCurrency, setCurrencySettings } from '../utils/currency';

const fmt = formatCurrency;

// Format a YYYY-MM-DD date string according to a format pattern
function formatDate(dateStr, pattern) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return pattern
    .replace('YYYY', y)
    .replace('YY', String(y).slice(-2))
    .replace('MMMM', monthsFull[m - 1])
    .replace('MMM', months[m - 1])
    .replace('MM', String(m).padStart(2, '0'))
    .replace('DD', String(d).padStart(2, '0'))
    .replace(/\bD\b/, d);
}

function Transactions() {
  const [transactions, setTransactions] = useState(null);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [editTxn, setEditTxn] = useState(null);
  const [editSplits, setEditSplits] = useState([]);
  const [editMerchant, setEditMerchant] = useState('');
  const [editDate, setEditDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [dateFormat, setDateFormat] = useState('MMM D, YYYY');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadTransactions();
    getCategories().then(setCategories);
    getSettings().then(s => { if (s.date_format) setDateFormat(s.date_format); setCurrencySettings(s); });
  }, [startDate, endDate]);

  const loadTransactions = async () => {
    const data = await getTransactions(startDate, endDate);
    setTransactions(data);
  };

  // Search-as-you-type with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim()) {
        searchTransactions(search).then(setTransactions);
      }
      else {
        loadTransactions();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Open edit modal
  const openEdit = useCallback((txn) => {
    setEditTxn(txn);
    setEditMerchant(txn.merchant || '');
    setEditDate(txn.date || '');
    setEditSplits(
      txn.splits?.length
        ? txn.splits.map(s => ({ ...s }))
        : [{ category_id: '', amount: txn.amount, notes: '' }]
    );
  }, []);

  const addSplit = () => {
    setEditSplits(prev => [...prev, { category_id: '', amount: 0, notes: '' }]);
  };

  const removeSplit = (idx) => {
    setEditSplits(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSplitField = (idx, field, value) => {
    setEditSplits(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    if (!editTxn) return;
    setSaving(true);
    try {
      await updateTransaction(editTxn.id, { merchant: editMerchant, date: editDate });
      await updateSplits(editTxn.id, editSplits.map(s => ({
        category_id: s.category_id || null,
        amount: parseFloat(s.amount) || 0,
        notes: s.notes || null,
      })));
      setEditTxn(null);
      loadTransactions();
    }
    finally {
      setSaving(false);
    }
  };

  // Month navigation
  const navigateMonth = (direction) => {
    const parts = startDate.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const newMonth = month + direction;
    const start = new Date(year, newMonth, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const monthLabel = () => {
    const parts = startDate.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const [showSummary, setShowSummary] = useState(false);

  // Compute summary totals from current transactions
  const summaryData = useMemo(() => {
    if (!transactions || transactions.length === 0) return { accounts: [], categories: [] };

    // Account totals
    const acctMap = {};
    for (const txn of transactions) {
      const name = txn.account_name || 'Unknown';
      acctMap[name] = (acctMap[name] || 0) + txn.amount;
    }
    const accounts = Object.entries(acctMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => a.total - b.total);

    // Category totals (from splits)
    const catMap = {};
    for (const txn of transactions) {
      if (txn.splits && txn.splits.length > 0) {
        for (const s of txn.splits) {
          const name = s.category_name || 'Uncategorized';
          catMap[name] = (catMap[name] || 0) + s.amount;
        }
      } else {
        catMap['Uncategorized'] = (catMap['Uncategorized'] || 0) + txn.amount;
      }
    }
    const cats = Object.entries(catMap)
      .filter(([, total]) => total !== 0)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => a.total - b.total);

    return { accounts, categories: cats };
  }, [transactions]);

  if (!transactions) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="light" style={{ width: 60, height: 60 }} />
      </div>
    );
  }

  return (
    <div className="transactions-page">
      <div className="d-flex justify-content-between align-items-center">
        <h4>Transactions</h4>
        <Button
          className="d-none d-md-inline-block"
          variant={showSummary ? 'primary' : 'outline-primary'}
          size="sm"
          onClick={() => setShowSummary(!showSummary)}
          title="Summary"
        >
          &#931; Summary
        </Button>
      </div>

      {/* Month navigation + search */}
      <div className="transactions-header">
        <Button variant="outline-light" size="sm" onClick={() => navigateMonth(-1)}>&lt;</Button>
        <span style={{ minWidth: 150, textAlign: 'center', fontWeight: 'bold' }}>{monthLabel()}</span>
        <Button variant="outline-light" size="sm" onClick={() => navigateMonth(1)}>&gt;</Button>
        <div className="d-none d-md-block" style={{ flex: 1 }}></div>
        <Form.Control
          type="text"
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="transactions-search"
        />
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Main content */}
        <div className="transactions-body">

      {/* Desktop table */}
      <div className="d-none d-md-block">
        <Table striped hover responsive variant="dark" className="transaction-table">
          <thead>
            <tr>
              <th className="fit-width">Date</th>
              <th style={{ textAlign: 'left' }}>Where</th>
              <th style={{ textAlign: 'left' }}>Notes</th>
              <th>Category</th>
              <th className="fit-width">Amount</th>
              <th>Account</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((txn) => {
              const hasSplits = txn.splits?.length > 1;
              if (!hasSplits) {
                return (
                  <tr
                    key={txn.id}
                    className={`transaction-row ${txn.is_removed ? 'transaction-removed' : ''}`}
                    onClick={() => openEdit(txn)}
                  >
                    <td className="fit-width">{formatDate(txn.date, dateFormat)}</td>
                    <td style={{ textAlign: 'left' }}>
                      {txn.merchant}
                      {txn.is_pending ? <Badge bg="warning" className="ms-2">Pending</Badge> : null}
                    </td>
                    <td style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>{txn.splits?.[0]?.notes || ''}</td>
                    <td>{txn.splits?.[0]?.category_name || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
                    <td className="fit-width">{fmt(txn.amount)}</td>
                    <td>{txn.account_name || ''}</td>
                  </tr>
                );
              }
              // Multi-split: render one row per split
              return txn.splits.map((split, idx) => (
                <tr
                  key={`${txn.id}-${idx}`}
                  className={`transaction-row split-row ${idx > 0 ? 'split-continuation' : 'split-start'} ${txn.is_removed ? 'transaction-removed' : ''}`}
                  onClick={() => openEdit(txn)}
                >
                  <td className="fit-width">
                    {idx === 0 ? formatDate(txn.date, dateFormat) : ''}
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    {idx === 0 ? txn.merchant : ''}
                    {idx === 0 && txn.is_pending ? <Badge bg="warning" className="ms-2">Pending</Badge> : null}
                  </td>
                  <td style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>{split.notes || ''}</td>
                  <td>{split.category_name || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
                  <td className="fit-width">{fmt(split.amount)}</td>
                  <td>{txn.account_name || ''}</td>
                </tr>
              ));
            })}
          </tbody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="d-md-none">
        {transactions.map((txn) => (
          <div key={txn.id} className={`transaction-card ${txn.is_removed ? 'transaction-removed' : ''}`} onClick={() => openEdit(txn)}>
            <div className="transaction-card-header d-flex justify-content-between">
              <span>{txn.merchant}</span>
              <span>{fmt(txn.amount)}</span>
            </div>
            {txn.splits?.length > 1 ? (
              txn.splits.map((split, idx) => (
                <div key={idx} className="d-flex justify-content-between" style={{ color: 'var(--text-secondary)', fontSize: '0.85em', paddingLeft: 8 }}>
                  <span>{split.category_name || 'Uncategorized'}</span>
                  <span>{fmt(split.amount)}</span>
                </div>
              ))
            ) : (
              <div className="transaction-card-body d-flex justify-content-between" style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>
                <span>{formatDate(txn.date, dateFormat)}</span>
                <span>{txn.splits?.[0]?.category_name || 'Uncategorized'}</span>
              </div>
            )}
            {txn.splits?.length > 1 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em', padding: '2px 8px' }}>
                {formatDate(txn.date, dateFormat)}
              </div>
            )}
          </div>
        ))}
      </div>

      {transactions.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 40 }}>No transactions found.</p>
      )}
      </div>

        {/* Summary side panel */}
        {showSummary && (
          <div className="d-none d-md-block" style={{
            width: 280,
            flexShrink: 0,
            backgroundColor: '#1a1f25',
            borderRadius: 8,
            padding: '12px 16px',
            overflowY: 'auto',
            fontSize: '0.85em',
          }}>
            <h6 style={{ color: '#aaa', borderBottom: '1px solid #333', paddingBottom: 6, marginBottom: 8 }}>Accounts</h6>
            {summaryData.accounts.map(a => (
              <div key={a.name} className="d-flex justify-content-between" style={{ padding: '3px 0' }}>
                <span style={{ color: '#ccc' }}>{a.name}</span>
                <span style={{ color: '#ccc', fontWeight: 'bold' }}>{fmt(a.total)}</span>
              </div>
            ))}

            <h6 style={{ color: '#aaa', borderBottom: '1px solid #333', paddingBottom: 6, marginTop: 16, marginBottom: 8 }}>Categories</h6>
            {summaryData.categories.map(c => (
              <div key={c.name} className="d-flex justify-content-between" style={{ padding: '3px 0' }}>
                <span style={{ color: '#ccc' }}>{c.name}</span>
                <span style={{ color: '#ccc', fontWeight: 'bold' }}>{fmt(c.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal show={!!editTxn} onHide={() => setEditTxn(null)} size="lg" data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>Edit Transaction</Modal.Title>
        </Modal.Header>
        {editTxn && (
          <Modal.Body>
            <div className="d-flex gap-3 mb-3">
              <Form.Group style={{ flex: 1 }}>
                <Form.Label>Date</Form.Label>
                <Form.Control type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </Form.Group>
              <Form.Group style={{ flex: 2 }}>
                <Form.Label>Where (Merchant)</Form.Label>
                <Form.Control value={editMerchant} onChange={(e) => setEditMerchant(e.target.value)} />
              </Form.Group>
            </div>

            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong>Itemized Splits ({editSplits.length})</strong>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginRight: 12 }}>
                  Total: {fmt(editSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0))}
                </span>
                <Button variant="outline-primary" size="sm" onClick={addSplit}>+ Add Split</Button>
              </div>
            </div>

            {editSplits.map((split, idx) => (
              <div key={idx} className="d-flex gap-2 mb-2 align-items-center">
                <Form.Select
                  value={split.category_id || ''}
                  onChange={(e) => updateSplitField(idx, 'category_id', e.target.value)}
                  style={{ flex: 2 }}
                >
                  <option value="">Uncategorized</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Form.Select>
                <Form.Control
                  type="number"
                  step="0.01"
                  value={split.amount}
                  onChange={(e) => updateSplitField(idx, 'amount', e.target.value)}
                  style={{ flex: 1 }}
                />
                <Form.Control
                  placeholder="Notes"
                  value={split.notes || ''}
                  onChange={(e) => updateSplitField(idx, 'notes', e.target.value)}
                  style={{ flex: 2 }}
                />
                {editSplits.length > 1 && (
                  <Button variant="outline-danger" size="sm" onClick={() => removeSplit(idx)}>×</Button>
                )}
              </div>
            ))}

            {editTxn.plaid_transaction_id && (
              <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: 8 }}>
                Plaid ID: {editTxn.plaid_transaction_id}
              </small>
            )}
          </Modal.Body>
        )}
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditTxn(null)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default Transactions;
