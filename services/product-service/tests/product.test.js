'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');

beforeEach(() => app.locals.resetProducts());

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns 200 with healthy status', async () => {
    const res = await request(app).get('/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('product-service');
    expect(res.body.status).toBe('healthy');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /products
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /products', () => {
  test('returns all products', async () => {
    const res = await request(app).get('/products');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBe(3);
  });

  test('each product has required fields', async () => {
    const res = await request(app).get('/products');
    const p = res.body.data[0];

    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('category');
    expect(p).toHaveProperty('price');
    expect(p).toHaveProperty('stock');
    expect(p).toHaveProperty('createdAt');
  });

  // ── Filtering ───────────────────────────────────────────────────────────────

  test('filters by category (case-insensitive)', async () => {
    const res = await request(app).get('/products?category=electronics');

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
    res.body.data.forEach(p => expect(p.category).toBe('Electronics'));
  });

  test('filters by category - Peripherals', async () => {
    const res = await request(app).get('/products?category=peripherals');

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].name).toBe('Mechanical Keyboard');
  });

  test('filters by minPrice', async () => {
    const res = await request(app).get('/products?minPrice=500');

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].price).toBeGreaterThanOrEqual(500);
  });

  test('filters by maxPrice', async () => {
    const res = await request(app).get('/products?maxPrice=200');

    res.body.data.forEach(p => expect(p.price).toBeLessThanOrEqual(200));
  });

  test('filters by minPrice and maxPrice together', async () => {
    const res = await request(app).get('/products?minPrice=100&maxPrice=600');

    expect(res.body.total).toBe(2); // Keyboard 149.99, Monitor 499.99
    res.body.data.forEach(p => {
      expect(p.price).toBeGreaterThanOrEqual(100);
      expect(p.price).toBeLessThanOrEqual(600);
    });
  });

  test('returns empty array when no products match filter', async () => {
    const res = await request(app).get('/products?category=nonexistent');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('unknown query params are ignored', async () => {
    const res = await request(app).get('/products?foo=bar&baz=123');

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /products/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /products/:id', () => {
  test('returns a product by valid ID', async () => {
    const res = await request(app).get('/products/p1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe('p1');
    expect(res.body.data.name).toBe('Laptop Pro 15');
    expect(res.body.data.price).toBe(1299.99);
  });

  test('returns 404 for non-existent product', async () => {
    const res = await request(app).get('/products/zzz999');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /products
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /products', () => {
  const validPayload = { name: 'USB-C Hub', category: 'Peripherals', price: 59.99, stock: 300 };

  test('creates a new product with valid payload', async () => {
    const res = await request(app).post('/products').send(validPayload);

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Product created');
    expect(res.body.data.name).toBe('USB-C Hub');
    expect(res.body.data.price).toBe(59.99);
    expect(res.body.data.stock).toBe(300);
    expect(res.body.data.id).toBeDefined();
  });

  test('defaults stock to 0 when not provided', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'Widget', category: 'Other', price: 9.99 });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.stock).toBe(0);
  });

  test('coerces price and stock to numbers', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'Gadget', category: 'Other', price: '25.50', stock: '10' });

    expect(typeof res.body.data.price).toBe('number');
    expect(typeof res.body.data.stock).toBe('number');
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/products')
      .send({ category: 'Electronics', price: 99 });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/name, category, and price/);
  });

  test('returns 400 when category is missing', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'Widget', price: 10 });

    expect(res.statusCode).toBe(400);
  });

  test('returns 400 when price is missing', async () => {
    const res = await request(app)
      .post('/products')
      .send({ name: 'Widget', category: 'Other' });

    expect(res.statusCode).toBe(400);
  });

  test('new product appears in GET /products', async () => {
    await request(app).post('/products').send(validPayload);
    const res = await request(app).get('/products');

    const names = res.body.data.map(p => p.name);
    expect(names).toContain('USB-C Hub');
    expect(res.body.total).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /products/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /products/:id', () => {
  test('updates an existing product', async () => {
    const res = await request(app)
      .put('/products/p2')
      .send({ price: 199.99, stock: 150 });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Product updated');
    expect(res.body.data.price).toBe(199.99);
    expect(res.body.data.stock).toBe(150);
    expect(res.body.data.id).toBe('p2');       // ID preserved
    expect(res.body.data.updatedAt).toBeDefined();
  });

  test('returns 404 for non-existent product', async () => {
    const res = await request(app).put('/products/xyz').send({ price: 1 });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });

  test('update is reflected in subsequent GET', async () => {
    await request(app).put('/products/p1').send({ name: 'Laptop Pro 16' });
    const res = await request(app).get('/products/p1');

    expect(res.body.data.name).toBe('Laptop Pro 16');
  });

  test('cannot overwrite product ID via body', async () => {
    const res = await request(app).put('/products/p1').send({ id: 'tampered' });

    expect(res.body.data.id).toBe('p1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /products/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /products/:id', () => {
  test('deletes an existing product', async () => {
    const res = await request(app).delete('/products/p3');

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Product deleted');
  });

  test('deleted product no longer in list', async () => {
    await request(app).delete('/products/p3');
    const res = await request(app).get('/products');

    const ids = res.body.data.map(p => p.id);
    expect(ids).not.toContain('p3');
    expect(res.body.total).toBe(2);
  });

  test('deleted product returns 404 on GET', async () => {
    await request(app).delete('/products/p2');
    const res = await request(app).get('/products/p2');

    expect(res.statusCode).toBe(404);
  });

  test('returns 404 when deleting non-existent product', async () => {
    const res = await request(app).delete('/products/ghost');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });
});
