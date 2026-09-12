import React from 'react';
import { Dropdown, Form } from 'react-bootstrap';
import { formatCurrency } from '../../utils/currency';

// Two-column label/value table used by several Planning views (Emergency Fund, Retirement).
// Pass className="wide-value-column" when the value side needs more room (e.g. stacked
// account chips) than the default 42%/58% split.
export function InfoTable({ title, rows, className }) {
  return (
    <table className={`planning-info-table mb-3${className ? ` ${className}` : ''}`}>
      <thead>
        <tr><th colSpan={2}>{title}</th></tr>
      </thead>
      <tbody>
        {rows.map(({ key, label, value }) => (
          <tr key={key}>
            <td className="info-label">{label}</td>
            <td className="info-value">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function sumBalances(accounts, ids) {
  return accounts
    .filter(a => ids.includes(a.id))
    .reduce((sum, a) => sum + (a.current_balance || 0), 0);
}

export function AccountChip({ account, extra, wrap }) {
  return (
    <span
      className="account-chip"
      style={wrap ? { backgroundColor: account.institution_color || '#1a73e8', flexWrap: 'wrap', maxWidth: '100%' } : { backgroundColor: account.institution_color || '#1a73e8' }}
    >
      {/* Wraps at word boundaries between the name and amount, but never inside either one -
          word-break: break-word would otherwise split a number like "$80,488.83" mid-digit. */}
      <span style={wrap ? { whiteSpace: 'normal', overflowWrap: 'normal' } : undefined}>{account.display_name || account.name}</span>
      {extra && <span className="account-chip-extra" style={wrap ? { whiteSpace: 'nowrap' } : undefined}>{extra}</span>}
    </span>
  );
}

// Single-account version of AccountMultiSelect below - same chip styling, but picking one
// account selects it and closes the dropdown instead of toggling a checklist.
export function AccountSelect({ idPrefix, accounts, selectedId, onChange, placeholder = 'Choose account…' }) {
  const selectedAccount = accounts.find(a => String(a.id) === String(selectedId));

  return (
    <Dropdown>
      <Dropdown.Toggle
        id={`${idPrefix}-toggle`}
        variant="outline-light"
        className="account-multiselect-toggle"
      >
        <span className="chip-row">
          {selectedAccount
            ? <AccountChip account={selectedAccount} />
            : <span className="text-muted">{placeholder}</span>}
        </span>
        <svg className="toggle-arrow" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
        </svg>
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ maxHeight: 280, overflowY: 'auto', width: '100%' }}>
        {accounts.map(a => (
          <Dropdown.Item
            key={a.id}
            className="account-multiselect-item"
            active={String(a.id) === String(selectedId)}
            onClick={() => onChange(a.id)}
          >
            <AccountChip account={a} extra={formatCurrency(a.current_balance || 0)} />
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export function AccountMultiSelect({ idPrefix, accounts, selectedIds, onToggle, placeholder = 'Select account(s)…' }) {
  const selectedAccounts = accounts.filter(a => selectedIds.includes(a.id));

  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle
        id={`${idPrefix}-toggle`}
        variant="outline-light"
        className="account-multiselect-toggle"
      >
        <span className="chip-row">
          {selectedAccounts.length > 0
            ? selectedAccounts.map(a => <AccountChip key={a.id} account={a} />)
            : <span className="text-muted">{placeholder}</span>}
        </span>
        <svg className="toggle-arrow" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
        </svg>
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ maxHeight: 280, overflowY: 'auto', width: '100%' }}>
        {accounts.map(a => (
          <Dropdown.ItemText
            key={a.id}
            className="account-multiselect-item"
            onClick={() => onToggle(a.id)}
          >
            <Form.Check
              type="checkbox"
              id={`${idPrefix}-${a.id}`}
              checked={selectedIds.includes(a.id)}
              onChange={() => onToggle(a.id)}
              onClick={(e) => e.stopPropagation()}
              className="mb-0"
            />
            <AccountChip account={a} extra={formatCurrency(a.current_balance || 0)} />
          </Dropdown.ItemText>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
