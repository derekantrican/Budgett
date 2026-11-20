# Budgett — Future Ideas

## Support for other financial sources (eg SimpleFIN, banksync.io, etc)
These can work very differently than Plaid (eg SimpleFIN works on a "GET only, call once per day" model). We might want to create an "interface" or "plugin standard" similar to our extensions framework that has things like:
- whether or not the app should expect to receive webhooks (eg Plaid)
- refresh transactions function (eg Plaid, SimpleFIN)
- refresh frequency
- rules for reconciling transactions (like how Plaid has removed, modified, created, etc)
- etc

## One-click deployment on Railway
Offer a one-click "Deploy on Railway" template so users can run their own instance without having to host it on-prem themselves.

## Custom widget system
This would allow us to integrate our "personal funds" and other ideas into the app without coding it in as a first-party feature forced upon all users.

## Category time-scoping
Categories currently persist forever, globally — there's no way to scope one to just a year or a month. Re-assess whether that's still the right model, or whether categories should be able to expire/roll over so a category no longer relevant going forward doesn't have to stay in the active list while remaining attached to its historical transactions.

## Incomplete Transactions doesn't really handle split transactions
The "Fix" flow on the Incomplete Transactions page (`client/src/pages/admin/IncompleteTransactions.js`) was built assuming one category per transaction: it shows a single category dropdown, and saving goes through `PUT /api/transactions/:id`, which only ever creates a split (if none exist) or updates "the first split it finds" (`server/routes/transactions.js`). It has no concept of editing one split among several.

This mostly doesn't matter today because `missing_category` only fired when a transaction had zero splits at all — which is inherently the single-split-or-none case. But now that a null-`category_id` split (e.g. from disassociating a deleted category) also counts as missing a category, a transaction with multiple splits where only one lacks a category can legitimately show up here. The display subqueries were updated to at least surface the *right* split's info (name/notes) by preferring the null-category one, so "Fix" won't show misleading info — but the actual save path still can't target a specific split, so fixing a multi-split transaction from this screen may silently edit the wrong split. Left as a known rough edge for now; would need a real per-split editor (or at least a split picker) in the Fix modal to properly close this gap.

## Universal variables?
This is not a fully-flushed out idea, but something like `$CATEGORY_GROCERIES` or `$CAT(Groceries)` that can be used anywhere in the app (formulas, widgets, etc). I think in some places (like the above "Custom widget system" or "Planning" page) this might be needed, but I'm not sure how we would fully implement this. Things variables could show (we may not want to support all of these): a transaction amount by id, a category budgeted amount by name, a category remaining amount by name, an account balance by name/id, etc.

## Better notifications
- Notification methods: more methods (only Discord webhook is supported right now)
- Notification events: currently notifications happen for a hardcoded set of events. But we could allow users to select what events they want notifications for (and maybe even multiple notification methods - different methods for different notifications). One example: "When emergency fund is no longer fully funded" (i.e. the Emergency Fund planning view's fund balance drops below its target amount).

## Retirement planning view — more than just accumulation
The Retirement planning view (`client/src/components/planning/RetirementView.js`) currently only projects account growth up to retirement age. A few natural additions if we want more than a pure accumulation chart — nothing here needs to be fancy, just enough to sanity-check "am I roughly on track," not a full replacement for something like Fidelity/NewRetirement:

- **Amount needed in retirement.** Right now the view shows a projected ending balance with no benchmark to judge it against. A simple target (e.g. desired annual retirement spending × 25, or a configurable withdrawal-rate multiplier) would let the view say "on track" / "short by $X" instead of just showing a raw number.
- **Inflation-adjusted ("today's dollars") view.** Nominal balances 30+ years out are hard to reason about. An optional toggle (or a second line on the chart) showing the same projection deflated by an assumed inflation rate would make the numbers more intuitive.
- **Post-retirement drawdown.** The projection currently stops cold at the retirement date. Modeling a simple withdrawal rate (e.g. 4%/year) from that point forward would show how long the balance actually lasts, rather than leaving that as a separate mental exercise.

## Basic authentication
Right now anyone who can reach the app can use it. Add optional, simple password protection (no usernames yet), configured entirely through environment variables:

- **`REQUIRE_LOGIN`** (`true`/`false`, default `false`) — turns the whole feature on. When `false`, the app behaves exactly as it does today and none of the other variables below are needed.
- **`LOGIN_PASSWORD_HASH`** — a slow password hash (e.g. bcrypt or argon2) of the login password.
- **`LOGIN_EXPIRATION`** — how long a login lasts, in a format like `5d` or `24h`.
- **`API_KEY`** — only required when `REQUIRE_LOGIN` is set.

When `REQUIRE_LOGIN` is `true`, the app shows a simple password login page before any UI page can be accessed. The client sends the entered password to the server over HTTPS, and the server verifies it against `LOGIN_PASSWORD_HASH` using the matching slow hash function (bcrypt/argon2 verify). If it matches, the server sends back a token that expires after `LOGIN_EXPIRATION`.

Hashing on the server rather than the client is deliberate: if the client hashed the password and the server just compared hashes, the stored hash would effectively *be* the password — anyone who could read the env vars (e.g. a leaked `.env` or access to the hosting dashboard) could log in by sending it directly. Verifying the plain password server-side means the stored hash alone isn't a usable credential.

`API_KEY` lets any other application access the app, but **only** the API endpoints — it can't be used to get into the UI as a user.