'use strict';

const pino = require('pino');
const { getCorrelationId } = require('./correlation-id');

let loggerInstance = null;

/**
 * Initialize and return pino logger with correlation ID support
 */
function initLogger(serviceName = 'service', level = process.env.LOG_LEVEL || 'info') {
  if (!loggerInstance) {
    const transport = process.env.NODE_ENV === 'production'
      ? undefined // JSON logs to stdout in production
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            singleLine: false,
          },
        };

    loggerInstance = pino(
      {
        level,
        base: { service: serviceName },
        transport,
      },
      pino.destination(1) // stdout
    );
  }
  return loggerInstance;
}

/**
 * Get a child logger with correlation ID and service context
 */
function getLogger(serviceName = 'service') {
  if (!loggerInstance) {
    initLogger(serviceName);
  }
  return loggerInstance.child({
    service: serviceName,
    correlationId: getCorrelationId(),
  });
}

/**
 * Express middleware to log incoming requests with correlation ID
 */
function requestLoggerMiddleware(serviceName = 'service') {
  return (req, res, next) => {
    const logger = getLogger(serviceName);
    const start = Date.now();

    // Log incoming request
    logger.info(
      {
        event: 'request_incoming',
        method: req.method,
        path: req.path,
        correlationId: req.correlationId,
      },
      `${req.method} ${req.path}`
    );

    // Override res.json to log response
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      const duration = Date.now() - start;
      logger.info(
        {
          event: 'request_complete',
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
          correlationId: req.correlationId,
        },
        `${req.method} ${req.path} ${res.statusCode} ${duration}ms`
      );
      return originalJson(data);
    };

    next();
  };
}

module.exports = {
  initLogger,
  getLogger,
  requestLoggerMiddleware,
};
