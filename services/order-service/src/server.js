'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.ORDER_SERVICE_PORT || 3003;

const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const orders = new Map([
  ['o1', { id: 'o1', userId: 'u1', productId: 'p1', quantity: 1, total: 1299.99, status: 'delivered', createdAt: new Date().toISOString() }],
  ['o2', { id: 'o2', userId: 'u2', productId: 'p2', quantity: 2, total: 299.98,  status: 'shipped',   createdAt: new Date().toISOString() }],
]);

app.use((req, _res, next) => { console.log(`[order-service] ${req.method} ${req.path}`); next(); });

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ service: 'order-service', status: 'healthy', uptime: process.uptime() }));

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

app.listen(PORT, () => console.log(`[order-service] Running on port ${PORT}`));
