import React from 'react';
import { AccountChip } from '../../planning/shared';
import { formatCurrency } from '../../../utils/currency';

function BalancesTableTile({ ctx, config }) {
  const accountIds = config.accountIds || [];
  const accounts = (ctx.accounts || []).filter(a => accountIds.includes(a.id));

  if (accounts.length === 0) {
    return <div className="text-muted text-center" style={{ padding: '32px 8px' }}>No accounts selected - use the tile's "Configure" menu to pick some.</div>;
  }

  const total = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

  return (
    <table className="planning-info-table mb-0">
      <thead>
        <tr><th colSpan={2}>Balances</th></tr>
      </thead>
      <tbody>
        {accounts.map(a => (
          <tr key={a.id}>
            <td className="info-label"><AccountChip account={a} wrap /></td>
            <td className="info-value">{formatCurrency(a.current_balance || 0)}</td>
          </tr>
        ))}
        <tr style={{ fontWeight: 'bold' }}>
          <td className="info-label">Total</td>
          <td className="info-value">{formatCurrency(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default BalancesTableTile;
