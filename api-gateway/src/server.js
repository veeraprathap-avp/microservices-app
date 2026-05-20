'use strict';
import fastifySensible from '@fastify/sensible';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCors from '@fastify/cors';
import fastifyJWT from '@fastify/jwt';
import Fastify from 'fastify';

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  },
});

const { GATEWAY_PORT = 3000, JWT_SECRET = 'supersecretkey' } = process.env;

// ── Plugins ───────────────────────────────────────────────────────────────────

async function registerPlugins() {
  await fastify.register(fastifySensible);

  await fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please retry after 1 minute.',
    }),
  });

  await fastify.register(fastifyJWT, { secret: JWT_SECRET });
}

// ── Auth decorator ─────────────────────────────────────────────────────────

fastify.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

// ── Service registry ──────────────────────────────────────────────────────────

const SERVICES = {
  users:    { url: 'http://localhost:3001', healthPath: '/health' },
  products: { url: 'http://localhost:3002', healthPath: '/health' },
  orders:   { url: 'http://localhost:3003', healthPath: '/health' },
};

// ── Generic upstream proxy helper ─────────────────────────────────────────────

import { fetch } from 'undici';

async function proxyRequest(serviceUrl, path, method, body, headers = {}) {
  const url = `${serviceUrl}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-gateway': 'fastify-gateway',
      ...headers,
    },
  };
  if (body && method !== 'GET') options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ── Public routes ─────────────────────────────────────────────────────────────

fastify.get('/', async () => ({
  service: 'API Gateway',
  framework: 'Fastify v4',
  version: '1.0.0',
  routes: {
    auth:     'POST /auth/login',
    users:    '/api/users/*',
    products: '/api/products/*',
    orders:   '/api/orders/*  [JWT required]',
  },
}));

fastify.get('/health', async () => {
  const checks = await Promise.all(
    Object.entries(SERVICES).map(async ([name, svc]) => {
      try {
        const res = await fetch(`${svc.url}${svc.healthPath}`, { signal: AbortSignal.timeout(2000) });
        return { [name]: res.ok ? 'healthy' : 'degraded' };
      } catch {
        return { [name]: 'unreachable' };
      }
    })
  );
  return { gateway: 'healthy', services: Object.assign({}, ...checks), timestamp: new Date().toISOString() };
});

// ── Auth (token issue) ────────────────────────────────────────────────────────

fastify.post('/auth/login', async (request, reply) => {
  const { username, password } = request.body ?? {};
  // Demo: accept any user; in production, verify against user-service
  if (!username || !password) {
    return reply.badRequest('username and password are required');
  }
  const token = fastify.jwt.sign({ sub: username, role: 'user' }, { expiresIn: '1h' });
  return { token, expiresIn: 3600 };
});

// ── User routes (public read, protected write) ────────────────────────────────

fastify.get('/api/users', async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, '/users', 'GET');
  return reply.status(status).send(data);
});

fastify.get('/api/users/:id', async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, `/users/${request.params.id}`, 'GET');
  return reply.status(status).send(data);
});

fastify.post('/api/users', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, '/users', 'POST', request.body);
  return reply.status(status).send(data);
});

fastify.put('/api/users/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, `/users/${request.params.id}`, 'PUT', request.body);
  return reply.status(status).send(data);
});

fastify.delete('/api/users/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, `/users/${request.params.id}`, 'DELETE');
  return reply.status(status).send(data);
});

// ── Product routes ────────────────────────────────────────────────────────────

fastify.get('/api/products', async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, '/products', 'GET');
  return reply.status(status).send(data);
});

fastify.get('/api/products/:id', async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, `/products/${request.params.id}`, 'GET');
  return reply.status(status).send(data);
});

fastify.post('/api/products', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, '/products', 'POST', request.body);
  return reply.status(status).send(data);
});

fastify.put('/api/products/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, `/products/${request.params.id}`, 'PUT', request.body);
  return reply.status(status).send(data);
});

fastify.delete('/api/products/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, `/products/${request.params.id}`, 'DELETE');
  return reply.status(status).send(data);
});

// ── Order routes (all protected) ──────────────────────────────────────────────

fastify.get('/api/orders', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.orders.url, '/orders', 'GET');
  return reply.status(status).send(data);
});

fastify.get('/api/orders/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.orders.url, `/orders/${request.params.id}`, 'GET');
  return reply.status(status).send(data);
});

fastify.post('/api/orders', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const user = request.user;
  const { status, data } = await proxyRequest(
    SERVICES.orders.url, '/orders', 'POST',
    { ...request.body, userId: user.sub },
    { 'x-user-id': user.sub, 'x-user-role': user.role }
  );
  return reply.status(status).send(data);
});

fastify.patch('/api/orders/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.orders.url, `/orders/${request.params.id}`, 'PATCH', request.body);
  return reply.status(status).send(data);
});

// ── Error handler ─────────────────────────────────────────────────────────────

fastify.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  fastify.log.error(error);
  reply.status(statusCode).send({
    statusCode,
    error: error.name ?? 'Internal Server Error',
    message: error.message,
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

(async () => {
  await registerPlugins();
  await fastify.listen({ port: Number(GATEWAY_PORT), host: '0.0.0.0' });
  fastify.log.info(`🚀 API Gateway running on port ${GATEWAY_PORT}`);
})();

// Export for testing
if (process.env.NODE_ENV === 'test') {
  // Re-run boot without listen for test env
}
export default fastify;
