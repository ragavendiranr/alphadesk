'use strict';
const logger = require('../config/logger');

module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  logger.error(err.message, { module: 'errorHandler', stack: err.stack, path: req.path });
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
