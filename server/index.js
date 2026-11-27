const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { init: initDb, startPeriodicCheckpoint } = require('./db/init');
const { initQueries } = require('./db/queries');
const { errorHandler } = require('./middleware/errorHandler');
const { scanExtensions } = require('./services/extensionLoader');
const { initAuth, requireApiAuth, requireSocketAuth, authRouter } = require('./middleware/auth');
const { liveUpdatesMiddleware } = require('./helpers/liveUpdates');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(requireApiAuth); // no-op unless REQUIRE_LOGIN=true
io.use(requireSocketAuth);

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Tell other open tabs when a write changes data, so they refetch (see helpers/liveUpdates.js)
app.use(liveUpdatesMiddleware(io));

// Routes
const institutionsRoutes = require('./routes/institutions');
const accountsRoutes = require('./routes/accounts');
const transactionsRoutes = require('./routes/transactions');
const categoriesRoutes = require('./routes/categories');
const rulesRoutes = require('./routes/rules');
const { router: plaidRoutes, webhookRouter: plaidWebhookRoutes } = require('./connectors/plaid/routes');
const { router: simplefinRoutes } = require('./connectors/simplefin/routes');
const { startScheduler: startSimplefinScheduler } = require('./connectors/simplefin/sync');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');
const templatesRoutes = require('./routes/templates');
const planningViewsRoutes = require('./routes/planningViews');
const dashboardTilesRoutes = require('./routes/dashboardTiles');
const incomeRoutes = require('./routes/income');
const extensionsRoutes = require('./routes/extensions');

app.use('/api/auth', authRouter);
app.use('/api/webhook', plaidWebhookRoutes); // Plaid's registered webhook URL — keep this path stable
app.use('/api/institutions', institutionsRoutes);
app.use('/api/connectors/plaid', plaidRoutes);
app.use('/api/connectors/simplefin', simplefinRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/planning-views', planningViewsRoutes);
app.use('/api/dashboard-tiles', dashboardTilesRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/extensions', extensionsRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Unknown API paths get a JSON 404 rather than falling through to the client's index.html below,
// which would answer 200 with a web page (so e.g. an extension calling a removed endpoint would
// fail confusingly at JSON-parsing time instead of seeing a 404)
app.use('/api', (req, res) => res.status(404).json({ error: `No such API endpoint: ${req.method} ${req.originalUrl}` }));

// Serve React client in production
const clientBuildPath = path.resolve(__dirname, '../client/build');
if (process.env.NODE_ENV === 'production' || !process.env.NODE_ENV) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

// Socket.IO
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Initialize and start
function start() {
  initAuth();
  initDb();
  initQueries();
  startPeriodicCheckpoint();
  startSimplefinScheduler(io);
  scanExtensions();

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Budgett server running on port ${PORT}`);
  });
}

try {
  start();
}
catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}

// Log unhandled errors to DB and console
const logger = require('./helpers/logger');

process.on('uncaughtException', (err) => {
  try {
    logger.error('uncaughtException', err.stack || err.message); 
  }
  catch (e) {
    console.error('Uncaught Exception:', err); 
  }

  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  try {
    logger.error('unhandledRejection', reason?.stack || String(reason)); 
  }
  catch (e) {
    console.error('Unhandled Rejection:', reason); 
  }
});
