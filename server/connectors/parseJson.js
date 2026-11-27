// Parse a connector-owned JSON column, tolerating NULL/garbage. Its own module so connectors can
// use it without requiring the registry (connectors/index.js), which requires them.
function parseJson(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  }
  catch {
    return fallback;
  }
}

module.exports = { parseJson };
