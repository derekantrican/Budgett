// Points every Plaid Item already stored in Budgett's DB at Budgett's webhook URL,
// via /item/webhook/update. No re-link required — just needs each item's access_token.
//
// Usage:
//   node server/scripts/migrate_webhooks.js [webhookUrl] [--dry-run]
//
// If webhookUrl is omitted, uses `${WEBHOOK_URL}/api/webhook` from .env.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { getAllItems } = require('../db/queries');
const { plaidClient } = require('../routes/link');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const webhookUrl = args.find(a => !a.startsWith('--')) || (process.env.WEBHOOK_URL ? `${process.env.WEBHOOK_URL}/api/webhook` : null);

  if (!webhookUrl) {
    console.error('No webhook URL provided and WEBHOOK_URL is not set in .env.');
    console.error('Usage: node server/scripts/migrate_webhooks.js [webhookUrl] [--dry-run]');
    process.exit(1);
  }

  const items = getAllItems();
  if (items.length === 0) {
    console.log('No items found in the database.');
    return;
  }

  console.log(`${dryRun ? '[dry run] ' : ''}Updating ${items.length} item(s) to webhook: ${webhookUrl}`);

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    const label = item.institution_name || item.plaid_item_id;
    if (dryRun) {
      console.log(`  [dry run] would update ${label} with webhook: ${webhookUrl}`);
      continue;
    }

    try {
      await plaidClient.itemWebhookUpdate({
        access_token: item.plaid_access_token,
        webhook: webhookUrl,
      });
      console.log(`  ok: ${label}`);
      succeeded++;
    }
    catch (err) {
      console.error(`  failed: ${label} - ${err.response?.data?.error_message || err.message}`);
      failed++;
    }
  }

  if (!dryRun) {
    console.log(`Done. ${succeeded} succeeded, ${failed} failed.`);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
