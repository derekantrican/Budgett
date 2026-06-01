const { plaidClient } = require('../routes/link');
const { getItemByPlaidId, updateItemCursor, createTransaction, getTransactionByPlaidId,
  getTransactionByPendingId, softRemoveTransaction, restoreTransaction,
  createLog, createSplit, getAllRules, updateTransactionFromPending,
  updateTransactionPlaidData, getAccountByPlaidId } = require('../db/queries');
const { matchRule } = require('../helpers/rules');
const { sendNotifications } = require('../helpers/notifications');

async function syncTransactions(plaidItemId, accessToken, cursor, io) {
  let hasMore = true;
  let currentCursor = cursor;

  createLog('info', 'sync_started', `Starting sync for item ${plaidItemId}`);

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: currentCursor || undefined,
    });

    const { added, modified, removed, has_more, next_cursor } = response.data;

    for (const txn of added) {
      await processAddedTransaction(txn, io);
    }

    for (const txn of modified) {
      await processModifiedTransaction(txn, io);
    }

    for (const txn of removed) {
      await processRemovedTransaction(txn, io);
    }

    hasMore = has_more;
    currentCursor = next_cursor;
  }

  const item = getItemByPlaidId(plaidItemId);
  if (item) {
    updateItemCursor(currentCursor, item.id);
  }

  createLog('info', 'sync_completed', `Sync completed for item ${plaidItemId}`);

  if (io) {
    io.emit('SYNC_COMPLETE', { item_id: plaidItemId });
  }
}

async function processAddedTransaction(txn, io) {
  const existing = getTransactionByPlaidId(txn.transaction_id);
  if (existing) {
    if (existing.is_removed) {
      restoreTransaction(txn.transaction_id);
      createLog('info', 'transaction_restored', `Restored: ${txn.name} (${txn.amount})`);
    }
    return;
  }

  // Check if this matches a pending transaction
  let matchedPending = null;
  if (txn.pending_transaction_id) {
    matchedPending = getTransactionByPendingId(txn.pending_transaction_id);
  }

  if (matchedPending) {
    updateTransactionFromPending(
      txn.transaction_id,
      -txn.amount,
      txn.name || txn.merchant_name,
      txn.date,
      txn.personal_finance_category?.primary || null,
      JSON.stringify(txn),
      matchedPending.id
    );
    createLog('info', 'pending_matched', `Pending→Posted: ${txn.name} (${txn.amount})`);
    return;
  }

  // Resolve account
  const account = getAccountByPlaidId(txn.account_id);
  const accountId = account ? account.id : null;

  // Insert new transaction
  const result = createTransaction(
    txn.transaction_id,
    txn.pending_transaction_id || null,
    accountId,
    txn.date,
    txn.name || txn.merchant_name,
    -txn.amount, // Invert: Plaid positive = expense, we use negative = expense
    txn.pending ? 1 : 0,
    txn.personal_finance_category?.primary || null,
    JSON.stringify(txn)
  );

  const txnId = result.lastInsertRowid;

  // Try to match a rule
  const rules = getAllRules();
  const matchedRule = matchRule(rules, txn.name || txn.merchant_name);
  if (matchedRule) {
    createSplit(txnId, matchedRule.category_id, -txn.amount, matchedRule.notes_template || null);
    createLog('info', 'rule_matched', `Rule "${matchedRule.pattern}" matched for ${txn.name}`);
  }

  // Send notifications
  await sendNotifications('transaction_found', {
    merchant: txn.name || txn.merchant_name,
    amount: txn.amount,
    date: txn.date,
    category: matchedRule ? matchedRule.category_name : 'Uncategorized',
  });

  createLog('info', 'transaction_added', `Added: ${txn.name} (${txn.amount})`);

  if (io) {
    io.emit('NEW_TRANSACTION', { id: txnId, merchant: txn.name, amount: -txn.amount });
  }
}

async function processModifiedTransaction(txn, io) {
  const existing = getTransactionByPlaidId(txn.transaction_id);
  if (!existing) 
    return;

  updateTransactionPlaidData(
    -txn.amount,
    txn.name || txn.merchant_name,
    txn.date,
    txn.personal_finance_category?.primary || null,
    JSON.stringify(txn),
    txn.transaction_id
  );

  createLog('info', 'transaction_modified', `Modified: ${txn.name} (${txn.amount})`);
}

async function processRemovedTransaction(txn, io) {
  softRemoveTransaction(txn.transaction_id);
  createLog('info', 'transaction_removed', `Soft-removed: ${txn.transaction_id}`);
}

module.exports = { syncTransactions };
