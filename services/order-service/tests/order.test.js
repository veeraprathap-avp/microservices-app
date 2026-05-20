'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');

beforeEach(() => app.locals.resetOrders());

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns 200 with healthy status', async () => {
    const res = await request(app).get('/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('order-service');
    expect(res.body.status).toBe('healthy');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /orders
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /orders', () => {
  test('returns all orders', async () => {
    const res = await request(app).get('/orders');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBe(2);
  });

  test('each order has required fields', async () => {
    const res = await request(app).get('/orders');
    const o = res.body.data[0];

    expect(o).toHaveProperty('id');
    expect(o).toHaveProperty('userId');
    expect(o).toHaveProperty('productId');
    expect(o).toHaveProperty('quantity');
    expect(o).toHaveProperty('total');
    expect(o).toHaveProperty('status');
    expect(o).toHaveProperty('createdAt');
  });

  test('filters by userId', async () => {
    const res = await request(app).get('/orders?userId=u1');

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].userId).toBe('u1');
  });

  test('filters by status', async () => {
    const res = await request(app).get('/orders?status=shipped');

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].status).toBe('shipped');
  });

  test('filters by userId and status combined', async () => {
    const res = await request(app).get('/orders?userId=u2&status=shipped');

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].userId).toBe('u2');
    expect(res.body.data[0].status).toBe('shipped');
  });

  test('returns empty array when no orders match filter', async () => {
    const res = await request(app).get('/orders?userId=nobody');

    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /orders/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /orders/:id', () => {
  test('returns an order by valid ID', async () => {
    const res = await request(app).get('/orders/o1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe('o1');
    expect(res.body.data.userId).toBe('u1');
    expect(res.body.data.status).toBe('delivered');
  });

  test('returns 404 for non-existent order', async () => {
    const res = await request(app).get('/orders/zzz999');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /orders
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /orders', () => {
  const validPayload = { userId: 'u1', productId: 'p2', quantity: 3, price: 149.99 };

  test('creates an order with valid payload', async () => {
    const res = await request(app).post('/orders').send(validPayload);

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Order placed');
    expect(res.body.data.userId).toBe('u1');
    expect(res.body.data.productId).toBe('p2');
    expect(res.body.data.quantity).toBe(3);
    expect(res.body.data.status).toBe('pending'); // always starts as pending
    expect(res.body.data.id).toBeDefined();
  });

  test('calculates total correctly (price × quantity)', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ userId: 'u1', productId: 'p1', quantity: 2, price: 100 });

    expect(res.body.data.total).toBe(200);
  });

  test('calculates total for quantity = 1 correctly', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ userId: 'u1', productId: 'p1', quantity: 1, price: 499.99 });

    expect(res.body.data.total).toBeCloseTo(499.99);
  });

  test('defaults quantity to 1 when not provided', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ userId: 'u2', productId: 'p3', price: 50 });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.quantity).toBe(1);
  });

  test('returns 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ productId: 'p1', price: 100 });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('userId, productId, and price are required');
  });

  test('returns 400 when productId is missing', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ userId: 'u1', price: 100 });

    expect(res.statusCode).toBe(400);
  });

  test('returns 400 when price is missing', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ userId: 'u1', productId: 'p1' });

    expect(res.statusCode).toBe(400);
  });

  test('returns 400 for empty body', async () => {
    const res = await request(app).post('/orders').send({});

    expect(res.statusCode).toBe(400);
  });

  test('new order appears in GET /orders', async () => {
    await request(app).post('/orders').send(validPayload);
    const res = await request(app).get('/orders');

    expect(res.body.total).toBe(3);
  });

  test('generates unique IDs for multiple orders', async () => {
    const r1 = await request(app).post('/orders').send(validPayload);
    const r2 = await request(app).post('/orders').send(validPayload);

    expect(r1.body.data.id).not.toBe(r2.body.data.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /orders/:id  (status workflow)
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /orders/:id', () => {
  test('updates order status to "confirmed"', async () => {
    const res = await request(app).patch('/orders/o1').send({ status: 'confirmed' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Order updated');
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.updatedAt).toBeDefined();
  });

  test('accepts all valid statuses', async () => {
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

    for (const status of validStatuses) {
      const res = await request(app).patch('/orders/o1').send({ status });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe(status);
    }
  });

  test('returns 400 for invalid status value', async () => {
    const res = await request(app).patch('/orders/o1').send({ status: 'flying' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid status/);
    expect(res.body.error).toMatch(/pending/);
  });

  test('returns 404 for non-existent order', async () => {
    const res = await request(app).patch('/orders/ghost').send({ status: 'confirmed' });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });

  test('preserves other fields when patching status', async () => {
    const res = await request(app).patch('/orders/o2').send({ status: 'delivered' });

    expect(res.body.data.userId).toBe('u2');
    expect(res.body.data.productId).toBe('p2');
    expect(res.body.data.total).toBe(299.98);
    expect(res.body.data.id).toBe('o2');
  });

  test('status change reflected in GET /orders/:id', async () => {
    await request(app).patch('/orders/o1').send({ status: 'cancelled' });
    const res = await request(app).get('/orders/o1');

    expect(res.body.data.status).toBe('cancelled');
  });

  test('status change reflected in filtered GET /orders', async () => {
    await request(app).patch('/orders/o1').send({ status: 'confirmed' });
    const res = await request(app).get('/orders?status=confirmed');

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].id).toBe('o1');
  });
});
