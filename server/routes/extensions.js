const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { getAllExtensions, getExtensionBySlug, getExtensionDataValue, setExtensionDataValue } = require('../db/queries');
const { scanExtensions } = require('../services/extensionLoader');

const KEY_RE = /^[a-zA-Z0-9_.-]{1,100}$/;

// GET /api/extensions
router.get('/', (req, res) => {
  const rows = getAllExtensions();
  res.json(rows.map(r => ({
    slug: r.slug,
    name: r.name,
    version: r.version,
    status: r.status,
    status_message: r.status_message,
    has_client: !!r.client_entry_path,
  })));
});

// POST /api/extensions/rescan
router.post('/rescan', (req, res) => {
  const rows = scanExtensions();
  res.json(rows.map(r => ({ slug: r.slug, name: r.name, status: r.status })));
});

// GET /api/extensions/:slug/bundle.js
router.get('/:slug/bundle.js', (req, res) => {
  const ext = getExtensionBySlug(req.params.slug);
  if (!ext || !ext.client_entry_path) {
    return res.status(404).end();
  }

  // Never trust a filename from the request — always the one path resolved at scan
  // time for this slug, re-checked against its folder here as defense in depth.
  const resolved = path.resolve(ext.client_entry_path);
  const folder = path.resolve(ext.folder_path) + path.sep;
  if (!resolved.startsWith(folder)) {
    return res.status(404).end();
  }

  fs.readFile(resolved, 'utf-8', (err, content) => {
    if (err) {
      return res.status(404).end();
    }

    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    res.send(content);
  });
});

// GET /api/extensions/:slug/data/:key
router.get('/:slug/data/:key', (req, res) => {
  const ext = getExtensionBySlug(req.params.slug);
  if (!ext) {
    return res.status(404).json({ error: 'Unknown extension' });
  }

  if (!KEY_RE.test(req.params.key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }

  const row = getExtensionDataValue(ext.slug, req.params.key);
  res.json({ value: row ? JSON.parse(row.value_json) : null });
});

// PUT /api/extensions/:slug/data/:key
router.put('/:slug/data/:key', (req, res) => {
  const ext = getExtensionBySlug(req.params.slug);
  if (!ext) {
    return res.status(404).json({ error: 'Unknown extension' });
  }

  if (!KEY_RE.test(req.params.key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }

  setExtensionDataValue(ext.slug, req.params.key, JSON.stringify(req.body.value ?? null));
  res.json({ success: true });
});

module.exports = router;
