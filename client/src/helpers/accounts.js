// Merges each account's parent item's display/institution color onto the account object -
// AccountChip (client/src/components/planning/shared.js) reads `account.institution_color`,
// but that field lives on the item, not the account row itself, so anywhere accounts are
// loaded for use with AccountChip needs this merge first (Planning views, dashboard tiles).
export function withInstitutionColors(accounts, items) {
  const colorByItemId = new Map(items.map(i => [i.id, i.display_color || i.institution_color]));
  return accounts.map(a => ({ ...a, institution_color: colorByItemId.get(a.item_id) || null }));
}
