import { useEffect, useState } from 'react';

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

// Dashboard tiles are registered the same way, keyed by "slug:tileId" so one extension bundle
// can offer several tiles alongside (or instead of) its full-page component.
window.__BUDGETT_TILES__ = window.__BUDGETT_TILES__ || {};
window.registerBudgettTile = (slug, tileId, Component) => {
  window.__BUDGETT_TILES__[`${slug}:${tileId}`] = Component;
};

// ---- Extension error reporting ----
// An extension's own async code (a fetch in a useEffect, say) can fail without React ever
// seeing it - no error boundary catches a rejected promise - which typically leaves the
// extension showing its loading state forever. So Budgett watches for uncaught errors, unhandled
// rejections and failed /api requests, works out which extension caused each one from the stack
// (bundle URLs are /api/extensions/<slug>/bundle.js), and reports them to whoever is showing that
// extension (see useExtensionErrors).
const BUNDLE_URL_PATTERN = /\/api\/extensions\/([^/?#]+)\/bundle\.js/;
const slugFromStack = (stack) => {
  const match = String(stack || '').match(BUNDLE_URL_PATTERN);
  return match ? decodeURIComponent(match[1]) : null;
};

const MAX_RECENT_ERRORS = 50;
const recentErrors = []; // { slug, message, at }
const errorListeners = new Set();

function reportExtensionError(slug, message) {
  const entry = { slug, message, at: Date.now() };
  recentErrors.push(entry);
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.shift();
  }

  errorListeners.forEach(listener => listener(entry));
}

const describeError = (err) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err?.message ?? err));

if (!window.__BUDGETT_EXTENSION_ERRORS_HOOKED__) {
  window.__BUDGETT_EXTENSION_ERRORS_HOOKED__ = true;

  window.addEventListener('error', (event) => {
    // A syntax error in a bundle only carries the file name, not a stack
    reportExtensionError(slugFromStack(event.error?.stack) || slugFromStack(event.filename), describeError(event.error || event.message));
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportExtensionError(slugFromStack(event.reason?.stack), describeError(event.reason));
  });

  // The calling extension is known when fetch is called (its bundle is on the stack then), but
  // not by the time the response arrives, so capture it up front
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const slug = slugFromStack(new Error().stack);
    if (!slug) {
      return originalFetch(input, init);
    }

    const url = typeof input === 'string' ? input : input?.url;
    const method = (init?.method || input?.method || 'GET').toUpperCase();
    return originalFetch(input, init).then(
      (response) => {
        if (!response.ok) {
          reportExtensionError(slug, `${method} ${url} failed: ${response.status} ${response.statusText}`.trim());
        }

        return response;
      },
      (err) => {
        reportExtensionError(slug, `${method} ${url} failed: ${describeError(err)}`);
        throw err;
      });
  };
}

// Errors from `slug` reported since `since` (ms). With `includeUnattributed`, also errors that
// couldn't be traced to any extension (e.g. a JSON parse failure, whose stack is all browser
// code) - fine while a single extension's page is all that's showing.
function matchingErrors(slug, since, includeUnattributed) {
  return recentErrors.filter(e => e.at >= since && (e.slug === slug || (includeUnattributed && !e.slug)));
}

export function useExtensionErrors(slug, { includeUnattributed = false } = {}) {
  const [errors, setErrors] = useState([]);
  useEffect(() => {
    // Errors from the moment this view started showing the extension (a bundle that's loaded
    // once can fail again each time it mounts, so earlier ones are stale)
    const since = Date.now();
    setErrors([]);
    if (!slug) {
      return undefined;
    }

    const listener = () => setErrors(matchingErrors(slug, since, includeUnattributed));
    errorListeners.add(listener);
    return () => errorListeners.delete(listener);
  }, [slug, includeUnattributed]);

  // Repeats (the same failing request on every render, say) add nothing
  return [...new Set(errors.map(e => e.message))];
}

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

    // A <script> error says nothing about why, so ask the server again for the status
    script.onerror = () => {
      script.remove();
      fetch(script.src, { cache: 'no-store' })
        .then(r => (r.ok ? 'the server returned it, but the browser could not run it' : `the server returned ${r.status} ${r.statusText}`.trim()))
        .catch(err => `the request failed (${err.message})`)
        .then(reason => reject(new Error(`Failed to load extension "${slug}": ${reason}`)));
    };

    document.body.appendChild(script);
  });
}

// For when the bundle loaded but never registered what was asked for (it threw while running, or
// registered under a different slug)
export const notRegisteredMessage = (slug, what) =>
  `Extension "${slug}" loaded, but didn't register ${what}. Check that its bundle calls `
  + `window.${what === 'a page' ? 'registerBudgettExtension' : 'registerBudgettTile'}('${slug}', ...)`
  + ' and that it does not throw while loading.';

export const getExtensionComponent = (slug) => window.__BUDGETT_EXTENSIONS__[slug] || null;
export const getExtensionTileComponent = (slug, tileId) => window.__BUDGETT_TILES__[`${slug}:${tileId}`] || null;

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
