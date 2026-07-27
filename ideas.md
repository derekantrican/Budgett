# Budgett — Future Ideas

## SimpleFIN support
What would it take to support SimpleFIN accounts in addtion to Plaid accounts?

## Custom widget system
This would allow us to integrate our "personal funds" and other ideas into the app without coding it in as a first-party feature forced upon all users.

## Category time-scoping
Categories currently persist forever, globally — there's no way to scope one to just a year or a month. Re-assess whether that's still the right model, or whether categories should be able to expire/roll over so a category no longer relevant going forward doesn't have to stay in the active list while remaining attached to its historical transactions.

## Universal variables?
This is not a fully-flushed out idea, but something like `$CATEGORY_GROCERIES` or `$CAT(Groceries)` that can be used anywhere in the app (formulas, widgets, etc). I think in some places (like the above "Custom widget system" or "Planning" page) this might be needed, but I'm not sure how we would fully implement this. Things variables could show (we may not want to support all of these): a transaction amount by id, a category budgeted amount by name, a category remaining amount by name, an account balance by name/id, etc.