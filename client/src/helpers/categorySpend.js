// Category spending aggregation shared by the dashboard's pie-chart and year-table tiles
// (and originally the old Summary page's single hardcoded pie chart).

// Narrows `categories` down to a tile's configured subset, if any - config.categoryIds is
// only ever a positive filter (never empty-means-none), so an empty/missing list means
// "show every category" rather than "show nothing".
export function filterCategoriesForTile(categories, config) {
  if (!config?.categoryIds || config.categoryIds.length === 0) {
    return categories || [];
  }

  return (categories || []).filter(c => config.categoryIds.includes(c.id));
}

// Builds pie-chart-ready { name, value, color } entries (one per category with spend > 0,
// plus an "Uncategorized" slice) from a set of transactions already scoped to the desired
// date range. Amounts follow the app-wide convention (negative = expense), so only negative
// totals are charted, shown as positive magnitudes.
export function buildCategoryPieData(categories, transactions) {
  const chartData = [];

  for (const cat of categories) {
    const spent = transactions
      .filter(t => t.splits?.some(s => s.category_id === cat.id))
      .reduce((sum, t) => {
        const catSplits = t.splits.filter(s => s.category_id === cat.id);
        return sum + catSplits.reduce((s, split) => s + split.amount, 0);
      }, 0);

    if (spent < 0) {
      chartData.push({ name: cat.name, value: Math.abs(spent), color: cat.color || `hsl(${Math.random() * 360}, 60%, 50%)` });
    }
  }

  const uncategorized = transactions.reduce((sum, t) => {
    if (!t.splits || t.splits.length === 0) {
      return sum + t.amount;
    }

    const uncatSplits = t.splits.filter(s => !s.category_id);
    return sum + uncatSplits.reduce((s, split) => s + split.amount, 0);
  }, 0);

  if (uncategorized < 0) {
    chartData.push({ name: 'Uncategorized', value: Math.abs(uncategorized), color: '#6c757d' });
  }

  return chartData;
}

// Buckets a full year's transactions into one spend total per category per month (0-11),
// plus an "Uncategorized" row, for the category year table tile. Parses the month directly
// out of the 'YYYY-MM-DD' string (rather than `new Date(t.date)`) to avoid local-timezone
// shifting a transaction into the wrong month near midnight.
export function buildCategoryMonthlyTotals(categories, transactions) {
  const totalsByCategoryId = new Map(categories.map(c => [c.id, new Array(12).fill(0)]));
  const uncategorized = new Array(12).fill(0);

  for (const t of transactions) {
    const month = Number(t.date.slice(5, 7)) - 1;

    if (!t.splits || t.splits.length === 0) {
      uncategorized[month] += t.amount;
      continue;
    }

    for (const split of t.splits) {
      if (split.category_id && totalsByCategoryId.has(split.category_id)) {
        totalsByCategoryId.get(split.category_id)[month] += split.amount;
      }
      else if (!split.category_id) {
        uncategorized[month] += split.amount;
      }
    }
  }

  return { totalsByCategoryId, uncategorized };
}
