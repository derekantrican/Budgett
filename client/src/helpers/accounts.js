// Merges each account's parent institution's display/institution color onto the account object -
// AccountChip (client/src/components/planning/shared.js) reads `account.institution_color`,
// but that field lives on the institution, not the account row itself, so anywhere accounts are
// loaded for use with AccountChip needs this merge first (Planning views, dashboard tiles).
export function withInstitutionColors(accounts, institutions) {
  const colorByInstitutionId = new Map(institutions.map(c => [c.id, c.display_color || c.color]));
  return accounts.map(a => ({ ...a, institution_color: colorByInstitutionId.get(a.institution_id) || null }));
}
