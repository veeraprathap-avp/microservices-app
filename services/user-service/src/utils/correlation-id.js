'use strict';

const { v4: uuidv4 } = require('uuid');
const { AsyncLocalStorage } = require('async_hooks');

const correlationIdStorage = new AsyncLocalStorage();

/**
 * Get current correlation ID from AsyncLocalStorage
 */
function getCorrelationId() {
  return correlationIdStorage.getStore() || 'unknown';
}

/**
 * Set correlation ID in AsyncLocalStorage
 */
function setCorrelationId(id) {
  correlationIdStorage.enterWith(id);
}

/**
 * Middleware for Express: extract or create correlation ID
 */
function expressCorrelationIdMiddleware() {
  return (req, res, next) => {
    const incomingId = req.headers['x-correlation-id'];
    const correlationId = incomingId || uuidv4();
    
    // Store in AsyncLocalStorage
    correlationIdStorage.run(correlationId, () => {
      req.correlationId = correlationId;
      res.setHeader('x-correlation-id', correlationId);
      next();
    });
  };
}

module.exports = {
  correlationIdStorage,
  getCorrelationId,
  setCorrelationId,
  expressCorrelationIdMiddleware,
};
