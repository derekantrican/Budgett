const router = require('express').Router();
const { getAllIncome, createIncome, updateIncome, toggleIncomeArchived, deleteIncome } = require('../db/queries');

function parseRow(row) {
  return { ...row, adjustments: row.adjustments_json ? JSON.parse(row.adjustments_json) : [] };
}

// GET /api/income
router.get('/', (req, res) => {
  res.json(getAllIncome().map(parseRow));
});

// POST /api/income
router.post('/', (req, res) => {
  const { name, type, amount, quantity_per_period, unit_label, pay_period, payday_weekday, reference_pay_date, adjustments } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'name and type required' });
  }

  const result = createIncome(
    name,
    type,
    amount ?? null,
    quantity_per_period ?? null,
    unit_label || null,
    pay_period || null,
    payday_weekday ?? null,
    reference_pay_date || null,
    JSON.stringify(adjustments || [])
  );

  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/income/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, type, amount, quantity_per_period, unit_label, pay_period, payday_weekday, reference_pay_date, adjustments } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'name and type required' });
  }

  updateIncome(
    id,
    name,
    type,
    amount ?? null,
    quantity_per_period ?? null,
    unit_label || null,
    pay_period || null,
    payday_weekday ?? null,
    reference_pay_date || null,
    JSON.stringify(adjustments || [])
  );

  res.json({ success: true });
});

// PATCH /api/income/:id/archive
router.patch('/:id/archive', (req, res) => {
  const { id } = req.params;
  const { is_archived } = req.body;
  toggleIncomeArchived(id, is_archived);
  res.json({ success: true });
});

// DELETE /api/income/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  deleteIncome(id);
  res.json({ success: true });
});

module.exports = router;
