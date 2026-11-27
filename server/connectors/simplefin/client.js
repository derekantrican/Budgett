// SimpleFIN HTTP calls (https://www.simplefin.org/protocol.html). Nothing here knows about
// Budgett's database; see ./index.js for normalization and ./sync.js for polling.

class SimplefinHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'SimplefinHttpError';
    this.status = status;
  }
}

// An access URL carries its credentials in the userinfo part (https://user:pass@host/path).
// Node's fetch refuses URLs with embedded credentials, so they're moved into a Basic auth header.
function splitAccessUrl(accessUrl) {
  const url = new URL(accessUrl);
  if (url.protocol !== 'https:') {
    throw new Error('SimpleFIN access URL must use https');
  }

  const authorization = `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`;
  url.username = '';
  url.password = '';
  return { baseUrl: url.toString().replace(/\/$/, ''), authorization };
}

// A setup token is a base64-encoded, one-time claim URL. POSTing to it (empty body) returns the
// long-lived access URL as plain text. 403 = invalid or already claimed.
async function claimAccessUrl(setupToken) {
  let claimUrl;
  try {
    claimUrl = new URL(Buffer.from(String(setupToken).trim(), 'base64').toString('utf-8').trim());
  }
  catch {
    throw new SimplefinHttpError(400, 'That doesn\'t look like a SimpleFIN setup token');
  }

  if (claimUrl.protocol !== 'https:') {
    throw new SimplefinHttpError(400, 'That doesn\'t look like a SimpleFIN setup token');
  }

  const response = await fetch(claimUrl, { method: 'POST', body: '' });
  if (response.status === 403) {
    throw new SimplefinHttpError(403, 'SimpleFIN rejected the setup token (it may have already been used). Create a new one in SimpleFIN Bridge.');
  }

  if (!response.ok) {
    throw new SimplefinHttpError(response.status, `SimpleFIN claim failed (${response.status})`);
  }

  const accessUrl = (await response.text()).trim();
  splitAccessUrl(accessUrl); // validates
  return accessUrl;
}

// GET {access url}/accounts. `startDate` is inclusive and `endDate` exclusive, as unix seconds.
// SimpleFIN Bridge caps a request at 90 days. Requests protocol v2 (connections + conn_id); a
// v1-only server ignores the parameter and answers in v1 shape, which ./index.js also handles.
async function getAccounts(accessUrl, { startDate, endDate, pending = true, balancesOnly = false } = {}) {
  const { baseUrl, authorization } = splitAccessUrl(accessUrl);
  const url = new URL(`${baseUrl}/accounts`);
  url.searchParams.set('version', '2');
  if (startDate != null) {
    url.searchParams.set('start-date', String(startDate));
  }

  if (endDate != null) {
    url.searchParams.set('end-date', String(endDate));
  }

  if (pending) {
    url.searchParams.set('pending', '1');
  }

  if (balancesOnly) {
    url.searchParams.set('balances-only', '1');
  }

  const response = await fetch(url, { headers: { Authorization: authorization } });
  if (response.status === 403) {
    throw new SimplefinHttpError(403, 'SimpleFIN authentication failed (access revoked or invalid)');
  }

  if (response.status === 402) {
    throw new SimplefinHttpError(402, 'SimpleFIN Bridge requires payment');
  }

  if (!response.ok) {
    throw new SimplefinHttpError(response.status, `SimpleFIN accounts request failed (${response.status})`);
  }

  return response.json();
}

module.exports = { SimplefinHttpError, splitAccessUrl, claimAccessUrl, getAccounts };
