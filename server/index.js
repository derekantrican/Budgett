const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { init: initDb, startPeriodicCheckpoint } = require('./db/init');
const { initQueries } = require('./db/queries');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Middleware
app.use(cors());
app.use(express.json());

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
const itemsRoutes = require('./routes/items');
const accountsRoutes = require('./routes/accounts');
const transactionsRoutes = require('./routes/transactions');
const categoriesRoutes = require('./routes/categories');
const rulesRoutes = require('./routes/rules');
const webhookRoutes = require('./routes/webhook');
const linkRoutes = require('./routes/link');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');
const templatesRoutes = require('./routes/templates');
const planningViewsRoutes = require('./routes/planningViews');

app.use('/api/webhook', webhookRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/link', linkRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/planning-views', planningViewsRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

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
  initDb();
  initQueries();
  startPeriodicCheckpoint();

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
