import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Modal } from 'react-bootstrap';
import { getRules, createRule, updateRule, deleteRule, getCategories } from '../../services/api';

function Rules() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ pattern: '', category_id: '', notes_template: '', expires_at: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [r, c] = await Promise.all([getRules(), getCategories()]);
    setRules(r);
    setCategories(c);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ pattern: '', category_id: '', notes_template: '', expires_at: '' });
    setShowModal(true);
  };

  const openEdit = (rule) => {
    setEditId(rule.id);
    setForm({
      pattern: rule.pattern,
      category_id: rule.category_id || '',
      notes_template: rule.notes_template || '',
      expires_at: rule.expires_at || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const data = {
      pattern: form.pattern,
      category_id: form.category_id || null,
      notes_template: form.notes_template || null,
      expires_at: form.expires_at || null,
    };
    if (editId) {
      await updateRule(editId, data);
    } else {
      await createRule(data);
    }
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    await deleteRule(id);
    loadData();
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Rules</h4>
        <Button variant="primary" size="sm" onClick={openNew}>+ Add Rule</Button>
      </div>

      <Table striped hover responsive variant="dark">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Pattern</th>
            <th>Category</th>
            <th style={{ textAlign: 'left' }}>Notes Template</th>
            <th>Expires</th>
            <th className="fit-width"></th>
          </tr>
        </thead>
        <tbody>
          {rules.map(rule => (
            <tr key={rule.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(rule)}>
              <td style={{ textAlign: 'left', fontFamily: 'monospace' }}>{rule.pattern}</td>
              <td>{rule.category_name || '—'}</td>
              <td style={{ textAlign: 'left' }}>{rule.notes_template || '—'}</td>
              <td>{rule.expires_at || '—'}</td>
              <td className="fit-width">
                <Button variant="outline-danger" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(rule.id); }}>✕</Button>
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No rules configured</td></tr>
          )}
        </tbody>
      </Table>

      <Modal show={showModal} onHide={() => setShowModal(false)} data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>{editId ? 'Edit Rule' : 'New Rule'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Pattern (regex)</Form.Label>
            <Form.Control
              value={form.pattern}
              onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              placeholder="e.g. costco|COSTCO WHSE"
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Category</Form.Label>
            <Form.Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">— None —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Notes Template</Form.Label>
            <Form.Control
              value={form.notes_template}
              onChange={(e) => setForm({ ...form, notes_template: e.target.value })}
              placeholder="Optional notes to auto-fill"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Expires At</Form.Label>
            <Form.Control
              type="date"
              value={form.expires_at ? form.expires_at.split('T')[0] : ''}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value || '' })}
            />
            <Form.Text style={{ color: 'var(--text-secondary)' }}>Leave blank for no expiration</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!form.pattern}>{editId ? 'Update' : 'Create'}</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default Rules;
