import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Modal } from 'react-bootstrap';
import { getTemplates, createTemplateApi, updateTemplateApi, deleteTemplateApi, getCategories, getItems } from '../../services/api';
import CategorySelect from '../../components/CategorySelect';
import { renderNotes } from '../../utils/notes';

function Templates() {
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', merchant: '', notes: '', category_id: '', account_id: '', amount: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [t, c, items] = await Promise.all([getTemplates(), getCategories(), getItems()]);
    setTemplates(t);
    setCategories(c);
    const accts = items.flatMap(item => (item.accounts || []).map(a => ({ id: a.id, name: a.name || a.official_name })));
    setAccounts(accts);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ name: '', merchant: '', notes: '', category_id: '', account_id: '', amount: '' });
    setShowModal(true);
  };

  const openEdit = (tmpl) => {
    setEditId(tmpl.id);
    setForm({
      name: tmpl.name,
      merchant: tmpl.merchant || '',
      notes: tmpl.notes || '',
      category_id: tmpl.category_id || '',
      account_id: tmpl.account_id || '',
      amount: tmpl.amount || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const data = {
      name: form.name,
      merchant: form.merchant || null,
      notes: form.notes || null,
      category_id: form.category_id || null,
      account_id: form.account_id || null,
      amount: form.amount ? parseFloat(form.amount) : null,
    };
    if (editId) {
      await updateTemplateApi(editId, data);
    }
    else {
      await createTemplateApi(data);
    }

    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) 
      return;
    await deleteTemplateApi(id);
    loadData();
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Templates</h4>
        <Button variant="primary" size="sm" onClick={openNew}>+ Add Template</Button>
      </div>

      <Table striped hover responsive variant="dark">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'left' }}>Merchant</th>
            <th style={{ textAlign: 'left' }}>Notes</th>
            <th>Category</th>
            <th>Amount</th>
            <th className="fit-width"></th>
          </tr>
        </thead>
        <tbody>
          {templates.map(tmpl => (
            <tr key={tmpl.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(tmpl)}>
              <td style={{ textAlign: 'left' }}>{tmpl.name}</td>
              <td style={{ textAlign: 'left' }}>{tmpl.merchant || '—'}</td>
              <td style={{ textAlign: 'left' }}>{renderNotes(tmpl.notes) || '—'}</td>
              <td>{tmpl.category_name || '—'}</td>
              <td>{tmpl.amount || '—'}</td>
              <td className="fit-width">
                <Button variant="outline-danger" size="sm" onClick={(e) => {
                  e.stopPropagation(); handleDelete(tmpl.id); 
                }}>✕</Button>
              </td>
            </tr>
          ))}
          {templates.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No templates configured</td></tr>
          )}
        </tbody>
      </Table>

      <Modal show={showModal} onHide={() => setShowModal(false)} data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>{editId ? 'Edit Template' : 'New Template'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Name</Form.Label>
            <Form.Control
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Template name"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Merchant</Form.Label>
            <Form.Control
              value={form.merchant}
              onChange={(e) => setForm({ ...form, merchant: e.target.value })}
              placeholder="Where / merchant name"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Notes</Form.Label>
            <Form.Control
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Default notes (supports **bold**, *italic*)"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Category</Form.Label>
            <CategorySelect
              categories={categories}
              value={form.category_id}
              onChange={(val) => setForm({ ...form, category_id: val })}
              placeholder="— None —"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Account</Form.Label>
            <Form.Select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">— None —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Amount</Form.Label>
            <Form.Control
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Default amount (optional)"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!form.name}>{editId ? 'Update' : 'Create'}</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default Templates;
