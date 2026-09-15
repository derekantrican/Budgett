const { plaidClient } = require('../routes/link');
const { getItemByPlaidId, updateItemCursor, createTransaction, getTransactionByPlaidId,
  getTransactionByPendingId, softRemoveTransaction, restoreTransaction,
  createLog, createSplit, getAllRules, updateTransactionFromPending,
  updateTransactionPlaidData, getAccountByPlaidId, getSetting,
  findIncompleteMatches, linkIncompleteTransaction,
  findFuzzyPendingMatch, promotePendingToPosted, unlinkPlaidId,
  updateAccountBalance, updateItemStatus, get, deleteTransaction } = require('../db/queries');
const { matchRule } = require('../helpers/rules');
const { sendNotifications, escapeDiscordMarkdown } = require('../helpers/notifications');
const { dispatchExtensionEvent } = require('../services/extensionLoader');
const { formatAmount } = require('../helpers/format');
const { evaluateMathExpression } = require('../helpers/mathExpression');

async function syncTransactions(plaidItemId, accessToken, cursor, io) {
  let hasMore = true;
  let currentCursor = cursor;
  let addedCount = 0, modifiedCount = 0, removedCount = 0;

  const item = getItemByPlaidId(plaidItemId);
  const itemLabel = `${plaidItemId}${item ? ` (${item.display_name || item.institution_name})` : ''}`;

  createLog('info', 'sync_started', `Starting sync for item ${itemLabel}`);

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

  if (item) {
    updateItemCursor(currentCursor, item.id);
  }

  // Send sync summary notification FIRST
  if (addedCount > 0 || modifiedCount > 0 || removedCount > 0) {
    const instName = item ? (item.display_name || item.institution_name) : plaidItemId;
    const syncCompleteVars = {
      institution: instName,
      added_count: String(addedCount),
      modified_count: String(modifiedCount),
      removed_count: String(removedCount),
    };
    await sendNotifications('sync_complete', syncCompleteVars);
    await dispatchExtensionEvent('sync_complete', syncCompleteVars);

    // Send detailed listing of added/modified/removed
    let details = '';
    if (allAdded.length > 0) {
      details += 'Added transactions:\n\n';
      details += allAdded.map(t => {
        return `- ${formatAmount(-t.amount)} ${escapeDiscordMarkdown(t.merchant_name || t.name)}`;
      }).join('\n');
      details += '\n\n';
    }

    if (allModified.length > 0) {
      details += 'Modified transactions:\n\n';
      details += allModified.map(t => {
        return `- ${formatAmount(-t.amount)} ${escapeDiscordMarkdown(t.merchant_name || t.name)}`;
      }).join('\n');
      details += '\n\n';
    }

    if (allRemoved.length > 0) {
      details += 'Removed transactions:\n\n';
      details += allRemoved.map(r => {
        // Check if removed txn matches a pending_transaction_id in added (pending→posted)
        const match = allAdded.find(a => a.pending_transaction_id === r.transaction_id);
        if (match) {
          return `- ${r.transaction_id} (was: ${formatAmount(-match.amount)} ${escapeDiscordMarkdown(match.merchant_name || match.name)})`;
        }

        return `- ${r.transaction_id}`;
      }).join('\n');
      details += '\n';
    }

    if (details) {
      await sendNotifications('sync_details', { details });
      await dispatchExtensionEvent('sync_details', { details });
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

  createLog('info', 'sync_completed', `Sync completed for item ${itemLabel}`);

  // Refresh account balances
  try {
    const balanceResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    for (const acct of balanceResponse.data.accounts) {
      const dbAccount = getAccountByPlaidId(acct.account_id);
      if (dbAccount) {
        updateAccountBalance(
          acct.balances.current,
          acct.balances.available,
          dbAccount.id
        );
      }
    }

    createLog('info', 'balances_updated', `Updated balances for item ${itemLabel}`);
  }
  catch (e) {
    const plaidError = e.response?.data?.error_code;
    if (plaidError === 'ITEM_LOGIN_REQUIRED' && item) {
      updateItemStatus('login_required', item.id);
    }

    createLog('warn', 'balance_update_failed', `Failed to update balances for item ${itemLabel}: ${plaidError || e.message}`);
  }

  if (io) {
    io.emit('SYNC_COMPLETE', { item_id: plaidItemId });
  }
}

async function processAddedTransaction(txn, io) {
  const existing = getTransactionByPlaidId(txn.transaction_id);
  if (existing) {
    if (existing.is_removed) {
      restoreTransaction(txn.transaction_id);
      createLog('info', 'transaction_restored', `Restored: ${txn.merchant_name || txn.name} (${formatAmount(-txn.amount)})`);

    }

    return;
  }

  // Check if this matches a pending transaction. Plaid's pending_transaction_id points
  // at the ORIGINAL pending transaction's own plaid_transaction_id, so look it up there
  // (that row's pending_transaction_id column is unrelated — it's always null for a
  // pending transaction, since it doesn't reference a prior pending version of itself).
  let matchedPending = null;
  if (txn.pending_transaction_id) {
    matchedPending = getTransactionByPlaidId(txn.pending_transaction_id);
  }

  if (matchedPending) {
    // Pending→Posted: only update plaid_id and amount, preserve user edits
    updateTransactionFromPending(
      txn.transaction_id,
      -txn.amount,
      matchedPending.id,
      matchedPending.plaid_transaction_id
    );
    createLog('info', 'pending_matched', `Pending→Posted: ${txn.merchant_name || txn.name} (${formatAmount(-txn.amount)})`);
    await sendNotifications('sync_update', { message: `UPDATED (posted matched by pending id): ${escapeDiscordMarkdown(txn.merchant_name || txn.name)}` });
    await dispatchExtensionEvent('sync_update', { message: `UPDATED (posted matched by pending id): ${txn.merchant_name || txn.name}` });
    return;
  }

  // Resolve account (used by fuzzy match and transaction creation)
  const account = getAccountByPlaidId(txn.account_id);
  const accountId = account ? account.id : null;

  // Check for incomplete transactions (no plaid_id, same amount, date/merchant proximity)
  const incompleteMatches = findIncompleteMatches(-txn.amount, txn.date, txn.merchant_name || txn.name);
  if (incompleteMatches.length === 1) {
    const incompleteMatch = incompleteMatches[0];
    linkIncompleteTransaction(txn.transaction_id, txn.pending ? 1 : 0, incompleteMatch.id);
    createLog('info', 'incomplete_matched', `Linked to incomplete txn #${incompleteMatch.id}: ${txn.merchant_name || txn.name} (${formatAmount(-txn.amount)})`);
    await sendNotifications('sync_update', { message: `UPDATED (matched incomplete by amount): ${escapeDiscordMarkdown(txn.merchant_name || txn.name)}` });
    await dispatchExtensionEvent('sync_update', { message: `UPDATED (matched incomplete by amount): ${txn.merchant_name || txn.name}` });
    return;
  }
  else if (incompleteMatches.length > 1) {
    // Ambiguous: multiple incomplete transactions could plausibly be this one (e.g. two
    // same-amount manual entries with no merchant set). Guessing wrong would silently
    // attach this transaction's data to the wrong entry — refuse and fall through to
    // creating a new transaction instead. Worst case is a visible duplicate the user can
    // clean up, which beats an invisible wrong merge.
    createLog('warn', 'incomplete_match_ambiguous',
      `Skipped auto-linking for ${txn.merchant_name || txn.name} (${formatAmount(-txn.amount)}) — ${incompleteMatches.length} incomplete candidates matched (ids: ${incompleteMatches.map(m => m.id).join(', ')}), creating new transaction to avoid a wrong merge`);
  }

  // Fuzzy match: posted transaction without pending_transaction_id link
  // Look for a recent pending transaction on the same account with exact amount OR similar merchant
  if (!txn.pending && accountId) {
    const incomingMerchant = txn.merchant_name || txn.name || '';
    const fuzzyMatch = findFuzzyPendingMatch(accountId, -txn.amount, txn.date, incomingMerchant);
    if (fuzzyMatch) {
      promotePendingToPosted(txn.transaction_id, -txn.amount, fuzzyMatch.id, fuzzyMatch.plaid_transaction_id);
      createLog('info', 'fuzzy_pending_matched',
        `Posted txn matched pending #${fuzzyMatch.id} (${fuzzyMatch.merchant}): plaid_id ${fuzzyMatch.plaid_transaction_id} → ${txn.transaction_id}, amount ${fuzzyMatch.amount} → ${-txn.amount}`);
      await sendNotifications('sync_update', { message: `UPDATED (fuzzy matched pending): ${escapeDiscordMarkdown(txn.merchant_name || txn.name)} → ${escapeDiscordMarkdown(fuzzyMatch.merchant)}` });
      await dispatchExtensionEvent('sync_update', { message: `UPDATED (fuzzy matched pending): ${txn.merchant_name || txn.name} → ${fuzzyMatch.merchant}` });
      return;
    }
  }

  // Try to match a rule (disabled rules still exist for display/re-enabling, just don't apply)
  const rules = getAllRules().filter(r => !r.is_disabled);
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
    if (matchedRule.is_split && matchedRule.split_json) {
      const splits = JSON.parse(matchedRule.split_json);
      for (const split of splits) {
        let splitAmount = -txn.amount;
        if (split.amount_expression) {
          const result = evaluateMathExpression(split.amount_expression, { amount: -txn.amount });
          // Round to the nearest cent: e.g. "amount-12.99-17.49" is exact in decimal but not in
          // IEEE-754 double math, and that noise would otherwise get saved as-is.
          if (result !== null) {
            splitAmount = Math.round(result * 100) / 100;
          }
        }

        createSplit(txnId, split.category_id || null, splitAmount, split.notes || null);
      }
    }
    else {
      createSplit(txnId, matchedRule.category_id || null, -txn.amount, matchedRule.notes_template || null);
    }

    createLog('info', 'rule_matched', `Rule "${matchedRule.pattern}" matched for ${merchantName}${matchedRule.rename_to ? ' → ' + matchedRule.rename_to : ''}`);
    const ruleMatchedVars = {
      merchant: merchantName,
      pattern: matchedRule.pattern,
      rename_to: matchedRule.rename_to || null,
      category_name: matchedRule.category_name || null,
    };
    await sendNotifications('rule_matched', ruleMatchedVars);
    await dispatchExtensionEvent('rule_matched', ruleMatchedVars);
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
  // URLSearchParams leaves "*" unescaped (it's unreserved in application/x-www-form-urlencoded),
  // but a raw "*" inside the <...>-wrapped link can still combine with markdown elsewhere in a
  // Discord message and corrupt it — percent-encode it explicitly so the link is fully inert.
  const recordLink = `${baseUrl}/recordTransaction?${recordParams.toString().replace(/\*/g, '%2A')}`;

  // Send notifications
  const transactionFoundVars = {
    merchant: displayName,
    amount: -txn.amount,  // Use Budgett convention: negative = expense, positive = income
    date: txn.date,
    category: matchedRule && matchedRule.category_name ? matchedRule.category_name : 'Uncategorized',
    account_name: account ? (account.display_name || account.name) : 'Unknown',
    record_link: recordLink,
  };
  await sendNotifications('transaction_found', transactionFoundVars);
  await dispatchExtensionEvent('transaction_found', {
    ...transactionFoundVars,
    transaction_id: txnId,
    account_id: accountId,
    // Plaid's own categorization, not Budgett's rule-derived `category` above — extensions that
    // need to detect a specific kind of transaction (e.g. dividend/interest income) generally
    // want this rather than a Budgett category, since a user-defined rule may not exist for it.
    plaid_category: txn.personal_finance_category?.primary || null,
    plaid_category_detailed: txn.personal_finance_category?.detailed || null,
  });

  createLog('info', 'transaction_added', `Added: ${txn.merchant_name || txn.name} (${formatAmount(-txn.amount)})`);

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
    txn.personal_finance_category?.primary || null,
    JSON.stringify(txn),
    txn.transaction_id
  );

  createLog('info', 'transaction_modified', `Modified: ${txn.merchant_name || txn.name} (${formatAmount(-txn.amount)})`);
}

async function processRemovedTransaction(txn, io) {
  const existing = getTransactionByPlaidId(txn.transaction_id);
  if (!existing) {
    // The removed id may be a pending id that was already promoted to a posted
    // transaction (exact or fuzzy match) — its pending_transaction_id is kept
    // around for exactly this reconciliation, so check there before warning.
    const promoted = getTransactionByPendingId(txn.transaction_id);
    if (promoted) {
      createLog('info', 'remove_already_promoted', `Remove for pending id ${txn.transaction_id} ignored — already promoted to posted transaction ${promoted.plaid_transaction_id} (${promoted.merchant})`);
      return;
    }

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
    createLog('info', 'pending_unlinked', `Pending transaction unlinked: ${existing.merchant} (${formatAmount(existing.amount)}) — plaid_id ${txn.transaction_id} removed, moved to incomplete`);
    return;
  }

  softRemoveTransaction(txn.transaction_id);
  createLog('info', 'transaction_removed', `Soft-removed: ${txn.transaction_id} (${existing.merchant}, ${formatAmount(existing.amount)})`);

  // Auth charge auto-delete: if this hidden+auth transaction's counterpart is also removed, hard-delete both
  if (existing.is_hidden && existing.is_auth && existing.linked_transaction_id) {
    const counterpart = get('SELECT * FROM transactions WHERE id = ?', [existing.linked_transaction_id]);
    if (counterpart && counterpart.is_removed) {
      deleteTransaction(existing.id);
      deleteTransaction(counterpart.id);
      createLog('info', 'auth_pair_deleted', `Auto-deleted auth charge pair: ${existing.merchant} (${formatAmount(existing.amount)}) and counterpart #${counterpart.id}`);
    }
  }
}

module.exports = { syncTransactions };
