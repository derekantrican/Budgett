/**
 * Budgett Transaction Importer
 * 
 * Imports transactions from .xlsx or .csv files into the Budgett database.
 * 
 * Usage:
 *   node database/import-transactions.js <file.xlsx|file.csv> [options]
 * 
 * Options:
 *   --dry-run              Show what would be imported without writing to DB
 *   --skip-dupes           Skip rows whose plaid_transaction_id already exists (default: true)
 *   --sheet <name>         Import only a specific sheet (xlsx only). Omit to import all monthly sheets.
 *   --snap-to-sheet-month  Snap transaction dates that fall after the end of their sheet's month
 *                          (e.g. a 5/4 transaction on the "Apr" sheet) to the last day of that month,
 *                          so it counts toward the sheet's month instead of the following one.
 *
 * Expected spreadsheet format (per monthly sheet):
 *   Row 5 (0-indexed): Header row with columns:
 *     [Plaid Transaction ID(s), Date, Where?, Notes, Category, Amount, Payment Method]
 *   Data rows start at row 6.
 * 
 * Expected CSV format:
 *   Header row with columns: plaid_transaction_id, date, merchant, notes, category, amount, payment_method
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// --- Config ---
const DB_PATH = path.resolve(__dirname, 'budgett.db');
const MONTH_SHEETS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// --- Parse CLI args ---
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const sheetFilter = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : null;
const snapToSheetMonth = args.includes('--snap-to-sheet-month');

if (!filePath) {
  console.error('Usage: node database/import-transactions.js <file.xlsx|file.csv> [--dry-run] [--sheet <name>] [--snap-to-sheet-month]');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

// --- Helpers ---
function excelDateToISO(serial) {
  // Excel serial date → JS Date → ISO string (YYYY-MM-DD)
  if (typeof serial === 'string') {
    // Already a date string? Try to parse it
    const d = new Date(serial);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return null;
  }
  if (typeof serial !== 'number') return null;
  // Excel epoch: Jan 0, 1900 (with the 1900 leap year bug)
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + serial * 86400000);
  return date.toISOString().split('T')[0];
}

function parseAmount(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[$,]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

// Snap dates that fall after the end of a sheet's month (e.g. a 5/4 transaction on the
// "Apr" sheet) to the last day of that month, so it counts toward the sheet's own month.
// The sheet's year is inferred from whichever rows already fall in the expected month.
function snapOverflowDates(rows, sheetName) {
  const expectedMonthIdx = MONTH_SHEETS.indexOf(sheetName);
  if (expectedMonthIdx === -1) return;

  const yearCounts = {};
  for (const row of rows) {
    const d = new Date(row.date + 'T00:00:00Z');
    if (d.getUTCMonth() === expectedMonthIdx)
      yearCounts[d.getUTCFullYear()] = (yearCounts[d.getUTCFullYear()] || 0) + 1;
  }

  const years = Object.keys(yearCounts);
  if (years.length === 0) return; // Can't infer the sheet's year, leave dates untouched

  const sheetYear = Number(years.reduce((a, b) => (yearCounts[a] >= yearCounts[b] ? a : b)));
  const endOfMonth = new Date(Date.UTC(sheetYear, expectedMonthIdx + 1, 0));
  const endOfMonthIso = endOfMonth.toISOString().split('T')[0];

  let snapped = 0;
  for (const row of rows) {
    const d = new Date(row.date + 'T00:00:00Z');
    if (d.getTime() > endOfMonth.getTime()) {
      row.date = endOfMonthIso;
      snapped++;
    }
  }

  if (snapped > 0)
    console.log(`  ${sheetName}: snapped ${snapped} transaction(s) past end of month to ${endOfMonthIso}`);
}

// --- Parse XLSX ---
function parseXlsx(filePath) {
  const wb = XLSX.readFile(filePath, { cellFormula: true });
  const sheets = sheetFilter ? [sheetFilter] : MONTH_SHEETS.filter(s => wb.SheetNames.includes(s));
  
  const transactions = [];
  
  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.warn(`Sheet "${sheetName}" not found, skipping.`);
      continue;
    }
    
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    // Find header row (look for "Plaid Transaction ID" in first column)
    let headerIdx = -1;
    for (let i = 0; i < Math.min(data.length, 15); i++) {
      if (data[i] && data[i][0] && String(data[i][0]).includes('Plaid Transaction ID')) {
        headerIdx = i;
        break;
      }
    }
    
    if (headerIdx === -1) {
      console.warn(`No header row found in sheet "${sheetName}", skipping.`);
      continue;
    }
    
    // Determine the Amount column letter in the actual sheet
    // sheet_to_json trims empty leading columns, so we need to find which sheet column
    // maps to array index 5 (Amount). We check the header row in the raw sheet.
    let amountColLetter = null;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: headerIdx, c });
      const cell = ws[addr];
      if (cell && String(cell.v).includes('Amount')) {
        amountColLetter = XLSX.utils.encode_col(c);
        break;
      }
    }
    
    // Parse data rows
    const sheetTransactions = [];
    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[1]) continue; // Skip rows without a date
      
      const plaidId = row[0] ? String(row[0]).trim() : null;
      const date = excelDateToISO(row[1]);
      const merchant = row[2] ? String(row[2]).trim() : null;
      const notes = row[3] ? String(row[3]).trim() : null;
      const category = row[4] ? String(row[4]).trim() : null;
      const amount = parseAmount(row[5]);
      const paymentMethod = row[6] ? String(row[6]).trim() : null;
      
      if (!date || amount === null) continue; // Skip invalid rows
      
      // Check if the Amount cell has a formula (indicates split parent)
      // Sheet row = headerIdx + 1 + (i - headerIdx - 1) + 1 = i + 1 (1-indexed)
      let originalTotal = null;
      let isSplitParent = false;
      if (amountColLetter) {
        const sheetRow = i + 1; // sheet_to_json row 0 = sheet row 1
        const cellAddr = amountColLetter + sheetRow;
        const cell = ws[cellAddr];
        if (cell && cell.f) {
          // Extract the original total from formulas like "=-146.92-G70-G71-G72"
          // The first number in the formula is the original transaction total
          const match = cell.f.match(/^=?\s*(-?\d+\.?\d*)/);
          if (match) {
            originalTotal = parseFloat(match[1]);
            isSplitParent = true;
          }
        }
      }
      
      sheetTransactions.push({
        plaid_transaction_id: plaidId || null,
        date,
        merchant,
        notes: notes || null,
        category,
        amount,
        original_total: originalTotal,
        is_split_parent: isSplitParent,
        payment_method: paymentMethod || null,
        source_sheet: sheetName
      });
    }

    if (snapToSheetMonth)
      snapOverflowDates(sheetTransactions, sheetName);

    transactions.push(...sheetTransactions);

    console.log(`  ${sheetName}: ${sheetTransactions.length} transactions`);
  }
  
  return transactions;
}

// --- Parse CSV ---
function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  
  if (lines.length < 2) {
    console.error('CSV file is empty or has no data rows.');
    process.exit(1);
  }
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const transactions = [];
  
  // Map common header variations
  const colMap = {
    plaid_transaction_id: headers.findIndex(h => h.includes('plaid') || h.includes('transaction_id')),
    date: headers.findIndex(h => h === 'date'),
    merchant: headers.findIndex(h => h.includes('merchant') || h.includes('where')),
    notes: headers.findIndex(h => h.includes('notes') || h.includes('memo')),
    category: headers.findIndex(h => h.includes('category')),
    amount: headers.findIndex(h => h.includes('amount')),
    payment_method: headers.findIndex(h => h.includes('payment') || h.includes('account'))
  };
  
  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parse (doesn't handle quoted commas - TODO: use proper parser if needed)
    const parts = lines[i].split(',');
    
    const date = colMap.date >= 0 ? parts[colMap.date]?.trim() : null;
    const amount = colMap.amount >= 0 ? parseAmount(parts[colMap.amount]) : null;
    
    if (!date || amount === null) continue;
    
    transactions.push({
      plaid_transaction_id: colMap.plaid_transaction_id >= 0 ? parts[colMap.plaid_transaction_id]?.trim() || null : null,
      date,
      merchant: colMap.merchant >= 0 ? parts[colMap.merchant]?.trim() || null : null,
      notes: colMap.notes >= 0 ? parts[colMap.notes]?.trim() || null : null,
      category: colMap.category >= 0 ? parts[colMap.category]?.trim() || null : null,
      amount,
      payment_method: colMap.payment_method >= 0 ? parts[colMap.payment_method]?.trim() || null : null,
      source_sheet: null
    });
  }
  
  return transactions;
}

// --- Import to DB ---
async function importToDb(transactions) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}. Run npm run db:init first.`);
    process.exit(1);
  }
  
  const dbBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(dbBuffer);
  
  // Add notes column if it doesn't exist yet
  try {
    db.run('ALTER TABLE transactions ADD COLUMN notes TEXT');
    console.log('  Added "notes" column to transactions table.');
  } catch (e) {
    // Column already exists — fine
  }
  
  // Load categories for name→id lookup
  const catRows = db.exec('SELECT id, name FROM categories');
  const categoryMap = {};
  if (catRows.length > 0) {
    for (const row of catRows[0].values) {
      categoryMap[row[1].toLowerCase()] = row[0];
    }
  }
  
  // Auto-create missing categories (marked as hidden)
  const allCatsInFile = new Set(transactions.map(t => t.category).filter(Boolean));
  let createdCategories = 0;
  for (const catName of allCatsInFile) {
    if (!categoryMap[catName.toLowerCase()]) {
      db.run(
        "INSERT INTO categories (name, color, is_hidden) VALUES (?, ?, 1)",
        [catName, '#888888']
      );
      const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      categoryMap[catName.toLowerCase()] = newId;
      createdCategories++;
    }
  }
  if (createdCategories > 0) {
    console.log(`  Auto-created ${createdCategories} missing categories (marked as hidden)`);
  }
  
  // Load accounts for payment_method→id lookup
  const accRows = db.exec('SELECT id, name FROM accounts');
  const accountMap = {};
  let defaultAccountId = null;
  if (accRows.length > 0) {
    for (const row of accRows[0].values) {
      accountMap[row[1].toLowerCase()] = row[0];
      if (row[1].toLowerCase().includes('checking')) defaultAccountId = row[0];
    }
  }
  
  // Check existing plaid_transaction_ids to skip duplicates
  const existingIds = new Set();
  const existingRows = db.exec('SELECT plaid_transaction_id FROM transactions WHERE plaid_transaction_id IS NOT NULL');
  if (existingRows.length > 0) {
    for (const row of existingRows[0].values) {
      existingIds.add(row[0]);
    }
  }
  
  let imported = 0;
  let skippedDupe = 0;
  let skippedNoDate = 0;
  let unmatchedCategories = new Set();
  let unmatchedAccounts = new Set();
  
  // Group rows by plaid_transaction_id to detect splits
  // Rows with the same Plaid ID = one transaction with multiple category splits
  const grouped = new Map(); // plaid_id → [rows]
  const noIdRows = []; // rows without a plaid ID (imported individually)
  
  for (const txn of transactions) {
    if (txn.plaid_transaction_id) {
      if (!grouped.has(txn.plaid_transaction_id)) {
        grouped.set(txn.plaid_transaction_id, []);
      }
      grouped.get(txn.plaid_transaction_id).push(txn);
    } else {
      noIdRows.push(txn);
    }
  }
  
  db.run('BEGIN TRANSACTION');
  
  // Import grouped transactions (with Plaid IDs)
  for (const [plaidId, rows] of grouped) {
    // Skip if already in DB
    if (existingIds.has(plaidId)) {
      skippedDupe += rows.length;
      continue;
    }
    
    // Use first row for the transaction record
    const first = rows[0];
    
    // Determine the true transaction total:
    // If a row has original_total from a formula (e.g. =-146.92-G70-G71), use that.
    // Otherwise sum all split row amounts.
    const splitParent = rows.find(r => r.is_split_parent);
    const totalAmount = splitParent ? splitParent.original_total : rows.reduce((sum, r) => sum + r.amount, 0);
    
    // Resolve account from first row
    let accountId = defaultAccountId;
    if (first.payment_method) {
      accountId = accountMap[first.payment_method.toLowerCase()] || null;
      if (!accountId) unmatchedAccounts.add(first.payment_method);
    }
    
    // Combine notes from all rows
    const allNotes = rows.map(r => r.notes).filter(Boolean);
    const combinedNotes = allNotes.length > 1 ? allNotes.join(' | ') : (allNotes[0] || null);
    
    // Insert the single transaction
    db.run(
      `INSERT INTO transactions (plaid_transaction_id, account_id, date, merchant, notes, amount, is_pending, is_removed)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      [plaidId, accountId, first.date, first.merchant, combinedNotes, totalAmount]
    );
    
    const txnId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    
    // Create a split for each row
    for (const row of rows) {
      let categoryId = null;
      if (row.category) {
        categoryId = categoryMap[row.category.toLowerCase()] || null;
        if (!categoryId) unmatchedCategories.add(row.category);
      }
      
      if (categoryId) {
        db.run(
          `INSERT INTO transaction_splits (transaction_id, category_id, amount, notes)
           VALUES (?, ?, ?, ?)`,
          [txnId, categoryId, row.amount, row.notes]
        );
      }
    }
    
    imported++;
  }
  
  // Import rows without Plaid IDs (no dedup possible)
  for (const txn of noIdRows) {
    let accountId = defaultAccountId;
    if (txn.payment_method) {
      accountId = accountMap[txn.payment_method.toLowerCase()] || null;
      if (!accountId) unmatchedAccounts.add(txn.payment_method);
    }
    
    db.run(
      `INSERT INTO transactions (plaid_transaction_id, account_id, date, merchant, notes, amount, is_pending, is_removed)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      [null, accountId, txn.date, txn.merchant, txn.notes, txn.amount]
    );
    
    const txnId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    
    let categoryId = null;
    if (txn.category) {
      categoryId = categoryMap[txn.category.toLowerCase()] || null;
      if (!categoryId) unmatchedCategories.add(txn.category);
    }
    
    if (categoryId) {
      db.run(
        `INSERT INTO transaction_splits (transaction_id, category_id, amount, notes)
         VALUES (?, ?, ?, ?)`,
        [txnId, categoryId, txn.amount, null]
      );
    }
    
    imported++;
  }
  
  db.run('COMMIT');
  
  // Save
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();
  
  return { imported, skippedDupe, skippedNoDate, unmatchedCategories, unmatchedAccounts };
}

// --- Main ---
async function main() {
  const ext = path.extname(filePath).toLowerCase();
  
  console.log(`\nBudgett Transaction Importer`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`File: ${filePath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE IMPORT'}`);
  console.log();
  
  let transactions;
  if (ext === '.xlsx' || ext === '.xls') {
    console.log('Parsing spreadsheet...');
    transactions = parseXlsx(filePath);
  } else if (ext === '.csv') {
    console.log('Parsing CSV...');
    transactions = parseCsv(filePath);
  } else {
    console.error(`Unsupported file type: ${ext}. Use .xlsx or .csv`);
    process.exit(1);
  }
  
  console.log(`\nTotal transactions parsed: ${transactions.length}`);
  
  if (transactions.length === 0) {
    console.log('No transactions to import.');
    return;
  }
  
  // Show sample
  console.log('\nSample (first 3):');
  for (const t of transactions.slice(0, 3)) {
    console.log(`  ${t.date} | ${(t.merchant || '').padEnd(20)} | ${t.category?.padEnd(18) || '(none)'.padEnd(18)} | $${t.amount}`);
  }
  
  if (dryRun) {
    console.log('\n[DRY RUN] No changes written to database.');
    
    // Show category/account match stats
    const categories = [...new Set(transactions.map(t => t.category).filter(Boolean))];
    console.log(`\nUnique categories in file: ${categories.length}`);
    console.log(`Unique payment methods: ${[...new Set(transactions.map(t => t.payment_method).filter(Boolean))].length}`);
    return;
  }
  
  console.log('\nImporting to database...');
  const result = await importToDb(transactions);
  
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Imported:          ${result.imported}`);
  console.log(`Skipped (dupes):   ${result.skippedDupe}`);
  
  if (result.unmatchedCategories.size > 0) {
    console.log(`\nUnmatched categories (no split created):`);
    for (const c of result.unmatchedCategories) {
      console.log(`  - "${c}"`);
    }
  }
  
  if (result.unmatchedAccounts.size > 0) {
    console.log(`\nUnmatched payment methods (account_id left null):`);
    for (const a of result.unmatchedAccounts) {
      console.log(`  - "${a}"`);
    }
  }
  
  console.log(`\nDone!`);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
