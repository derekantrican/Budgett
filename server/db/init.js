const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const dbPath = path.resolve(__dirname, '..', '..', 'database', 'budgett.db');
const schemaPath = path.resolve(__dirname, '..', '..', 'database', 'schema.sql');

// Ensure the database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

function getDb() {
  if (db)
    return db;

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

function init() {
  const database = getDb();
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
  console.log('Database initialized successfully.');
  return database;
}

// Close DB on exit
process.on('exit', () => {
  if (db) db.close();
});

process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

// Run if called directly
if (require.main === module) {
  init();
  process.exit(0);
}

module.exports = { getDb, init };

