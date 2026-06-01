const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const dbPath = path.resolve(__dirname, '..', '..', 'database', 'budgett.db');
const schemaPath = path.resolve(__dirname, '..', '..', 'database', 'schema.sql');

// Ensure the database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

async function getDb() {
  if (db) 
    return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  }
  else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Auto-save every 5 seconds
setInterval(saveDb, 5000);

// Save on exit
process.on('exit', saveDb);
process.on('SIGINT', () => {
  saveDb(); process.exit(); 
});
process.on('SIGTERM', () => {
  saveDb(); process.exit(); 
});

async function init() {
  const database = await getDb();
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
  saveDb();
  console.log('Database initialized successfully.');
  return database;
}

// Run if called directly
if (require.main === module) {
  init().then(() => process.exit(0));
}

module.exports = { getDb, saveDb, init };

