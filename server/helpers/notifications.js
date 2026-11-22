const { getSetting, createWebhookPayload } = require('../db/queries');
const { formatAmount } = require('./format');

// Escape Discord markdown special characters in data-derived text (merchant names, account/
// institution names, etc.) so a value like "ORC*00WFX2Y" can't be interpreted as formatting
// and corrupt the rest of a message — e.g. a stray "*" pairing up with another special
// character later in the message and swallowing/breaking a link that follows it.
function escapeDiscordMarkdown(text) {
  if (text === null || text === undefined) {
    return text;
  }

  return String(text).replace(/([*_~`|>\\])/g, '\\$1');
}

async function sendNotifications(eventType, variables) {
  const webhookUrl = getSetting('webhook_url');
  if (!webhookUrl) {
    return;
  }

  const { content, embeds } = normalizeMessage(formatMessage(eventType, variables));

  try {
    const body = JSON.stringify({
      content,
      ...(embeds ? { embeds } : {}),
      username: 'Budgett',
    });

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    // Log outgoing webhook
    createWebhookPayload(eventType, JSON.stringify({ content, ...(embeds ? { embeds } : {}) }), 'outgoing', webhookUrl);
  }
  catch (err) {
    const logger = require('./logger');
    logger.error('notification_failed', `${eventType}: ${err.message}`);
    createWebhookPayload(`${eventType}_FAILED`, JSON.stringify({ error: err.message, content }), 'outgoing', webhookUrl);
  }
}

// formatMessage returns either a plain string (content only) or { content, embeds }.
function normalizeMessage(message) {
  return typeof message === 'string' ? { content: message } : message;
}

// Discord's mobile push notifications expand masked [text](url) links to the full raw URL, both
// in message content and in embed descriptions. An embed's `url` field isn't part of any text,
// so sending the message as an embed whose (clickable) title links to the URL keeps the raw URL
// out of the notification. Discord caps embed titles at 256 characters.
function linkedTitleMessage(title, url) {
  return { embeds: [{ title: title.length > 256 ? `${title.slice(0, 255)}…` : title, url }] };
}

function formatMessage(eventType, vars) {
  switch (eventType) {
    case 'transaction_found': {
      const prefix = vars.amount > 0
        ? 'You received the following refund: '
        : 'The following transaction was found: ';
      return linkedTitleMessage(`${prefix}${formatAmount(vars.amount)} ${escapeDiscordMarkdown(vars.merchant)} (${escapeDiscordMarkdown(vars.account_name)})`, vars.record_link);
    }

    case 'sync_complete':
      return `Syncing transactions for ${escapeDiscordMarkdown(vars.institution)} (${vars.added_count} added, ${vars.modified_count} modified, ${vars.removed_count} removed)`;
    case 'sync_details':
      return vars.details;
    case 'sync_update':
      return vars.message;
    case 'item_login_required':
      return `⚠️ ${escapeDiscordMarkdown(vars.institution)} needs to be re-authorized. Please visit: [[RE-AUTH]](<${vars.settings_link}>) to reauthorize it`;
    case 'item_login_repaired':
      return `✅ ${escapeDiscordMarkdown(vars.institution)} login repaired`;
    case 'rule_matched':
      return `📋 Rule "${escapeDiscordMarkdown(vars.pattern)}" matched for ${escapeDiscordMarkdown(vars.merchant)}`
        + `${vars.rename_to ? ` → renamed to ${escapeDiscordMarkdown(vars.rename_to)}` : ''}`
        + `${vars.category_name ? `, categorized as ${escapeDiscordMarkdown(vars.category_name)}` : ''}`;
    default:
      return `[${eventType}] ${JSON.stringify(vars)}`;
  }
}

module.exports = { sendNotifications, escapeDiscordMarkdown };
