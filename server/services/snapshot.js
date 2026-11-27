// Snapshot support for connectors with no change feed (capabilities.syncMode 'snapshot', e.g.
// SimpleFIN). Such a connector just returns "every transaction in this date window"; this module
// decides which window to ask for and turns the answer into the same { added, modified, removed }
// shape a change-feed connector like Plaid produces, so both go through one reconcile pipeline
// (services/sync.js applyChanges).
const { getAccountsByInstitution, getTransactionByExternalId, getTransactionByExternalPendingId,
  getLinkedTransactionsForAccounts, getOldestPendingDate } = require('../db/queries');

const DEFAULT_OVERLAP_DAYS = 7; // re-fetch this far behind the last sync to catch late edits/posts
const DEFAULT_INITIAL_DAYS = 90; // history to pull on an institution's first sync

const toDateString = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
// last_synced_at is SQLite datetime('now'): UTC 'YYYY-MM-DD HH:MM:SS'
const parseSqliteUtc = (value) => new Date(`${value.replace(' ', 'T')}Z`);

// Pure: the date window ('YYYY-MM-DD', inclusive) to fetch. Starts `overlapDays` before the last
// sync (or `initialDays` back on the first one), and further back if needed to reach the oldest
// transaction still pending, so the snapshot can say what became of it.
function computeSnapshotWindow({ lastSyncedAt = null, oldestPendingDate = null, today = new Date(),
  overlapDays = DEFAULT_OVERLAP_DAYS, initialDays = DEFAULT_INITIAL_DAYS } = {}) {
  const endDate = toDateString(today);
  let startDate = lastSyncedAt
    ? toDateString(addDays(parseSqliteUtc(lastSyncedAt), -overlapDays))
    : toDateString(addDays(today, -initialDays));

  if (oldestPendingDate && oldestPendingDate < startDate) {
    startDate = oldestPendingDate;
  }

  if (startDate > endDate) {
    startDate = endDate;
  }

  return { startDate, endDate };
}

function planSnapshotWindow(institution, options = {}) {
  const accountIds = getAccountsByInstitution(institution.id).map(a => a.id);
  return computeSnapshotWindow({
    lastSyncedAt: institution.last_synced_at,
    oldestPendingDate: getOldestPendingDate(accountIds),
    ...options,
  });
}

// Compare a snapshot against what Budgett already has for this institution.
//
//   snapshot: { accounts: NormalizedAccount[], transactions: NormalizedTxn[],
//               window: { startDate, endDate } }  // the window the snapshot fully covers
//
// - added:    ids Budgett has never stored, either as a transaction's own id or as the old
//             pending id of one that has since posted. A posted transaction arriving under a new
//             id is just "added"; applyChanges' fuzzy pending match then promotes the pending
//             row it replaces.
// - modified: known transactions whose amount or pending flag changed. Other fields are left
//             alone on purpose: the stored merchant is often a rule rename or a user edit, so
//             comparing it would report (and overwrite) every renamed transaction on every sync.
// - removed:  only PENDING transactions on accounts the snapshot includes, dated inside its
//             window, that the snapshot no longer lists. A posted transaction missing from a
//             snapshot is never removed: providers can trim history or drop a page, and silently
//             deleting real spending is worse than keeping a stale row. Without a window,
//             nothing is removed.
function diffSnapshot(institution, { accounts = [], transactions = [], window = null }) {
  const accountIdByExternalId = new Map(getAccountsByInstitution(institution.id).map(a => [a.external_id, a.id]));

  const snapshotTxns = new Map();
  for (const txn of transactions) {
    snapshotTxns.set(txn.externalId, txn); // a provider repeating an id: keep the last copy
  }

  const added = [];
  const modified = [];
  for (const txn of snapshotTxns.values()) {
    const existing = getTransactionByExternalId(txn.externalId);
    if (!existing) {
      if (!getTransactionByExternalPendingId(txn.externalId)) {
        added.push(txn);
      }

      continue;
    }

    if (existing.is_removed) {
      continue; // Budgett deliberately removed it (e.g. merged away); don't resurrect it every sync
    }

    const amountChanged = Math.abs(existing.amount - txn.amount) >= 0.005;
    const pendingChanged = Boolean(existing.is_pending) !== Boolean(txn.pending);
    if (amountChanged || pendingChanged) {
      modified.push(txn);
    }
  }

  let removed = [];
  if (window?.startDate && window?.endDate) {
    const coveredAccountIds = accounts.map(a => accountIdByExternalId.get(a.externalId)).filter(id => id != null);
    removed = getLinkedTransactionsForAccounts(coveredAccountIds, window.startDate, window.endDate)
      .filter(row => row.is_pending && !row.is_removed && !snapshotTxns.has(row.external_id))
      .map(row => ({ externalId: row.external_id }));
  }

  return { added, modified, removed };
}

module.exports = { computeSnapshotWindow, planSnapshotWindow, diffSnapshot };
