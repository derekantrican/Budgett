const router = require('express').Router();
const {
  getAllDashboardTiles, createDashboardTile, updateDashboardTileConfig, updateDashboardTilesLayout, deleteDashboardTile,
} = require('../db/queries');

// GET /api/dashboard-tiles
router.get('/', (req, res) => {
  const tiles = getAllDashboardTiles();
  res.json(tiles.map(t => ({ ...t, config: t.config_json ? JSON.parse(t.config_json) : {} })));
});

// POST /api/dashboard-tiles
router.post('/', (req, res) => {
  const { type, config, x, y, w, h } = req.body;
  if (!type) {
    return res.status(400).json({ error: 'type is required' });
  }

  const result = createDashboardTile(type, JSON.stringify(config || {}), x || 0, y || 0, w || 4, h || 4);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/dashboard-tiles/layout - bulk position/size update after a drag or resize
router.put('/layout', (req, res) => {
  const { tiles } = req.body;
  if (!Array.isArray(tiles)) {
    return res.status(400).json({ error: 'tiles must be an array' });
  }

  updateDashboardTilesLayout(tiles.map(t => ({
    id: t.id, x: Number(t.x) || 0, y: Number(t.y) || 0, w: Number(t.w) || 1, h: Number(t.h) || 1,
  })));
  res.json({ success: true });
});

// PUT /api/dashboard-tiles/:id - config edits only (layout changes go through /layout above)
router.put('/:id', (req, res) => {
  const { config } = req.body;
  updateDashboardTileConfig(req.params.id, JSON.stringify(config || {}));
  res.json({ success: true });
});

// DELETE /api/dashboard-tiles/:id
router.delete('/:id', (req, res) => {
  deleteDashboardTile(req.params.id);
  res.json({ success: true });
});

module.exports = router;
