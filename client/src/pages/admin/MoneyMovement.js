import React, { useState, useEffect } from 'react';
import { Spinner } from 'react-bootstrap';
import { getMoneyMovement, getSettings } from '../../services/api';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';

function AccountCard({ account }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: account.color || '#1a73e8',
        borderRadius: 10,
        padding: '8px 14px',
        minWidth: 180,
      }}
    >
      {account.icon_url ? (
        <img src={account.icon_url} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />
      ) : account.logo ? (
        <img src={`data:image/png;base64,${account.logo}`} alt="" style={{ width: 28, height: 28, borderRadius: 4, flexShrink: 0 }} />
      ) : null}
      <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.9em' }}>
        {account.name || 'Unknown account'}
        {account.mask ? <span style={{ opacity: 0.75, fontWeight: 'normal' }}> (*{account.mask})</span> : ''}
      </span>
    </div>
  );
}

// A solid connecting line with a real (CSS triangle) arrowhead, and the amount centered on
// top of it. Lives in the middle (1fr) grid column, so its width — and therefore the amount's
// horizontal position — is identical for every row, keeping every amount lined up.
function Connector({ amount }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 100 }}>
      <div style={{ flex: 1, height: 2, background: 'var(--border, #3a3a4f)', position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            top: -11,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-primary)',
            padding: '0 8px',
            fontSize: '0.85em',
            fontWeight: 'bold',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatCurrency(amount)}
        </span>
      </div>
      <div
        style={{
          width: 0,
          height: 0,
          borderTop: '5px solid transparent',
          borderBottom: '5px solid transparent',
          borderLeft: '8px solid var(--border, #3a3a4f)',
          flexShrink: 0,
        }}
      />
    </div>
  );
}

function MoneyMovement() {
  const [movements, setMovements] = useState(null);
  const [dateFormatPattern, setDateFormatPattern] = useState('MMM D, YYYY');

  useEffect(() => {
    getMoneyMovement(30).then(setMovements);
    getSettings().then(s => {
      if (s.date_format) {
        setDateFormatPattern(s.date_format);
      }
    });
  }, []);

  if (!movements) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="light" style={{ width: 60, height: 60 }} />
      </div>
    );
  }

  // Group consecutive same-date movements under one date header (server already returns
  // newest-first, so this naturally keeps that order)
  const groups = [];
  for (const m of movements) {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || lastGroup.date !== m.date) {
      groups.push({ date: m.date, items: [m] });
    }
    else {
      lastGroup.items.push(m);
    }
  }

  return (
    <div>
      <h4 className="mb-1">Money Movement</h4>
      <p style={{ color: 'var(--text-secondary)' }}>Transfers between accounts over the last 30 days.</p>

      {groups.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No transfers in this period.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr max-content', columnGap: 16, rowGap: 12, alignItems: 'center' }}>
          {groups.map(group => (
            <React.Fragment key={group.date}>
              <div style={{ gridColumn: '1 / -1', fontWeight: 'bold', textDecoration: 'underline', fontSize: '1.05em', marginTop: 8 }}>
                {formatDate(group.date, dateFormatPattern)}
              </div>
              {group.items.map(m => (
                <React.Fragment key={m.id}>
                  <AccountCard account={m.from} />
                  <Connector amount={m.amount} />
                  <AccountCard account={m.to} />
                </React.Fragment>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export default MoneyMovement;
