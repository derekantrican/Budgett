import React from 'react';
import { CategoryPieMonthTile, CategoryPieYearTile } from './tiles/CategoryPieTile';
import CategoryYearTableTile from './tiles/CategoryYearTableTile';
import { LoanAmortizationGraphTile, LoanAmortizationOverviewTile } from './tiles/LoanAmortizationTiles';
import { RetirementGraphTile, RetirementOverviewTile } from './tiles/RetirementTiles';
import { EmergencyFundGraphTile, EmergencyFundTableTile } from './tiles/EmergencyFundTiles';
import BalancesTableTile from './tiles/BalancesTableTile';
import CategoriesTableTile from './tiles/CategoriesTableTile';
import IncomeCardsTile from './tiles/IncomeCardsTile';
import ExtensionTile from './tiles/ExtensionTile';
import {
  LoanViewPicker, RetirementViewPicker, EmergencyFundViewPicker, AccountsConfigForm, CategoriesConfigForm,
  CategoryFilterConfigForm, IncomeConfigForm,
} from './configForms';

// A handful of small inline-SVG thumbnails, in the same style as Planning's AddViewModal.
function PieThumbnail() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%">
      <circle cx="50" cy="30" r="22" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
      <path d="M50,30 L50,8 A22,22 0 0,1 70,42 Z" fill="var(--accent)" opacity="0.8" />
      <path d="M50,30 L70,42 A22,22 0 0,1 34,48 Z" fill="var(--success)" opacity="0.8" />
    </svg>
  );
}

function TableThumbnail() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%">
      <rect x="6" y="8" width="88" height="44" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
      <line x1="6" y1="22" x2="94" y2="22" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="6" y1="36" x2="94" y2="36" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="38" y1="8" x2="38" y2="52" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="66" y1="8" x2="66" y2="52" stroke="var(--border)" strokeWidth="1.5" />
    </svg>
  );
}

function LineThumbnail() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%">
      <polyline points="4,10 4,50 96,50" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
      <path d="M4,40 C 30,44 55,20 96,10" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CardsThumbnail() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%">
      <rect x="6" y="10" width="60" height="24" rx="3" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <rect x="20" y="26" width="60" height="24" rx="3" fill="none" stroke="var(--success)" strokeWidth="1.5" />
    </svg>
  );
}

function ExtensionThumbnail() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%">
      <rect x="18" y="14" width="64" height="32" rx="4" fill="none" stroke="var(--warning)" strokeWidth="1.5" />
      <circle cx="50" cy="30" r="6" fill="var(--warning)" opacity="0.6" />
    </svg>
  );
}

const matching = (ctx, type) => (ctx.planningViews || []).filter(v => v.type === type);
const hasAny = (ctx, type) => matching(ctx, type).length > 0;
const autoBindDefault = (ctx, type) => ({ viewId: matching(ctx, type)[0]?.id });

// The floor every tile type can be resized down to, regardless of its (larger) defaultSize -
// users should be able to shrink any tile quite small if they want, even a busy one like the
// year table. In DashboardGrid.js's grid units (rowHeight 28px, margin 16px), h=4 works out to
// ~160px tall, and w=2 to ~150-200px wide on a typical desktop-width column - roughly a
// 150x150px floor, snapped to whole grid cells.
const MIN_W = 2;
const MIN_H = 4;

// Registry of built-in dashboard tile types, in the same shape/spirit as Planning's
// VIEW_TYPES registry. `availability(ctx)` hides/disables types that need a Planning view
// which doesn't exist yet. Every type always gets a config step when added (AddTileModal.js) -
// at minimum the universal title override (TileTitleField), plus whatever type-specific
// settings `ConfigForm` adds (a type with none simply omits `ConfigForm`).
const BUILTIN_TILE_TYPES = [
  {
    type: 'category_pie_month',
    label: 'Category Spending (This Month)',
    description: 'Pie chart of spending by category for the current month.',
    Thumbnail: PieThumbnail,
    defaultSize: { w: 5, h: 10 },
    minW: MIN_W,
    minH: MIN_H,
    availability: () => true,
    getDefaultConfig: () => ({ categoryIds: [] }),
    ConfigForm: CategoryFilterConfigForm,
    Component: CategoryPieMonthTile,
  },
  {
    type: 'category_pie_year',
    label: 'Category Spending (This Year)',
    description: 'Pie chart of spending by category for the current year.',
    Thumbnail: PieThumbnail,
    defaultSize: { w: 5, h: 10 },
    minW: MIN_W,
    minH: MIN_H,
    availability: () => true,
    getDefaultConfig: () => ({ categoryIds: [] }),
    ConfigForm: CategoryFilterConfigForm,
    Component: CategoryPieYearTile,
  },
  {
    type: 'category_year_table',
    label: 'Category Spending Table (Year)',
    description: 'Every category\'s spend for each month of the current year.',
    Thumbnail: TableThumbnail,
    defaultSize: { w: 12, h: 10 },
    minW: MIN_W,
    minH: MIN_H,
    availability: () => true,
    getDefaultConfig: () => ({ categoryIds: [] }),
    ConfigForm: CategoryFilterConfigForm,
    Component: CategoryYearTableTile,
  },
  {
    type: 'loan_amortization_graph',
    label: 'Loan Balance Graph',
    description: 'Balance pay-down over time for a Loan Amortization view.',
    Thumbnail: LineThumbnail,
    defaultSize: { w: 6, h: 9 },
    minW: MIN_W,
    minH: MIN_H,
    availability: (ctx) => hasAny(ctx, 'loan_amortization'),
    getDefaultConfig: (ctx) => autoBindDefault(ctx, 'loan_amortization'),
    ConfigForm: LoanViewPicker,
    Component: LoanAmortizationGraphTile,
  },
  {
    type: 'loan_amortization_overview',
    label: 'Loan Overview',
    description: 'Remaining balance, interest/principal paid so far, and payoff date.',
    Thumbnail: TableThumbnail,
    defaultSize: { w: 4, h: 7 },
    minW: MIN_W,
    minH: MIN_H,
    availability: (ctx) => hasAny(ctx, 'loan_amortization'),
    getDefaultConfig: (ctx) => autoBindDefault(ctx, 'loan_amortization'),
    ConfigForm: LoanViewPicker,
    Component: LoanAmortizationOverviewTile,
  },
  {
    type: 'retirement_graph',
    label: 'Retirement Growth Graph',
    description: 'Projected balance over time (below/average/above scenarios).',
    Thumbnail: LineThumbnail,
    defaultSize: { w: 6, h: 9 },
    minW: MIN_W,
    minH: MIN_H,
    availability: (ctx) => hasAny(ctx, 'retirement'),
    getDefaultConfig: (ctx) => autoBindDefault(ctx, 'retirement'),
    ConfigForm: RetirementViewPicker,
    Component: RetirementGraphTile,
  },
  {
    type: 'retirement_overview',
    label: 'Retirement Overview',
    description: 'Projected balance at retirement for each scenario.',
    Thumbnail: TableThumbnail,
    defaultSize: { w: 4, h: 7 },
    minW: MIN_W,
    minH: MIN_H,
    availability: (ctx) => hasAny(ctx, 'retirement'),
    getDefaultConfig: (ctx) => autoBindDefault(ctx, 'retirement'),
    ConfigForm: RetirementViewPicker,
    Component: RetirementOverviewTile,
  },
  {
    type: 'emergency_fund_graph',
    label: 'Emergency Fund Graph',
    description: 'Projected fund depletion over time, including backup if configured.',
    Thumbnail: LineThumbnail,
    defaultSize: { w: 6, h: 8 },
    minW: MIN_W,
    minH: MIN_H,
    availability: (ctx) => hasAny(ctx, 'emergency_fund'),
    getDefaultConfig: (ctx) => autoBindDefault(ctx, 'emergency_fund'),
    ConfigForm: EmergencyFundViewPicker,
    Component: EmergencyFundGraphTile,
  },
  {
    type: 'emergency_fund_table',
    label: 'Emergency Fund Overview',
    description: 'Fund and backup balances, target amount, and months covered - combined.',
    Thumbnail: TableThumbnail,
    defaultSize: { w: 5, h: 9 },
    minW: MIN_W,
    minH: MIN_H,
    availability: (ctx) => hasAny(ctx, 'emergency_fund'),
    getDefaultConfig: (ctx) => autoBindDefault(ctx, 'emergency_fund'),
    ConfigForm: EmergencyFundViewPicker,
    Component: EmergencyFundTableTile,
  },
  {
    type: 'balances_table',
    label: 'Account Balances',
    description: 'Current balances for accounts you choose.',
    Thumbnail: TableThumbnail,
    defaultSize: { w: 4, h: 7 },
    minW: MIN_W,
    minH: MIN_H,
    availability: () => true,
    getDefaultConfig: () => ({ accountIds: [] }),
    ConfigForm: AccountsConfigForm,
    Component: BalancesTableTile,
  },
  {
    type: 'categories_table',
    label: 'Category Budget Status',
    description: 'Budgeted, spent, and remaining for categories you choose, this month.',
    Thumbnail: TableThumbnail,
    defaultSize: { w: 5, h: 8 },
    minW: MIN_W,
    minH: MIN_H,
    availability: () => true,
    getDefaultConfig: () => ({ categoryIds: [] }),
    ConfigForm: CategoriesConfigForm,
    Component: CategoriesTableTile,
  },
  {
    type: 'income_cards',
    label: 'Income',
    description: 'The same income source cards as the Income tab.',
    Thumbnail: CardsThumbnail,
    defaultSize: { w: 6, h: 8 },
    minW: MIN_W,
    minH: MIN_H,
    availability: () => true,
    getDefaultConfig: () => ({ incomeSourceIds: null }),
    ConfigForm: IncomeConfigForm,
    Component: IncomeCardsTile,
  },
];

// Extension-provided tiles, one registry entry per {extension, tile} pair declared in the
// extension's manifest.json (client.tiles). Always "available" since they're only listed at
// all once the extension itself is loaded; rendering (and thus actually running the
// extension's script) is deferred to ExtensionTile until the tile is placed on the grid.
function extensionTileTypes(ctx) {
  return (ctx.extensions || []).flatMap(ext => (ext.tiles || []).map(t => ({
    type: `ext:${ext.slug}:${t.id}`,
    label: t.label,
    description: t.description || `Provided by the "${ext.name}" extension.`,
    Thumbnail: ExtensionThumbnail,
    defaultSize: { w: 4, h: 7 },
    minW: MIN_W,
    minH: MIN_H,
    availability: () => true,
    getDefaultConfig: () => ({ extensionSlug: ext.slug, tileId: t.id }),
    Component: ExtensionTile,
  })));
}

export function getTileTypes(ctx) {
  return [...BUILTIN_TILE_TYPES, ...extensionTileTypes(ctx)];
}

export function getTileType(type, ctx) {
  return getTileTypes(ctx || {}).find(tt => tt.type === type) || null;
}
