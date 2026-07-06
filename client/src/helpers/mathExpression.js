// Evaluates a spreadsheet-style math expression: +, -, *, /, parentheses, and
// CEILING(x, step) / FLOOR(x, step) / ROUND(x, step), which all round to the
// nearest multiple of "step" (Excel-style), e.g. CEILING(4.42, 0.05) = 4.45.
//
// `variables` is an optional { name: value } map substituted into the expression
// before evaluation.
//
// NOTE: this file is intentionally mirrored at server/helpers/mathExpression.js.
// Tried collapsing this to one physical file (server reaching into client/src,
// since only the client's bundler restricts cross-directory imports) — Node's
// require() side works fine, but CRA's webpack requires real ES `export` syntax
// for any local sibling file and has no CommonJS-interop fallback for it (unlike
// node_modules packages), so a `module.exports`-based file fails to bundle no
// matter how it's imported (named or default). Making this genuinely shared would
// need CRACO/ejecting to relax that, or converting the server to ESM — both too
// heavy for a ~40-line helper, so keep both copies in sync by hand instead.
export function evaluateMathExpression(expression, variables = {}) {
  if (!expression || !expression.trim())
    return null;

  let expr = expression.trim().replace(/^=/, '');

  for (const [name, value] of Object.entries(variables))
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'gi'), `(${value})`);

  // Validate BEFORE substituting function names to Math.* calls — otherwise the
  // letters in "Math.ceil" etc. would fail this same check.
  const withoutFunctionNames = expr.replace(/CEILING|FLOOR|ROUND/gi, '');
  if (!/^[\d\s+\-*/().,]*$/.test(withoutFunctionNames))
    return null;

  expr = expr
    .replace(/CEILING\(([^,]+),\s*([^)]+)\)/gi, '(Math.ceil(($1)/($2))*($2))')
    .replace(/FLOOR\(([^,]+),\s*([^)]+)\)/gi, '(Math.floor(($1)/($2))*($2))')
    .replace(/ROUND\(([^,]+),\s*([^)]+)\)/gi, '(Math.round(($1)/($2))*($2))');

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr});`)();
    return typeof result === 'number' && isFinite(result) ? result : null;
  }
  catch {
    return null;
  }
}
