/**
 * Evaluates a budget expression for a given year/month.
 * 
 * Supports:
 *   - Plain numbers: "500"
 *   - Arithmetic: "150 * sundays", "100 + 50 * mondays"
 *   - Variables: sundays, mondays, tuesdays, wednesdays, thursdays, fridays, saturdays, days, weeks
 * 
 * @param {string} expression - The budget formula
 * @param {number} year - Full year (e.g. 2025)
 * @param {number} month - 0-indexed month (0=Jan, 11=Dec)
 * @returns {number} Evaluated amount, or 0 if expression is invalid/empty
 */
export function evaluateBudgetExpression(expression, year, month) {
  if (!expression || !expression.trim()) return 0;

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Count occurrences of each day-of-week
  const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun=0, Mon=1, ...
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    dayCounts[dow]++;
  }

  const variables = {
    sundays: dayCounts[0],
    mondays: dayCounts[1],
    tuesdays: dayCounts[2],
    wednesdays: dayCounts[3],
    thursdays: dayCounts[4],
    fridays: dayCounts[5],
    saturdays: dayCounts[6],
    days: daysInMonth,
    weeks: Math.ceil(daysInMonth / 7),
  };

  try {
    // Replace variable names with their values
    let expr = expression.toLowerCase().trim();
    for (const [name, value] of Object.entries(variables)) {
      expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(value));
    }

    // Only allow numbers, operators, parens, whitespace, and decimal points
    if (!/^[\d\s+\-*/().]+$/.test(expr)) return 0;

    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  }
  catch {
    return 0;
  }
}

/**
 * Generates a random vibrant color suitable for dark backgrounds.
 * Returns a hex string like '#4ecdc4'.
 */
export function randomVibrantColor() {
  const palette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F1948A', '#82E0AA', '#F8C471', '#AED6F1', '#D2B4DE',
    '#A3E4D7', '#FAD7A0', '#D5DBDB', '#F9E79F', '#A9CCE3',
    '#E6B0AA', '#A2D9CE', '#F5CBA7', '#D4E6F1', '#FADBD8',
    '#D5F5E3', '#FCF3CF', '#D6EAF8', '#E8DAEF', '#D1F2EB',
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}
