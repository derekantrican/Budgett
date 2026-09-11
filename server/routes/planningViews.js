const router = require('express').Router();
const { getAllPlanningViews, createPlanningView, updatePlanningView, deletePlanningView } = require('../db/queries');

// GET /api/planning-views
router.get('/', (req, res) => {
  const views = getAllPlanningViews();
  res.json(views.map(v => ({ ...v, config: v.config_json ? JSON.parse(v.config_json) : {} })));
});

// POST /api/planning-views
router.post('/', (req, res) => {
  const { type, name, config } = req.body;
  if (!type || !name) {
    return res.status(400).json({ error: 'type and name are required' });
  }

  const result = createPlanningView(type, name, JSON.stringify(config || {}));
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/planning-views/:id
router.put('/:id', (req, res) => {
  const { name, config } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  updatePlanningView(req.params.id, name, JSON.stringify(config || {}));
  res.json({ success: true });
});

// DELETE /api/planning-views/:id
router.delete('/:id', (req, res) => {
  deletePlanningView(req.params.id);
  res.json({ success: true });
});

module.exports = router;
