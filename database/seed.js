/**
 * Seed script - imports settings from the old Budget app into Budgett's SQLite database.
 * 
 * Usage: node database/seed.js
 * 
 * Imports:
 *  - Categories (from data.jsonc)
 *  - Plaid items & accounts (from settings.jsonc - production only)
 *  - Auto-categorization rules (from Rules.txt)
 *  - App settings as a notification endpoint (Discord webhook from applicationSettings.jsonc)
 */

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const SETTINGS_DIR = 'C:\\Users\\deantric\\Desktop\\Budget app settings files';
const DB_PATH = path.resolve(__dirname, 'budgett.db');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

// Strip JSONC comments and control characters
function parseJsonc(text) {
  // Remove single-line comments, but only those NOT inside strings
  // Strategy: process line by line, only strip // that aren't inside quotes
  let stripped = '';
  for (const line of text.split('\n')) {
    let inString = false;
    let escaped = false;
    let commentStart = -1;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (!inString && ch === '/' && line[i + 1] === '/') {
        commentStart = i;
        break;
      }
    }
    stripped += (commentStart >= 0 ? line.substring(0, commentStart) : line) + '\n';
  }
  // Remove multi-line comments (these shouldn't appear inside strings in JSONC)
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove trailing commas before ] or }
  stripped = stripped.replace(/,\s*([\]\}])/g, '$1');
  return JSON.parse(stripped);
}

// Parse the Rules.txt format
function parseRules(text) {
  const rules = [];
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  let i = 0;

  while (i < lines.length) {
    if (!lines[i] || lines[i].startsWith('\t')) { i++; continue; }

    // Header line: pattern;{optional condition}
    const headerParts = lines[i].split(';');
    const pattern = headerParts[0].trim();
    const condition = headerParts[1] ? headerParts[1].trim() : null;

    // Collect template lines (indented with tab)
    const templates = [];
    i++;
    while (i < lines.length && lines[i].startsWith('\t')) {
      templates.push(lines[i].substring(1).trim()); // Remove leading tab
      i++;
    }

    if (templates.length === 1) {
      // Single output: {DATE};Merchant;Notes;Category;{AMOUNT};PaymentMethod
      const parts = templates[0].split(';');
      rules.push({
        pattern,
        condition,
        merchant_template: parts[1] || null,
        notes_template: parts[2] || null,
        category_name: parts[3] || null,
        amount_expression: parts[4] || null,
        payment_method: parts[5] || null,
        is_split: false,
        splits: null,
      });
    } else if (templates.length > 1) {
      // Multiple outputs = split rule
      const splits = templates.map(t => {
        const parts = t.split(';');
        return {
          merchant_template: parts[1] || null,
          notes_template: parts[2] || null,
          category_name: parts[3] || null,
          amount_expression: parts[4] || null,
          payment_method: parts[5] || null,
        };
      });
      rules.push({
        pattern,
        condition,
        merchant_template: splits[0].merchant_template,
        notes_template: splits[0].notes_template,
        category_name: splits[0].category_name,
        amount_expression: splits[0].amount_expression,
        payment_method: splits[0].payment_method,
        is_split: true,
        splits,
      });
    }
  }

  return rules;
}

async function seed() {
  console.log('Loading settings files...');

  const dataJsonc = fs.readFileSync(path.join(SETTINGS_DIR, 'data.jsonc'), 'utf8');
  const settingsJsonc = fs.readFileSync(path.join(SETTINGS_DIR, 'settings.jsonc'), 'utf8');
  const appSettingsJsonc = fs.readFileSync(path.join(SETTINGS_DIR, 'applicationSettings.jsonc'), 'utf8');
  const rulesTxt = fs.readFileSync(path.join(SETTINGS_DIR, 'Rules.txt'), 'utf8');

  const data = parseJsonc(dataJsonc);
  const settings = parseJsonc(settingsJsonc);
  const appSettings = parseJsonc(appSettingsJsonc);
  const rules = parseRules(rulesTxt);

  console.log(`Parsed: ${data.categories.length} categories, ${rules.length} rules`);
  console.log(`Production accounts: ${settings.plaid.accountsProduction.length} institutions`);

  // Init database
  const SQL = await initSqlJs();
  let db;

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Opened existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  // Run schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.run(schema);
  console.log('Schema applied');

  // ─── Categories ─────────────────────────────────────────────
  console.log('\nImporting categories...');
  const existingCats = db.exec("SELECT COUNT(*) FROM categories")[0].values[0][0];
  if (existingCats > 0) {
    console.log(`  Skipping - ${existingCats} categories already exist`);
  } else {
    for (let i = 0; i < data.categories.length; i++) {
      const cat = data.categories[i];
      const budgetExpr = cat.budgetedAmount !== undefined ? String(cat.budgetedAmount) : null;
      db.run(
        "INSERT INTO categories (name, budgeted_amount_expression, sort_order) VALUES (?, ?, ?)",
        [cat.name, budgetExpr, i]
      );
    }
    console.log(`  Imported ${data.categories.length} categories`);
  }

  // ─── Items & Accounts (production only) ─────────────────────
  console.log('\nImporting Plaid items (production)...');
  const existingItems = db.exec("SELECT COUNT(*) FROM items")[0].values[0][0];
  if (existingItems > 0) {
    console.log(`  Skipping - ${existingItems} items already exist`);
  } else {
    for (const inst of settings.plaid.accountsProduction) {
      db.run(
        `INSERT INTO items (plaid_item_id, plaid_access_token, institution_name, institution_id, institution_color, institution_logo, online_banking_url, transaction_cursor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inst.PlaidItemId,
          inst.AccessToken,
          inst.Name,
          inst.PlaidId,
          inst.Color,
          inst.Logo,
          inst.OnlineBankingUrl,
          inst.Cursor || null,
        ]
      );
      const itemId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];

      for (const acct of inst.Accounts) {
        db.run(
          `INSERT INTO accounts (item_id, plaid_account_id, name, official_name, mask, current_balance)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            acct.PlaidId,
            acct.PaymentMethodName || acct.Name,
            acct.Name,
            acct.Mask,
            acct.CurrentBalance,
          ]
        );
      }
      console.log(`  ${inst.Name}: ${inst.Accounts.length} accounts`);
    }
  }

  // ─── Rules ──────────────────────────────────────────────────
  console.log('\nImporting rules...');
  const existingRules = db.exec("SELECT COUNT(*) FROM rules")[0].values[0][0];
  if (existingRules > 0) {
    console.log(`  Skipping - ${existingRules} rules already exist`);
  } else {
    // Build category name → id lookup
    const catRows = db.exec("SELECT id, name FROM categories");
    const catLookup = {};
    if (catRows.length > 0) {
      for (const row of catRows[0].values) {
        catLookup[row[1]] = row[0];
      }
    }

    for (const rule of rules) {
      const categoryId = rule.category_name ? (catLookup[rule.category_name] || null) : null;
      db.run(
        `INSERT INTO rules (pattern, condition, category_id, merchant_template, notes_template, amount_expression, payment_method, is_split, split_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rule.pattern,
          rule.condition,
          categoryId,
          rule.merchant_template,
          rule.notes_template,
          rule.amount_expression === '{AMOUNT}' ? null : rule.amount_expression,
          rule.payment_method,
          rule.is_split ? 1 : 0,
          rule.is_split ? JSON.stringify(rule.splits.map(s => ({
            ...s,
            category_id: s.category_name ? (catLookup[s.category_name] || null) : null,
          }))) : null,
        ]
      );
    }
    console.log(`  Imported ${rules.length} rules`);
  }

  // ─── Notification Endpoint (Discord) ────────────────────────
  console.log('\nImporting notification endpoint...');
  const existingEndpoints = db.exec("SELECT COUNT(*) FROM notification_endpoints")[0].values[0][0];
  if (existingEndpoints > 0) {
    console.log(`  Skipping - ${existingEndpoints} endpoints already exist`);
  } else {
    db.run(
      `INSERT INTO notification_endpoints (name, url, method, body_template, event_types_json)
       VALUES (?, ?, ?, ?, ?)`,
      [
        'Discord',
        appSettings.DiscordWebhook,
        'POST',
        '{"content": "{{message}}"}',
        '["transaction.added", "sync.complete", "error"]',
      ]
    );
    console.log('  Added Discord webhook endpoint');
  }

  // Save database
  const dbData = db.export();
  const buffer = Buffer.from(dbData);
  fs.writeFileSync(DB_PATH, buffer);
  console.log(`\nDatabase saved to ${DB_PATH} (${(buffer.length / 1024).toFixed(1)} KB)`);

  db.close();
  console.log('Done!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
