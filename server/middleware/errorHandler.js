function errorHandler(err, req, res, next) {
  const logger = require('../helpers/logger');
  logger.error('unhandled_exception', err.message);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
  });
}

module.exports = { errorHandler };
