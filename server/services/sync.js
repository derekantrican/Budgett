// Connector-agnostic sync. Two stages:
//   1. Fetch, which depends on the connector's syncMode:
//      - 'changes' (Plaid): the connector returns { added, modified, removed } itself.
//      - 'snapshot' (no change feed): the connector returns every transaction in a date window,
//        and services/snapshot.js diffs that against the DB into the same shape.
//   2. applyChanges: reconcile into Budgett (pending→posted promotion, incomplete-transaction
//      matching, rules, notifications, extension events). Connectors only fetch and normalize;
//      everything about how Budgett stores and reacts to a transaction lives here.
const { getConnectorFor } = require('../connectors');
const { updateInstitutionSyncState, markInstitutionSynced, createTransaction, getTransactionByExternalId,
  getTransactionByExternalPendingId, softRemoveTransaction, restoreTransaction,
  createLog, createSplit, getAllRules, updateTransactionFromPending,
  updateTransactionProviderData, setTransactionPending, getAccountByExternalId, getSetting,
  findIncompleteMatches, linkIncompleteTransaction,
  findFuzzyPendingMatch, promotePendingToPosted, unlinkExternalId,
  createAccount, updateAccountBalance, updateInstitutionStatus } = require('../db/queries');
const { planSnapshotWindow, diffSnapshot } = require('./snapshot');
const { matchRule } = require('../helpers/rules');
const { sendNotifications, escapeDiscordMarkdown } = require('../helpers/notifications');
const { dispatchExtensionEvent } = require('./extensionLoader');
const { formatAmount } = require('../helpers/format');
const { evaluateMathExpression } = require('../helpers/mathExpression');

const institutionLabel = (institution) =>
  `${institution.external_id} (${institution.display_name || institution.name || institution.provider})`;

// Fetch and apply everything new for one institution, whatever its connector's sync mode.
async function syncInstitution(institution, io) {
  const connector = getConnectorFor(institution);

  if (connector.capabilities?.syncMode === 'snapshot') {
    const requestedWindow = planSnapshotWindow(institution);
    const snapshot = await connector.fetchSnapshot(institution, requestedWindow);
    // The connector reports the window it actually covered (a provider may cap history)
    return ingestSnapshot(institution, { window: requestedWindow, ...snapshot }, io);
  }

  const label = institutionLabel(institution);
  createLog('info', 'sync_started', `Starting sync for institution ${label}`);

  const { added, modified, removed, syncState } = await connector.fetchChanges(institution);
  updateInstitutionSyncState(syncState ? JSON.stringify(syncState) : null, institution.id);

  const changes = { added, modified, removed };
  await applyChanges(institution, changes, io);
  await refreshBalances(institution, connector);
  finishSync(institution, io);
  return changes;
}

// Apply a snapshot (see services/snapshot.js for its shape) to one institution. Called by
// syncInstitution for snapshot-mode connectors; also callable directly by a connector whose
// single fetch covers several institutions, once per institution with its share of the data.
async function ingestSnapshot(institution, snapshot, io) {
  const label = institutionLabel(institution);
  createLog('info', 'sync_started', `Starting snapshot sync for institution ${label} (${snapshot.window?.startDate} to ${snapshot.window?.endDate})`);

  // Accounts first, so the snapshot's transactions resolve to them. A snapshot carries balances
  // too, so there's no separate balance fetch like the changes path does.
  for (const acct of snapshot.accounts || []) {
    const dbAccount = getAccountByExternalId(institution.id, acct.externalId);
    if (dbAccount) {
      updateAccountBalance(acct.currentBalance, acct.availableBalance, dbAccount.id);
    }
    else {
      createAccount(institution.id, acct);
      createLog('info', 'account_added', `New account from ${label}: ${acct.name}`);
    }
  }

  const changes = diffSnapshot(institution, snapshot);
  if (snapshot.syncState !== undefined) {
    updateInstitutionSyncState(snapshot.syncState ? JSON.stringify(snapshot.syncState) : null, institution.id);
  }

  await applyChanges(institution, changes, io);
  finishSync(institution, io);
  return changes;
}

async function refreshBalances(institution, connector) {
  const label = institutionLabel(institution);
  try {
    for (const acct of await connector.fetchAccounts(institution)) {
      const dbAccount = getAccountByExternalId(institution.id, acct.externalId);
      if (dbAccount) {
        updateAccountBalance(acct.currentBalance, acct.availableBalance, dbAccount.id);
      }
    }

    createLog('info', 'balances_updated', `Updated balances for institution ${label}`);
  }
  catch (e) {
    const { loginRequired, code, message } = connector.classifyError(e);
    if (loginRequired) {
      updateInstitutionStatus('login_required', institution.id);
    }

    createLog('warn', 'balance_update_failed', `Failed to update balances for institution ${label}: ${code || message}`);
  }
}

function finishSync(institution, io) {
  markInstitutionSynced(institution.id);
  if (io) {
    io.emit('SYNC_COMPLETE', { institution_id: institution.id });
  }
}

// Reconcile one batch of normalized changes into Budgett: summary notifications first, then
// each transaction (which sends its own notifications).
async function applyChanges(institution, { added: allAdded = [], modified: allModified = [], removed: allRemoved = [] }, io) {
  const label = institutionLabel(institution);

  // Send sync summary notification FIRST
  if (allAdded.length > 0 || allModified.length > 0 || allRemoved.length > 0) {
    const instName = institution.display_name || institution.name || institution.external_id;
    const syncCompleteVars = {
      institution: instName,
      added_count: String(allAdded.length),
      modified_count: String(allModified.length),
      removed_count: String(allRemoved.length),
    };
    await sendNotifications('sync_complete', syncCompleteVars);
    await dispatchExtensionEvent('sync_complete', syncCompleteVars);

    // Send detailed listing of added/modified/removed
    let details = '';
    if (allAdded.length > 0) {
      details += 'Added transactions:\n\n';
      details += allAdded.map(t => `- ${formatAmount(t.amount)} ${escapeDiscordMarkdown(t.merchant)}`).join('\n');
      details += '\n\n';
    }

    if (allModified.length > 0) {
      details += 'Modified transactions:\n\n';
      details += allModified.map(t => `- ${formatAmount(t.amount)} ${escapeDiscordMarkdown(t.merchant)}`).join('\n');
      details += '\n\n';
    }

    if (allRemoved.length > 0) {
      details += 'Removed transactions:\n\n';
      details += allRemoved.map(r => {
        // Check if removed txn matches an external pending id in added (pending→posted)
        const match = allAdded.find(a => a.externalPendingId === r.externalId);
        if (match) {
          return `- ${r.externalId} (was: ${formatAmount(match.amount)} ${escapeDiscordMarkdown(match.merchant)})`;
        }

        return `- ${r.externalId}`;
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
    await processAddedTransaction(txn, institution, io);
  }

  for (const txn of allModified) {
    await processModifiedTransaction(txn);
  }

  for (const txn of allRemoved) {
    await processRemovedTransaction(txn);
  }

  createLog('info', 'sync_completed', `Sync completed for institution ${label}`);
}

// The name sync would give this transaction: the provider's merchant, renamed by the first
// matching enabled rule (disabled rules still exist for display/re-enabling, just don't apply).
function syncDisplayName(txn) {
  const rules = getAllRules().filter(r => !r.is_disabled);
  const matchedRule = matchRule(rules, txn.merchant, txn.amount);
  return { matchedRule, displayName: matchedRule?.rename_to || txn.merchant };
}

async function processAddedTransaction(txn, institution, io) {
  const existing = getTransactionByExternalId(txn.externalId);
  if (existing) {
    if (existing.is_removed) {
      restoreTransaction(txn.externalId);
      createLog('info', 'transaction_restored', `Restored: ${txn.merchant} (${formatAmount(txn.amount)})`);

    }

    return;
  }

  // Check if this matches a pending transaction. The provider's pending id points at the
  // ORIGINAL pending transaction's own external_id, so look it up there (that row's
  // external_pending_id column is unrelated — it's always null for a pending transaction,
  // since it doesn't reference a prior pending version of itself).
  let matchedPending = null;
  if (txn.externalPendingId) {
    matchedPending = getTransactionByExternalId(txn.externalPendingId);
  }

  if (matchedPending) {
    // Pending→Posted: update the external id and amount, and the name only if the user hasn't
    // edited it (see SYNC_MERCHANT in db/queries.js); categories/notes are untouched
    updateTransactionFromPending(
      txn.externalId,
      txn.amount,
      matchedPending.id,
      matchedPending.external_id,
      syncDisplayName(txn).displayName
    );
    createLog('info', 'pending_matched', `Pending→Posted: ${txn.merchant} (${formatAmount(txn.amount)})`);
    await sendNotifications('sync_update', { message: `UPDATED (posted matched by pending id): ${escapeDiscordMarkdown(txn.merchant)}` });
    await dispatchExtensionEvent('sync_update', { message: `UPDATED (posted matched by pending id): ${txn.merchant}` });
    return;
  }

  // Resolve account (used by fuzzy match and transaction creation)
  const account = getAccountByExternalId(institution.id, txn.externalAccountId);
  const accountId = account ? account.id : null;

  // Check for incomplete transactions (no external id, same amount, date proximity, same account or similar merchant)
  const incompleteMatches = findIncompleteMatches(txn.amount, txn.date, txn.merchant, accountId);
  if (incompleteMatches.length === 1) {
    const incompleteMatch = incompleteMatches[0];
    linkIncompleteTransaction(txn.externalId, txn.pending ? 1 : 0, incompleteMatch.id);
    createLog('info', 'incomplete_matched', `Linked to incomplete txn #${incompleteMatch.id}: ${txn.merchant} (${formatAmount(txn.amount)})`);
    await sendNotifications('sync_update', { message: `UPDATED (matched incomplete by amount): ${escapeDiscordMarkdown(txn.merchant)}` });
    await dispatchExtensionEvent('sync_update', { message: `UPDATED (matched incomplete by amount): ${txn.merchant}` });
    return;
  }
  else if (incompleteMatches.length > 1) {
    // Ambiguous: multiple incomplete transactions could plausibly be this one (e.g. two
    // same-amount manual entries with no merchant set). Guessing wrong would silently
    // attach this transaction's data to the wrong entry — refuse and fall through to
    // creating a new transaction instead. Worst case is a visible duplicate the user can
    // clean up, which beats an invisible wrong merge.
    createLog('warn', 'incomplete_match_ambiguous',
      `Skipped auto-linking for ${txn.merchant} (${formatAmount(txn.amount)}) — ${incompleteMatches.length} incomplete candidates matched (ids: ${incompleteMatches.map(m => m.id).join(', ')}), creating new transaction to avoid a wrong merge`);
  }

  // Fuzzy match: posted transaction without an external pending id link
  // Look for a recent pending transaction on the same account with exact amount OR similar merchant
  if (!txn.pending && accountId) {
    const fuzzyMatch = findFuzzyPendingMatch(accountId, txn.amount, txn.date, txn.merchant || '');
    if (fuzzyMatch) {
      promotePendingToPosted(txn.externalId, txn.amount, fuzzyMatch.id, fuzzyMatch.external_id, syncDisplayName(txn).displayName);
      createLog('info', 'fuzzy_pending_matched',
        `Posted txn matched pending #${fuzzyMatch.id} (${fuzzyMatch.merchant}): external id ${fuzzyMatch.external_id} → ${txn.externalId}, amount ${fuzzyMatch.amount} → ${txn.amount}`);
      await sendNotifications('sync_update', { message: `UPDATED (fuzzy matched pending): ${escapeDiscordMarkdown(txn.merchant)} → ${escapeDiscordMarkdown(fuzzyMatch.merchant)}` });
      await dispatchExtensionEvent('sync_update', { message: `UPDATED (fuzzy matched pending): ${txn.merchant} → ${fuzzyMatch.merchant}` });
      return;
    }
  }

  const merchantName = txn.merchant;
  const { matchedRule, displayName } = syncDisplayName(txn);

  // Insert new transaction (use renamed merchant if rule specifies). Recording the same name as
  // provider_merchant marks it as sync-owned until the user edits it.
  const result = createTransaction(
    txn.externalId,
    txn.externalPendingId || null,
    accountId,
    txn.date,
    displayName,
    txn.amount,
    txn.pending ? 1 : 0,
    txn.providerCategory || null,
    JSON.stringify(txn.raw),
    displayName
  );

  const txnId = result.lastInsertRowid;

  if (matchedRule) {
    if (matchedRule.is_split && matchedRule.split_json) {
      const splits = JSON.parse(matchedRule.split_json);
      for (const split of splits) {
        let splitAmount = txn.amount;
        if (split.amount_expression) {
          const result = evaluateMathExpression(split.amount_expression, { amount: txn.amount });
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
      createSplit(txnId, matchedRule.category_id || null, txn.amount, matchedRule.notes_template || null);
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
    externalid: txn.externalId,
    date: txn.date,
    where: displayName,
    amount: String(txn.amount),
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
    amount: txn.amount,  // Budgett convention: negative = expense, positive = income
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
    provider: institution.provider,
    // The provider's own categorization, not Budgett's rule-derived `category` above — extensions
    // that need to detect a specific kind of transaction (e.g. dividend/interest income) generally
    // want this rather than a Budgett category, since a user-defined rule may not exist for it.
    provider_category: txn.providerCategory || null,
    provider_category_detailed: txn.providerCategoryDetailed || null,
  });

  createLog('info', 'transaction_added', `Added: ${txn.merchant} (${formatAmount(txn.amount)})`);

  if (io) {
    io.emit('NEW_TRANSACTION', { id: txnId, merchant: txn.merchant, amount: txn.amount });
  }
}

async function processModifiedTransaction(txn) {
  const existing = getTransactionByExternalId(txn.externalId);
  if (!existing) {
    // A pending id whose posted version was just promoted earlier in this same batch
    if (getTransactionByExternalPendingId(txn.externalId)) {
      createLog('info', 'modify_already_promoted', `Modify for pending id ${txn.externalId} ignored — already promoted to a posted transaction`);
      return;
    }

    createLog('warn', 'modify_not_found', `Attempted to modify transaction ${txn.externalId} (${txn.merchant}, ${formatAmount(txn.amount)}), but could not find it`);
    return;
  }

  // Renamed the same way as a new transaction; only applied if the user hasn't edited the name
  updateTransactionProviderData(
    txn.amount,
    syncDisplayName(txn).displayName,
    txn.providerCategory || null,
    JSON.stringify(txn.raw),
    txn.externalId
  );

  // Plaid posts under a new id (handled as added + removed), but a snapshot provider may flip
  // `pending` on the same id
  if (typeof txn.pending === 'boolean' && txn.pending !== Boolean(existing.is_pending)) {
    setTransactionPending(txn.pending, txn.externalId);
  }

  createLog('info', 'transaction_modified', `Modified: ${txn.merchant} (${formatAmount(txn.amount)})`);
}

async function processRemovedTransaction(txn) {
  const existing = getTransactionByExternalId(txn.externalId);
  if (!existing) {
    // The removed id may be a pending id that was already promoted to a posted
    // transaction (exact or fuzzy match) — its external_pending_id is kept
    // around for exactly this reconciliation, so check there before warning.
    const promoted = getTransactionByExternalPendingId(txn.externalId);
    if (promoted) {
      createLog('info', 'remove_already_promoted', `Remove for pending id ${txn.externalId} ignored — already promoted to posted transaction ${promoted.external_id} (${promoted.merchant})`);
      return;
    }

    // Neither a posted nor a pending record exists for this id — it was never
    // recorded here at all, not just missed. This is expected (not a bug) when
    // syncs are infrequent: a pending transaction (e.g. an auth hold) can be
    // created and cancelled by the bank entirely within the gap between two
    // syncs, and Plaid's sync cursor doesn't backfill the "added" event for
    // something already invalidated by the time we ask — we just get told to
    // remove an id we never had a chance to see. Nothing to reconcile.
    createLog('info', 'remove_never_seen', `Remove for transaction ${txn.externalId} ignored — it was never added here (likely created and cancelled between infrequent syncs)`);
    return;
  }

  if (existing.is_removed) {
    createLog('info', 'already_removed', `Transaction ${txn.externalId} already marked removed, skipping`);
    return;
  }

  // If the transaction is pending, don't delete it — strip the external id so it
  // shows up in "incomplete transactions" and user-specified data is preserved.
  // (The posted version likely already exists as a separate entry.)
  if (existing.is_pending) {
    unlinkExternalId(existing.id);
    createLog('info', 'pending_unlinked', `Pending transaction unlinked: ${existing.merchant} (${formatAmount(existing.amount)}) — external id ${txn.externalId} removed, moved to incomplete`);
    return;
  }

  softRemoveTransaction(txn.externalId);
  createLog('info', 'transaction_removed', `Soft-removed: ${txn.externalId} (${existing.merchant}, ${formatAmount(existing.amount)})`);
}

module.exports = { syncInstitution, ingestSnapshot, applyChanges };
