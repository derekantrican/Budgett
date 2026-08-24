import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Modal, Badge } from 'react-bootstrap';
import { getRules, createRule, updateRule, deleteRule, toggleRuleDisabled, getCategories, getSettings, updateSettings } from '../../services/api';
import CategorySelect from '../../components/CategorySelect';
import { renderNotes } from '../../utils/notes';

function Rules() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [autoRuleCreationEnabled, setAutoRuleCreationEnabled] = useState(true);
  const [form, setForm] = useState({
    pattern: '', category_id: '', notes_template: '',
    amount_condition: '', rename_to: '', is_split: false, splits: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [r, c, s] = await Promise.all([getRules(), getCategories(), getSettings()]);
    setRules(r);
    setCategories(c);
    setAutoRuleCreationEnabled(s.auto_rule_creation_enabled !== '0');
  };

  const handleToggleAutoRuleCreation = async (enabled) => {
    setAutoRuleCreationEnabled(enabled);
    await updateSettings({ auto_rule_creation_enabled: enabled ? '1' : '0' });
  };

  const emptySplit = () => ({ category_id: '', notes: '', amount_expression: '' });

  const openNew = () => {
    setEditId(null);
    setForm({
      pattern: '', category_id: '', notes_template: '',
      amount_condition: '', rename_to: '', is_split: false, splits: [],
    });
    setShowModal(true);
  };

  const openEdit = (rule) => {
    setEditId(rule.id);
    let splits = [];
    if (rule.is_split && rule.split_json) {
      try {
        splits = JSON.parse(rule.split_json);
      }
      catch (e) { /* ignore */ }
    }

    setForm({
      pattern: rule.pattern,
      category_id: rule.category_id || '',
      notes_template: rule.notes_template || '',
      amount_condition: rule.amount_condition || '',
      rename_to: rule.rename_to || '',
      is_split: !!rule.is_split,
      splits,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const data = {
      pattern: form.pattern,
      amount_condition: form.amount_condition || null,
      rename_to: form.rename_to || null,
      is_split: form.is_split,
    };

    if (form.is_split && form.splits.length > 0) {
      data.split_json = JSON.stringify(form.splits.map(s => ({
        category_id: s.category_id || null,
        notes: s.notes || null,
        amount_expression: s.amount_expression || null,
      })));
      data.category_id = null;
      data.notes_template = null;
    }
    else {
      data.category_id = form.category_id || null;
      data.notes_template = form.notes_template || null;
      data.split_json = null;
    }

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
    if (!window.confirm('Delete this rule?')) {
      return;
    }

    await deleteRule(id);
    loadData();
  };

  const updateSplit = (index, field, value) => {
    const updated = [...form.splits];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, splits: updated });
  };

  const addSplit = () => {
    setForm({ ...form, splits: [...form.splits, emptySplit()] });
  };

  const removeSplit = (index) => {
    setForm({ ...form, splits: form.splits.filter((_, i) => i !== index) });
  };

  const toggleSplitMode = (isSplit) => {
    setForm({
      ...form,
      is_split: isSplit,
      splits: isSplit && form.splits.length === 0 ? [emptySplit(), emptySplit()] : form.splits,
    });
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

  const getSplitSummary = (rule) => {
    if (!rule.is_split || !rule.split_json) {
      return null;
    }

    try {
      const splits = JSON.parse(rule.split_json);
      return splits.length + ' splits';
    }
    catch (e) {
      return null;
    }
  };

  const manualRules = rules.filter(r => !r.is_auto_created);
  const autoCreatedRules = rules.filter(r => r.is_auto_created);

  const enabledToggle = (rule) => (
    <Form.Check
      type="switch"
      checked={!rule.is_disabled}
      onChange={async (e) => {
        await toggleRuleDisabled(rule.id, !e.target.checked);
        loadData();
      }}
    />
  );

  const deleteButton = (rule) => (
    <Button variant="outline-danger" size="sm" onClick={(e) => {
      e.stopPropagation();
      handleDelete(rule.id);
    }}>✕</Button>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Rules</h4>
        <Button variant="primary" size="sm" onClick={openNew}>+ Add Rule</Button>
      </div>

      <Table striped hover responsive variant="dark" size="sm" className="rules-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Pattern</th>
            <th style={{ textAlign: 'left' }}>Amount Condition</th>
            <th style={{ textAlign: 'left' }}>Rename To</th>
            <th style={{ textAlign: 'left' }}>Notes / Splits</th>
            <th className="fit-width">Category</th>
            <th className="fit-width">Enabled</th>
            <th className="fit-width"></th>
          </tr>
        </thead>
        <tbody>
          {manualRules.map(rule => (
            <tr key={rule.id} style={{ cursor: 'pointer', opacity: rule.is_disabled ? 0.5 : 1 }} onClick={() => openEdit(rule)}>
              <td style={{ textAlign: 'left', fontFamily: 'monospace' }}>{rule.pattern}</td>
              <td style={{ textAlign: 'left', fontFamily: 'monospace' }}>{rule.amount_condition || '—'}</td>
              <td style={{ textAlign: 'left' }}>{rule.rename_to || '—'}</td>
              <td style={{ textAlign: 'left' }}>
                {rule.is_split
                  ? <Badge bg="primary">{getSplitSummary(rule)}</Badge>
                  : (renderNotes(rule.notes_template) || '—')}
              </td>
              <td className="fit-width">{rule.is_split ? '—' : (rule.category_name || '—')}</td>
              <td className="fit-width" onClick={(e) => e.stopPropagation()}>{enabledToggle(rule)}</td>
              <td className="fit-width">{deleteButton(rule)}</td>
            </tr>
          ))}
          {manualRules.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No rules configured</td></tr>
          )}
        </tbody>
      </Table>

      <div className="d-flex align-items-center gap-2 mt-4 mb-2">
        <h5 className="mb-0">Auto-Created Rules</h5>
        <Form.Check
          type="switch"
          id="auto-rule-creation-switch"
          checked={autoRuleCreationEnabled}
          onChange={(e) => handleToggleAutoRuleCreation(e.target.checked)}
          className="mb-0"
        />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>
          {autoRuleCreationEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginTop: -4 }}>
        {autoRuleCreationEnabled
          ? "Created automatically after you repeatedly rename or categorize a merchant in the same way. Disable or delete any you don't want."
          : 'Auto-creation is off — repeated renames/categorizations will no longer create rules automatically.'}
      </p>
      {autoCreatedRules.length > 0 && (
        <Table striped hover responsive variant="dark" size="sm" className="rules-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Pattern</th>
              <th style={{ textAlign: 'left' }}>Rename To</th>
              <th className="fit-width">Enabled</th>
              <th className="fit-width"></th>
            </tr>
          </thead>
          <tbody>
            {autoCreatedRules.map(rule => (
              <tr key={rule.id} style={{ cursor: 'pointer', opacity: rule.is_disabled ? 0.5 : 1 }} onClick={() => openEdit(rule)}>
                <td style={{ textAlign: 'left', fontFamily: 'monospace' }}>{rule.pattern}</td>
                <td style={{ textAlign: 'left' }}>{rule.rename_to || '—'}</td>
                <td className="fit-width" onClick={(e) => e.stopPropagation()}>{enabledToggle(rule)}</td>
                <td className="fit-width">{deleteButton(rule)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" data-bs-theme="dark">
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
            <div className="d-flex justify-content-between align-items-center" style={{ marginBottom: '8px' }}>
              <div style={sectionLabelStyle}>Actions</div>
            </div>
            <Form.Group className="mb-3">
              <Form.Label>Rename "Where" to</Form.Label>
              <Form.Control
                value={form.rename_to}
                onChange={(e) => setForm({ ...form, rename_to: e.target.value })}
                placeholder="Leave blank to keep original name"
              />
            </Form.Group>

            <Form.Check
              type="switch"
              id="split-mode-switch"
              label="Create multiple splits"
              checked={form.is_split}
              onChange={(e) => toggleSplitMode(e.target.checked)}
              className="mb-3"
            />

            {!form.is_split && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label>Notes Template</Form.Label>
                  <Form.Control
                    value={form.notes_template}
                    onChange={(e) => setForm({ ...form, notes_template: e.target.value })}
                    placeholder="Leave blank for no notes (supports **bold**, *italic*)"
                  />
                </Form.Group>
                <Form.Group className="mb-0">
                  <Form.Label>Category</Form.Label>
                  <CategorySelect
                    categories={categories}
                    value={form.category_id}
                    onChange={(val) => setForm({ ...form, category_id: val })}
                    placeholder="— None (don't change) —"
                  />
                </Form.Group>
              </>
            )}

            {form.is_split && (
              <div>
                {form.splits.map((split, i) => (
                  <div key={i} style={{
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    marginBottom: '8px',
                    position: 'relative',
                  }}>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <small style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Split {i + 1}</small>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        style={{ padding: '0 6px', fontSize: '0.75rem', lineHeight: '1.4' }}
                        onClick={() => removeSplit(i)}
                      >✕</Button>
                    </div>
                    <Form.Group className="mb-2">
                      <Form.Label style={{ fontSize: '0.85em' }}>Category</Form.Label>
                      <CategorySelect
                        categories={categories}
                        value={split.category_id}
                        onChange={(val) => updateSplit(i, 'category_id', val || null)}
                        placeholder="— None —"
                      />
                    </Form.Group>
                    <Form.Group className="mb-2">
                      <Form.Label style={{ fontSize: '0.85em' }}>Notes</Form.Label>
                      <Form.Control
                        size="sm"
                        value={split.notes || ''}
                        onChange={(e) => updateSplit(i, 'notes', e.target.value)}
                        placeholder="e.g. Half"
                      />
                    </Form.Group>
                    <Form.Group className="mb-0">
                      <Form.Label style={{ fontSize: '0.85em' }}>Amount Expression</Form.Label>
                      <Form.Control
                        size="sm"
                        value={split.amount_expression || ''}
                        onChange={(e) => updateSplit(i, 'amount_expression', e.target.value)}
                        placeholder="e.g. =CEILING(amount/2, 0.01)"
                        style={{ fontFamily: 'monospace' }}
                      />
                      <Form.Text style={{ color: 'var(--text-secondary)', fontSize: '0.75em' }}>
                        Use "amount" for the transaction total. Supports CEILING(x, step), FLOOR(x, step), and ROUND(x, step). Leave blank for full amount.
                      </Form.Text>
                    </Form.Group>
                  </div>
                ))}
                <Button variant="outline-primary" size="sm" onClick={addSplit}>+ Add Split</Button>
              </div>
            )}
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
