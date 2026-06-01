import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { getIncompleteTransactions, getCategories, updateTransaction, getPlaidCandidates, linkPlaidId, mergeAndLinkPlaid } from '../../services/api';

const fmt = (amount) => (amount < 0 ? '-' : '') + '$' + Math.abs(amount).toFixed(2);

function IncompleteTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editTxn, setEditTxn] = useState(null);
  const [form, setForm] = useState({});
  const [checked, setChecked] = useState(new Set());

  // Plaid candidate matching state
  const [matchTxns, setMatchTxns] = useState([]); // transactions being matched
  const [matchAmount, setMatchAmount] = useState(0);
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState(null);
  const [searchStartDate, setSearchStartDate] = useState('');
  const [searchEndDate, setSearchEndDate] = useState('');

  const loadData = () => {
    getIncompleteTransactions().then(setTransactions);
    getCategories().then(setCategories);
  };

  useEffect(() => { loadData(); }, []);

  const toggleCheck = (id) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEdit = (txn) => {
    setChecked(new Set([txn.id]));
    setEditTxn(txn);
    setForm({
      merchant: txn.merchant || '',
      notes: txn.notes || '',
      category_id: txn.split_category_id || '',
      account_id: txn.account_id || ''
    });
  };

  const handleSave = async () => {
    await updateTransaction(editTxn.id, form);
    setEditTxn(null);
    loadData();
  };

  const handleFindMatch = async (txn, customStartDate, customEndDate) => {
    let selectedIds;
    if (checked.has(txn.id) && checked.size > 1) {
      selectedIds = [...checked];
    }
    else {
      setChecked(new Set([txn.id]));
      selectedIds = [txn.id];
    }

    const selectedTxns = transactions.filter(t => selectedIds.includes(t.id));
    const combinedAmount = selectedTxns.reduce((sum, t) => sum + t.amount, 0);

    setMatchTxns(selectedTxns);
    setMatchAmount(combinedAmount);
    setCandidates([]);
    setCandidateError(null);
    setLoadingCandidates(true);

    // Set default date range (±7 days) if not provided
    if (!customStartDate) {
      const d = new Date(txn.date + 'T12:00:00');
      const sd = new Date(d); sd.setDate(d.getDate() - 7);
      const ed = new Date(d); ed.setDate(d.getDate() + 7);
      customStartDate = sd.toISOString().split('T')[0];
      customEndDate = ed.toISOString().split('T')[0];
      setSearchStartDate(customStartDate);
      setSearchEndDate(customEndDate);
    }

    try {
      const amountOverride = selectedTxns.length > 1 ? combinedAmount : undefined;
      const data = await getPlaidCandidates(txn.id, amountOverride, customStartDate, customEndDate);
      setCandidates(data.candidates);
    }
    catch (err) {
      setCandidateError(err.message || 'Failed to fetch candidates');
    }
    finally {
      setLoadingCandidates(false);
    }
  };

  const handleLinkPlaid = async (plaidId) => {
    if (matchTxns.length > 1) {
      // Merge multiple transactions and link
      await mergeAndLinkPlaid(matchTxns.map(t => t.id), plaidId);
    }
    else {
      await linkPlaidId(matchTxns[0].id, plaidId);
    }
    setMatchTxns([]);
    setChecked(new Set());
    loadData();
  };

  const closeMatchModal = () => {
    setMatchTxns([]);
    setCandidates([]);
    setCandidateError(null);
  };

  const issues = (txn) => {
    const badges = [];
    if (txn.missing_category) badges.push(<Badge key="cat" bg="danger" className="me-1">No category</Badge>);
    if (txn.missing_merchant) badges.push(<Badge key="mer" bg="warning" className="me-1">No merchant</Badge>);
    if (txn.missing_account) badges.push(<Badge key="acc" bg="info" className="me-1">No account</Badge>);
    if (txn.missing_plaid_id) badges.push(<Badge key="pid" bg="secondary" className="me-1">No Plaid ID</Badge>);
    return badges;
  };

  return (
    <div>
      <h4>Incomplete Transactions</h4>
      <p style={{ color: 'var(--text-secondary)' }}>
        Transactions missing data. Check multiple rows then click "Find Match" to match a combined amount.
      </p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }} className="mb-3">
        Showing {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
        {checked.size > 0 && <span> &bull; <strong>{checked.size} selected</strong></span>}
      </p>

      <Table striped hover responsive variant="dark">
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th>Date</th>
            <th style={{ textAlign: 'left' }}>Merchant</th>
            <th style={{ textAlign: 'left' }}>Notes</th>
            <th>Amount</th>
            <th>Account</th>
            <th>Issues</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => (
            <tr key={txn.id} style={{ background: checked.has(txn.id) ? 'rgba(75, 171, 247, 0.1)' : undefined }}>
              <td>
                <Form.Check
                  type="checkbox"
                  checked={checked.has(txn.id)}
                  onChange={() => toggleCheck(txn.id)}
                />
              </td>
              <td>{txn.date}</td>
              <td style={{ textAlign: 'left' }}>{txn.merchant || <span style={{ color: 'var(--text-secondary)' }}>(empty)</span>}</td>
              <td style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>{txn.notes || ''}</td>
              <td>{fmt(txn.amount)}</td>
              <td>{txn.account_name || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
              <td>{issues(txn)}</td>
              <td>
                <div className="d-flex gap-1">
                  <Button size="sm" variant="outline-light" onClick={() => handleEdit(txn)}>Fix</Button>
                  {txn.missing_plaid_id ? (
                    <Button size="sm" variant="outline-primary" onClick={() => handleFindMatch(txn)}>Find Match</Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
          {transactions.length === 0 && (
            <tr><td colSpan="8" className="text-center" style={{ color: 'var(--text-secondary)' }}>All transactions are complete!</td></tr>
          )}
        </tbody>
      </Table>

      {/* Edit Modal */}
      <Modal show={!!editTxn} onHide={() => setEditTxn(null)} data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>Fix Transaction</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editTxn && (
            <>
              <div className="mb-3" style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>
                {editTxn.date} &bull; {fmt(editTxn.amount)}
                {editTxn.plaid_transaction_id && <> &bull; <code>{editTxn.plaid_transaction_id.substring(0, 20)}...</code></>}
              </div>
              <Form.Group className="mb-3">
                <Form.Label>Merchant</Form.Label>
                <Form.Control
                  value={form.merchant}
                  onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                  placeholder="e.g. Safeway"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Category</Form.Label>
                <Form.Select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">— Select category —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Notes</Form.Label>
                <Form.Control
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional notes"
                />
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditTxn(null)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
        </Modal.Footer>
      </Modal>

      {/* Plaid Match Modal */}
      <Modal show={matchTxns.length > 0} onHide={closeMatchModal} size="lg" data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>Find Plaid Match</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {matchTxns.length > 0 && (
            <div className="mb-3" style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8 }}>
              <strong>Looking for:</strong> {matchTxns[0].merchant || '(no merchant)'} &bull; {fmt(matchAmount)} &bull; {matchTxns[0].date}
              {matchTxns.length > 1 && (
                <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginTop: 4 }}>
                  Combined from {matchTxns.length} selected transactions:
                  {matchTxns.map((t, i) => (
                    <span key={t.id}>{i > 0 ? ' + ' : ' '}{fmt(t.amount)}{t.notes ? ` (${t.notes})` : ''}</span>
                  ))}
                </div>
              )}
              <div className="d-flex align-items-center gap-2 mt-2" style={{ fontSize: '0.85em' }}>
                <Form.Control
                  type="date"
                  size="sm"
                  value={searchStartDate}
                  onChange={(e) => setSearchStartDate(e.target.value)}
                  style={{ width: 150 }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>to</span>
                <Form.Control
                  type="date"
                  size="sm"
                  value={searchEndDate}
                  onChange={(e) => setSearchEndDate(e.target.value)}
                  style={{ width: 150 }}
                />
                <Button
                  size="sm"
                  variant="outline-light"
                  onClick={() => handleFindMatch(matchTxns[0], searchStartDate, searchEndDate)}
                  disabled={loadingCandidates}
                >
                  Search Again
                </Button>
              </div>
            </div>
          )}
          {loadingCandidates && (
            <div className="text-center py-4">
              <Spinner animation="border" variant="light" />
              <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>Querying Plaid API...</p>
            </div>
          )}
          {candidateError && (
            <p style={{ color: '#dc3545' }}>{candidateError}</p>
          )}
          {!loadingCandidates && candidates.length > 0 && (
            <Table striped responsive variant="dark" size="sm">
              <thead>
                <tr>
                  <th>Score</th>
                  <th style={{ textAlign: 'left' }}>Name</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.plaid_transaction_id} style={{ opacity: c.is_claimed ? 0.5 : 1 }}>
                    <td>
                      <Badge bg={c.score >= 100 ? 'success' : c.score >= 50 ? 'warning' : 'secondary'}>
                        {c.score}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      {c.name}
                      {c.merchant_name && c.merchant_name !== c.name && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginLeft: 6 }}>({c.merchant_name})</span>
                      )}
                    </td>
                    <td style={{ color: Math.abs(c.amount - matchAmount) < 0.01 ? '#4fa94d' : Math.abs(c.amount + matchAmount) < 0.01 ? '#e6a817' : '#dc3545' }}>{fmt(c.amount)}</td>
                    <td>{c.date}</td>
                    <td>
                      {c.is_claimed ? <Badge bg="dark">Claimed</Badge> : <Badge bg="success">Available</Badge>}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant={c.is_claimed ? 'outline-secondary' : 'outline-primary'}
                        onClick={() => handleLinkPlaid(c.plaid_transaction_id)}
                        disabled={c.is_claimed}
                      >
                        Link
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {!loadingCandidates && candidates.length === 0 && !candidateError && (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No candidates found in the ±7 day window.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeMatchModal}>Close</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default IncompleteTransactions;
