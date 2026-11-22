// Baseline migration: brings any database up to the schema in baseline_schema.sql and marks it
// as version 1.
//
// For a brand-new database this just creates everything. The interesting case is a database
// created before the migration system existed: back then startup ran database/schema.sql with
// `CREATE TABLE IF NOT EXISTS` and then a best-effort list of ALTER statements in
// queries.js#initQueries (errors swallowed), so depending on when it was created and which code
// versions it ran under, a database may be missing columns. baseline_schema.sql is schema.sql
// plus everything from that ALTER list. This repairs existing tables so every install starts
// from the same known schema:
//
//   1. Create any tables that don't exist yet (+ the default settings rows).
//   2. For each table that is missing one or more expected columns, rebuild it from the expected
//      CREATE TABLE statement and copy the existing rows over (missing columns get their defaults).
//      This is SQLite's documented "create new, copy, drop old, rename" procedure — needed because
//      ALTER TABLE ADD COLUMN can't add e.g. a NOT NULL DEFAULT (datetime('now')) column.
//   3. Re-run the schema so any indexes dropped along with a rebuilt table are recreated.
//
// Columns that exist in a table but not in the baseline are dropped if that table gets rebuilt
// (logged first; the runner takes a backup before this runs) and otherwise left alone, except
// categories.include_in_summary, which the old ALTER list explicitly dropped. Column *type*
// differences (e.g. income_sources.quantity_per_period was added as REAL by the old ALTER list
// but is TEXT in schema.sql) are only logged: SQLite's type affinity makes them mostly harmless,
// and converting stored values could change how existing data reads back.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const BASELINE_SQL = fs.readFileSync(path.join(__dirname, 'baseline_schema.sql'), 'utf-8');

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(r => r.name);
}

function columnInfo(db, table) {
  return db.pragma(`table_info(${quoteIdent(table)})`);
}

function columnNames(db, table) {
  return columnInfo(db, table).map(c => c.name);
}

function up(db, { log }) {
  // Build the expected schema in a scratch in-memory database to compare against.
  const expected = new Database(':memory:');
  let expectedTables;
  try {
    expected.exec(BASELINE_SQL);
    expectedTables = tableNames(expected).map(name => ({
      name,
      columns: columnNames(expected, name),
      types: Object.fromEntries(columnInfo(expected, name).map(c => [c.name, c.type])),
      createSql: expected.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name).sql,
    }));
  }
  finally {
    expected.close();
  }

  db.exec(BASELINE_SQL);

  for (const table of expectedTables) {
    const actualColumns = columnNames(db, table.name);
    const missing = table.columns.filter(c => !actualColumns.includes(c));
    if (missing.length === 0) {
      continue;
    }

    const extra = actualColumns.filter(c => !table.columns.includes(c));
    const shared = table.columns.filter(c => actualColumns.includes(c));
    log(`Baseline: rebuilding table "${table.name}" to add missing column(s): ${missing.join(', ')}`
      + (extra.length ? ` (dropping column(s) no longer in the schema: ${extra.join(', ')})` : ''));

    const tempName = `__baseline_new_${table.name}`;
    // The stored CREATE statement is always `CREATE TABLE <name> (` — swap in the temp name.
    const tempCreateSql = table.createSql.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?("[^"]+"|\S+)/i, `CREATE TABLE ${quoteIdent(tempName)}`);
    const columnList = shared.map(quoteIdent).join(', ');

    db.exec(tempCreateSql);
    db.exec(`INSERT INTO ${quoteIdent(tempName)} (${columnList}) SELECT ${columnList} FROM ${quoteIdent(table.name)}`);
    db.exec(`DROP TABLE ${quoteIdent(table.name)}`);
    db.exec(`ALTER TABLE ${quoteIdent(tempName)} RENAME TO ${quoteIdent(table.name)}`);
  }

  // Recreate any indexes/triggers that went away with a rebuilt table (all IF NOT EXISTS / OR IGNORE).
  db.exec(BASELINE_SQL);

  if (columnNames(db, 'categories').includes('include_in_summary')) {
    log('Baseline: dropping removed column categories.include_in_summary');
    db.exec('ALTER TABLE categories DROP COLUMN include_in_summary');
  }

  for (const table of expectedTables) {
    for (const col of columnInfo(db, table.name)) {
      const expectedType = table.types[col.name];
      if (expectedType !== undefined && expectedType !== col.type) {
        log(`Baseline: note: ${table.name}.${col.name} is declared ${col.type || '(none)'} here but ${expectedType} in the baseline — leaving as-is`);
      }
    }
  }

  const unknownTables = tableNames(db).filter(name => !expectedTables.some(t => t.name === name));
  if (unknownTables.length > 0) {
    log(`Baseline: leaving table(s) not in the schema untouched: ${unknownTables.join(', ')}`);
  }
}

module.exports = { up };
