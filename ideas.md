# Budgett — Future Ideas

## Auto-rule creation from repeated user renames
For some fields (starting with "where"/merchant), keep track of user actions to rename/override those fields. If a user does the same rename frequently (e.g. "Qfc" → "QFC"), automatically create a Rule for it so it happens automatically in the future. There should be the option to disable this rule if the user doesn't like it.

## Hide/unhide checkbox in Edit Transaction dialog
The "Edit transaction" dialog should expose a "hide" checkbox that allows the user to manually hide/unhide transactions.

## Math expressions in split amount boxes
Allow math expressions in the amount box, triggered by starting with `=` (like a spreadsheet). Examples: `=5*2`, `=CEILING(3*0.15, 2)`. Show a warning if the formula results in a sub-cent value (like 0.001) since that causes headaches for lining up transactions. Continue enforcing split validation: all splits must exactly total the Plaid transaction amount before the dialog can be saved.