// Example Budgett extension server hook. Exported function names must match the event
// vocabulary used in server/webhookHandlers/transactionSync.js (same names as the Discord
// notification events): transaction_found, sync_complete, sync_details, sync_update, rule_matched.
module.exports = {
  async transaction_found(api, vars) {
    const log = (await api.getData('log')) || [];
    log.unshift({
      merchant: vars.merchant,
      amount: vars.amount,
      date: vars.date,
      seen_at: new Date().toISOString(),
    });
    await api.setData('log', log.slice(0, 50));
  },
};
