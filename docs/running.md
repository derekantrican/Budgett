# Running Budgett

## Prerequisites

- Node.js (LTS recommended)
- A `.env` file (copy from `.env.template` and fill in your values)

---

## Development Mode

**Start command:**
```bash
npm run dev
```

**How it works:**
- Runs **two processes** in parallel (via `concurrently`):
  - **CRA dev server** on `http://localhost:3000` — serves the React UI with hot-reload
  - **Express API server** on `http://localhost:5000` — serves all `/api` routes
- The CRA dev server proxies `/api` requests to the Express server (configured in `client/src/setupProxy.js`)
- Open `http://localhost:3000` in your browser

**Useful for:** Active development — you get instant hot-reload on frontend changes and can restart the server independently.

---

## Production Mode

**Build & start:**
```bash
cd client && npm run build && cd ..
NODE_ENV=production node server/index.js
```

**How it works:**
- `npm run build` compiles the React app into static files in `client/build/`
- The Express server serves **everything** on a single port (`http://localhost:5000`):
  - `/api/*` routes → Express API handlers
  - All other routes → React static files (`client/build/index.html`)
- Only one process to manage

**Useful for:** Deployment on your Ubuntu server or Raspberry Pi behind a Cloudflare Tunnel. One port, one process.

---

## First-Time Setup

```bash
cp .env.template .env       # Fill in Plaid credentials & session secret
npm run install:all          # Installs root + server + client dependencies
npm run db:init              # Creates the SQLite database file
```

---

## Summary

| | Dev | Production |
|---|---|---|
| Command | `npm run dev` | `NODE_ENV=production node server/index.js` |
| Ports | 3000 (UI) + 5000 (API) | 5000 (both) |
| Hot reload | ✅ | ❌ (rebuild required) |
| Processes | 2 (concurrently) | 1 |
| Browser URL | `http://localhost:3000` | `http://localhost:5000` |
