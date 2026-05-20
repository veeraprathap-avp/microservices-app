'use strict';

process.env.NODE_ENV  = 'test';
process.env.JWT_SECRET = 'test-secret-key';

jest.mock('undici', () => ({ fetch: jest.fn() }));

const { fetch: mockFetch } = require('undici');
const jwt = require('jsonwebtoken');

function mockResponse(body, status = 200) {
  return Promise.resolve({
    status, ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
}

let app;
beforeAll(async () => { app = require('../src/server'); await app.ready(); });
afterAll(async () => { await app.close(); });
afterEach(() => jest.clearAllMocks());

async function inject(method, url, opts = {}) {
  return app.inject({ method, url, ...opts });
}
async function getToken() {
  const res = await inject('POST', '/auth/login', { payload: { username: 'test-user', password: 'pw' } });
  return JSON.parse(res.body).token;
}

// ── Root & Health ─────────────────────────────────────────────────────────────
describe('GET /', () => {
  test('returns service info', async () => {
    const res = await inject('GET', '/');
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.service).toBe('API Gateway');
    expect(body.routes).toBeDefined();
  });
});

describe('GET /health', () => {
  test('returns gateway + service statuses', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const res = await inject('GET', '/health');
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.gateway).toBe('healthy');
    expect(body.services).toBeDefined();
  });

  test('marks services unreachable on error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await inject('GET', '/health');
    const body = JSON.parse(res.body);
    Object.values(body.services).forEach(s => expect(s).toBe('unreachable'));
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
describe('POST /auth/login', () => {
  test('returns JWT for any credentials', async () => {
    const res = await inject('POST', '/auth/login', { payload: { username: 'alice', password: 'pw' } });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.expiresIn).toBe(3600);
  });
  test('returns 400 when username missing', async () => {
    const res = await inject('POST', '/auth/login', { payload: { password: 'x' } });
    expect(res.statusCode).toBe(400);
  });
  test('returns 400 when password missing', async () => {
    const res = await inject('POST', '/auth/login', { payload: { username: 'x' } });
    expect(res.statusCode).toBe(400);
  });
  test('returns 400 for empty body', async () => {
    const res = await inject('POST', '/auth/login', { payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

// ── User routes ───────────────────────────────────────────────────────────────
describe('User routes via Gateway', () => {
  test('GET /api/users — no auth needed, proxies', async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: [{ id: 'u1' }], total: 1 }));
    const res = await inject('GET', '/api/users');
    expect(res.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  test('GET /api/users/:id — no auth needed', async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: { id: 'u1' } }));
    const res = await inject('GET', '/api/users/u1');
    expect(res.statusCode).toBe(200);
  });
  test('POST /api/users — 401 without JWT', async () => {
    const res = await inject('POST', '/api/users', { payload: { name: 'X', email: 'x@x.com' } });
    expect(res.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  test('POST /api/users — proxies with JWT', async () => {
    const token = await getToken();
    mockFetch.mockResolvedValue(mockResponse({ data: { id: 'u9' }, message: 'User created' }, 201));
    const res = await inject('POST', '/api/users', {
      payload: { name: 'New', email: 'new@test.com' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).message).toBe('User created');
  });
  test('PUT /api/users/:id — 401 without JWT', async () => {
    const res = await inject('PUT', '/api/users/u1', { payload: { name: 'X' } });
    expect(res.statusCode).toBe(401);
  });
  test('PUT /api/users/:id — proxies with JWT', async () => {
    const token = await getToken();
    mockFetch.mockResolvedValue(mockResponse({ data: { id: 'u1', name: 'Updated' }, message: 'User updated' }));
    const res = await inject('PUT', '/api/users/u1', {
      payload: { name: 'Updated' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe('User updated');
  });
  test('DELETE /api/users/:id — 401 without JWT', async () => {
    const res = await inject('DELETE', '/api/users/u1');
    expect(res.statusCode).toBe(401);
  });
  test('DELETE /api/users/:id — proxies with JWT', async () => {
    const token = await getToken();
    mockFetch.mockResolvedValue(mockResponse({ message: 'User deleted' }));
    const res = await inject('DELETE', '/api/users/u1', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
  });
});

// ── Product routes ────────────────────────────────────────────────────────────
describe('Product routes via Gateway', () => {
  test('GET /api/products — no auth needed', async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: [], total: 0 }));
    const res = await inject('GET', '/api/products');
    expect(res.statusCode).toBe(200);
  });
  test('GET /api/products/:id — no auth needed', async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: { id: 'p1' } }));
    const res = await inject('GET', '/api/products/p1');
    expect(res.statusCode).toBe(200);
  });
  test('POST /api/products — 401 without JWT', async () => {
    const res = await inject('POST', '/api/products', { payload: { name: 'W', category: 'X', price: 1 } });
    expect(res.statusCode).toBe(401);
  });
  test('POST /api/products — proxies with JWT', async () => {
    const token = await getToken();
    mockFetch.mockResolvedValue(mockResponse({ data: { id: 'p9' }, message: 'Product created' }, 201));
    const res = await inject('POST', '/api/products', {
      payload: { name: 'W', category: 'X', price: 1 },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
  });
  test('DELETE /api/products/:id — 401 without JWT', async () => {
    const res = await inject('DELETE', '/api/products/p1');
    expect(res.statusCode).toBe(401);
  });
});

// ── Order routes (all protected) ──────────────────────────────────────────────
describe('Order routes via Gateway', () => {
  test('GET /api/orders — 401 without JWT', async () => {
    const res = await inject('GET', '/api/orders');
    expect(res.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  test('GET /api/orders — proxies with JWT', async () => {
    const token = await getToken();
    mockFetch.mockResolvedValue(mockResponse({ data: [], total: 0 }));
    const res = await inject('GET', '/api/orders', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
  });
  test('GET /api/orders/:id — 401 without JWT', async () => {
    const res = await inject('GET', '/api/orders/o1');
    expect(res.statusCode).toBe(401);
  });
  test('GET /api/orders/:id — proxies with JWT', async () => {
    const token = await getToken();
    mockFetch.mockResolvedValue(mockResponse({ data: { id: 'o1', status: 'delivered' } }));
    const res = await inject('GET', '/api/orders/o1', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe('delivered');
  });
  test('POST /api/orders — 401 without JWT', async () => {
    const res = await inject('POST', '/api/orders', { payload: { productId: 'p1' } });
    expect(res.statusCode).toBe(401);
  });
  test('POST /api/orders — injects x-user-id from JWT', async () => {
    const token = await getToken();
    mockFetch.mockResolvedValue(mockResponse({ data: { id: 'o9' }, message: 'Order placed' }, 201));
    const res = await inject('POST', '/api/orders', {
      payload: { productId: 'p1', quantity: 1, price: 100 },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    const callOpts = mockFetch.mock.calls[0][1];
    expect(callOpts.headers['x-user-id']).toBe('test-user');
  });
  test('PATCH /api/orders/:id — 401 without JWT', async () => {
    const res = await inject('PATCH', '/api/orders/o1', { payload: { status: 'confirmed' } });
    expect(res.statusCode).toBe(401);
  });
  test('PATCH /api/orders/:id — proxies with JWT', async () => {
    const token = await getToken();
    mockFetch.mockResolvedValue(mockResponse({ data: { id: 'o1', status: 'confirmed' }, message: 'Order updated' }));
    const res = await inject('PATCH', '/api/orders/o1', {
      payload: { status: 'confirmed' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe('confirmed');
  });
});

// ── JWT edge cases ────────────────────────────────────────────────────────────
describe('JWT edge cases', () => {
  test('rejects malformed token', async () => {
    const res = await inject('GET', '/api/orders', { headers: { Authorization: 'Bearer not.a.token' } });
    expect(res.statusCode).toBe(401);
  });
  test('rejects token with wrong secret', async () => {
    const bad = jwt.sign({ sub: 'hacker' }, 'wrong-secret');
    const res = await inject('GET', '/api/orders', { headers: { Authorization: `Bearer ${bad}` } });
    expect(res.statusCode).toBe(401);
  });
  test('rejects expired token', async () => {
    const expired = jwt.sign({ sub: 'user' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = await inject('GET', '/api/orders', { headers: { Authorization: `Bearer ${expired}` } });
    expect(res.statusCode).toBe(401);
  });
  test('rejects missing Authorization header', async () => {
    const res = await inject('GET', '/api/orders');
    expect(res.statusCode).toBe(401);
  });
});
