function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${err.message}`);
  console.error(err.stack);

  const { createLog } = require('../db/queries');
  createLog.run('error', 'unhandled_exception', err.message);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
  });
}

module.exports = { errorHandler };
