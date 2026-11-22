const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { runMigrations } = require('./migrate');

const dbPath = path.resolve(__dirname, '..', '..', 'database', 'budgett.db');

// Ensure the database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

function getDb() {
  if (db) {
    return db;
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

function init() {
  const database = getDb();
  const { from, to, applied } = runMigrations(database, { dbPath });
  console.log(applied.length
    ? `Database migrated from schema version ${from} to ${to}.`
    : `Database is up to date (schema version ${to}).`);
  return database;
}

// Periodically (once per day) flush the WAL into budgett.db so a plain copy of that one file
// (without the -wal/-shm companions) doesn't miss recent writes for too long.
function startPeriodicCheckpoint(intervalMs = 24 * 60 * 60 * 1000) {
  const database = getDb();
  setInterval(() => {
    try {
      database.pragma('wal_checkpoint(TRUNCATE)');
    }
    catch (err) {
      console.error('WAL checkpoint failed:', err.message);
    }
  }, intervalMs).unref();
}

// Close DB on exit
process.on('exit', () => {
  if (db) {
    db.close();
  }
});

process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

// Run if called directly
if (require.main === module) {
  init();
  process.exit(0);
}

module.exports = { getDb, init, startPeriodicCheckpoint };

