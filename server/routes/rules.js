const router = require('express').Router();
const { getAllRules, createRule, updateRule, deleteRule } = require('../db/queries');

// GET /api/rules
router.get('/', (req, res) => {
  const rules = getAllRules();
  res.json(rules);
});

// POST /api/rules
router.post('/', (req, res) => {
  const { pattern, category_id, notes_template, amount_condition, rename_to, is_split, split_json } = req.body;

  if (!pattern) {
    return res.status(400).json({ error: 'pattern required' });
  }

  try {
    new RegExp(pattern);
  }
  catch (e) {
    return res.status(400).json({ error: 'Invalid regex pattern' });
  }

  const result = createRule(
    pattern, category_id || null, notes_template || null,
    amount_condition || null, rename_to || null,
    is_split || false, split_json || null
  );

  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/rules/:id
router.put('/:id', (req, res) => {
  const { pattern, category_id, notes_template, amount_condition, rename_to, is_split, split_json } = req.body;
  if (!pattern) 
    return res.status(400).json({ error: 'pattern required' });
  try {
    new RegExp(pattern); 
  }
  catch (e) {
    return res.status(400).json({ error: 'Invalid regex pattern' }); 
  }

  updateRule(
    req.params.id, pattern, category_id || null, notes_template || null,
    amount_condition || null, rename_to || null,
    is_split || false, split_json || null
  );
  res.json({ success: true });
});

// DELETE /api/rules/:id
router.delete('/:id', (req, res) => {
  deleteRule(req.params.id);
  res.json({ success: true });
});

module.exports = router;
