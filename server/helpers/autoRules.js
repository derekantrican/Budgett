// Auto-creates (or extends) a Rule after the user repeatedly renames or categorizes
// the same (fuzzy-matched) merchant the same way — see ideas.md "Auto-rule creation
// from repeated user renames". A single rule can end up with both rename_to and
// category_id set, if both patterns get detected for the same merchant.
const {
  logMerchantRename, getDistinctRenameOriginals, countRenameEvents,
  logMerchantCategorization, getDistinctCategorizationMerchants, countCategorizationEvents,
  getAllRules, createRule, updateRule, createLog, getSetting,
} = require('../db/queries');
const { similarity, commonPrefix, textBeforeDigits } = require('./fuzzyMatch');

const THRESHOLD = 3; // how many times the same rename/categorization must happen before acting on it
const SIMILARITY_THRESHOLD = 0.7; // how similar two merchant strings must be to count as "the same" merchant
const MIN_PATTERN_LENGTH = 3; // reject overly broad patterns (e.g. a single shared letter)

// Defaults to enabled — absence of the setting (e.g. on an existing install that
// predates this toggle) shouldn't silently turn the feature off.
const isAutoRuleCreationEnabled = () => getSetting('auto_rule_creation_enabled') !== '0';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds any existing rule (manual or auto-created — either should count) whose
// pattern already matches something in a fuzzy-matched merchant cluster.
function findCoveringRule(cluster) {
  return getAllRules().find(r => {
    try {
      const regex = new RegExp(r.pattern, 'i');
      return cluster.some(o => regex.test(o));
    }
    catch {
      return false;
    }
  }) || null;
}

// Records a manual merchant rename and, if it's now happened often enough (after
// fuzzy-matching similar merchant name variants), auto-creates a Rule for it — or,
// if a rule already covers this merchant but has no rename_to yet, fills that in
// rather than creating a redundant second rule.
function recordMerchantRename(transactionId, originalMerchant, newMerchant) {
  if (!isAutoRuleCreationEnabled()) {
    return null;
  }

  const original = (originalMerchant || '').trim();
  const updated = (newMerchant || '').trim();

  if (!original || !updated || original === updated) {
    return null;
  }

  logMerchantRename(transactionId, original, updated);

  // All distinct original merchant strings the user has ever renamed to this same target
  const allOriginals = getDistinctRenameOriginals(updated);

  // Fuzzy-cluster: which of those are similar enough to this rename to count as "the same"
  const cluster = allOriginals.filter(o => similarity(o, original) >= SIMILARITY_THRESHOLD);

  const eventCount = countRenameEvents(updated, cluster);
  if (eventCount < THRESHOLD) {
    return null;
  }

  const covering = findCoveringRule(cluster);
  if (covering) {
    if (covering.rename_to === updated || covering.rename_to) {
      return null;
    } // already covered (same value, or a different one we shouldn't clobber)

    updateRule(covering.id, covering.pattern, covering.category_id, covering.notes_template,
      covering.amount_condition, updated, covering.is_split, covering.split_json);
    createLog('info', 'auto_rule_updated', `Auto-updated rule "${covering.pattern}": added rename to "${updated}" (after ${eventCount} manual renames)`);
    return { pattern: covering.pattern, rename_to: updated };
  }

  // The stem may contain a digit-run placeholder (e.g. "qfc #\x00") — strip that and
  // everything after it, since future real merchant names will have actual digits
  // there, not the placeholder, and Rules match by substring anyway.
  const stem = textBeforeDigits(commonPrefix(cluster));
  if (!stem || stem.length < MIN_PATTERN_LENGTH) {
    return null;
  }

  const pattern = escapeRegex(stem);

  createRule(pattern, null, null, null, updated, false, null, true);
  createLog('info', 'auto_rule_created', `Auto-created rule: "${pattern}" → rename to "${updated}" (after ${eventCount} manual renames)`);

  return { pattern, rename_to: updated };
}

// Same idea as recordMerchantRename, but for repeated manual category assignments
// (e.g. transactions with merchant "QFC" consistently get categorized as "Groceries").
function recordMerchantCategorization(transactionId, merchant, categoryId, categoryName) {
  if (!isAutoRuleCreationEnabled()) {
    return null;
  }

  const merchantTrimmed = (merchant || '').trim();

  if (!merchantTrimmed || !categoryId) {
    return null;
  }

  logMerchantCategorization(transactionId, merchantTrimmed, categoryId);

  const allMerchants = getDistinctCategorizationMerchants(categoryId);
  const cluster = allMerchants.filter(m => similarity(m, merchantTrimmed) >= SIMILARITY_THRESHOLD);

  const eventCount = countCategorizationEvents(categoryId, cluster);
  if (eventCount < THRESHOLD) {
    return null;
  }

  const covering = findCoveringRule(cluster);
  if (covering) {
    // Loose (non-strict) comparison: category_id may come back as a number from the
    // DB but as a string from the request body depending on the caller.
    if (covering.category_id == categoryId || covering.category_id) {
      return null;
    } // already covered (same category, or a different one we shouldn't clobber)

    updateRule(covering.id, covering.pattern, categoryId, covering.notes_template,
      covering.amount_condition, covering.rename_to, covering.is_split, covering.split_json);
    createLog('info', 'auto_rule_updated', `Auto-updated rule "${covering.pattern}": added category "${categoryName}" (after ${eventCount} manual categorizations)`);
    return { pattern: covering.pattern, category_id: categoryId, category_name: categoryName };
  }

  const stem = textBeforeDigits(commonPrefix(cluster));
  if (!stem || stem.length < MIN_PATTERN_LENGTH) {
    return null;
  }

  const pattern = escapeRegex(stem);

  createRule(pattern, categoryId, null, null, null, false, null, true);
  createLog('info', 'auto_rule_created', `Auto-created rule: "${pattern}" → category "${categoryName}" (after ${eventCount} manual categorizations)`);

  return { pattern, category_id: categoryId, category_name: categoryName };
}

module.exports = { recordMerchantRename, recordMerchantCategorization };
