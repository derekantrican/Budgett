// Spotting a bank account that's already linked (e.g. through Plaid) when it's about to be linked
// again (e.g. through SimpleFIN). Each connector has its own ids, so nothing ties the two copies
// together and every transaction would arrive twice; this compares what the user would recognize
// instead: the bank's name, the account number's last 4 digits, the account name and the balance.
const { all } = require('../db/queries');

// Words that don't tell two banks apart ("Chase Bank" vs "JPMorgan Chase" should still match)
const BANK_STOPWORDS = new Set(['bank', 'banks', 'credit', 'union', 'cu', 'financial', 'federal', 'savings', 'national',
  'na', 'fsb', 'of', 'the', 'and', 'co', 'company', 'inc', 'corp', 'corporation', 'association', 'group', 'trust',
  'online', 'banking', 'usa', 'us', 'america', 'card', 'cards', 'services']);

const words = (text) => String(text || '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
const bankWords = (name) => new Set(words(name).filter(w => w.length >= 3 && !BANK_STOPWORDS.has(w)));

function sameBank(a, b) {
  const wa = bankWords(a);
  return [...bankWords(b)].some(w => wa.has(w));
}

// Plaid gives a mask; SimpleFIN only has the name, which usually ends with the last 4 ("Checking ...1234")
function lastFour(account) {
  if (account.mask) {
    return String(account.mask).slice(-4);
  }

  const match = String(account.name || '').match(/(\d{4})\D*$/);
  return match ? match[1] : null;
}

const accountWords = (name) => words(name).filter(w => !/\d/.test(w)).join(' ');

// Connectors disagree on sign (Plaid: card owed is positive, SimpleFIN: negative), so compare magnitudes
function sameBalance(a, b) {
  if (a == null || b == null || a === 0 || b === 0) {
    return false;
  }

  return Math.abs(Math.abs(a) - Math.abs(b)) < 0.005;
}

// Why `candidate` (an account about to be linked) looks like `existing`, or null if it doesn't
function matchReasons(candidate, candidateBank, existing) {
  const bank = sameBank(candidateBank, existing.institution_name);
  const candidateLast4 = lastFour(candidate);
  const existingLast4 = lastFour(existing);
  const last4 = candidateLast4 && existingLast4 && candidateLast4 === existingLast4;
  const balance = sameBalance(candidate.currentBalance, existing.current_balance);
  const name = accountWords(candidate.name) !== '' && accountWords(candidate.name) === accountWords(existing.name);

  const isMatch = (last4 && (bank || balance))
    || (bank && balance)
    // Same bank and account name, and no account numbers that say otherwise
    || (bank && name && !(candidateLast4 && existingLast4));
  if (!isMatch) {
    return null;
  }

  return [
    bank && 'same bank',
    last4 && `account ending ${candidateLast4}`,
    name && 'same account name',
    balance && 'same balance',
  ].filter(Boolean);
}

// accounts: [{ name, mask?, currentBalance? }] about to be linked from `institutionName`.
// Returns one entry per account that looks already linked: { account, matches: [{ ...existing, reasons }] }.
function findLinkedDuplicates(institutionName, accounts, { excludeInstitutionIds = [] } = {}) {
  const existing = all(`
    SELECT a.id, a.name, a.display_name, a.mask, a.current_balance, i.id AS institution_id, i.provider,
           COALESCE(i.display_name, i.name) AS institution_name
    FROM accounts a JOIN institutions i ON i.id = a.institution_id`)
    .filter(a => !excludeInstitutionIds.includes(a.institution_id));

  const results = [];
  for (const account of accounts || []) {
    const matches = existing
      .map(e => ({ e, reasons: matchReasons(account, institutionName, e) }))
      .filter(m => m.reasons)
      .map(({ e, reasons }) => ({
        account_id: e.id,
        account_name: e.display_name || e.name,
        institution_id: e.institution_id,
        institution_name: e.institution_name,
        provider: e.provider,
        reasons,
      }));
    if (matches.length > 0) {
      results.push({ account: { name: account.name, mask: account.mask || null }, matches });
    }
  }

  return results;
}

module.exports = { findLinkedDuplicates, lastFour, sameBank };
