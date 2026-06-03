const { getSetting } = require('../db/queries');

async function sendNotifications(eventType, variables) {
  const webhookUrl = getSetting('webhook_url');
  if (!webhookUrl) return;

  try {
    const body = JSON.stringify({
      content: formatMessage(eventType, variables),
      username: 'Budgett',
    });

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (err) {
    console.error(`Notification failed:`, err.message);
  }
}

function formatMessage(eventType, vars) {
  switch (eventType) {
    case 'transaction_found': {
      const prefix = vars.amount > 0
        ? 'You received the following refund: '
        : 'The following transaction was found: ';
      const dollarAmount = `$${Math.abs(vars.amount).toFixed(2)}`;
      return `${prefix}${dollarAmount} ${vars.merchant} (${vars.account_name}) [[RECORD]](<${vars.record_link}>)`;
    }
    case 'sync_complete':
      return `Syncing transactions for ${vars.institution} (${vars.added_count} added, ${vars.modified_count} modified, ${vars.removed_count} removed)`;
    case 'item_login_required':
      return `⚠️ ${vars.institution} needs to be re-authorized. Please visit: [[RE-AUTH]](<${vars.settings_link}>) to reauthorize it`;
    case 'item_login_repaired':
      return `✅ ${vars.institution} login repaired`;
    default:
      return `[${eventType}] ${JSON.stringify(vars)}`;
  }
}

module.exports = { sendNotifications };
