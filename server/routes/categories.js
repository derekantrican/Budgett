const router = require('express').Router();
const {
  getAllCategories, createCategory, updateCategory, toggleCategoryHidden, reorderCategory,
  getCategoryTransactionCount, deleteCategory, mergeCategory, disassociateCategory,
} = require('../db/queries');

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

  // Assign a random vibrant color if none provided
  const finalColor = color || randomVibrantColor();

  const result = createCategory(
    name,
    finalColor,
    budgeted_amount_expression || null,
    reset_on_new_month !== undefined ? (reset_on_new_month ? 1 : 0) : 1,
    sort_order || 0
  );

  res.status(201).json({ id: result.lastInsertRowid });
});

function randomVibrantColor() {
  const palette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F1948A', '#82E0AA', '#F8C471', '#AED6F1', '#D2B4DE',
    '#A3E4D7', '#FAD7A0', '#D5DBDB', '#F9E79F', '#A9CCE3',
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

// PUT /api/categories/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, color, budgeted_amount_expression, reset_on_new_month, sort_order } = req.body;

  // reset_on_new_month/sort_order are only overwritten when explicitly present in the body,
  // so a save from a form that doesn't know about one of these fields can't clobber it
  updateCategory(
    name,
    color || null,
    budgeted_amount_expression || null,
    reset_on_new_month === undefined ? null : (reset_on_new_month ? 1 : 0),
    sort_order === undefined ? null : sort_order,
    id
  );

  res.json({ id: Number(id), name, color, budgeted_amount_expression, reset_on_new_month, sort_order });
});

// PATCH /api/categories/:id/toggle-hidden
router.patch('/:id/toggle-hidden', (req, res) => {
  const { id } = req.params;
  const { is_hidden } = req.body;
  toggleCategoryHidden(id, is_hidden);
  res.json({ success: true });
});

// PATCH /api/categories/:id/reorder
router.patch('/:id/reorder', (req, res) => {
  const { id } = req.params;
  const { position } = req.body;
  reorderCategory(id, Number(position));
  res.json({ success: true });
});

// GET /api/categories/:id/usage
router.get('/:id/usage', (req, res) => {
  const { id } = req.params;
  res.json({ transactionCount: getCategoryTransactionCount(id) });
});

// DELETE /api/categories/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    deleteCategory(id);
    res.json({ success: true });
  }
  catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/categories/:id/merge
router.post('/:id/merge', (req, res) => {
  const { id } = req.params;
  const { targetId } = req.body;

  if (!targetId || Number(targetId) === Number(id)) {
    return res.status(400).json({ error: 'A different target category is required' });
  }

  mergeCategory(id, targetId);
  res.json({ success: true });
});

// POST /api/categories/:id/disassociate
router.post('/:id/disassociate', (req, res) => {
  const { id } = req.params;
  disassociateCategory(id);
  res.json({ success: true });
});

module.exports = router;
