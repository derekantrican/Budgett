import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Form, Modal } from 'react-bootstrap';
import { getIncompleteTransactions, getCategories, updateTransaction } from '../../services/api';

const fmt = (amount) => (amount < 0 ? '-' : '') + '$' + Math.abs(amount).toFixed(2);

function IncompleteTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editTxn, setEditTxn] = useState(null);
  const [form, setForm] = useState({});

  const loadData = () => {
    getIncompleteTransactions().then(setTransactions);
    getCategories().then(setCategories);
  };

  useEffect(() => { loadData(); }, []);

  const handleEdit = (txn) => {
    setEditTxn(txn);
    setForm({
      merchant: txn.merchant || '',
      notes: txn.notes || '',
      category_id: '',
      account_id: txn.account_id || ''
    });
  };

  const handleSave = async () => {
    await updateTransaction(editTxn.id, form);
    setEditTxn(null);
    loadData();
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
      <h2>Incomplete Transactions</h2>
      <p className="text-muted">
        Transactions missing data that needs attention. Click "Fix" to fill in missing fields.
      </p>
      <p className="text-muted mb-3" style={{ fontSize: '0.9em' }}>
        Showing {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
      </p>

      <Table striped hover responsive variant="dark">
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Amount</th>
            <th>Issues</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => (
            <tr key={txn.id}>
              <td>{txn.date}</td>
              <td>{txn.merchant || <span className="text-muted">(empty)</span>}</td>
              <td>
                {fmt(txn.amount)}
              </td>
              <td>{issues(txn)}</td>
              <td>
                <Button size="sm" variant="outline-light" onClick={() => handleEdit(txn)}>
                  Fix
                </Button>
              </td>
            </tr>
          ))}
          {transactions.length === 0 && (
            <tr><td colSpan="5" className="text-center text-muted">All transactions are complete!</td></tr>
          )}
        </tbody>
      </Table>

      {/* Edit Modal */}
      <Modal show={!!editTxn} onHide={() => setEditTxn(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Fix Transaction</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editTxn && (
            <>
              <div className="mb-3 text-muted" style={{ fontSize: '0.85em' }}>
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
    </div>
  );
}

export default IncompleteTransactions;
