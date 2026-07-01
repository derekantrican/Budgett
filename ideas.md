# Budgett — Future Ideas

## Fuzzy-match "remove" reconciliation
When a transaction is fuzzy-matched, we discard the pending ID. But later, a "remove" action might come in for that pending ID. Currently, the logs show "attempted to remove...but could not find it in database". We should do some lookup or otherwise keep a list of "recently removed" transactions so this doesn't become a warning in the logs.

## Auto-rule creation from repeated user renames
For some fields (starting with "where"/merchant), keep track of user actions to rename/override those fields. If a user does the same rename frequently (e.g. "Qfc" → "QFC"), automatically create a Rule for it so it happens automatically in the future. There should be the option to disable this rule if the user doesn't like it.

## Basic markdown in notes
Support basic markdown (probably just bold & italic) in "notes" fields.

## Hide/unhide checkbox in Edit Transaction dialog
The "Edit transaction" dialog should expose a "hide" checkbox that allows the user to manually hide/unhide transactions.

## "Remaining" amount in split transactions
When using the "split transaction" feature, there should be some way to assign the remaining amount to a split. Either a button like "Calculate remaining" or a variable like `{remaining}` that auto-fills with whatever is left after the other splits are accounted for.

## Math expressions in split amount boxes
Allow math expressions in the amount box, triggered by starting with `=` (like a spreadsheet). Examples: `=5*2`, `=CEILING(3*0.15, 2)`. Show a warning if the formula results in a sub-cent value (like 0.001) since that causes headaches for lining up transactions. Continue enforcing split validation: all splits must exactly total the Plaid transaction amount before the dialog can be saved.

## Improved linking UI
- Show the link and allow the user to click to navigate to the linked transaction.
- In the "link counterpart" dialog, show both transactions and allow the user to decide which should be hidden (allowing linking two transactions while leaving one or both unhidden).
- Add the ability to remove the link (which would remove it from both transactions).
