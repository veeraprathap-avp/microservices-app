'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { expressCorrelationIdMiddleware } = require('./utils/correlation-id');
const { initLogger, requestLoggerMiddleware } = require('./utils/logger');

const app = express();
app.use(express.json());

// Initialize logger for this service
initLogger('order-service');

const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

// ── In-memory store ───────────────────────────────────────────────────────────

const orders = new Map([
  ['o1', { id: 'o1', userId: 'u1', productId: 'p1', quantity: 1, total: 1299.99, status: 'delivered', createdAt: new Date().toISOString() }],
  ['o2', { id: 'o2', userId: 'u2', productId: 'p2', quantity: 2, total: 299.98,  status: 'shipped',   createdAt: new Date().toISOString() }],
]);

// app.locals.getOrders  = () => orders;
// app.locals.getStatuses = () => STATUSES;
// app.locals.resetOrders = () => {
//   orders.clear();
//   orders.set('o1', { id: 'o1', userId: 'u1', productId: 'p1', quantity: 1, total: 1299.99, status: 'delivered', createdAt: new Date().toISOString() });
//   orders.set('o2', { id: 'o2', userId: 'u2', productId: 'p2', quantity: 2, total: 299.98,  status: 'shipped',   createdAt: new Date().toISOString() });
// };

// ── Middleware ────────────────────────────────────────────────────────────────

// Correlation ID middleware (extract or create x-correlation-id)
app.use(expressCorrelationIdMiddleware());

// Request logger middleware with structured logging and correlation ID
app.use(requestLoggerMiddleware('order-service'));

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) =>
  res.json({ service: 'order-service', status: 'healthy', uptime: process.uptime() })
);

app.get('/orders', (req, res) => {
  let items = [...orders.values()];
  const { userId, status } = req.query;
  if (userId) items = items.filter(o => o.userId === userId);
  if (status)  items = items.filter(o => o.status === status);
  res.json({ data: items, total: items.length });
});

app.get('/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ data: order });
});

app.post('/orders', (req, res) => {
  const { userId, productId, quantity = 1, price } = req.body;
  if (!userId || !productId || !price) {
    return res.status(400).json({ error: 'userId, productId, and price are required' });
  }
  const order = {
    id: uuidv4(),
    userId,
    productId,
    quantity: Number(quantity),
    total: Number(price) * Number(quantity),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  orders.set(order.id, order);
  //add lineitems details to order object before publishing event
  // Publish ORDER_PLACED event to Kafka
  publishOrderCreatedEvent(order);
  res.status(201).json({ data: order, message: 'Order placed' });
});

app.patch('/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const { status } = req.body;
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
  }
  const updated = { ...order, ...req.body, id: order.id, updatedAt: new Date().toISOString() };
  orders.set(order.id, updated);
  res.json({ data: updated, message: 'Order updated' });
});

module.exports = app;
