const { getSetting } = require('../db/queries');

async function sendNotifications(eventType, variables) {
  const webhookUrl = getSetting('webhook_url');
  if (!webhookUrl) return;

  try {
    const body = JSON.stringify({
      content: formatMessage(eventType, variables),
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
    case 'transaction_found':
      return `**${vars.merchant}** ${vars.amount} on ${vars.date}\nCategory: ${vars.category}\nAccount: ${vars.account_name}\n${vars.record_link}`;
    case 'sync_complete':
      return `🔄 Sync complete for **${vars.institution}**: +${vars.added_count} added, ~${vars.modified_count} modified, -${vars.removed_count} removed`;
    case 'item_login_required':
      return `⚠️ **${vars.institution}** requires re-authentication\n${vars.settings_link}`;
    case 'item_login_repaired':
      return `✅ **${vars.institution}** login repaired`;
    default:
      return `[${eventType}] ${JSON.stringify(vars)}`;
  }
}

module.exports = { sendNotifications };
