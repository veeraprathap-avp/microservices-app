'use strict';

/**
 * Serialization Module for Efficient JSON Encoding
 * 
 * Uses fast-json-stringify for blazing fast JSON serialization
 * Better than JSON.stringify for high-throughput APIs
 * 
 * Compilation happens once, then serialization is ~2-3x faster
 */

import fastJsonStringify from 'fast-json-stringify';

/**
 * Schema for generic API responses
 * Defines expected response structure for fast-json-stringify compilation
 */
const genericResponseSchema = {
  type: 'object',
  properties: {
    id: { type: ['string', 'null'] },
    data: { type: ['object', 'array', 'null'] },
    error: { type: ['string', 'null'] },
    message: { type: ['string', 'null'] },
    status: { type: ['string', 'null'] },
    correlationId: { type: 'string' },
    timestamp: { type: 'string' },
  },
  additionalProperties: true, // Allow other fields
};

/**
 * Pre-compiled serializers for common response types
 * Compilation happens at startup, serialization is very fast
 */
const serializers = {
  // Generic serializer for any response structure
  generic: fastJsonStringify(genericResponseSchema),
};

/**
 * Serialize object to JSON string using fast-json-stringify
 * 
 * @param {Object} data - Object to serialize
 * @param {string} type - Type of serializer to use ('generic' or null for JSON.stringify)
 * @returns {string} JSON string
 * 
 * Example:
 * const json = serializeJSON({ id: '123', data: {...} }, 'generic');
 */
function serializeJSON(data, type = 'generic') {
  if (!type || !serializers[type]) {
    // Fallback to standard JSON.stringify if serializer doesn't exist
    return JSON.stringify(data);
  }
  
  try {
    return serializers[type](data);
  } catch (err) {
    // If fast-json-stringify fails, fallback to standard JSON.stringify
    console.warn(`fast-json-stringify failed for type '${type}', falling back to JSON.stringify:`, err.message);
    return JSON.stringify(data);
  }
}

/**
 * Create a custom serializer for a specific schema
 * 
 * @param {Object} schema - JSON Schema definition
 * @returns {Function} Serialization function
 * 
 * Example:
 * const userSerializer = createSerializer({
 *   type: 'object',
 *   properties: {
 *     id: { type: 'string' },
 *     name: { type: 'string' },
 *     email: { type: 'string' }
 *   }
 * });
 * const json = userSerializer({ id: '1', name: 'Alice', email: 'alice@example.com' });
 */
function createSerializer(schema) {
  try {
    return fastJsonStringify(schema);
  } catch (err) {
    console.warn('Failed to create custom serializer:', err.message);
    // Return fallback to JSON.stringify
    return (data) => JSON.stringify(data);
  }
}

export {
  serializeJSON,
  createSerializer,
  serializers,
  genericResponseSchema,
};
