'use strict';
// Entry point — import app and start listening
const app = require('./app');
const PORT = process.env.USER_SERVICE_PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`[user-service] Running on port ${PORT}`));
}
module.exports = app;

// ---- legacy inline code below kept for reference, replaced by app.js ----
const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.USER_SERVICE_PORT || 3001;

// ── In-memory store ───────────────────────────────────────────────────────────

const users = new Map([
  ['u1', { id: 'u1', name: 'Alice Johnson', email: 'alice@example.com', role: 'admin', createdAt: new Date().toISOString() }],
  ['u2', { id: 'u2', name: 'Bob Smith',    email: 'bob@example.com',   role: 'user',  createdAt: new Date().toISOString() }],
]);

// ── Middleware: request logger ────────────────────────────────────────────────

app.use((req, _res, next) => {
  console.log(`[user-service] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ service: 'user-service', status: 'healthy', uptime: process.uptime() }));

app.get('/users', (_req, res) => res.json({ data: [...users.values()], total: users.size }));

app.get('/users/:id', (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ data: user });
});

app.post('/users', (req, res) => {
  const { name, email, role = 'user' } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
  if ([...users.values()].some(u => u.email === email)) {
    return res.status(409).json({ error: 'Email already exists' });
  }
  const user = { id: uuidv4(), name, email, role, createdAt: new Date().toISOString() };
  users.set(user.id, user);
  res.status(201).json({ data: user, message: 'User created' });
});

app.put('/users/:id', (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const updated = { ...user, ...req.body, id: user.id, updatedAt: new Date().toISOString() };
  users.set(user.id, updated);
  res.json({ data: updated, message: 'User updated' });
});

app.delete('/users/:id', (req, res) => {
  if (!users.has(req.params.id)) return res.status(404).json({ error: 'User not found' });
  users.delete(req.params.id);
  res.json({ message: 'User deleted' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`[user-service] Running on port ${PORT}`));
