// Evaluates a spreadsheet-style math expression: +, -, *, /, parentheses, and
// CEILING(x, step) / FLOOR(x, step) / ROUND(x, step), which all round to the
// nearest multiple of "step" (Excel-style), e.g. CEILING(4.42, 0.05) = 4.45.
//
// `variables` is an optional { name: value } map substituted into the expression
// before evaluation, e.g. { amount: -42.5 } lets a rule reference "amount".
//
// NOTE: this file is intentionally mirrored at client/src/helpers/mathExpression.js.
// See the comment there for why a single shared file isn't practical (CRA's
// webpack has no CommonJS-interop fallback for local sibling files) — keep both
// copies in sync by hand.
function evaluateMathExpression(expression, variables = {}) {
  if (!expression || !expression.trim()) {
    return null;
  }

  let expr = expression.trim().replace(/^=/, '');

  for (const [name, value] of Object.entries(variables)) {
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'gi'), `(${value})`);
  }

  // Validate BEFORE substituting function names to Math.* calls — otherwise the
  // letters in "Math.ceil" etc. would fail this same check.
  const withoutFunctionNames = expr.replace(/CEILING|FLOOR|ROUND/gi, '');
  if (!/^[\d\s+\-*/().,]*$/.test(withoutFunctionNames)) {
    return null;
  }

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

module.exports = { evaluateMathExpression };
