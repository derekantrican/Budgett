// Core institution lifecycle shared by every connector's "connect" flow.
const { createInstitution, createAccount, getInstitutionById } = require('../db/queries');
const { syncInstitution } = require('./sync');

// Persist a newly-authorized institution and its accounts, then run the initial sync.
// `accounts` are connector NormalizedAccounts. Returns the stored institution row.
async function addInstitution({ provider, externalId, credentials, name = null, providerInstitutionId = null, accounts = [] }, io) {
  const result = createInstitution(provider, externalId, JSON.stringify(credentials), name, providerInstitutionId);
  const institutionId = result.lastInsertRowid;

  for (const acct of accounts) {
    createAccount(institutionId, acct);
  }

  const institution = getInstitutionById(institutionId);
  await syncInstitution(institution, io);
  return institution;
}

module.exports = { addInstitution };
