// Format a YYYY-MM-DD date string according to a format pattern (e.g. 'MMM D, YYYY')
export function formatDate(dateStr, pattern) {
  if (!dateStr) {
    return '';
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return pattern
    .replace('YYYY', y)
    .replace('YY', String(y).slice(-2))
    .replace('MMMM', monthsFull[m - 1])
    .replace('MMM', months[m - 1])
    .replace('MM', String(m).padStart(2, '0'))
    .replace('DD', String(d).padStart(2, '0'))
    .replace(/\bD\b/, d);
}
