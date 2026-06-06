const { plaidClient } = require('../routes/link');
const { getItemByPlaidId, updateItemCursor, createTransaction, getTransactionByPlaidId,
  getTransactionByPendingId, softRemoveTransaction, restoreTransaction,
  createLog, createSplit, getAllRules, updateTransactionFromPending,
  updateTransactionPlaidData, getAccountByPlaidId, getSetting,
  findIncompleteMatch, linkIncompleteTransaction,
  findFuzzyPendingMatch, promotePendingToPosted, unlinkPlaidId } = require('../db/queries');
const { matchRule } = require('../helpers/rules');
const { sendNotifications } = require('../helpers/notifications');

async function syncTransactions(plaidItemId, accessToken, cursor, io) {
  let hasMore = true;
  let currentCursor = cursor;
  let addedCount = 0, modifiedCount = 0, removedCount = 0;

  createLog('info', 'sync_started', `Starting sync for item ${plaidItemId}`);

  // First pass: count totals without sending individual notifications
  const allAdded = [], allModified = [], allRemoved = [];

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: currentCursor || undefined,
    });

    const { added, modified, removed, has_more, next_cursor } = response.data;

    allAdded.push(...added);
    allModified.push(...modified);
    allRemoved.push(...removed);
    addedCount += added.length;
    modifiedCount += modified.length;
    removedCount += removed.length;

    hasMore = has_more;
    currentCursor = next_cursor;
  }

  const item = getItemByPlaidId(plaidItemId);
  if (item) {
    updateItemCursor(currentCursor, item.id);
  }

  // Send sync summary notification FIRST
  if (addedCount > 0 || modifiedCount > 0 || removedCount > 0) {
    const instName = item ? (item.display_name || item.institution_name) : plaidItemId;
    await sendNotifications('sync_complete', {
      institution: instName,
      added_count: String(addedCount),
      modified_count: String(modifiedCount),
      removed_count: String(removedCount),
    });

    // Send detailed listing of added/modified/removed
    let details = '';
    if (allAdded.length > 0) {
      details += 'Added transactions:\n\n';
      details += allAdded.map(t => {
        const amt = `$${Math.abs(t.amount).toFixed(2)}`;
        return `- ${t.amount <= 0 ? '' : '-'}${amt} ${t.merchant_name || t.name}`;
      }).join('\n');
      details += '\n\n';
    }

    if (allModified.length > 0) {
      details += 'Modified transactions:\n\n';
      details += allModified.map(t => {
        const amt = `$${Math.abs(t.amount).toFixed(2)}`;
        return `- ${t.amount <= 0 ? '' : '-'}${amt} ${t.merchant_name || t.name}`;
      }).join('\n');
      details += '\n\n';
    }

    if (allRemoved.length > 0) {
      details += 'Removed transactions:\n\n';
      details += allRemoved.map(r => {
        // Check if removed txn matches a pending_transaction_id in added (pending→posted)
        const match = allAdded.find(a => a.pending_transaction_id === r.transaction_id);
        if (match) {
          const amt = `$${Math.abs(match.amount).toFixed(2)}`;
          return `- ${r.transaction_id} (was: ${match.amount <= 0 ? '' : '-'}${amt} ${match.merchant_name || match.name})`;
        }

        return `- ${r.transaction_id}`;
      }).join('\n');
      details += '\n';
    }

    if (details) {
      await sendNotifications('sync_details', { details });
    }
  }

  // Then process transactions (which sends individual notifications)
  for (const txn of allAdded) {
    await processAddedTransaction(txn, io);
  }

  for (const txn of allModified) {
    await processModifiedTransaction(txn, io);
  }

  for (const txn of allRemoved) {
    await processRemovedTransaction(txn, io);
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
      createLog('info', 'transaction_restored', `Restored: ${txn.merchant_name || txn.name} (${txn.amount})`);

    }

    return;
  }

  // Check if this matches a pending transaction
  let matchedPending = null;
  if (txn.pending_transaction_id) {
    matchedPending = getTransactionByPendingId(txn.pending_transaction_id);
  }

  if (matchedPending) {
    // Pending→Posted: only update plaid_id and amount, preserve user edits
    updateTransactionFromPending(
      txn.transaction_id,
      -txn.amount,
      matchedPending.id
    );
    createLog('info', 'pending_matched', `Pending→Posted: ${txn.merchant_name || txn.name} (${txn.amount})`);
    await sendNotifications('sync_update', { message: `UPDATED (posted matched by pending id): ${txn.merchant_name || txn.name}` });
    return;
  }

  // Resolve account (used by fuzzy match and transaction creation)
  const account = getAccountByPlaidId(txn.account_id);
  const accountId = account ? account.id : null;

  // Check for incomplete transactions (no plaid_id, within 7 days, same amount)
  const incompleteMatch = findIncompleteMatch(-txn.amount);
  if (incompleteMatch) {
    linkIncompleteTransaction(txn.transaction_id, incompleteMatch.id);
    createLog('info', 'incomplete_matched', `Linked to incomplete txn #${incompleteMatch.id}: ${txn.merchant_name || txn.name} (${txn.amount})`);
    await sendNotifications('sync_update', { message: `UPDATED (matched incomplete by amount): ${txn.merchant_name || txn.name}` });
    return;
  }

  // Fuzzy match: posted transaction without pending_transaction_id link
  // Look for a recent pending transaction on the same account with exact amount OR similar merchant
  if (!txn.pending && accountId) {
    const incomingMerchant = txn.merchant_name || txn.name || '';
    const fuzzyMatch = findFuzzyPendingMatch(accountId, -txn.amount, txn.date, incomingMerchant);
    if (fuzzyMatch) {
      promotePendingToPosted(txn.transaction_id, -txn.amount, fuzzyMatch.id);
      createLog('info', 'fuzzy_pending_matched',
        `Posted txn matched pending #${fuzzyMatch.id} (${fuzzyMatch.merchant}): plaid_id ${fuzzyMatch.plaid_transaction_id} → ${txn.transaction_id}, amount ${fuzzyMatch.amount} → ${-txn.amount}`);
      await sendNotifications('sync_update', { message: `UPDATED (fuzzy matched pending): ${txn.merchant_name || txn.name} → ${fuzzyMatch.merchant}` });
      return;
    }
  }

  // Try to match a rule
  const rules = getAllRules();
  const merchantName = txn.merchant_name || txn.name;
  const matchedRule = matchRule(rules, merchantName, -txn.amount);
  const displayName = (matchedRule && matchedRule.rename_to) ? matchedRule.rename_to : merchantName;

  // Insert new transaction (use renamed merchant if rule specifies)
  const result = createTransaction(
    txn.transaction_id,
    txn.pending_transaction_id || null,
    accountId,
    txn.date,
    displayName,
    -txn.amount, // Invert: Plaid positive = expense, we use negative = expense
    txn.pending ? 1 : 0,
    txn.personal_finance_category?.primary || null,
    JSON.stringify(txn)
  );

  const txnId = result.lastInsertRowid;

  if (matchedRule) {
    createSplit(txnId, matchedRule.category_id || null, -txn.amount, matchedRule.notes_template || null);
    createLog('info', 'rule_matched', `Rule "${matchedRule.pattern}" matched for ${merchantName}${matchedRule.rename_to ? ' → ' + matchedRule.rename_to : ''}`);
  }

  // Build record link
  const baseUrl = getSetting('base_url') || 'http://localhost:3000';
  const recordParams = new URLSearchParams({
    plaidid: txn.transaction_id,
    date: txn.date,
    where: displayName,
    amount: String(-txn.amount),
    ...(account ? { paymentmethod: account.display_name || account.name } : {}),
    ...(matchedRule && matchedRule.category_name ? { category: matchedRule.category_name } : {}),
  });
  const recordLink = `${baseUrl}/recordTransaction?${recordParams.toString()}`;

  // Send notifications
  await sendNotifications('transaction_found', {
    merchant: displayName,
    amount: -txn.amount,  // Use Budgett convention: negative = expense, positive = income
    date: txn.date,
    category: matchedRule && matchedRule.category_name ? matchedRule.category_name : 'Uncategorized',
    account_name: account ? (account.display_name || account.name) : 'Unknown',
    record_link: recordLink,
  });

  createLog('info', 'transaction_added', `Added: ${txn.merchant_name || txn.name} (${txn.amount})`);

  if (io) {
    io.emit('NEW_TRANSACTION', { id: txnId, merchant: txn.merchant_name || txn.name, amount: -txn.amount });
  }
}

async function processModifiedTransaction(txn, io) {
  const existing = getTransactionByPlaidId(txn.transaction_id);
  if (!existing) {
    createLog('warn', 'modify_not_found', `Attempted to modify transaction ${txn.transaction_id} (${txn.merchant_name || txn.name}, $${txn.amount}), but could not find it`);
    return;
  }

  updateTransactionPlaidData(
    -txn.amount,
    txn.merchant_name || txn.name,
    txn.date,
    txn.personal_finance_category?.primary || null,
    JSON.stringify(txn),
    txn.transaction_id
  );

  createLog('info', 'transaction_modified', `Modified: ${txn.merchant_name || txn.name} (${txn.amount})`);
}

async function processRemovedTransaction(txn, io) {
  const existing = getTransactionByPlaidId(txn.transaction_id);
  if (!existing) {
    createLog('warn', 'remove_not_found', `Attempted to remove transaction ${txn.transaction_id}, but could not find it in database`);
    return;
  }

  if (existing.is_removed) {
    createLog('info', 'already_removed', `Transaction ${txn.transaction_id} already marked removed, skipping`);
    return;
  }

  // If the transaction is pending, don't delete it — strip the plaid_id so it
  // shows up in "incomplete transactions" and user-specified data is preserved.
  // (The posted version likely already exists as a separate entry.)
  if (existing.is_pending) {
    unlinkPlaidId(existing.id);
    createLog('info', 'pending_unlinked', `Pending transaction unlinked: ${existing.merchant} ($${existing.amount}) — plaid_id ${txn.transaction_id} removed, moved to incomplete`);
    return;
  }

  softRemoveTransaction(txn.transaction_id);
  createLog('info', 'transaction_removed', `Soft-removed: ${txn.transaction_id} (${existing.merchant}, $${existing.amount})`);
}

module.exports = { syncTransactions };
