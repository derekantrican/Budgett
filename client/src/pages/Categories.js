import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Modal, Spinner, Badge } from 'react-bootstrap';
import { PieChart, Pie, Cell } from 'recharts';
import { getCategories, getTransactions, createCategory, updateCategoryApi, toggleCategoryHidden } from '../services/api';

function Categories() {
  const [categories, setCategories] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#4e89ff', budgeted_amount_expression: '' });

  // Edit modal state
  const [editCat, setEditCat] = useState(null);
  const [editForm, setEditForm] = useState({ color: '', budgeted_amount_expression: '', is_hidden: false });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const [cats, txns] = await Promise.all([getCategories(), getTransactions(startDate, endDate)]);
    setCategories(cats);
    setTransactions(txns);
  };

  const handleSave = async () => {
    await createCategory(form);
    setShowModal(false);
    setForm({ name: '', color: '#4e89ff', budgeted_amount_expression: '' });
    loadData();
  };

  const openEdit = (cat) => {
    setEditCat(cat);
    setEditForm({
      color: cat.color || '#4e89ff',
      budgeted_amount_expression: cat.budgeted_amount_expression || '',
      is_hidden: !!cat.is_hidden,
    });
  };

  const handleEditSave = async () => {
    if (!editCat) return;
    await updateCategoryApi(editCat.id, {
      name: editCat.name,
      color: editForm.color,
      budgeted_amount_expression: editForm.budgeted_amount_expression,
    });
    if (editForm.is_hidden !== !!editCat.is_hidden) {
      await toggleCategoryHidden(editCat.id, editForm.is_hidden);
    }
    setEditCat(null);
    loadData();
  };

  if (!categories || !transactions) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="light" style={{ width: 60, height: 60 }} />
      </div>
    );
  }

  // Calculate spending per category (only visible ones for chart)
  const visibleCategories = categories.filter(c => !c.is_hidden);
  const hiddenCategories = categories.filter(c => c.is_hidden);
  
  const catData = visibleCategories.map(cat => {
    const spent = transactions
      .filter(t => t.amount < 0 && t.splits?.some(s => s.category_id === cat.id))
      .reduce((sum, t) => {
        const catSplits = t.splits.filter(s => s.category_id === cat.id);
        return sum + catSplits.reduce((s, split) => s + Math.abs(split.amount), 0);
      }, 0);
    return { ...cat, spent };
  });

  const uncategorizedSpent = transactions
    .filter(t => t.amount < 0 && (!t.splits || t.splits.length === 0))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const pieData = [
    ...catData.filter(c => c.spent > 0).map(c => ({ name: c.name, value: c.spent, color: c.color || '#4e89ff' })),
    ...(uncategorizedSpent > 0 ? [{ name: 'Uncategorized', value: uncategorizedSpent, color: '#6c757d' }] : [])
  ];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Categories</h4>
        <Button variant="primary" onClick={() => setShowModal(true)}>+ Add Category</Button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Pie Chart */}
        {pieData.length > 0 && (
          <div>
            <PieChart width={320} height={320}>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={130} innerRadius={65} dataKey="value" isAnimationActive={false}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
            </PieChart>
          </div>
        )}

        {/* Table */}
        <div style={{ maxWidth: 900 }}>
          <Table striped hover responsive variant="dark">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Name</th>
                <th className="fit-width">Budgeted&nbsp;Amount</th>
                <th className="fit-width">Spent&nbsp;Amount</th>
                <th className="fit-width">Surplus/Deficit</th>
              </tr>
            </thead>
            <tbody>
              {catData.filter(c => c.include_in_summary !== 0).map(cat => {
                const budgeted = parseFloat(cat.budgeted_amount_expression) || 0;
                const diff = Math.abs(budgeted) - cat.spent;
                return (
                  <tr key={cat.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(cat)}>
                    <td style={{ textAlign: 'left' }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, backgroundColor: cat.color || '#4e89ff', marginRight: 8 }}></span>
                      {cat.name}
                    </td>
                    <td className="fit-width">{budgeted ? `${budgeted < 0 ? '-' : ''}$${Math.abs(budgeted).toFixed(2)}` : '—'}</td>
                    <td className="fit-width">${cat.spent.toFixed(2)}</td>
                    <td className="fit-width" style={{ color: diff >= 0 ? '#4fa94d' : '#dc3545' }}>
                      {budgeted !== 0 ? `${diff < 0 ? '-' : ''}$${Math.abs(diff).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })}
              {uncategorizedSpent > 0 && (
                <tr style={{ fontStyle: 'italic' }}>
                  <td style={{ textAlign: 'left' }}>Uncategorized</td>
                  <td className="fit-width">—</td>
                  <td className="fit-width">${uncategorizedSpent.toFixed(2)}</td>
                  <td className="fit-width">—</td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </div>

      {/* Hidden Categories */}
      {hiddenCategories.length > 0 && (
        <div className="mt-4">
          <Button
            variant="link"
            style={{ color: 'var(--text-secondary)', padding: 0, fontSize: '0.9em' }}
            onClick={() => setShowHidden(!showHidden)}
          >
            {showHidden ? '▾' : '▸'} Hidden categories ({hiddenCategories.length})
          </Button>
          {showHidden && (
            <div className="mt-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {hiddenCategories.map(cat => (
                <Badge
                  key={cat.id}
                  bg="secondary"
                  style={{ cursor: 'pointer', fontSize: '0.85em' }}
                  onClick={() => openEdit(cat)}
                  title="Click to edit"
                >
                  {cat.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Category Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>New Category</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Name</Form.Label>
            <Form.Control value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Color</Form.Label>
            <Form.Control type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Budget Expression</Form.Label>
            <Form.Control value={form.budgeted_amount_expression} onChange={(e) => setForm({ ...form, budgeted_amount_expression: e.target.value })} placeholder="e.g. 500 or 125 * sundays" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Category Modal */}
      <Modal show={!!editCat} onHide={() => setEditCat(null)} data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>Edit: {editCat?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Color</Form.Label>
            <Form.Control type="color" value={editForm.color} onChange={(e) => setEditForm({ ...editForm, color: e.target.value })} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Budgeted Amount</Form.Label>
            <Form.Control
              value={editForm.budgeted_amount_expression}
              onChange={(e) => setEditForm({ ...editForm, budgeted_amount_expression: e.target.value })}
              placeholder="e.g. 500 or 125 * sundays"
            />
          </Form.Group>
          <Form.Check
            type="checkbox"
            label="Hidden"
            checked={editForm.is_hidden}
            onChange={(e) => setEditForm({ ...editForm, is_hidden: e.target.checked })}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditCat(null)}>Cancel</Button>
          <Button variant="primary" onClick={handleEditSave}>Save Changes</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default Categories;
