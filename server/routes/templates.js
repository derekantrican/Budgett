const express = require('express');
const router = express.Router();
const { getAllTemplates, createTemplate, deleteTemplate, updateTemplate } = require('../db/queries');

// GET /api/templates
router.get('/', (req, res) => {
  const templates = getAllTemplates();
  res.json(templates);
});

// POST /api/templates
router.post('/', (req, res) => {
  const { name, merchant, notes, category_id, account_id, amount } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = createTemplate(name, merchant || null, notes || null, category_id || null, account_id || null, amount || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/templates/:id
router.put('/:id', (req, res) => {
  const { name, merchant, notes, category_id, account_id, amount } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  updateTemplate(req.params.id, name, merchant || null, notes || null, category_id || null, account_id || null, amount || null);
  res.json({ success: true });
});

// DELETE /api/templates/:id
router.delete('/:id', (req, res) => {
  deleteTemplate(req.params.id);
  res.json({ success: true });
});

module.exports = router;
