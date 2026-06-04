import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Modal, Spinner, Badge } from 'react-bootstrap';
import { PieChart, Pie, Cell } from 'recharts';
import { getCategories, getTransactions, createCategory, updateCategoryApi, toggleCategoryHidden } from '../services/api';
import { evaluateBudgetExpression, randomVibrantColor } from '../helpers/budgetFormula';
import { formatCurrency } from '../utils/currency';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function Categories() {
  const [categories, setCategories] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [form, setForm] = useState({ name: '', color: '', budgeted_amount_expression: '' });

  // Edit modal state
  const [editCat, setEditCat] = useState(null);
  const [editForm, setEditForm] = useState({ color: '', budgeted_amount_expression: '', is_hidden: false });

  // Period selector
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'year'
  const [hoveredSlice, setHoveredSlice] = useState(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth, viewMode]);

  const loadData = async () => {
    let startDate, endDate;
    if (viewMode === 'month') {
      startDate = new Date(viewYear, viewMonth, 1).toISOString().split('T')[0];
      endDate = new Date(viewYear, viewMonth + 1, 0).toISOString().split('T')[0];
    }
    else {
      startDate = `${viewYear}-01-01`;
      endDate = `${viewYear}-12-31`;
    }

    const [cats, txns] = await Promise.all([getCategories(), getTransactions(startDate, endDate)]);
    setCategories(cats);
    setTransactions(txns);
  };

  const handleSave = async () => {
    const color = form.color || randomVibrantColor();
    await createCategory({ ...form, color });
    setShowModal(false);
    setForm({ name: '', color: '', budgeted_amount_expression: '' });
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
    if (!editCat) 
return;
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

  const prevPeriod = () => {
    if (viewMode === 'month') {
      if (viewMonth === 0) {
 setViewMonth(11); setViewYear(viewYear - 1); 
}
      else 
setViewMonth(viewMonth - 1);
    }
    else {
      setViewYear(viewYear - 1);
    }
  };

  const nextPeriod = () => {
    if (viewMode === 'month') {
      if (viewMonth === 11) {
 setViewMonth(0); setViewYear(viewYear + 1); 
}
      else 
setViewMonth(viewMonth + 1);
    }
    else {
      setViewYear(viewYear + 1);
    }
  };

  const periodLabel = viewMode === 'month'
    ? `${MONTHS[viewMonth]} ${viewYear}`
    : `${viewYear}`;

  if (!categories || !transactions) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="light" style={{ width: 60, height: 60 }} />
      </div>
    );
  }

  // Evaluate budgets for the current period
  const evaluateBudget = (cat) => {
    if (!cat.budgeted_amount_expression) 
return 0;
    if (viewMode === 'year') {
      // Sum across all 12 months
      let total = 0;
      for (let m = 0; m < 12; m++) {
        total += evaluateBudgetExpression(cat.budgeted_amount_expression, viewYear, m);
      }

      return total;
    }

    return evaluateBudgetExpression(cat.budgeted_amount_expression, viewYear, viewMonth);
  };

  // Calculate spending per category (only visible ones for chart)
  const visibleCategories = categories.filter(c => !c.is_hidden);
  const hiddenCategories = categories.filter(c => c.is_hidden);
  
  const catData = visibleCategories.map(cat => {
    const spent = transactions
      .filter(t => t.splits?.some(s => s.category_id === cat.id))
      .reduce((sum, t) => {
        const catSplits = t.splits.filter(s => s.category_id === cat.id);
        return sum + catSplits.reduce((s, split) => s + split.amount, 0);
      }, 0);
    return { ...cat, spent, budgeted: evaluateBudget(cat) };
  });

  const uncategorizedSpent = transactions
    .filter(t => !t.splits || t.splits.length === 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const pieData = [
    ...catData.filter(c => c.spent !== 0).map(c => ({ name: c.name, value: Math.abs(c.spent), rawSpent: c.spent, color: c.color || '#4e89ff' })),
    ...(uncategorizedSpent !== 0 ? [{ name: 'Uncategorized', value: Math.abs(uncategorizedSpent), rawSpent: uncategorizedSpent, color: '#6c757d' }] : [])
  ];

  return (
    <div style={{ overflowX: 'hidden' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Categories</h4>
        <Button variant="primary" onClick={() => setShowModal(true)}>+ Add Category</Button>
      </div>

      {/* Period Selector */}
      <div className="d-flex align-items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline-light" onClick={prevPeriod}>◀</Button>
        <span style={{ fontWeight: 'bold', fontSize: '1.1em', minWidth: 140, textAlign: 'center' }}>{periodLabel}</span>
        <Button size="sm" variant="outline-light" onClick={nextPeriod}>▶</Button>
        <Button
          size="sm"
          variant={viewMode === 'month' ? 'primary' : 'outline-secondary'}
          onClick={() => setViewMode('month')}
        >
          Month
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'year' ? 'primary' : 'outline-secondary'}
          onClick={() => setViewMode('year')}
        >
          Year
        </Button>
      </div>

      <div className="categories-layout" style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', alignItems: 'flex-start', overflow: 'hidden' }}>
        {/* Pie Chart */}
        {pieData.length > 0 && (
          <div style={{ position: 'relative', maxWidth: '100%', overflow: 'hidden' }}>
            <PieChart width={Math.min(window.innerWidth > 600 ? 700 : 300, window.innerWidth - 32)} height={window.innerWidth > 600 ? 700 : 300}>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={window.innerWidth > 600 ? 190 : 110}
                innerRadius={window.innerWidth > 600 ? 95 : 55}
                dataKey="value"
                isAnimationActive={false}
                onMouseLeave={() => setHoveredSlice(null)}
                label={window.innerWidth > 768 ? ({ cx, cy, midAngle, outerRadius: or, name, percent }) => {
                  const RADIAN = Math.PI / 180;
                  const sin = Math.sin(-midAngle * RADIAN);
                  const cos = Math.cos(-midAngle * RADIAN);
                  const mx = cx + (or + 14) * cos;
                  const my = cy + (or + 14) * sin;
                  const ex = cx + (or + 55) * cos;
                  const ey = cy + (or + 55) * sin;
                  const tx = cx + (or + 60) * cos;
                  const textAnchor = cos >= 0 ? 'start' : 'end';
                  if (percent < 0.015) 
return null;
                  return (
                    <g>
                      <line x1={mx} y1={my} x2={ex} y2={ey} stroke="#aaa" strokeWidth={1} />
                      <text x={tx + (cos >= 0 ? 4 : -4)} y={ey} textAnchor={textAnchor} fill="#ccc" fontSize={12} dominantBaseline="central">
                        {name}
                      </text>
                      <text x={tx + (cos >= 0 ? 4 : -4)} y={ey + 14} textAnchor={textAnchor} fill="#999" fontSize={11} dominantBaseline="central">
                        {(percent * 100).toFixed(1)}%
                      </text>
                    </g>
                  );
                } : false}
                labelLine={false}
              >
                {pieData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.color}
                    onMouseEnter={() => setHoveredSlice(entry)}
                  />
                ))}
              </Pie>
            </PieChart>
            {/* Center label */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
              width: 160
            }}>
              {hoveredSlice ? (
                <>
                  <div style={{ fontWeight: 'bold', fontSize: '1em', color: hoveredSlice.color }}>{hoveredSlice.name}</div>
                  <div style={{ fontSize: '1.2em', color: '#fff' }}>{formatCurrency(hoveredSlice.rawSpent)}</div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="categories-table" style={{ maxWidth: 900 }}>
          <Table striped hover responsive variant="dark">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Name</th>
                <th className="fit-width">Budgeted</th>
                <th className="fit-width">Spent</th>
                <th className="fit-width">Surplus/Deficit</th>
              </tr>
            </thead>
            <tbody>
              {catData.filter(c => c.include_in_summary !== 0).map(cat => {
                const diff = Math.abs(cat.budgeted) - Math.abs(cat.spent);
                return (
                  <tr key={cat.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(cat)}>
                    <td style={{ textAlign: 'left' }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, backgroundColor: cat.color || '#4e89ff', marginRight: 8 }}></span>
                      {cat.name}
                    </td>
                    <td className="fit-width">{cat.budgeted ? formatCurrency(cat.budgeted) : '—'}</td>
                    <td className="fit-width">{formatCurrency(Math.abs(cat.spent))}</td>
                    <td className="fit-width" style={{ color: diff >= 0 ? '#4fa94d' : '#dc3545' }}>
                      {cat.budgeted !== 0 ? formatCurrency(diff) : '—'}
                    </td>
                  </tr>
                );
              })}
              {uncategorizedSpent > 0 && (
                <tr style={{ fontStyle: 'italic' }}>
                  <td style={{ textAlign: 'left' }}>Uncategorized</td>
                  <td className="fit-width">—</td>
                  <td className="fit-width">{formatCurrency(uncategorizedSpent)}</td>
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
            <Form.Control type="color" value={form.color || '#4e89ff'} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            <Form.Text style={{ color: 'var(--text-secondary)' }}>Leave default for a random color</Form.Text>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Budget Expression</Form.Label>
            <Form.Control value={form.budgeted_amount_expression} onChange={(e) => setForm({ ...form, budgeted_amount_expression: e.target.value })} placeholder="e.g. 500 or 150 * sundays" />
            <Form.Text style={{ color: 'var(--text-secondary)' }}>
              Variables: sundays, mondays, ..., saturdays, days, weeks
            </Form.Text>
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
          {editCat && (
            <>
              <Form.Group className="mb-3">
                <Form.Label>Color</Form.Label>
                <Form.Control type="color" value={editForm.color} onChange={(e) => setEditForm({ ...editForm, color: e.target.value })} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Budget Expression</Form.Label>
                <Form.Control
                  value={editForm.budgeted_amount_expression}
                  onChange={(e) => setEditForm({ ...editForm, budgeted_amount_expression: e.target.value })}
                  placeholder="e.g. 500 or 150 * sundays"
                />
                <Form.Text style={{ color: 'var(--text-secondary)' }}>
                  Variables: sundays, mondays, ..., saturdays, days, weeks
                  {editForm.budgeted_amount_expression && (
                    <span> — evaluates to <strong>{formatCurrency(evaluateBudgetExpression(editForm.budgeted_amount_expression, viewYear, viewMonth))}</strong> for {MONTHS[viewMonth]}</span>
                  )}
                </Form.Text>
              </Form.Group>
              <Form.Check
                type="checkbox"
                label="Hidden"
                checked={editForm.is_hidden}
                onChange={(e) => setEditForm({ ...editForm, is_hidden: e.target.checked })}
              />
            </>
          )}
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
