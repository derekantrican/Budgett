const { getAllEndpoints } = require('../db/queries');

async function sendNotifications(eventType, variables) {
  const allEndpoints = getAllEndpoints();

  for (const endpoint of allEndpoints) {
    const eventTypes = JSON.parse(endpoint.event_types_json || '[]');
    if (eventTypes.length > 0 && !eventTypes.includes(eventType)) {
      continue;
    }

    try {
      const body = interpolateTemplate(endpoint.body_template, variables);

      await fetch(endpoint.url, {
        method: endpoint.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    }
    catch (err) {
      console.error(`Notification failed for endpoint ${endpoint.name}:`, err.message);
    }
  }
}

function interpolateTemplate(template, variables) {
  if (!template) {
    return JSON.stringify(variables);
  }

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

module.exports = { sendNotifications, interpolateTemplate };
