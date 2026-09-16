import React from 'react';
import { Form } from 'react-bootstrap';
import { AccountMultiSelect } from '../planning/shared';

// Shown in the "Add Tile" modal's config step when a loan/retirement/emergency-fund tile has
// more than one matching Planning view to choose from (when there's exactly one, tileTypes.js
// auto-binds to it and skips this step entirely).
function planningViewPicker(viewType, label) {
  return function PlanningViewPicker({ ctx, config, onChange }) {
    const matches = (ctx.planningViews || []).filter(v => v.type === viewType);
    return (
      <Form.Group className="mb-3">
        <Form.Label>{label}</Form.Label>
        <Form.Select value={config.viewId || ''} onChange={(e) => onChange({ viewId: Number(e.target.value) })}>
          <option value="">— Choose —</option>
          {matches.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </Form.Select>
      </Form.Group>
    );
  };
}

export const LoanViewPicker = planningViewPicker('loan_amortization', 'Which loan?');
export const RetirementViewPicker = planningViewPicker('retirement', 'Which retirement view?');
export const EmergencyFundViewPicker = planningViewPicker('emergency_fund', 'Which emergency fund?');

export function AccountsConfigForm({ ctx, config, onChange }) {
  return (
    <Form.Group className="mb-3">
      <Form.Label>Accounts</Form.Label>
      <AccountMultiSelect
        idPrefix="dashboard-tile-accounts"
        accounts={ctx.accounts || []}
        selectedIds={config.accountIds || []}
        onToggle={(id) => {
          const current = config.accountIds || [];
          onChange({ accountIds: current.includes(id) ? current.filter(x => x !== id) : [...current, id] });
        }}
      />
    </Form.Group>
  );
}

// Shared checkbox list used by both CategoriesConfigForm (must pick which to show) and
// CategoryFilterConfigForm (picking narrows an otherwise-"show everything" tile).
function CategoryChecklist({ ctx, selectedIds, onToggle }) {
  const categories = (ctx.categories || []).filter(c => !c.is_hidden);
  return (
    <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      {categories.map(c => (
        <Form.Check
          key={c.id}
          type="checkbox"
          id={`dashboard-tile-category-${c.id}`}
          label={c.name}
          checked={selectedIds.includes(c.id)}
          onChange={() => onToggle(c.id)}
        />
      ))}
    </div>
  );
}

export function CategoriesConfigForm({ ctx, config, onChange }) {
  const selectedIds = config.categoryIds || [];
  const toggle = (id) => {
    onChange({ categoryIds: selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id] });
  };

  return (
    <Form.Group className="mb-3">
      <Form.Label>Categories</Form.Label>
      <CategoryChecklist ctx={ctx} selectedIds={selectedIds} onToggle={toggle} />
    </Form.Group>
  );
}

// Used by tiles that otherwise show every category (the category pie/year-table tiles) -
// nothing selected means "show all"; picking any narrows it down to just those.
export function CategoryFilterConfigForm({ ctx, config, onChange }) {
  const selectedIds = config.categoryIds || [];
  const toggle = (id) => {
    onChange({ categoryIds: selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id] });
  };

  return (
    <Form.Group className="mb-3">
      <Form.Label>Categories</Form.Label>
      <Form.Text className="text-muted d-block mb-2">Leave none checked to show every category.</Form.Text>
      <CategoryChecklist ctx={ctx} selectedIds={selectedIds} onToggle={toggle} />
    </Form.Group>
  );
}

// Every tile gets this, in addition to whatever type-specific settings it has (or, for tile
// types with no settings of their own, as the only thing in its "Configure" dialog) - see
// AddTileModal.js and ConfigureTileModal.js, which always render it first, above a type's own
// ConfigForm, if any. An empty value falls back to the tile type's own default label.
export function TileTitleField({ config, defaultLabel, onChange }) {
  return (
    <Form.Group className="mb-3">
      <Form.Label>Tile Title</Form.Label>
      <Form.Control
        value={config.title || ''}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder={defaultLabel}
      />
    </Form.Group>
  );
}

export function IncomeConfigForm({ ctx, config, onChange }) {
  const sources = (ctx.incomeSources || []).filter(s => !s.is_archived);
  // null/undefined means "all active sources" - only becomes an explicit list once the user
  // unchecks at least one.
  const selectedIds = config.incomeSourceIds ?? sources.map(s => s.id);
  const toggle = (id) => {
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
    onChange({ incomeSourceIds: next });
  };

  return (
    <Form.Group className="mb-3">
      <Form.Label>Income Sources</Form.Label>
      <Form.Text className="text-muted d-block mb-2">Defaults to every active income source.</Form.Text>
      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
        {sources.map(s => (
          <Form.Check
            key={s.id}
            type="checkbox"
            id={`dashboard-tile-income-${s.id}`}
            label={s.name}
            checked={selectedIds.includes(s.id)}
            onChange={() => toggle(s.id)}
          />
        ))}
      </div>
    </Form.Group>
  );
}
