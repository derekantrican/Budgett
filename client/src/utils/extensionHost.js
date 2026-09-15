// Runtime host for dynamically-loaded extension UI bundles. Extensions ship a plain,
// non-module <script> (no build step required) that registers a React component via
// window.registerBudgettExtension once it's loaded — this module owns that registry and the
// script-injection loader. Plain script injection (not dynamic import()) is used because
// CRA's webpack-managed import() can only target modules inside its own build graph, not
// arbitrary runtime file URLs served from disk.
window.__BUDGETT_EXTENSIONS__ = window.__BUDGETT_EXTENSIONS__ || {};
window.registerBudgettExtension = (slug, Component) => {
  window.__BUDGETT_EXTENSIONS__[slug] = Component;
};

const loadedSlugs = new Set();

export function loadExtensionScript(slug) {
  if (loadedSlugs.has(slug) || window.__BUDGETT_EXTENSIONS__[slug]) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/api/extensions/${encodeURIComponent(slug)}/bundle.js`;
    script.onload = () => {
      loadedSlugs.add(slug);
      resolve();
    };

    script.onerror = () => reject(new Error(`Failed to load extension "${slug}"`));
    document.body.appendChild(script);
  });
}

export const getExtensionComponent = (slug) => window.__BUDGETT_EXTENSIONS__[slug] || null;

// Per-extension data API handed to the extension's React component as `props.api`. Extension
// bundles live outside the CRA module graph and can't import services/api.js, so this talks
// to the extension's own scoped data endpoint directly via fetch.
export function makeExtensionApi(slug) {
  const base = `/api/extensions/${encodeURIComponent(slug)}/data/`;
  return {
    getData: (key) => fetch(base + encodeURIComponent(key)).then(r => r.json()).then(d => d.value),
    setData: (key, value) => fetch(base + encodeURIComponent(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }).then(r => r.json()),
  };
}
