import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Form, Button, Badge, Modal, Spinner, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { getTransactions, searchTransactions, getCategories, getAccounts, getSettings, updateTransaction, updateSplits, createTransaction, deleteTransaction, getHiddenTransactions, getCounterpartCandidates, linkCounterpart, unlinkCounterpart, getTransaction } from '../services/api';
import { formatCurrency, setCurrencySettings } from '../utils/currency';
import CategorySelect from '../components/CategorySelect';
import { renderNotes } from '../utils/notes';
import { evaluateMathExpression } from '../helpers/mathExpression';

const fmt = formatCurrency;

// Bootstrap Icons "link-45deg" path, inlined (matches the pattern used in Settings.js)
function LinkIcon({ size = 16 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="currentColor" viewBox="0 0 16 16">
      <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.001 1.001 0 0 0-.264.264 2 2 0 0 1 .571 3.239l-1.828 1.829a2 2 0 1 1-2.829-2.83l.793-.792a4 4 0 0 1-.242-1.247z"/>
      <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.143 1.286l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z"/>
    </svg>
  );
}

// LinkIcon with a small "x" badge overlaid, for the "remove link" action
function UnlinkIcon({ size = 16 }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      <LinkIcon size={size} />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size * 0.6}
        height={size * 0.6}
        fill="#ff6666"
        viewBox="0 0 16 16"
        style={{ position: 'absolute', bottom: -3, right: -4 }}
      >
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
      </svg>
    </span>
  );
}

// Bootstrap Icons "eye-fill" / "eye-slash-fill", inlined (same pattern as LinkIcon)
function EyeIcon({ size = 16 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="currentColor" viewBox="0 0 16 16">
      <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
      <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>
    </svg>
  );
}

function EyeSlashIcon({ size = 16 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="currentColor" viewBox="0 0 16 16">
      <path d="M10.79 12.912l-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7.029 7.029 0 0 0 2.79-.588zM5.21 3.088A7.028 7.028 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474L5.21 3.089z"/>
      <path d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829l-2.83-2.829zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829zm3.171 6-12-12 .708-.708 12 12-.708.708z"/>
    </svg>
  );
}

// Format a YYYY-MM-DD date string according to a format pattern
function formatDate(dateStr, pattern) {
  if (!dateStr) 
    return '';
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
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState('');
  const [editTxn, setEditTxn] = useState(null);
  const [isNewTxn, setIsNewTxn] = useState(false);
  const [editSplits, setEditSplits] = useState([]);
  const [editMerchant, setEditMerchant] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('0.00');
  const [editAccountId, setEditAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hiddenTxns, setHiddenTxns] = useState([]);
  const [showHidden, setShowHidden] = useState(false);
  const [counterpartCandidates, setCounterpartCandidates] = useState(null);
  const [counterpartLinkType, setCounterpartLinkType] = useState('auth');
  const [selectedCounterpart, setSelectedCounterpart] = useState(null);
  const [hideSelf, setHideSelf] = useState(true);
  const [hideCounterpart, setHideCounterpart] = useState(true);
  const [linkedTxnSummary, setLinkedTxnSummary] = useState(null);
  const [dateFormat, setDateFormat] = useState('MMM D, YYYY');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });

  useEffect(() => {
    loadTransactions();
    getCategories().then(setCategories);
    getAccounts().then(setAccounts);
    getSettings().then(s => {
      if (s.date_format) 
        setDateFormat(s.date_format); setCurrencySettings(s); 
    });
  }, [startDate, endDate]);

  const loadTransactions = async () => {
    const data = await getTransactions(startDate, endDate);
    setTransactions(data);
    const hidden = await getHiddenTransactions(startDate, endDate);
    setHiddenTxns(hidden);
  };

  // Fetch a summary of the linked transaction (for the tooltip) whenever the edited transaction's link changes
  useEffect(() => {
    if (editTxn?.linked_transaction_id) {
      getTransaction(editTxn.linked_transaction_id).then(setLinkedTxnSummary);
    }
    else {
      setLinkedTxnSummary(null);
    }
  }, [editTxn?.linked_transaction_id]);

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
    setIsNewTxn(false);
    setEditMerchant(txn.merchant || '');
    setEditDate(txn.date || '');
    setEditAmount(parseFloat(txn.amount).toFixed(2));
    setEditSplits(
      txn.splits?.length
        ? txn.splits.map(s => ({ ...s, amount: s.amount_formula || parseFloat(s.amount).toFixed(2) }))
        : [{ category_id: '', amount: parseFloat(txn.amount).toFixed(2), notes: '' }]
    );
    setConfirmDelete(false);
  }, []);

  // Open modal for new manual transaction
  const openNew = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setEditTxn({ id: null, amount: 0 });
    setIsNewTxn(true);
    setEditMerchant('');
    setEditDate(dateStr);
    setEditAmount('0.00');
    setEditAccountId('');
    setEditSplits([{ category_id: '', amount: '0.00', notes: '' }]);
    setConfirmDelete(false);
  };

  const addSplit = () => {
    setEditSplits(prev => [...prev, { category_id: '', amount: '0.00', notes: '' }]);
  };

  const removeSplit = (idx) => {
    setEditSplits(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSplitField = (idx, field, value) => {
    setEditSplits(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  // Resolve a split's amount box text to a number: plain numbers parse as before, a
  // value starting with "=" is evaluated as a math expression (+ - * /, CEILING/FLOOR/ROUND).
  // Used everywhere a numeric total is needed (validation, distribute, save) — the box
  // itself keeps showing the raw formula text so it can be edited again later.
  const resolveAmount = (rawValue) => {
    const raw = (rawValue || '').trim();
    if (!raw.startsWith('='))
      return parseFloat(raw) || 0;

    const result = evaluateMathExpression(raw);
    return result === null ? 0 : result;
  };

  // On blur: plain numbers get normalized to 2 decimals as before. A formula is
  // evaluated (to warn on failure/sub-cent results) but the formula text itself is
  // left in the box — not overwritten with the resolved number — so it stays editable.
  const resolveSplitAmount = (idx, rawValue) => {
    const raw = (rawValue || '').trim();
    if (!raw.startsWith('=')) {
      updateSplitField(idx, 'amount', parseFloat(raw || 0).toFixed(2));
      return;
    }

    const result = evaluateMathExpression(raw);
    if (result === null) {
      alert(`Couldn't evaluate "${raw}". Check the formula and try again.`);
      return;
    }

    const cents = result * 100;
    if (Math.abs(cents - Math.round(cents)) > 0.001) {
      alert(`"${raw}" evaluates to ${result}, which isn't a whole number of cents. Sub-cent amounts can cause splits to not line up exactly.`);
    }

    updateSplitField(idx, 'amount', raw);
  };

  // Distribute the remaining (unassigned) transaction amount evenly across splits with a $0 amount
  const distributeRemaining = () => {
    const zeroIndices = editSplits
      .map((s, i) => ({ amount: resolveAmount(s.amount), i }))
      .filter(s => s.amount === 0)
      .map(s => s.i);

    if (zeroIndices.length === 0) {
      alert('No split has an amount of $0. This feature distributes the remaining transaction amount evenly among splits with a $0 amount.');
      return;
    }

    const totalAmount = isNewTxn ? (parseFloat(editAmount) || 0) : (editTxn?.amount || 0);
    const assignedAmount = editSplits.reduce((sum, s, i) => zeroIndices.includes(i) ? sum : sum + resolveAmount(s.amount), 0);
    const remaining = totalAmount - assignedAmount;

    const shares = zeroIndices.map(() => Math.round((remaining / zeroIndices.length) * 100) / 100);
    const roundingDiff = Math.round((remaining - shares.reduce((sum, s) => sum + s, 0)) * 100) / 100;
    shares[shares.length - 1] = Math.round((shares[shares.length - 1] + roundingDiff) * 100) / 100;

    setEditSplits(prev => prev.map((s, i) => {
      const shareIdx = zeroIndices.indexOf(i);
      return shareIdx === -1 ? s : { ...s, amount: shares[shareIdx].toFixed(2) };
    }));
  };

  // Shows a single alert summarizing any rules that were just auto-created/extended
  // from repeated manual renames or categorizations (see server/helpers/autoRules.js).
  const notifyAutoRules = (autoRulesCreated) => {
    if (!autoRulesCreated || autoRulesCreated.length === 0)
      return;

    const lines = autoRulesCreated.map(r => (
      r.rename_to ? `"${r.pattern}" → rename to "${r.rename_to}"` : `"${r.pattern}" → categorize as "${r.category_name}"`
    ));

    alert(`A pattern of rename or categorization was found, so a rule was created/updated automatically:\n\n${lines.join('\n')}\n\nYou can edit or delete it from Settings → Rules if you don't want it.`);
  };

  const handleSave = async () => {
    if (!editTxn) 
      return;
    setSaving(true);
    try {
      if (isNewTxn) {
        const amount = parseFloat(editAmount) || 0;
        const result = await createTransaction({
          date: editDate,
          merchant: editMerchant,
          amount,
          account_id: editAccountId || null,
          splits: editSplits.map(s => ({
            category_id: s.category_id || null,
            amount: resolveAmount(s.amount),
            amount_formula: (s.amount || '').trim().startsWith('=') ? s.amount.trim() : null,
            notes: s.notes || null,
          })),
        });

        if (result?.id) {
          const splitsResult = await updateSplits(result.id, editSplits.map(s => ({
            category_id: s.category_id || null,
            amount: resolveAmount(s.amount),
            amount_formula: (s.amount || '').trim().startsWith('=') ? s.amount.trim() : null,
            notes: s.notes || null,
          })));
          notifyAutoRules(splitsResult?.auto_rules_created);
        }
      }
      else {
        const result = await updateTransaction(editTxn.id, { merchant: editMerchant, date: editDate });
        notifyAutoRules(result?.auto_rules_created);

        const splitsResult = await updateSplits(editTxn.id, editSplits.map(s => ({
          category_id: s.category_id || null,
          amount: resolveAmount(s.amount),
          amount_formula: (s.amount || '').trim().startsWith('=') ? s.amount.trim() : null,
          notes: s.notes || null,
        })));
        notifyAutoRules(splitsResult?.auto_rules_created);
      }

      setEditTxn(null);
      loadTransactions();
    }
    finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editTxn || !editTxn.id) 
      return;
    setSaving(true);
    try {
      await deleteTransaction(editTxn.id);
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
    const month = parseInt(parts[1]) - 1 + direction;
    const start = new Date(year, month, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    setStartDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`);
    setEndDate(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`);
  };

  const monthLabel = () => {
    const parts = startDate.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const [showSummary, setShowSummary] = useState(false);

  // Compute summary totals from current transactions
  const summaryData = useMemo(() => {
    if (!transactions || transactions.length === 0) 
      return { accounts: [], categories: [] };

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
      }
      else {
        catMap['Uncategorized'] = (catMap['Uncategorized'] || 0) + txn.amount;
      }
    }

    const cats = Object.entries(catMap)
      .filter(([, total]) => total !== 0)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => a.total - b.total);

    return { accounts, categories: cats };
  }, [transactions]);

  const splitTotal = editSplits.reduce((sum, s) => sum + resolveAmount(s.amount), 0);
  const splitMismatch = !isNewTxn && !!editTxn && Math.abs(splitTotal - editTxn.amount) > 0.005;

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
        <div className="d-flex gap-2">
          <Button variant="success" size="sm" onClick={openNew}>+ Add Transaction</Button>
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
            <Table striped hover responsive variant="dark" className="transaction-table" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: 125 }}>Date</th>
                  <th style={{ width: 300, textAlign: 'left' }}>Where</th>
                  <th style={{ textAlign: 'left' }}>Notes</th>
                  <th style={{ width: 200 }}>Category</th>
                  <th style={{ width: 125 }}>Amount</th>
                  <th style={{ width: 200 }}>Account</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => {
                  const hasSplits = txn.splits?.length > 1;
                  if (!hasSplits) {
                    const isIncomplete = !txn.plaid_transaction_id || !txn.merchant || !txn.splits?.length || !txn.splits[0]?.category_name;
                    return (
                      <tr
                        key={txn.id}
                        className={`transaction-row ${txn.is_removed ? 'transaction-removed' : ''} ${isIncomplete ? 'transaction-incomplete' : ''}`}
                        onClick={() => openEdit(txn)}
                      >
                        <td className="fit-width">{formatDate(txn.date, dateFormat)}</td>
                        <td style={{ textAlign: 'left' }}>
                          {txn.merchant}
                          {txn.is_pending ? <Badge bg="warning" className="ms-2">Pending</Badge> : null}
                        </td>
                        <td style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>{renderNotes(txn.splits?.[0]?.notes)}</td>
                        <td>{txn.splits?.[0]?.category_name || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
                        <td className="fit-width">{fmt(txn.amount)}</td>
                        <td>{txn.account_name || ''}</td>
                      </tr>
                    );
                  }

                  // Multi-split: render one row per split
                  const splitIncomplete = !txn.plaid_transaction_id || !txn.merchant || txn.splits.some(s => !s.category_name);
                  return txn.splits.map((split, idx) => (
                    <tr
                      key={`${txn.id}-${idx}`}
                      className={`transaction-row split-row ${idx > 0 ? 'split-continuation' : 'split-start'} ${txn.is_removed ? 'transaction-removed' : ''} ${splitIncomplete && idx === 0 ? 'transaction-incomplete' : ''}`}
                      onClick={() => openEdit(txn)}
                    >
                      <td className="fit-width">
                        {idx === 0 ? formatDate(txn.date, dateFormat) : ''}
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        {idx === 0 ? txn.merchant : ''}
                        {idx === 0 && txn.is_pending ? <Badge bg="warning" className="ms-2">Pending</Badge> : null}
                      </td>
                      <td style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>{renderNotes(split.notes)}</td>
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
            {transactions.map((txn) => {
              const hasSplits = txn.splits?.length > 1;
              const isIncomplete = !txn.plaid_transaction_id || !txn.merchant || !txn.splits?.length || !txn.splits[0]?.category_name;
              const cardClass = `transaction-card${txn.is_removed ? ' transaction-removed' : ''}${hasSplits ? ' transaction-split' : ''}${isIncomplete ? ' transaction-incomplete' : ''}`;
              return (
                <div key={txn.id} className={cardClass} onClick={() => openEdit(txn)}>
                  <div className="transaction-card-header d-flex justify-content-between">
                    <span>
                      {txn.merchant}
                      {txn.is_pending ? <Badge bg="warning" className="ms-2">Pending</Badge> : null}
                    </span>
                    <span>{fmt(txn.amount)}</span>
                  </div>
                  {txn.splits?.length > 1 ? (
                    <div style={{ paddingBottom: 6 }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em', padding: '4px 8px 0' }}>
                        {formatDate(txn.date, dateFormat)}
                      </div>
                      {txn.splits.map((split, idx) => (
                        <div key={idx} className="d-flex justify-content-between" style={{ color: 'var(--text-secondary)', fontSize: '0.85em', padding: '0 10px 2px 8px' }}>
                          <span>{split.category_name || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</span>
                          <span>{fmt(split.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="transaction-card-body d-flex justify-content-between" style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>
                      <span>{formatDate(txn.date, dateFormat)}</span>
                      <span>{txn.splits?.[0]?.category_name || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {transactions.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 40 }}>No transactions found.</p>
          )}

          {/* Hidden transactions section */}
          {hiddenTxns.length > 0 && (
            <div style={{ marginTop: 24, borderTop: '1px solid #333', paddingTop: 12 }}>
              <div
                style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9em', userSelect: 'none' }}
                onClick={() => setShowHidden(!showHidden)}
              >
                {showHidden ? '▼' : '▶'} Hidden transactions ({hiddenTxns.length})
              </div>
              {showHidden && (
                <>
                  <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.8em', margin: '8px 0' }}>
                    Hidden transactions do not count towards categories and summary totals
                  </p>
                  <Table size="sm" hover variant="dark" className="d-none d-md-table" style={{ marginTop: 8, opacity: 0.7 }}>
                    <tbody>
                      {hiddenTxns.map(txn => (
                        <tr key={txn.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(txn)}>
                          <td style={{ width: 100 }}>{formatDate(txn.date, dateFormat)}</td>
                          <td style={{ width: 80, textAlign: 'center' }}>
                            {txn.linked_transaction_id
                              ? <Badge bg="info">Transfer</Badge>
                              : txn.is_auth ? <Badge bg="secondary">Auth</Badge>
                                : txn.is_transfer ? <Badge bg="info">Transfer</Badge>
                                  : null}
                          </td>
                          <td>{txn.merchant}</td>
                          <td style={{ textAlign: 'right', width: 125 }}>{fmt(txn.amount)}</td>
                          <td style={{ width: 200, color: 'var(--text-secondary)', fontSize: '0.85em' }}>{txn.account_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <div className="d-md-none" style={{ marginTop: 8, opacity: 0.7 }}>
                    {hiddenTxns.map(txn => (
                      <div key={txn.id} className="transaction-card" onClick={() => openEdit(txn)}>
                        <div className="transaction-card-header d-flex justify-content-between">
                          <span>
                            {txn.merchant}
                            {txn.linked_transaction_id
                              ? <Badge bg="info" className="ms-2">Transfer</Badge>
                              : txn.is_auth ? <Badge bg="secondary" className="ms-2">Auth</Badge>
                                : txn.is_transfer ? <Badge bg="info" className="ms-2">Transfer</Badge>
                                  : null}
                          </span>
                          <span>{fmt(txn.amount)}</span>
                        </div>
                        <div className="transaction-card-body d-flex justify-content-between" style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>
                          <span>{formatDate(txn.date, dateFormat)}</span>
                          <span>{txn.account_name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
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

      {/* Edit/Add Modal */}
      <Modal show={!!editTxn} onHide={() => setEditTxn(null)} size="lg" data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>{isNewTxn ? 'Add Transaction' : 'Edit Transaction'}</Modal.Title>
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
              {isNewTxn && (
                <Form.Group style={{ flex: 1 }}>
                  <Form.Label>Amount</Form.Label>
                  <Form.Control
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => {
                      setEditAmount(e.target.value);
                      if (editSplits.length === 1) {
                        updateSplitField(0, 'amount', e.target.value);
                      }
                    }}
                  />
                </Form.Group>
              )}
            </div>

            {isNewTxn && (
              <Form.Group className="mb-3">
                <Form.Label>Account</Form.Label>
                <Form.Select value={editAccountId} onChange={(e) => setEditAccountId(e.target.value)}>
                  <option value="">— No account —</option>
                  {accounts.filter(a => !a.is_deleted && !a.hide_from_transactions).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}

            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong>Itemized Splits ({editSplits.length})</strong>
              <div className="d-flex align-items-center gap-2">
                {!isNewTxn && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>
                    Total: {fmt(editTxn.amount)}
                  </span>
                )}
                {splitMismatch && (
                  <span style={{ color: '#ff4444', fontWeight: 'bold', fontSize: '0.85em' }}>
                    (split total: {fmt(splitTotal)})
                  </span>
                )}
                <Button variant={splitMismatch ? 'secondary' : 'outline-secondary'} size="sm" onClick={distributeRemaining}>Distribute</Button>
                <Button variant="outline-primary" size="sm" onClick={addSplit}>+ Add Split</Button>
              </div>
            </div>

            {editSplits.map((split, idx) => (
              <div key={idx} className="split-edit-row mb-2">
                <div className="split-edit-notes">
                  <Form.Control
                    placeholder="Notes (supports **bold**, *italic*)"
                    value={split.notes || ''}
                    onChange={(e) => updateSplitField(idx, 'notes', e.target.value)}
                  />
                </div>
                <div className="split-edit-bottom">
                  <CategorySelect
                    categories={categories}
                    value={split.category_id}
                    onChange={(val) => updateSplitField(idx, 'category_id', val)}
                  />
                  <Form.Control
                    type="text"
                    inputMode="decimal"
                    value={split.amount}
                    onChange={(e) => updateSplitField(idx, 'amount', e.target.value)}
                    onBlur={(e) => resolveSplitAmount(idx, e.target.value)}
                    title="Supports math expressions, e.g. =5*2, =CEILING(x, 0.01), =FLOOR(x, 0.01), =ROUND(x, 0.01)"
                    style={{ width: 125, flex: 'none' }}
                  />
                  {editSplits.length > 1 && (
                    <Button variant="outline-danger" size="sm" onClick={() => removeSplit(idx)}>×</Button>
                  )}
                </div>
              </div>
            ))}

            {(editTxn.account_name || editTxn.plaid_transaction_id) && (
              <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: 8 }}>
                {editTxn.account_name && <>Account: {editTxn.account_name}</>}
                {editTxn.account_name && editTxn.plaid_transaction_id && ' · '}
                {editTxn.plaid_transaction_id && <>Plaid ID: {editTxn.plaid_transaction_id}</>}
              </small>
            )}

          </Modal.Body>
        )}
        <Modal.Footer>
          <div className="me-auto d-flex align-items-center gap-2">
            {!isNewTxn && editTxn && !editTxn.plaid_transaction_id && (
              confirmDelete ? (
                <>
                  <span style={{ color: '#ff4444', fontSize: '0.9em' }}>Are you sure?</span>
                  <Button variant="danger" size="sm" onClick={handleDelete} disabled={saving}>Yes, Delete</Button>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </>
              ) : (
                <Button variant="outline-danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
              )
            )}
            {!isNewTxn && editTxn && !editTxn.linked_transaction_id && (
              <Button
                variant="outline-info"
                tabIndex={3}
                title="Link counterpart"
                onClick={async () => {
                  const candidates = await getCounterpartCandidates(editTxn.id);
                  setCounterpartCandidates(candidates);
                  setCounterpartLinkType('auth');
                  setSelectedCounterpart(null);
                  setHideSelf(true);
                  setHideCounterpart(true);
                }}
              >
                <LinkIcon />
              </Button>
            )}
            {!isNewTxn && editTxn && editTxn.linked_transaction_id && (
              <>
                <OverlayTrigger
                  placement="top"
                  overlay={
                    <Tooltip>
                      {linkedTxnSummary
                        ? `Linked to: ${formatDate(linkedTxnSummary.date, dateFormat)} ${linkedTxnSummary.merchant || ''} ${fmt(linkedTxnSummary.amount)} ${linkedTxnSummary.account_name || ''}`
                        : 'Loading…'}
                    </Tooltip>
                  }
                >
                  <Button
                    variant="outline-info"
                    tabIndex={3}
                    onClick={async () => {
                      const linked = await getTransaction(editTxn.linked_transaction_id);
                      openEdit(linked);
                    }}
                  >
                    <LinkIcon />
                  </Button>
                </OverlayTrigger>
                <Button
                  variant="outline-warning"
                  tabIndex={4}
                  title="Remove link"
                  onClick={async () => {
                    await unlinkCounterpart(editTxn.id);
                    setEditTxn(null);
                    loadTransactions();
                  }}
                >
                  <UnlinkIcon />
                </Button>
              </>
            )}
            {!isNewTxn && editTxn && (
              <Button
                variant="outline-secondary"
                tabIndex={5}
                title={editTxn.is_hidden ? 'Unhide transaction' : 'Hide transaction'}
                onClick={async () => {
                  await updateTransaction(editTxn.id, { is_hidden: !editTxn.is_hidden });
                  setEditTxn(null);
                  loadTransactions();
                }}
              >
                {editTxn.is_hidden ? <EyeSlashIcon /> : <EyeIcon />}
              </Button>
            )}
          </div>
          <Button variant="secondary" tabIndex={1} onClick={() => setEditTxn(null)}>Cancel</Button>
          <Button
            variant="primary"
            tabIndex={2}
            onClick={handleSave}
            disabled={saving || splitMismatch}
          >
            {saving ? 'Saving...' : isNewTxn ? 'Add Transaction' : 'Save Changes'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Counterpart candidates modal */}
      <Modal
        show={counterpartCandidates !== null}
        onHide={() => {
          setCounterpartCandidates(null); setSelectedCounterpart(null);
        }}
        data-bs-theme="dark"
      >
        <Modal.Header closeButton>
          <Modal.Title>Link Counterpart</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Link type</Form.Label>
            <Form.Select value={counterpartLinkType} onChange={e => setCounterpartLinkType(e.target.value)}>
              <option value="auth">Auth charge</option>
              <option value="transfer">Transfer</option>
            </Form.Select>
          </Form.Group>
          {counterpartCandidates && counterpartCandidates.length === 0 && (
            <p style={{ color: 'var(--text-secondary)' }}>No matching counterpart found (opposite amount within 7 days).</p>
          )}
          {counterpartCandidates && counterpartCandidates.map(c => (
            <div
              key={c.id}
              className="d-flex justify-content-between align-items-center counterpart-candidate"
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid #333',
                cursor: 'pointer',
                borderRadius: 6,
                marginBottom: 4,
                border: selectedCounterpart?.id === c.id ? '1px solid #58a6ff' : '1px solid #444',
                backgroundColor: selectedCounterpart?.id === c.id ? '#2a3040' : '',
                transition: 'background-color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                if (selectedCounterpart?.id === c.id)
                  return;
                e.currentTarget.style.backgroundColor = '#2a3040';
                e.currentTarget.style.borderColor = '#58a6ff';
              }}
              onMouseLeave={e => {
                if (selectedCounterpart?.id === c.id)
                  return;
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.borderColor = '#444';
              }}
              onClick={() => setSelectedCounterpart(c)}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{c.merchant || '(no merchant)'}</div>
                <small style={{ color: 'var(--text-secondary)' }}>{formatDate(c.date, dateFormat)} · {c.account_name}</small>
              </div>
              <span style={{ fontWeight: 'bold', fontSize: '1.05em' }}>{fmt(c.amount)}</span>
            </div>
          ))}

          {selectedCounterpart && (
            <div className="mt-3 p-3" style={{ border: '1px solid #444', borderRadius: 6 }}>
              <div className="d-flex justify-content-between align-items-center mb-3 pb-3" style={{ borderBottom: '1px solid #333' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {editTxn?.merchant || '(no merchant)'}
                    <Badge bg="secondary" className="ms-2">This transaction</Badge>
                  </div>
                  <small style={{ color: 'var(--text-secondary)' }}>
                    {formatDate(editTxn?.date, dateFormat)} · {fmt(editTxn?.amount)} · {editTxn?.account_name || '—'}
                  </small>
                </div>
                <Form.Check
                  type="switch"
                  label="Hide"
                  checked={hideSelf}
                  onChange={e => setHideSelf(e.target.checked)}
                />
              </div>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <div style={{ fontWeight: 500 }}>{selectedCounterpart.merchant || '(no merchant)'}</div>
                  <small style={{ color: 'var(--text-secondary)' }}>
                    {formatDate(selectedCounterpart.date, dateFormat)} · {fmt(selectedCounterpart.amount)} · {selectedCounterpart.account_name || '—'}
                  </small>
                </div>
                <Form.Check
                  type="switch"
                  label="Hide"
                  checked={hideCounterpart}
                  onChange={e => setHideCounterpart(e.target.checked)}
                />
              </div>
              <Button
                variant="primary"
                className="w-100"
                onClick={async () => {
                  await linkCounterpart(editTxn.id, selectedCounterpart.id, counterpartLinkType, hideSelf, hideCounterpart);
                  setCounterpartCandidates(null);
                  setSelectedCounterpart(null);
                  setEditTxn(null);
                  loadTransactions();
                }}
              >
                Link Transactions
              </Button>
            </div>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}

export default Transactions;
