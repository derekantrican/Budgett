const router = require('express').Router();
const { getAllRules, createRule } = require('../db/queries');

// GET /api/rules
router.get('/', (req, res) => {
  const rules = getAllRules();
  res.json(rules);
});

// POST /api/rules
router.post('/', (req, res) => {
  const { pattern, category_id, notes_template, expires_at } = req.body;

  if (!pattern) {
    return res.status(400).json({ error: 'pattern required' });
  }

  try {
    new RegExp(pattern);
  }
  catch (e) {
    return res.status(400).json({ error: 'Invalid regex pattern' });
  }

  const result = createRule(pattern, category_id || null, notes_template || null, expires_at || null);

  res.status(201).json({ id: result.lastInsertRowid });
});

module.exports = router;
