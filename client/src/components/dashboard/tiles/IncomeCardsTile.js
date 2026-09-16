import React from 'react';
import IncomeSourceCard from '../../income/IncomeSourceCard';

// Mirrors the cards on the Income tab, restricted to a chosen subset (or every active source
// by default).
function IncomeCardsTile({ ctx, config }) {
  const activeSources = (ctx.incomeSources || []).filter(s => !s.is_archived);
  const sources = config.incomeSourceIds
    ? activeSources.filter(s => config.incomeSourceIds.includes(s.id))
    : activeSources;

  if (sources.length === 0) {
    return <div className="text-muted text-center" style={{ padding: '32px 8px' }}>No income sources to show.</div>;
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexWrap: 'wrap', gap: 16, alignContent: 'flex-start' }}>
      {sources.map(source => (
        <IncomeSourceCard key={source.id} source={source} dateFormat={ctx.dateFormat} style={{ width: 320 }} />
      ))}
    </div>
  );
}

export default IncomeCardsTile;
