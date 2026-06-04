import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Modal } from 'react-bootstrap';
import { getRules, createRule, updateRule, deleteRule, getCategories } from '../../services/api';

function Rules() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ pattern: '', category_id: '', notes_template: '', amount_condition: '', rename_to: '' });

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
    setForm({ pattern: '', category_id: '', notes_template: '', amount_condition: '', rename_to: '' });
    setShowModal(true);
  };

  const openEdit = (rule) => {
    setEditId(rule.id);
    setForm({
      pattern: rule.pattern,
      category_id: rule.category_id || '',
      notes_template: rule.notes_template || '',
      amount_condition: rule.amount_condition || '',
      rename_to: rule.rename_to || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const data = {
      pattern: form.pattern,
      category_id: form.category_id || null,
      notes_template: form.notes_template || null,
      amount_condition: form.amount_condition || null,
      rename_to: form.rename_to || null,
    };
    if (editId) {
      await updateRule(editId, data);
    }
    else {
      await createRule(data);
    }

    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this rule?')) 
      return;
    await deleteRule(id);
    loadData();
  };

  const sectionStyle = {
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    padding: '12px 16px',
    marginBottom: '16px',
  };

  const sectionLabelStyle = {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
    fontWeight: 600,
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
            <th style={{ textAlign: 'left' }}>Amount Condition</th>
            <th style={{ textAlign: 'left' }}>Rename To</th>
            <th style={{ textAlign: 'left' }}>Notes Template</th>
            <th>Category</th>
            <th className="fit-width"></th>
          </tr>
        </thead>
        <tbody>
          {rules.map(rule => (
            <tr key={rule.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(rule)}>
              <td style={{ textAlign: 'left', fontFamily: 'monospace' }}>{rule.pattern}</td>
              <td style={{ textAlign: 'left', fontFamily: 'monospace' }}>{rule.amount_condition || '—'}</td>
              <td style={{ textAlign: 'left' }}>{rule.rename_to || '—'}</td>
              <td style={{ textAlign: 'left' }}>{rule.notes_template || '—'}</td>
              <td>{rule.category_name || '—'}</td>
              <td className="fit-width">
                <Button variant="outline-danger" size="sm" onClick={(e) => {
                  e.stopPropagation(); handleDelete(rule.id); 
                }}>✕</Button>
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No rules configured</td></tr>
          )}
        </tbody>
      </Table>

      <Modal show={showModal} onHide={() => setShowModal(false)} data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>{editId ? 'Edit Rule' : 'New Rule'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}>Conditions</div>
            <Form.Group className="mb-3">
              <Form.Label>Pattern (regex)</Form.Label>
              <Form.Control
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                placeholder="e.g. costco|COSTCO WHSE"
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Group>
            <Form.Group className="mb-0">
              <Form.Label>Amount Condition</Form.Label>
              <Form.Control
                value={form.amount_condition}
                onChange={(e) => setForm({ ...form, amount_condition: e.target.value })}
                placeholder="e.g. amount % 30 == 0"
                style={{ fontFamily: 'monospace' }}
              />
              <Form.Text style={{ color: 'var(--text-secondary)' }}>
                JavaScript expression using "amount" variable. Leave blank for no amount filter.
              </Form.Text>
            </Form.Group>
          </div>
          <div style={{ ...sectionStyle, backgroundColor: 'rgba(100,200,100,0.04)', borderColor: 'rgba(100,200,100,0.15)' }}>
            <div style={sectionLabelStyle}>Actions</div>
            <Form.Group className="mb-3">
              <Form.Label>Rename "Where" to</Form.Label>
              <Form.Control
                value={form.rename_to}
                onChange={(e) => setForm({ ...form, rename_to: e.target.value })}
                placeholder="Leave blank to keep original name"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Notes Template</Form.Label>
              <Form.Control
                value={form.notes_template}
                onChange={(e) => setForm({ ...form, notes_template: e.target.value })}
                placeholder="Leave blank for no notes"
              />
            </Form.Group>
            <Form.Group className="mb-0">
              <Form.Label>Category</Form.Label>
              <Form.Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— None (don't change) —</option>
                {categories.filter(c => !c.is_hidden).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Form.Select>
            </Form.Group>
          </div>
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
