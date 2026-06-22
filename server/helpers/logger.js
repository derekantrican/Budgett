const { createLog } = require('../db/queries');

const logger = {
  info(action, detail) {
    console.log(`[${action}] ${detail}`);
    createLog('info', action, detail);
  },
  warn(action, detail) {
    console.warn(`[${action}] ${detail}`);
    createLog('warn', action, detail);
  },
  error(action, detail) {
    console.error(`[${action}] ${detail}`);
    createLog('error', action, detail);
  },
};

module.exports = logger;
