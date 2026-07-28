# Budgett — Future Ideas

## SimpleFIN support
What would it take to support SimpleFIN accounts in addtion to Plaid accounts?

## Custom widget system
This would allow us to integrate our "personal funds" and other ideas into the app without coding it in as a first-party feature forced upon all users.

## Category time-scoping
Categories currently persist forever, globally — there's no way to scope one to just a year or a month. Re-assess whether that's still the right model, or whether categories should be able to expire/roll over so a category no longer relevant going forward doesn't have to stay in the active list while remaining attached to its historical transactions.

## Incomplete Transactions doesn't really handle split transactions
The "Fix" flow on the Incomplete Transactions page (`client/src/pages/admin/IncompleteTransactions.js`) was built assuming one category per transaction: it shows a single category dropdown, and saving goes through `PUT /api/transactions/:id`, which only ever creates a split (if none exist) or updates "the first split it finds" (`server/routes/transactions.js`). It has no concept of editing one split among several.

This mostly doesn't matter today because `missing_category` only fired when a transaction had zero splits at all — which is inherently the single-split-or-none case. But now that a null-`category_id` split (e.g. from disassociating a deleted category) also counts as missing a category, a transaction with multiple splits where only one lacks a category can legitimately show up here. The display subqueries were updated to at least surface the *right* split's info (name/notes) by preferring the null-category one, so "Fix" won't show misleading info — but the actual save path still can't target a specific split, so fixing a multi-split transaction from this screen may silently edit the wrong split. Left as a known rough edge for now; would need a real per-split editor (or at least a split picker) in the Fix modal to properly close this gap.

## Universal variables?
This is not a fully-flushed out idea, but something like `$CATEGORY_GROCERIES` or `$CAT(Groceries)` that can be used anywhere in the app (formulas, widgets, etc). I think in some places (like the above "Custom widget system" or "Planning" page) this might be needed, but I'm not sure how we would fully implement this. Things variables could show (we may not want to support all of these): a transaction amount by id, a category budgeted amount by name, a category remaining amount by name, an account balance by name/id, etc.