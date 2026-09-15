# Example Extensions

To try these, open Budgett's Settings page, set "Extensions Folder Path" to the absolute path of
this `examples/extensions` folder, and click "Rescan Extensions". An "Extensions" tab will appear
in the nav with both examples available in its dropdown.

See [`EXTENSIONS.md`](../../EXTENSIONS.md) in the project root for a full walkthrough of building
an extension from scratch (using `category-spending-chart` as the running example).

- **`hello-transaction-logger/`** — a server-side event hook example. `server/index.js` reacts to
  the `transaction_found` sync event and appends each transaction to a persisted log;
  `client/bundle.js` renders that log.
- **`category-spending-chart/`** — a client-only UI example. `client/bundle.js` fetches
  categories/transactions from Budgett's own API, lets you pick a category, and draws a bar chart
  of its spending per month for the current year so far, plus a button demonstrating an outbound
  call to a hardcoded webhook URL (not tied to the backend event system).
