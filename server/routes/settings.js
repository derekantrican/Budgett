const router = require('express').Router();
const { getSettings, setSetting } = require('../db/queries');

// GET /api/settings
router.get('/', (req, res) => {
  const rows = getSettings();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  res.json(settings);
});

// PUT /api/settings
router.put('/', (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    setSetting(key, String(value));
  }

  res.json({ success: true });
});

module.exports = router;
