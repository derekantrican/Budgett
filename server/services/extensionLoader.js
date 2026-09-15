// Extension loader — scans a user-configured folder for extension subfolders (each with a
// manifest.json), registers them in the DB, and dynamically requires their optional server-side
// hook module. Extensions are trusted/self-authored: there's no sandboxing here, only enough
// path validation to stop an obviously malformed manifest from escaping its own folder.
const fs = require('fs');
const path = require('path');
const logger = require('../helpers/logger');
const {
  getSetting, upsertExtension, setExtensionStatus, markExtensionsMissing, getAllExtensions,
  getExtensionDataValue, setExtensionDataValue,
} = require('../db/queries');

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;

// slug -> required server hook module (only extensions with a valid, successfully-loaded
// server entry appear here; a UI-only extension or one whose hook failed simply has no entry).
const loadedHooks = new Map();

// Resolves `entry` relative to `folderPath` and verifies the result doesn't escape it
// (rejects "../../whatever" and absolute-path overrides). Returns null if unsafe.
function resolveEntrySafely(folderPath, entry) {
  const resolved = path.resolve(folderPath, entry);
  const withSep = folderPath.endsWith(path.sep) ? folderPath : folderPath + path.sep;
  if (!resolved.startsWith(withSep)) {
    return null;
  }

  return resolved;
}

// Deletes every require.cache entry under `folderPath` so a rescan picks up edits.
// Only covers the extension's own folder — anything it required from node_modules
// (its own or the host's) is never re-loaded; extensions are expected to stick to
// Node builtins in their server hook. A rescan also doesn't dispose of any side
// effects the previous module instance created at top-level (timers, open handles,
// etc.) — authors should avoid persistent module-scope side effects.
function clearRequireCacheUnder(folderPath) {
  const withSep = folderPath.endsWith(path.sep) ? folderPath : folderPath + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key === folderPath || key.startsWith(withSep)) {
      delete require.cache[key];
    }
  }
}

function scanExtensions() {
  const root = getSetting('extensions_folder_path');
  if (!root || !fs.existsSync(root)) {
    return [];
  }

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory());
  }
  catch (err) {
    logger.error('extensions_scan_failed', `Could not read extensions folder "${root}": ${err.message}`);
    return [];
  }

  const seenSlugs = [];

  for (const entry of entries) {
    const folderPath = path.resolve(root, entry.name);
    const manifestPath = path.join(folderPath, 'manifest.json');

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    }
    catch (err) {
      logger.warn('extension_manifest_invalid', `Skipping "${entry.name}": ${err.message}`);
      continue;
    }

    if (!manifest.id || !SLUG_RE.test(manifest.id) || !manifest.name) {
      logger.warn('extension_manifest_invalid', `Skipping "${entry.name}": manifest.id must match ${SLUG_RE} and manifest.name is required`);
      continue;
    }

    const slug = manifest.id;
    if (seenSlugs.includes(slug)) {
      logger.warn('extension_duplicate_slug', `Skipping "${entry.name}": slug "${slug}" is already used by another extension folder`);
      continue;
    }

    let clientEntryPath = null;
    if (manifest.client?.entry) {
      clientEntryPath = resolveEntrySafely(folderPath, manifest.client.entry);
      if (!clientEntryPath) {
        logger.warn('extension_unsafe_entry', `Extension "${slug}": client.entry escapes its own folder, ignoring client bundle`);
      }
    }

    let serverEntryPath = null;
    if (manifest.server?.entry) {
      serverEntryPath = resolveEntrySafely(folderPath, manifest.server.entry);
      if (!serverEntryPath) {
        logger.warn('extension_unsafe_entry', `Extension "${slug}": server.entry escapes its own folder, ignoring server hook`);
      }
    }

    seenSlugs.push(slug);
    upsertExtension(slug, manifest.name, manifest.version || null, folderPath, clientEntryPath, serverEntryPath, JSON.stringify(manifest));

    loadedHooks.delete(slug);
    if (serverEntryPath) {
      try {
        clearRequireCacheUnder(folderPath);
        const hookModule = require(serverEntryPath);
        loadedHooks.set(slug, hookModule);
      }
      catch (err) {
        logger.error('extension_hook_load_failed', `Extension "${slug}" server hook failed to load: ${err.message}`);
        setExtensionStatus(slug, 'error', err.message);
      }
    }
  }

  markExtensionsMissing(seenSlugs);

  return getAllExtensions();
}

function buildExtensionApi(slug) {
  return {
    slug,
    getData: (key) => {
      const row = getExtensionDataValue(slug, key);
      return row ? JSON.parse(row.value_json) : null;
    },
    setData: (key, value) => setExtensionDataValue(slug, key, JSON.stringify(value)),
  };
}

// Fires `eventType` on every loaded extension hook that exports a handler for it. Never
// throws — one broken extension can't break sync or any other extension's handling.
async function dispatchExtensionEvent(eventType, variables) {
  for (const [slug, hookModule] of loadedHooks.entries()) {
    const handler = hookModule && hookModule[eventType];
    if (typeof handler !== 'function') {
      continue;
    }

    try {
      await handler(buildExtensionApi(slug), variables);
    }
    catch (err) {
      logger.error('extension_hook_error', `${slug}.${eventType}: ${err.message}`);
    }
  }
}

module.exports = { scanExtensions, dispatchExtensionEvent };
