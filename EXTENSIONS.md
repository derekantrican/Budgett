# Building a Budgett Extension: Hello World Walkthrough

This walks through building a small extension from scratch: a dropdown to pick a category and a
bar chart of that category's spending per month for the current year so far, plus a bonus button
that sends data to a hardcoded webhook URL. The finished version lives at
`examples/extensions/category-spending-chart/` if you want to skip ahead or diff against your
own work.

For background on how the extensions system fits together (folder scanning, the data store, the
backend event system), see the "How it all works" section near the end. If you want an example of
a *server-side* extension that reacts to sync events instead, see
`examples/extensions/hello-transaction-logger/`.

## Prerequisites

- No build step, no npm install, no bundler. Extensions are plain JavaScript files loaded
  directly in the browser (or, for the server side, directly by Node) — you write files, save
  them, and click "Rescan Extensions" in Settings.
- Because there's no build step, extension UI code can't use JSX and use `React.createElement`. If you'd
  rather write JSX, you can set up your own local build step (esbuild, etc.) that compiles down
  to a single plain script — the extension system doesn't care how the file was produced, only
  that the result is a script that calls `window.registerBudgettExtension(...)`.
- Extensions are trusted, self-authored code — only load extensions you wrote or trust. There's
  no sandboxing: an extension's client code runs with full access to the page, and its server
  hook (if any) runs with full access to Node.

## Step 1: The folder and the manifest

Every extension is a subfolder inside whatever folder you point Budgett's Settings →
"Extensions Folder Path" at. Create:

```
category-spending-chart/
  manifest.json
  client/
    bundle.js
```

`manifest.json`:

```json
{
  "id": "category-spending-chart",
  "name": "Category Spending Chart",
  "version": "1.0.0",
  "description": "Pick a category and see its spending per month for the current year so far.",
  "client": { "entry": "client/bundle.js" }
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | becomes the extension's slug — it's used in URLs and as the key for its stored data, so it must match `^[a-z0-9][a-z0-9_-]*$` (letters, digits, `_`, `-`, case-insensitive) and be unique across every extension in the folder |
| `name` | Yes | Display name shown in the Extensions tab dropdown in the UI & returned by `GET /api/extensions` |
| `version` | No | Free-form string, informational only. Returned by `GET /api/extensions` but it is not used anywhere. _Note: there is not currently any extension update mechanism_ |
| `description` | No | Not currently surfaced in the UI, but good documentation |
| `client.entry` | No | Path to your bundle, relative to the extension's own folder. It can't
  point outside that folder (Budgett rejects that at scan time) |
| `server.entry` | No | Path to a server hook module, relative to the extension's folder |

At least one of `client.entry` / `server.entry` should be set, or the extension does nothing.

## Step 2: A minimal component

`client/bundle.js` is a plain, self-executing script. It gets React off `window.React` (the host
app exposes its own React/ReactDOM instance globally so your component renders inside the host's
tree without pulling in a second copy of React) and registers itself by calling
`window.registerBudgettExtension(slug, Component)`:

```js
(function () {
  const React = window.React;
  const { useState, useEffect } = React;

  function CategorySpendingChart() {
    return React.createElement('p', null, 'Hello from my extension!');
  }

  window.registerBudgettExtension('category-spending-chart', CategorySpendingChart);
})();
```

Point Settings → Extensions Folder Path at the parent of `category-spending-chart/` and click
"Rescan Extensions" (see Step 6) to check this renders before building it out further.

Your component receives one prop: `api`, an object with `getData(key)` and `setData(key, value)`
for reading/writing this extension's own persistent JSON data (see "How it all works" below).
This example doesn't need it, so it's ignored here.

## Step 3: Loading app data

Because the extension's UI runs same-origin in the same browser tab, it can call Budgett's own
REST API directly with `fetch` — no special extension API needed for reading the app's data (only
for the extension's *own* private data store). Add data loading to the component:

```js
function CategorySpendingChart() {
  const [categories, setCategories] = useState(null);
  const [transactions, setTransactions] = useState(null);

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(setCategories);

    const now = new Date();
    const startDate = `${now.getFullYear()}-01-01`;
    const endDate = now.toISOString().split('T')[0];
    fetch(`/api/transactions?start_date=${startDate}&end_date=${endDate}`)
      .then(r => r.json())
      .then(setTransactions);
  }, []);

  if (!categories || !transactions) {
    return React.createElement('p', null, 'Loading...');
  }

  return React.createElement('p', null, `Loaded ${categories.length} categories and ${transactions.length} transactions.`);
}
```

Two things worth knowing about the shapes you get back:

- `GET /api/categories` returns a plain array of category rows: `{ id, name, color, ... }`.
- `GET /api/transactions?start_date=...&end_date=...` returns each transaction with its category
  assignments inlined as a `splits` array: `{ ..., date, amount, splits: [{ category_id, category_name, amount, notes }, ...] }`.
  A transaction can have zero, one, or several splits (e.g. one purchase split across two
  categories) — there's no single `category_id` directly on the transaction itself.
- Amounts follow Budgett's convention: **negative = expense, positive = income**, on both the
  transaction's own `amount` and each split's `amount`. To chart "amount spent" as a positive
  number, negate it.

## Step 4: Category dropdown + monthly totals

Add a `selectedId` state and a `<select>`, then reduce the transactions into one spending total
per month, for the selected category, from January through the current month:

```js
function CategorySpendingChart() {
  const [categories, setCategories] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then((cats) => {
      setCategories(cats);
      if (cats.length > 0) {
        setSelectedId(cats[0].id);
      }
    });

    const now = new Date();
    const startDate = `${now.getFullYear()}-01-01`;
    const endDate = now.toISOString().split('T')[0];
    fetch(`/api/transactions?start_date=${startDate}&end_date=${endDate}`)
      .then(r => r.json())
      .then(setTransactions);
  }, []);

  if (!categories || !transactions) {
    return React.createElement('p', null, 'Loading...');
  }

  const now = new Date();
  const monthCount = now.getMonth() + 1; // Jan (0) through the current month, inclusive
  const monthlyTotals = new Array(monthCount).fill(0);

  for (const txn of transactions) {
    const month = new Date(txn.date).getMonth();
    if (month >= monthCount) {
      continue;
    }

    const catSplits = (txn.splits || []).filter(s => s.category_id === selectedId);
    const spent = catSplits.reduce((sum, s) => sum - s.amount, 0); // negate: expenses are negative
    monthlyTotals[month] += spent;
  }

  return React.createElement('div', null,
    React.createElement('select', {
      value: selectedId || '',
      onChange: (e) => setSelectedId(Number(e.target.value)),
    }, categories.map(c => React.createElement('option', { key: c.id, value: c.id }, c.name))),
    React.createElement('pre', null, JSON.stringify(monthlyTotals))
  );
}
```

Changing the dropdown re-runs the component body (state changed → re-render), which recomputes
`monthlyTotals` for the newly selected category — no extra fetch needed, since we already loaded
the whole year's transactions up front.

## Step 5: Drawing the chart

No charting library is loaded (there's no build step to pull one in, and this app doesn't grant
extensions access to the main app's bundled dependencies like `recharts`). A handful of SVG
elements is enough for a bar chart.

To make the chart fill the width of its container (instead of a fixed pixel width), measure the
container with a `ResizeObserver` and derive the bar width from that measurement, rather than
setting a fixed-size `viewBox` and stretching it with `preserveAspectRatio: 'none'` — that
approach scales the X and Y axes by different factors, which distorts anything that isn't meant
to stretch (rounded rect corners, text glyphs):

```js
const React = window.React;
const { useState, useEffect, useCallback } = React;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ...inside the component:
const [containerWidth, setContainerWidth] = useState(600);

// The chart <div> below only exists once categories/transactions have loaded — before that,
// this component renders a "Loading..." paragraph instead. A plain useRef + a mount-only
// effect would miss it (the ref would still be null when that effect first runs), so track
// the DOM node itself in state via a callback ref, which re-fires once the div actually mounts.
const [containerEl, setContainerEl] = useState(null);
const containerRef = useCallback((el) => setContainerEl(el), []);

useEffect(() => {
  if (!containerEl) {
    return;
  }

  const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
  observer.observe(containerEl);
  return () => observer.disconnect();
}, [containerEl]);

// ...after computing monthlyTotals:
const max = Math.max(1, ...monthlyTotals); // avoid divide-by-zero when everything is 0
const gap = 16;
const barWidth = Math.max(8, (containerWidth - gap * (monthCount - 1)) / monthCount);
const chartHeight = 320;
// Reserve headroom above the tallest bar for its value label — without this, the max-value
// bar reaches all the way to y=0 and its label (drawn just above the bar) lands at a negative
// y, which the SVG clips instead of showing.
const topPadding = 24;
const plotHeight = chartHeight - topPadding;

const bars = monthlyTotals.map((total, i) => {
  const barHeight = (Math.max(total, 0) / max) * plotHeight;
  const barTop = chartHeight - barHeight;
  return React.createElement('g', { key: i, transform: `translate(${i * (barWidth + gap)}, 0)` },
    React.createElement('rect', {
      x: 0, y: barTop, width: barWidth, height: barHeight, fill: '#4e89ff', rx: 3,
    }),
    total > 0 ? React.createElement('text', {
      x: barWidth / 2, y: barTop - 6, textAnchor: 'middle', fontSize: 11, fill: '#fff',
    }, `$${total.toFixed(0)}`) : null,
    React.createElement('text', {
      x: barWidth / 2, y: chartHeight + 16, textAnchor: 'middle', fontSize: 11, fill: '#ccc',
    }, MONTH_LABELS[i]));
});

// ...in the returned JSX-equivalent — the wrapping div is what ResizeObserver measures;
// the svg itself just uses that same pixel width directly, so nothing gets rescaled:
React.createElement('div', { ref: containerRef, style: { width: '100%' } },
  React.createElement('svg', { width: containerWidth, height: chartHeight + 30 }, bars)
)
```

## Step 6 (bonus): Calling an external webhook

This extension has no server-side hook, so it can't react to backend events like a sync
completing (that's what `examples/extensions/hello-transaction-logger/`'s `server/index.js`
does). But a client-side extension can still make outbound calls on its own — for example, in
response to a button click — using plain `fetch`, same as talking to Budgett's own API:

```js
const WEBHOOK_URL = ''; // e.g. a Discord webhook URL, or a webhook.site URL for testing

const handleSendWebhook = async () => {
  if (!WEBHOOK_URL) {
    alert('Set WEBHOOK_URL at the top of the file first.');
    return;
  }

  const categoryName = categories.find(c => c.id === selectedId)?.name || 'Unknown';
  const lines = monthlyTotals.map((total, i) => `${MONTH_LABELS[i]}: $${total.toFixed(2)}`);
  const content = `**${categoryName}** spending by month:\n${lines.join('\n')}`;

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
};
```

Wire a `<button onClick={handleSendWebhook}>` next to the dropdown. Whether the target URL
actually accepts the request depends on that server's own CORS policy — same-origin restrictions
don't apply to your own backend, but they do apply to arbitrary third-party URLs your browser is
calling directly.

**Match the payload shape to what your target expects.** The body above uses `{ content: "..." }`
to match Discord as an example webhook, but your webhook service may expect a different format.

**Don't commit real webhook URLs.** A webhook URL is a credential — anyone with it can post to
it. If you're testing against a real Discord webhook (or anything similar), keep it out of a
committed `bundle.js`; read it from `props.api.getData('webhook_url')` (this extension's own
private data store — see "How it all works" below) instead of hardcoding it, or just don't commit
your local edit to `WEBHOOK_URL`.

The full, working version of all of this — dropdown, chart, and webhook button — is at
`examples/extensions/category-spending-chart/client/bundle.js`.

## Step 7: Loading it in Budgett

1. Open **Settings**.
2. Under **Extensions**, set **Extensions Folder Path** to the *parent* folder that contains your
   extension's subfolder (e.g. the absolute path to `examples/extensions`, not to
   `category-spending-chart` itself).
3. Click **Rescan Extensions**. The page reloads, and an **Extensions** tab appears in the nav
   (only shown when at least one extension is registered).
4. Open the Extensions tab and pick your extension from the dropdown at the top.

Every time you edit `bundle.js`, just refresh the page — extension bundles are served with
`Cache-Control: no-cache`, so there's no rebuild or rescan needed for client-side changes (only a
manifest change, like a renamed `id` or entry path, needs a rescan).

## How it all works

A few things worth knowing that this walkthrough didn't need but the platform supports:

- **Persistent data.** `props.api.getData(key)` / `props.api.setData(key, value)` read and write
  a JSON blob scoped to your extension (stored server-side, keyed by your extension's `id` and
  whatever `key` string you choose). A server hook gets the same two functions on the `api`
  argument it's called with. This extension doesn't use it, but you could, e.g., remember the
  last-selected category between visits.
- **Server-side event hooks.** If your `manifest.json` has a `server.entry`, that file is
  `require()`'d by Node and can export functions named after events Budgett fires during a
  Plaid sync: `transaction_found`, `sync_complete`, `sync_details`, `sync_update`,
  `rule_matched` (the same event names used by the built-in Discord notification integration).
  See `examples/extensions/hello-transaction-logger/server/index.js` for a working example that
  logs every transaction as it's found.
- **Rescanning** re-reads every extension folder's manifest, re-registers each one in the
  database, and re-loads any server hooks. An extension whose server hook throws on load is
  still shown in the extensions list (with an error status) — only its backend hook is disabled,
  not its UI.
- **No sandboxing, no auth boundary.** Extensions run with the same access as the app itself —
  a client bundle can call any of Budgett's own API endpoints, and (since this app has no
  per-request auth) so can any other extension's client bundle call this one's data endpoints.
  Only load extensions you trust.

## Troubleshooting

- **Extension doesn't show up after rescanning** — check the server logs (Settings → Logs) for
  `extension_manifest_invalid` or `extension_duplicate_slug` warnings; usually a bad/missing
  `id` in `manifest.json`.
- **"client.entry escapes its own folder"** — `client.entry`/`server.entry` must resolve to a
  path inside the extension's own subfolder; `../` paths that escape it are rejected.
- **Server hook shows an error status** — check Settings → Logs for
  `extension_hook_load_failed`; the extension's UI still works even if its server hook is
  broken. Server hooks can only use Node builtins — there's no per-extension `npm install`, so
  requiring a third-party package will fail to load.
- **Edited a server hook but nothing changed** — click Rescan; server hooks are only reloaded on
  a rescan, not automatically on file save.
