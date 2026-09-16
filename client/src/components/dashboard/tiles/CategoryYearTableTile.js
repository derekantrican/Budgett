import React, { useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';
import { getTransactions } from '../../../services/api';
import { buildCategoryMonthlyTotals, filterCategoriesForTile } from '../../../helpers/categorySpend';
import { formatCurrency } from '../../../utils/currency';
import TileLoading from '../TileLoading';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Categories down the left, Jan-Dec across the top, one cell per month's spend - for the
// current calendar year.
function CategoryYearTableTile({ ctx, config }) {
  const [transactions, setTransactions] = useState(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    setTransactions(null);
    getTransactions(`${year}-01-01`, `${year}-12-31`).then(setTransactions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  if (!transactions) {
    return <TileLoading />;
  }

  const categories = filterCategoriesForTile((ctx.categories || []).filter(c => !c.is_hidden), config);
  const { totalsByCategoryId, uncategorized } = buildCategoryMonthlyTotals(categories, transactions);

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Table striped hover variant="dark" size="sm" className="mb-0">
        <thead style={{ position: 'sticky', top: 0 }}>
          <tr>
            <th>Category</th>
            {MONTH_LABELS.map(m => <th key={m} className="text-end">{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {categories.map(cat => {
            const monthly = totalsByCategoryId.get(cat.id);
            return (
              <tr key={cat.id}>
                <td>{cat.name}</td>
                {monthly.map((amt, i) => (
                  <td key={i} className="text-end">{amt ? formatCurrency(amt) : '—'}</td>
                ))}
              </tr>
            );
          })}
          {uncategorized.some(v => v !== 0) && (
            <tr style={{ fontStyle: 'italic' }}>
              <td>Uncategorized</td>
              {uncategorized.map((amt, i) => (
                <td key={i} className="text-end">{amt ? formatCurrency(amt) : '—'}</td>
              ))}
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}

export default CategoryYearTableTile;
