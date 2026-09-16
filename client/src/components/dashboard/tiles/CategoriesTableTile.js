import React, { useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';
import { getTransactions } from '../../../services/api';
import { evaluateCategoryBudget, categorySpent } from '../../../helpers/categoryBudget';
import { formatCurrency } from '../../../utils/currency';
import TileLoading from '../TileLoading';

// Budgeted | Spent | Remaining for a chosen set of categories, for the current month.
function CategoriesTableTile({ ctx, config }) {
  const [transactions, setTransactions] = useState(null);
  const now = new Date();

  useEffect(() => {
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setTransactions(null);
    getTransactions(startDate, endDate).then(setTransactions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.getFullYear(), now.getMonth()]);

  const categoryIds = config.categoryIds || [];
  const categories = (ctx.categories || []).filter(c => categoryIds.includes(c.id));

  if (categories.length === 0) {
    return <div className="text-muted text-center" style={{ padding: '32px 8px' }}>No categories selected - use the tile's "Configure" menu to pick some.</div>;
  }

  if (!transactions) {
    return <TileLoading />;
  }

  const rows = categories.map(cat => {
    const budgeted = evaluateCategoryBudget(cat, ctx.incomeSources, now.getFullYear(), now.getMonth(), 'month');
    const spent = categorySpent(cat, transactions);
    return { cat, budgeted, spent, remaining: budgeted - Math.abs(spent) };
  });

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Table striped hover variant="dark" size="sm" className="mb-0">
        <thead>
          <tr>
            <th>Category</th>
            <th className="text-end">Budgeted</th>
            <th className="text-end">Spent</th>
            <th className="text-end">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ cat, budgeted, spent, remaining }) => (
            <tr key={cat.id}>
              <td>{cat.name}</td>
              <td className="text-end">{budgeted ? formatCurrency(budgeted) : '—'}</td>
              <td className="text-end">{formatCurrency(spent)}</td>
              <td className="text-end" style={{ color: remaining >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(remaining)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default CategoriesTableTile;
