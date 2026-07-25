'use strict';
import fastifySensible from '@fastify/sensible';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCors from '@fastify/cors';
import Fastify from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { initializeJWT, decorateAuthenticateMethod, generateAccessToken, generateRefreshToken, verifyRefreshToken } from './utils/auth.js';
import { serializeJSON } from './utils/serialization.js';

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

  // Initialize JWT with the secret (used for both signing AND verifying tokens)
  await initializeJWT(fastify, JWT_SECRET);

  // Add the authentication decorator for protected routes
  decorateAuthenticateMethod(fastify);
}

// ── Auth decorator ─────────────────────────────────────────────────────────

// The authentication decorator is registered during plugin initialization.
// Protected route definitions use a runtime wrapper so the hook is available
// after registerPlugins() completes.
async function authenticate(request, reply) {
  return fastify.authenticate(request, reply);
}

// ── Correlation ID hook ────────────────────────────────────────────────────────

fastify.addHook('onRequest', async (request, reply) => {
  const incomingCorrelationId = request.headers['x-correlation-id'];
  const correlationId = incomingCorrelationId || uuidv4();
  request.correlationId = correlationId;
  reply.header('x-correlation-id', correlationId);
  fastify.log.info({ correlationId, event: 'request_received', method: request.method, path: request.url }, 'Incoming request');
});

// ── Service registry ──────────────────────────────────────────────────────────

const SERVICES = {
  users: { url: 'http://localhost:3001', healthPath: '/health' },
  products: { url: 'http://localhost:3002', healthPath: '/health' },
  orders: { url: 'http://localhost:3003', healthPath: '/health' },
};

// ── Generic upstream proxy helper ─────────────────────────────────────────────

import { fetch } from 'undici';

async function proxyRequest(serviceUrl, path, method, body, correlationId, headers = {}) {
  const url = `${serviceUrl}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-gateway': 'fastify-gateway',
      'x-correlation-id': correlationId,
      ...headers,
    },
  };
  // Use fast-json-stringify for efficient JSON serialization (2-3x faster than JSON.stringify)
  if (body && method !== 'GET') options.body = serializeJSON(body, 'generic');

  const start = Date.now();
  fastify.log.info({ service: 'gateway', event: 'proxy_request_start', serviceUrl, path, method, correlationId }, 'Proxying request to service');
  try {
    const res = await fetch(url, options);
    const duration = Date.now() - start;
    const data = await res.json().catch(() => ({}));
    fastify.log.info({ service: 'gateway', event: 'proxy_request_end', serviceUrl, path, method, status: res.status, duration, correlationId }, 'Received response from service');
    return { status: res.status, data };
  } catch (err) {
    const duration = Date.now() - start;
    fastify.log.error({ service: 'gateway', event: 'proxy_request_error', serviceUrl, path, method, duration, err: err.message, correlationId }, 'Error calling upstream service');
    return { status: 502, data: { error: 'Bad Gateway', message: err.message } };
  }
}

// ── Public routes ─────────────────────────────────────────────────────────────

fastify.get('/', async () => ({
  service: 'API Gateway',
  framework: 'Fastify v4',
  version: '1.0.0',
  routes: {
    auth: 'POST /auth/login',
    users: '/api/users/*',
    products: '/api/products/*',
    orders: '/api/orders/*',//  [JWT required]
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

  const payload = { sub: username, role: 'user' };
  const token = generateAccessToken(fastify, payload);
  const refreshToken = generateRefreshToken(fastify, payload);

  return {
    token,
    expiresIn: 3600,
    refreshToken,
    refreshExpiresIn: 604800,
  };
});

fastify.post('/auth/refresh', async (request, reply) => {
  const { refreshToken } = request.body ?? {};
  if (!refreshToken) {
    return reply.badRequest('refreshToken is required');
  }

  try {
    const payload = verifyRefreshToken(fastify, refreshToken);
    const token = generateAccessToken(fastify, { sub: payload.sub, role: payload.role });
    return { token, expiresIn: 3600 };
  } catch (err) {
    return reply.unauthorized(err.message);
  }
});

// ── User routes (public read, protected write) ────────────────────────────────
//public route
fastify.get('/api/users', async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, '/users', 'GET', null, request.correlationId);
  return reply.status(status).send(data);
});

fastify.get('/api/users/:id', async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, `/users/${request.params.id}`, 'GET', null, request.correlationId);
  return reply.status(status).send(data);
});
//protected routes
fastify.post('/api/users', { onRequest: [authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, '/users', 'POST', request.body, request.correlationId);
  return reply.status(status).send(data);
});

fastify.put('/api/users/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, `/users/${request.params.id}`, 'PUT', request.body, request.correlationId);
  return reply.status(status).send(data);
});

fastify.delete('/api/users/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.users.url, `/users/${request.params.id}`, 'DELETE', null, request.correlationId);
  return reply.status(status).send(data);
});

// ── Product routes ────────────────────────────────────────────────────────────

fastify.get('/api/products', async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, '/products', 'GET', null, request.correlationId);
  return reply.status(status).send(data);
});

fastify.get('/api/products/:id', async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, `/products/${request.params.id}`, 'GET', null, request.correlationId);
  return reply.status(status).send(data);
});

fastify.post('/api/products', { onRequest: [authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, '/products', 'POST', request.body, request.correlationId);
  return reply.status(status).send(data);
});

fastify.put('/api/products/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, `/products/${request.params.id}`, 'PUT', request.body, request.correlationId);
  return reply.status(status).send(data);
});

fastify.delete('/api/products/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.products.url, `/products/${request.params.id}`, 'DELETE', null, request.correlationId);
  return reply.status(status).send(data);
});

// ── Order routes (all protected) ──────────────────────────────────────────────

fastify.get('/api/orders', { onRequest: [authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.orders.url, '/orders', 'GET', null, request.correlationId);
  return reply.status(status).send(data);
});

fastify.get('/api/orders/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.orders.url, `/orders/${request.params.id}`, 'GET', null, request.correlationId);
  return reply.status(status).send(data);
});

fastify.post('/api/orders', { onRequest: [authenticate] }, async (request, reply) => {
  const user = request.user;
  const { status, data } = await proxyRequest(
    SERVICES.orders.url, '/orders', 'POST',
    { ...request.body, userId: user.sub },
    request.correlationId,
    { 'x-user-id': user.sub, 'x-user-role': user.role }
  );
  return reply.status(status).send(data);
});

fastify.patch('/api/orders/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { status, data } = await proxyRequest(SERVICES.orders.url, `/orders/${request.params.id}`, 'PATCH', request.body, request.correlationId);
  return reply.status(status).send(data);
});

// ── Error handler ─────────────────────────────────────────────────────────────

fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  if (error.name === 'UnauthorizedError' || error.statusCode === 401) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: error.message || 'Invalid or expired token',
    });
  }

  const statusCode = error.statusCode ?? 500;
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
  fastify.log.info(`API Gateway running on port ${GATEWAY_PORT}`);
})();

// Export for testing
if (process.env.NODE_ENV === 'test') {
  // Re-run boot without listen for test env
}
export default fastify;
