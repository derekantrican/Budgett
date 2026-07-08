// Small dependency-free string-similarity helpers used to cluster merchant name
// variants (e.g. "QFC #1234" vs "QFC #5678") for auto-rule creation.

// A control character that can never appear in real merchant name text, used as a
// placeholder for digit runs — distinct from any literal character that might
// already be in the name (e.g. the "#" in "QFC #1234"), so callers that need to
// separate "was a digit run" from "was already there" (like building a regex
// pattern from a stem) can split on it unambiguously.
const DIGIT_PLACEHOLDER = '\x00';

// Lowercases and collapses any run of digits to a placeholder, so store numbers/
// reference codes that vary transaction-to-transaction (e.g. "QFC #1234" vs
// "QFC #5678") don't tank the similarity score just because the digits themselves
// differ in every position — plain edit distance treats "1234" vs "5678" as maximally
// different even though neither number carries any merchant-identifying signal.
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\d+/g, DIGIT_PLACEHOLDER)
    .trim()
    .replace(/\s+/g, ' ');
}

// Standard Levenshtein edit distance (insert/delete/substitute) between two strings.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) {
    return n;
  }

  if (n === 0) {
    return m;
  }

  const prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  const currRow = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,
        prevRow[j] + 1,
        prevRow[j - 1] + cost
      );
    }

    for (let j = 0; j <= n; j++) {
      prevRow[j] = currRow[j];
    }
  }

  return prevRow[n];
}

// 0..1 similarity ratio (1 = identical), based on normalized edit distance.
function similarity(a, b) {
  const normA = normalize(a), normB = normalize(b);
  if (!normA || !normB) {
    return 0;
  }

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) {
    return 1;
  }

  return 1 - levenshtein(normA, normB) / maxLen;
}

// Longest common prefix shared by every string in the list (whitespace-trimmed).
// Used to derive a rule pattern that generalizes across a cluster of fuzzy-matched
// merchant name variants, e.g. ["qfc \x001234", "qfc \x005678"] -> "qfc \x00".
function commonPrefix(strings) {
  if (strings.length === 0) {
    return '';
  }

  let prefix = normalize(strings[0]);
  for (const s of strings.slice(1)) {
    const norm = normalize(s);
    let i = 0;
    while (i < prefix.length && i < norm.length && prefix[i] === norm[i]) {
      i++;
    }

    prefix = prefix.slice(0, i);
  }

  return prefix.trim();
}

// The literal (non-digit-placeholder) text at the start of a normalized stem —
// i.e. what a stem looks like with any trailing digit-run placeholder and
// everything after it dropped. Used to build a regex pattern that will actually
// match future raw merchant names (which have real digits, not the placeholder).
function textBeforeDigits(stem) {
  return stem.split(DIGIT_PLACEHOLDER)[0].trim();
}

module.exports = { normalize, levenshtein, similarity, commonPrefix, textBeforeDigits };
