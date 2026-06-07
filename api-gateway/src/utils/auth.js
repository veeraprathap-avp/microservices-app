'use strict';

/**
 * Authentication Module for Fastify
 * 
 * Handles:
 * - JWT Plugin Registration
 * - Token Generation (Sign)
 * - Token Verification (Verify)
 * - Protected Route Decorator
 * 
 * How it works:
 * 1. Single JWT_SECRET is registered with the plugin
 * 2. SAME secret used for both signing AND verifying tokens
 * 3. Client sends token in Authorization header: "Bearer <token>"
 * 4. Decorator extracts and verifies token using the secret
 */

import fastifyJWT from '@fastify/jwt';

/**
 * Initialize JWT authentication for Fastify
 * 
 * @param {Object} fastify - Fastify instance
 * @param {string} jwtSecret - Secret key for signing/verifying tokens
 * @returns {Promise<void>}
 * 
 * What this does:
 * - Registers the JWT plugin with Fastify
 * - Stores the secret (used by both sign() and verify())
 * - Adds fastify.jwt.sign() method for creating tokens
 * - Adds request.jwtVerify() method for verifying incoming tokens
 */
async function initializeJWT(fastify, jwtSecret) {
  await fastify.register(fastifyJWT, {
    secret: jwtSecret,
    sign: { expiresIn: '1h' }, // Default expiration for signed tokens
  });
}

/**
 * Decorate Fastify with authentication verification
 * Used as middleware: { onRequest: [fastify.authenticate] }
 * 
 * @param {Object} fastify - Fastify instance
 * 
 * What this does:
 * - Creates a reusable auth decorator
 * - Can be used in route options: { onRequest: [fastify.authenticate] }
 * - Automatically reads Authorization: Bearer <token> header
 * - Verifies token using the registered secret
 * - Throws error if token is invalid or missing
 */
function decorateAuthenticateMethod(fastify) {
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      // This reads the Authorization header and verifies the token
      // Throws if token is invalid or expired
      await request.jwtVerify();
    } catch (err) {
      // Propagate JWT verification failures so the server error handler can map them.
      throw err;
    }
  });
}

/**
 * Generate a JWT token
 * 
 * @param {Object} fastify - Fastify instance
 * @param {Object} payload - Data to encode in token (e.g., { sub: username, role: 'user' })
 * @param {Object} options - Optional sign options (e.g., { expiresIn: '24h' })
 * @returns {string} JWT token
 * 
 * Example:
 * const token = generateToken(fastify, { sub: 'alice', role: 'admin' });
 */
function generateToken(fastify, payload, options = {}) {
  return fastify.jwt.sign(payload, options);
}

/**
 * Verify a JWT token manually
 * 
 * @param {Object} fastify - Fastify instance
 * @param {string} token - Token to verify (without "Bearer " prefix)
 * @returns {Object} Decoded token payload if valid
 * @throws {Error} If token is invalid or expired
 * 
 * Example:
 * try {
 *   const payload = verifyToken(fastify, token);
 *   console.log(payload); // { sub: 'alice', role: 'admin', ... }
 * } catch (err) {
 *   console.error('Invalid token:', err.message);
 * }
 */
function verifyToken(fastify, token) {
  try {
    return fastify.jwt.verify(token);
  } catch (err) {
    throw new Error(`Token verification failed: ${err.message}`);
  }
}

/**
 * Extract token from Authorization header
 * 
 * @param {Object} request - Fastify request object
 * @returns {string|null} Token or null if not found
 * 
 * Example:
 * const token = extractToken(request);
 * // Authorization: Bearer abc123xyz
 * // Returns: "abc123xyz"
 */
function extractToken(request) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7); // Remove "Bearer " prefix
}

/**
 * Verify request has valid JWT token
 * Can be used as a standalone check outside of decorator
 * 
 * @param {Object} request - Fastify request object
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is missing or invalid
 */
function getTokenPayload(request) {
  const token = extractToken(request);
  if (!token) {
    throw new Error('Missing authorization token');
  }
  return request.jwtVerify(); // This is async, but called from request context
}

export {
  initializeJWT,
  decorateAuthenticateMethod,
  generateToken,
  verifyToken,
  extractToken,
  getTokenPayload,
};
