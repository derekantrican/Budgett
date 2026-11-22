// Schema migration runner.
//
// Migrations live in server/db/migrations as numbered files: `0001_baseline.js`, `0002_add_foo.sql`,
// etc. (any file not matching `<digits>_<name>.sql|js` is ignored, so helper files and READMEs can
// sit alongside them). The database's current version is tracked in SQLite's built-in
// `PRAGMA user_version`, and every migration numbered above it runs in order on startup.
//
// Each migration runs in its own transaction, with foreign key enforcement turned off (so a
// migration can rebuild a table — SQLite's ALTER TABLE can't change most column definitions) and
// a check afterwards that it didn't introduce any new foreign key violations. If anything fails,
// that migration is rolled back, the version stays where it was, and startup aborts.
//
// Before running any migrations against a database that already has data in it, a full copy is
// written to database/backups/ via VACUUM INTO.
//
// Migration file formats:
//   .sql — executed as-is.
//   .js  — exports `up(db, { log })`, called with the better-sqlite3 handle. Must be synchronous.
const fs = require('fs');
const path = require('path');

const MIGRATION_FILE_PATTERN = /^(\d+)_[\w-]+\.(sql|js)$/;
const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function listMigrations(migrationsDir) {
  const migrations = fs.readdirSync(migrationsDir)
    .map(file => {
      const match = MIGRATION_FILE_PATTERN.exec(file);
      return match ? { version: Number(match[1]), file, kind: match[2], fullPath: path.join(migrationsDir, file) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.version - b.version);

  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].version === migrations[i - 1].version) {
      throw new Error(`Duplicate migration version ${migrations[i].version}: ${migrations[i - 1].file} and ${migrations[i].file}`);
    }
  }

  return migrations;
}

function hasUserTables(db) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get();
}

function backupDatabase(db, dbPath, fromVersion, log) {
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(dbPath, path.extname(dbPath));
  const backupPath = path.join(backupDir, `${base}.v${fromVersion}.${stamp}.db`);

  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  log(`Backed up database to ${backupPath} before migrating`);
  return backupPath;
}

// Foreign key violations as a set of stable keys, so we can tell new ones apart from any
// that already existed before a migration ran (older databases may have some, since
// enforcement depends on how rows were written — we don't want those to block migrating).
function foreignKeyViolations(db) {
  return new Set(db.pragma('foreign_key_check').map(v => `${v.table}:${v.rowid}:${v.parent}:${v.fkid}`));
}

function runMigrations(db, { migrationsDir = DEFAULT_MIGRATIONS_DIR, dbPath = null, log = console.log } = {}) {
  const migrations = listMigrations(migrationsDir);
  const currentVersion = db.pragma('user_version', { simple: true });
  const latestVersion = migrations.length ? migrations[migrations.length - 1].version : 0;

  if (currentVersion > latestVersion) {
    throw new Error(`Database is at schema version ${currentVersion}, but the newest migration this code knows about is ${latestVersion}. `
      + 'Was the database used with a newer version of Budgett?');
  }

  const pending = migrations.filter(m => m.version > currentVersion);
  if (pending.length === 0) {
    return { from: currentVersion, to: currentVersion, applied: [], backupPath: null };
  }

  let backupPath = null;
  if (dbPath && hasUserTables(db)) {
    backupPath = backupDatabase(db, dbPath, currentVersion, log);
  }

  // Can't be changed inside a transaction, so toggle it around the whole run.
  const foreignKeysWereOn = db.pragma('foreign_keys', { simple: true }) === 1;
  db.pragma('foreign_keys = OFF');

  const applied = [];
  try {
    for (const migration of pending) {
      const runOne = db.transaction(() => {
        const violationsBefore = foreignKeyViolations(db);

        if (migration.kind === 'sql') {
          db.exec(fs.readFileSync(migration.fullPath, 'utf-8'));
        }
        else {
          const mod = require(migration.fullPath);
          if (typeof mod.up !== 'function') {
            throw new Error('migration module does not export an up(db) function');
          }

          const result = mod.up(db, { log });
          if (result && typeof result.then === 'function') {
            throw new Error('up() returned a promise — migrations must be synchronous');
          }
        }

        const newViolations = [...foreignKeyViolations(db)].filter(v => !violationsBefore.has(v));
        if (newViolations.length > 0) {
          throw new Error(`introduced ${newViolations.length} foreign key violation(s), e.g. ${newViolations.slice(0, 5).join(', ')} (table:rowid:parent:fk)`);
        }

        db.pragma(`user_version = ${migration.version}`);
      });

      try {
        runOne();
      }
      catch (err) {
        err.message = `Migration ${migration.file} failed and was rolled back: ${err.message}`
          + (backupPath ? ` (pre-migration backup: ${backupPath})` : '');
        throw err;
      }

      applied.push(migration.file);
      log(`Applied migration ${migration.file}`);
    }
  }
  finally {
    if (foreignKeysWereOn) {
      db.pragma('foreign_keys = ON');
    }
  }

  return { from: currentVersion, to: latestVersion, applied, backupPath };
}

module.exports = { runMigrations, listMigrations };
