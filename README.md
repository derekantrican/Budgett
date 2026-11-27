<p align="center">
  <img src="client/public/banner.png" alt="Budgett" height="80">
</p>

A self-hosted budget management app powered by Plaid.

Budgett pulls in your real transactions, helps you categorize them (automatically, most of the time), and tells you where you actually stand against a budget — without handing your financial data to a SaaS company.

**[Try the live demo →](https://derekantrican.com/Budgett)** It runs entirely in your browser with made-up data (no server, no Plaid), and anything you change is saved only in your browser.

## Features

- **Plaid-first transaction syncing** — incremental, cursor-based sync via Plaid's `transactions/sync` webhook
- **Manual transaction entry** for cash or accounts you don't want to link
- **Transaction splits** — break one transaction across multiple categories, with spreadsheet-style split amounts (e.g. `=CEILING(amount/2, 0.01)`) that stay editable
- **Category budgets** — budgeted amounts can be plain numbers or `=`-prefixed formulas (e.g. `=-150*sundays`, `=income_gross*0.1`), with variables for weekdays/days/weeks and your monthly income so a budget can scale with the month
- **Category management** — custom colors, drag-to-reorder, hide instead of delete, and merge-or-disassociate flows when deleting a category that still has transactions
- **Auto-categorization rules** — regex pattern matching with optional amount conditions, merchant renaming, and split rules; when you rename or categorize the same (fuzzy-matched) merchant the same way several times, the app creates the rule for you (can be turned off)
- **Customizable Summary dashboard** — drag-and-resize tiles for category spending (pie charts, a month-by-month year table), budget status, account balances, income, and your Planning views
- **Income tracking** — salary, hourly, per-unit (commission), or fixed-per-paycheck income sources with deductions, pay schedules, and per-month paycheck counts (e.g. 3-paycheck months)
- **Planning views** — loan/mortgage amortization (with PMI, property tax, extra-payment scenarios, and a payment ledger), retirement growth projections, and emergency-fund sizing based on your essential categories
- **Extensions** — add your own pages, dashboard tiles, and server-side sync hooks as plain JavaScript files, without forking the app (see [EXTENSIONS.md](EXTENSIONS.md) and [`examples/extensions/`](examples/extensions/))
- **Transaction templates** — one-click presets for recurring transactions
- **Transfer detection** — fuzzy-matches a transaction on one account to its counterpart on another, with a dedicated Money Movement view visualizing transfers between your own accounts
- **Incomplete Transactions view** — surfaces anything missing a category (including a single uncategorized split on an otherwise-categorized transaction) so nothing falls through the cracks
- **Generalized notifications** — outgoing webhooks (e.g. Discord) with configurable message templates and variable placeholders, fired on events like rule matches, new transactions, and Plaid item errors
- **Admin tools** — activity log, webhook inspector (incoming/outgoing payloads), incomplete transactions, money movement
- **Plaid Link management** — connect/reconnect institutions, handle account-selection changes on reconnect, and choose what happens to a removed institution's transaction history
- **Configurable date/number formats** and a Plaid sandbox/production environment switch
- **Dark mode** UI throughout
- **Bulk transaction importer** (`server/scripts/import-transactions.js`) for migrating historical data from `.xlsx`/`.csv`
- **Lightweight** — SQLite via `better-sqlite3`, no external database server
- **Docker support** for deployment

## How is this different from Actual Budget?

[Actual Budget](https://actualbudget.org) is the best-known self-hosted budgeting app, and it's excellent — but the two take different approaches:

| | Budgett | Actual Budget |
|---|---|---|
| **Bank syncing** | Plaid-native: Plaid is the main way transactions arrive, synced by webhook in the background (SimpleFIN & BankSync.io coming soon!) | Built around manual entry and file imports; bank sync is optional, through providers such as GoCardless and SimpleFIN. Plaid isn't supported natively and needs a third-party integration |
| **Budgeting model** | A monthly target per category, compared with what you actually spent. Targets can be formulas that scale with the month (number of Sundays, your income, etc.) | Envelope / zero-based budgeting in the style of YNAB, where every dollar is assigned and balances carry over (it also has a simpler tracking mode) |
| **UI** | Deliberately simple: a transaction list, categories, and a customizable Summary dashboard | A fuller accounting-style app with accounts, a budget grid, scheduled transactions, and reports |
| **Beyond budgeting** | Built-in income modeling (pay schedules, deductions, 3-paycheck months) and planning tools (mortgage amortization, retirement projections, emergency-fund sizing) | Focused on budgeting and reports |
| **Automation** | Auto-categorization rules that the app writes for you as it learns your habits, transfer detection, and outgoing webhooks (e.g. Discord alerts) | A powerful rules engine that you set up yourself |
| **Customization** | Drop-in JavaScript extensions for new pages, dashboard tiles, and sync hooks | Customized by changing the code (it's open source) or through its API |
| **Architecture** | A single Node + SQLite server that you open in a browser | Local-first: each client keeps its own copy of the data and syncs through a server, with optional end-to-end encryption |

**When Actual is the better fit:** you want envelope budgeting, multi-device sync with offline support, end-to-end encryption, or multiple users — Budgett only has optional single-password login (see below). **When Budgett is the better fit:** you're in the US (or anywhere else Plaid covers) and want built-in Plaid sync, so transactions show up without you doing anything or setting up anything extra, you'd rather compare spending with simple targets than assign every dollar, or you want income and long-term planning in the same place as your budget.

> [!NOTE]
> Authentication is **off by default** — unless you turn on [basic authentication](#basic-authentication), every API route, including the admin endpoints, is open. Budgett is built for a single user, and if you make it reachable outside a trusted network (e.g. through a Cloudflare Tunnel), turn login on. There are no usernames or roles yet; multi-user auth is on the [roadmap](#roadmap). If you put your own auth in front of it instead (e.g. a login-gated reverse proxy), **exempt `/api/webhook` from it**, since Plaid calls that endpoint directly and can't take part in a login flow.

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** React 19 (CRA) + React Bootstrap, Recharts for charts
- **Database:** SQLite (via `better-sqlite3`)
- **Plaid SDK:** `plaid` (Node)

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- A [Plaid developer account](https://dashboard.plaid.com)

### Setup

1. Clone the repository
2. Copy `.env.template` to `.env` and fill in your Plaid credentials
   ```bash
   cp .env.template .env
   ```
3. Install dependencies (root + server + client):
   ```bash
   npm run install:all
   ```
4. Initialize the database:
   ```bash
   npm run db:init
   ```
5. Start the app in development mode:
   ```bash
   npm run dev
   ```

This runs the CRA dev server (`http://localhost:3000`, hot-reload) alongside the Express API (`http://localhost:5000`), with `/api` proxied from the client to the server.

### Production

```bash
cd client && npm run build && cd ..
NODE_ENV=production node server/index.js
```

This serves the built React app and the `/api/*` routes from a single Express process on one port (`5000`) — no separate client process to manage. Useful for deployment on a home server or Raspberry Pi behind a Cloudflare Tunnel: set `WEBHOOK_URL` in `.env` to your tunnel URL so Plaid can reach you.

A `Dockerfile` and `docker-compose.yml` are also provided if you'd rather run it in a container. See [docs/running.md](docs/running.md) for more detail on the development and production setups.

### Basic authentication

Budgett can require a password (one shared password, no usernames) before anyone can use the UI or API. Set these in `.env`:

| Variable | Description |
|---|---|
| `REQUIRE_LOGIN` | `true` to require login. Default `false`, which leaves the app open and ignores the variables below. |
| `LOGIN_PASSWORD_HASH` | bcrypt hash of the password. Generate it with `cd server && npm run hash-password`, and keep the single quotes it prints (the hash contains `$`). |
| `LOGIN_EXPIRATION` | How long a login lasts, e.g. `5d`, `24h`, `30m`. Default `7d`. |
| `API_KEY` | Lets other applications call the `/api` endpoints without logging in, by sending `X-API-Key: <key>` or `Authorization: Bearer <key>`. It only works for the API, never the UI. Optional. |
| `SESSION_SECRET` | Signs login sessions. Set it to a long random string, or logins won't survive a server restart. |

With login on, the UI shows a login page until you sign in, and every `/api` route needs a login session or the API key. The exceptions are `/api/health` and the Plaid webhook (`/api/webhook`), which stay open. Changing the password logs out every existing session. The server refuses to start if `REQUIRE_LOGIN=true` and the password hash is missing or invalid. Serve it over HTTPS (a Cloudflare Tunnel does this), since the password is sent to the server as typed.

## Project Structure

```
Budgett/
├── client/              # React frontend (CRA)
│   ├── demo/            # 404.html redirect for the GitHub Pages demo
│   └── src/
│       ├── components/  # Shared components (incl. dashboard tiles & planning views)
│       ├── demo/        # In-browser mock API + seed data for the demo build
│       ├── helpers/     # Budget formulas, income, loan/retirement/emergency-fund math
│       ├── pages/       # Route pages
│       │   └── admin/   # Admin subpages
│       ├── services/    # API helper
│       └── utils/       # Formatting & extension host
├── server/              # Express backend
│   ├── db/              # Database init, migrations (db/migrations) & queries
│   ├── helpers/         # Notifications, rules, auto-rules, formulas, logging
│   ├── connectors/      # Financial data connectors (Plaid; see connectors/index.js for the interface)
│   ├── services/        # Connector-agnostic sync, institution lifecycle, extension loader
│   ├── middleware/      # Error handling, basic authentication
│   ├── routes/          # API routes
│   └── scripts/         # One-off/maintenance scripts (transaction import, webhook migration, password hashing)
├── database/            # SQLite database file (+ pre-migration backups)
├── docs/                # Additional docs
├── examples/extensions/ # Example extensions (see EXTENSIONS.md)
├── .github/workflows/   # GitHub Pages demo deployment
├── Dockerfile / docker-compose.yml
├── .env.template        # Environment config template
└── package.json         # Root scripts
```

## Roadmap

Things that are planned but not built yet:

- **SimpleFIN support** as an alternative/complement to Plaid for institutions that support it (a bridge client already exists at `server/services/simplefin.js`, not yet wired into syncing)
- **Universal variables** (e.g. `$CAT(Groceries)`) usable across budget formulas and dashboard tiles
- **Per-category time-scoping** — categories that can expire or roll over instead of persisting forever
- **Multi-user auth & roles** (admin, user, read-only), building on the current single-password [basic authentication](#basic-authentication)

## License

Budgett is source-available under the [Creative Commons Attribution-NoDerivatives 4.0 International License](LICENSE) (CC BY-ND 4.0). You're free to use, self-host, and share it unchanged, as long as you credit the original project. Distributing modified versions is not permitted.
