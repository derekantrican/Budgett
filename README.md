# Budgett

A self-hosted budget management application powered by Plaid.

## Features

- **Plaid-first transaction syncing** — transactions come from Plaid, then you categorize/split them
- **Transaction splits** — break one transaction into multiple categories
- **Category budgets** — with formula-based amounts (e.g., `125 * sundays`)
- **Auto-categorization rules** — regex-based rules with optional expiry
- **Income tracking** — salary, hourly, or commission with deductions
- **Generalized notifications** — configurable webhooks with variable placeholders
- **Multi-user authentication** — admin, user, and read-only roles
- **Admin tools** — activity log, webhook inspector, incomplete transactions
- **Dark mode** support
- **Lightweight** — SQLite database, no external DB server needed

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** React (CRA) + Bootstrap
- **Database:** SQLite (via better-sqlite3)
- **Plaid SDK:** plaid-node
- **Real-time:** Socket.IO

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- A Plaid developer account (https://dashboard.plaid.com)

### Setup

1. Clone the repository
2. Copy `.env.template` to `.env` and fill in your Plaid credentials
3. Install dependencies:
   ```bash
   npm run install:all
   ```
4. Initialize the database:
   ```bash
   npm run db:init
   ```
5. Start the app:
   ```bash
   npm run dev
   ```

The server runs on `http://localhost:5000` and the client on `http://localhost:3000`.

### Production

For production behind a Cloudflare Tunnel:
1. Set `WEBHOOK_URL` in `.env` to your tunnel URL
2. Build the client: `cd client && npm run build`
3. Serve the built client from the Express server (or use a reverse proxy)

## Project Structure

```
Budgett/
├── client/              # React frontend (CRA)
│   └── src/
│       ├── components/  # Shared components
│       ├── pages/       # Route pages
│       │   └── admin/   # Admin subpages
│       └── services/    # API helper
├── server/              # Express backend
│   ├── db/              # Database init & queries
│   ├── helpers/         # Notifications, rules
│   ├── middleware/      # Auth, error handling
│   ├── routes/          # API routes
│   └── webhookHandlers/ # Plaid webhook processing
├── database/            # SQLite schema
├── .env.template        # Environment config template
└── package.json         # Root scripts
```
