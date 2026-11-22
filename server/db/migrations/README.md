# Database migrations

Budgett's schema is defined by the numbered files in this folder, applied in order by
[`../migrate.js`](../migrate.js) every time the server starts (and by `npm run db:init`). The
database's current version is stored in SQLite's `PRAGMA user_version`. Only migrations numbered
above that version run.

## Changing the schema

Add a new file named `<next number>_<short_description>.sql` or `.js`, for example
`0002_add_connections.sql`. Don't edit a migration that has already shipped, and that includes
`baseline_schema.sql`: other databases have already run it and won't run it again.

- **`.sql`**: executed as-is. Good for `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`,
  `ALTER TABLE ... RENAME COLUMN`, `CREATE INDEX`, and simple `UPDATE`s.
- **`.js`**: exports `up(db, { log })`, where `db` is the better-sqlite3 handle. Use this for
  data migrations that need logic (parsing JSON, moving values between tables, etc.). It must be
  synchronous.

Every migration runs inside its own transaction. If it throws, the transaction is rolled back,
the version is left unchanged, and the server refuses to start.

### Things to know

- **Foreign keys are off while migrations run**, so you can rebuild tables. Afterwards the runner
  checks for *new* foreign key violations and rolls back if there are any.
- **Rebuilding a table.** SQLite's `ALTER TABLE` can't change a column's type or constraints, and
  it can't add a column with a non-constant default such as `DEFAULT (datetime('now'))`. For
  those changes, use the create, copy, drop, rename steps:
  ```sql
  CREATE TABLE accounts_new ( ... new definition ... );
  INSERT INTO accounts_new (id, name, ...) SELECT id, name, ... FROM accounts;
  DROP TABLE accounts;
  ALTER TABLE accounts_new RENAME TO accounts;
  -- then recreate any indexes/triggers that were on the old table
  ```
- **Backups.** Before applying migrations to a database that already has data, the runner
  writes a full copy to `database/backups/budgett.v<old version>.<timestamp>.db`. To roll back,
  stop the server and copy that file over `database/budgett.db`.
- **Fresh vs. existing installs.** Both run the same migrations. `0001_baseline.js` creates the
  full baseline schema on an empty database. On a database created before migrations existed,
  it adds any columns that older schema files were missing.
