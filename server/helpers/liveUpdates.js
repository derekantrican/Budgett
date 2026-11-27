// Live updates: tells every open browser tab when data changes so it can refetch, without the
// user refreshing the page. Each change is broadcast over socket.io as
//   DATA_CHANGED { resources: ['transactions', ...] }
// and the client's useLiveUpdates hook reloads any page that depends on one of those resources.
//
// The tab that made the change is skipped (it already updates itself after its own request) - the
// client sends its socket id in the X-Socket-Id header for that.

const DATA_CHANGED_EVENT = 'DATA_CHANGED';

// Which resources a successful write under /api/<segment> can affect. Anything not listed here
// just affects the resource of the same name.
const RESOURCES_BY_ROUTE = {
  // Merging/deleting a category reassigns transaction splits
  categories: ['categories', 'transactions'],
  // Account names/visibility show up in the transaction table
  accounts: ['accounts', 'transactions'],
  // Connecting, removing or re-syncing an institution can add/remove accounts and transactions
  institutions: ['institutions', 'accounts', 'transactions'],
  connectors: ['institutions', 'accounts', 'transactions'],
  // Plaid's webhook stores the payload; any sync it triggers broadcasts separately when it finishes
  webhook: ['webhooks'],
};

// Never broadcast for these (logging in/out changes no data)
const IGNORED_ROUTES = new Set(['auth']);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Broadcast a change. `exceptSocketId` (optional) is the tab that made the change.
function broadcastChange(io, resources, exceptSocketId = null) {
  if (!io || !resources?.length) {
    return;
  }

  const target = exceptSocketId ? io.except(exceptSocketId) : io;
  target.emit(DATA_CHANGED_EVENT, { resources });
}

// Express middleware (mount at the app level, before the API routes): after any successful write
// to /api/*, broadcasts the affected resources.
function liveUpdatesMiddleware(io) {
  return (req, res, next) => {
    if (!WRITE_METHODS.has(req.method) || !req.path.startsWith('/api/')) {
      return next();
    }

    const segment = req.path.split('/')[2];
    if (!segment || IGNORED_ROUTES.has(segment)) {
      return next();
    }

    res.on('finish', () => {
      if (res.statusCode < 400) {
        const originSocketId = req.headers['x-socket-id'] || null;
        broadcastChange(io, RESOURCES_BY_ROUTE[segment] || [segment], originSocketId);
      }
    });

    next();
  };
}

module.exports = { DATA_CHANGED_EVENT, broadcastChange, liveUpdatesMiddleware };
