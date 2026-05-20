'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');

// Reset store before each test so tests are fully isolated
beforeEach(() => app.locals.resetUsers());

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns 200 with healthy status', async () => {
    const res = await request(app).get('/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('user-service');
    expect(res.body.status).toBe('healthy');
    expect(typeof res.body.uptime).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /users
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /users', () => {
  test('returns all users with correct structure', async () => {
    const res = await request(app).get('/users');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBe(2);
  });

  test('each user has required fields', async () => {
    const res = await request(app).get('/users');
    const user = res.body.data[0];

    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('role');
    expect(user).toHaveProperty('createdAt');
  });

  test('seed data contains Alice and Bob', async () => {
    const res = await request(app).get('/users');
    const emails = res.body.data.map(u => u.email);

    expect(emails).toContain('alice@example.com');
    expect(emails).toContain('bob@example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /users/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /users/:id', () => {
  test('returns a single user by valid ID', async () => {
    const res = await request(app).get('/users/u1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe('u1');
    expect(res.body.data.name).toBe('Alice Johnson');
    expect(res.body.data.email).toBe('alice@example.com');
  });

  test('returns 404 for non-existent user', async () => {
    const res = await request(app).get('/users/does-not-exist');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('User not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /users
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /users', () => {
  test('creates a new user with valid payload', async () => {
    const payload = { name: 'Charlie Brown', email: 'charlie@example.com', role: 'user' };
    const res = await request(app).post('/users').send(payload);

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('User created');
    expect(res.body.data.name).toBe('Charlie Brown');
    expect(res.body.data.email).toBe('charlie@example.com');
    expect(res.body.data.role).toBe('user');
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.createdAt).toBeDefined();
  });

  test('defaults role to "user" when not provided', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Dana White', email: 'dana@example.com' });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.role).toBe('user');
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/users')
      .send({ email: 'noname@example.com' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('name and email are required');
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'No Email' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('name and email are required');
  });

  test('returns 400 when body is empty', async () => {
    const res = await request(app).post('/users').send({});

    expect(res.statusCode).toBe(400);
  });

  test('returns 409 when email already exists', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Duplicate', email: 'alice@example.com' });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Email already exists');
  });

  test('newly created user appears in GET /users', async () => {
    await request(app)
      .post('/users')
      .send({ name: 'Echo User', email: 'echo@example.com' });

    const listRes = await request(app).get('/users');
    const emails = listRes.body.data.map(u => u.email);
    expect(emails).toContain('echo@example.com');
    expect(listRes.body.total).toBe(3);
  });

  test('generates unique IDs for different users', async () => {
    const r1 = await request(app).post('/users').send({ name: 'User One', email: 'one@example.com' });
    const r2 = await request(app).post('/users').send({ name: 'User Two', email: 'two@example.com' });

    expect(r1.body.data.id).not.toBe(r2.body.data.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /users/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /users/:id', () => {
  test('updates an existing user', async () => {
    const res = await request(app)
      .put('/users/u1')
      .send({ name: 'Alice Updated', role: 'superadmin' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('User updated');
    expect(res.body.data.name).toBe('Alice Updated');
    expect(res.body.data.role).toBe('superadmin');
    expect(res.body.data.id).toBe('u1');           // ID must not change
    expect(res.body.data.email).toBe('alice@example.com'); // unchanged field preserved
    expect(res.body.data.updatedAt).toBeDefined();
  });

  test('returns 404 when updating non-existent user', async () => {
    const res = await request(app)
      .put('/users/ghost-999')
      .send({ name: 'Ghost' });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('User not found');
  });

  test('update is reflected in subsequent GET', async () => {
    await request(app).put('/users/u2').send({ name: 'Bob Updated' });
    const res = await request(app).get('/users/u2');

    expect(res.body.data.name).toBe('Bob Updated');
  });

  test('cannot overwrite user ID via PUT body', async () => {
    const res = await request(app)
      .put('/users/u1')
      .send({ id: 'hacked-id', name: 'Alice' });

    expect(res.body.data.id).toBe('u1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /users/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /users/:id', () => {
  test('deletes an existing user', async () => {
    const res = await request(app).delete('/users/u1');

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('User deleted');
  });

  test('deleted user no longer appears in list', async () => {
    await request(app).delete('/users/u1');
    const res = await request(app).get('/users');

    const ids = res.body.data.map(u => u.id);
    expect(ids).not.toContain('u1');
    expect(res.body.total).toBe(1);
  });

  test('deleted user returns 404 on GET by ID', async () => {
    await request(app).delete('/users/u1');
    const res = await request(app).get('/users/u1');

    expect(res.statusCode).toBe(404);
  });

  test('returns 404 when deleting non-existent user', async () => {
    const res = await request(app).delete('/users/does-not-exist');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('User not found');
  });
});
