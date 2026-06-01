const router = require('express').Router();
const { getAllCategories, createCategory, updateCategory, toggleCategoryHidden } = require('../db/queries');

// GET /api/categories
router.get('/', (req, res) => {
  const categories = getAllCategories();
  res.json(categories);
});

// POST /api/categories
router.post('/', (req, res) => {
  const { name, color, budgeted_amount_expression, reset_on_new_month, sort_order } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name required' });
  }

  const result = createCategory(
    name,
    color || null,
    budgeted_amount_expression || null,
    reset_on_new_month !== undefined ? (reset_on_new_month ? 1 : 0) : 1,
    sort_order || 0
  );

  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/categories/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, color, budgeted_amount_expression, reset_on_new_month, sort_order } = req.body;

  updateCategory(name, color || null, budgeted_amount_expression || null, reset_on_new_month ? 1 : 0, sort_order || 0, id);

  res.json({ id: Number(id), name, color, budgeted_amount_expression, reset_on_new_month, sort_order });
});

// PATCH /api/categories/:id/toggle-hidden
router.patch('/:id/toggle-hidden', (req, res) => {
  const { id } = req.params;
  const { is_hidden } = req.body;
  toggleCategoryHidden(id, is_hidden);
  res.json({ success: true });
});

module.exports = router;
