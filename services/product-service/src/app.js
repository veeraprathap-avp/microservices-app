'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// ── In-memory store ───────────────────────────────────────────────────────────

const products = new Map([
  ['p1', { id: 'p1', name: 'Laptop Pro 15',     category: 'Electronics', price: 1299.99, stock: 50,  createdAt: new Date().toISOString() }],
  ['p2', { id: 'p2', name: 'Mechanical Keyboard', category: 'Peripherals', price: 149.99, stock: 200, createdAt: new Date().toISOString() }],
  ['p3', { id: 'p3', name: '4K Monitor 27"',    category: 'Electronics', price: 499.99, stock: 75,  createdAt: new Date().toISOString() }],
]);

app.locals.getProducts = () => products;
app.locals.resetProducts = () => {
  products.clear();
  products.set('p1', { id: 'p1', name: 'Laptop Pro 15',     category: 'Electronics', price: 1299.99, stock: 50,  createdAt: new Date().toISOString() });
  products.set('p2', { id: 'p2', name: 'Mechanical Keyboard', category: 'Peripherals', price: 149.99, stock: 200, createdAt: new Date().toISOString() });
  products.set('p3', { id: 'p3', name: '4K Monitor 27"',    category: 'Electronics', price: 499.99, stock: 75,  createdAt: new Date().toISOString() });
};

// ── Middleware ────────────────────────────────────────────────────────────────

app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'test') console.log(`[product-service] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) =>
  res.json({ service: 'product-service', status: 'healthy', uptime: process.uptime() })
);

app.get('/products', (req, res) => {
  let items = [...products.values()];
  const { category, minPrice, maxPrice } = req.query;
  if (category)  items = items.filter(p => p.category.toLowerCase() === category.toLowerCase());
  if (minPrice)  items = items.filter(p => p.price >= Number(minPrice));
  if (maxPrice)  items = items.filter(p => p.price <= Number(maxPrice));
  res.json({ data: items, total: items.length });
});

app.get('/products/:id', (req, res) => {
  const product = products.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ data: product });
});

app.post('/products', (req, res) => {
  const { name, category, price, stock = 0 } = req.body;
  if (!name || !category || price === undefined) {
    return res.status(400).json({ error: 'name, category, and price are required' });
  }
  const product = { id: uuidv4(), name, category, price: Number(price), stock: Number(stock), createdAt: new Date().toISOString() };
  products.set(product.id, product);
  res.status(201).json({ data: product, message: 'Product created' });
});

app.put('/products/:id', (req, res) => {
  const product = products.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const updated = { ...product, ...req.body, id: product.id, updatedAt: new Date().toISOString() };
  products.set(product.id, updated);
  res.json({ data: updated, message: 'Product updated' });
});

app.delete('/products/:id', (req, res) => {
  if (!products.has(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  products.delete(req.params.id);
  res.json({ message: 'Product deleted' });
});

module.exports = app;
