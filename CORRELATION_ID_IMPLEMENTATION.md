# Correlation ID & Structured Logging Implementation

## Overview

This document describes the correlation ID and structured logging feature implemented across all microservices in the microservices-app.

### Features Implemented

1. **Correlation ID (x-correlation-id)**
   - Automatically generated for each request if not present
   - Propagated through all service-to-service calls
   - Returned in response headers for client tracking
   - Stored in AsyncLocalStorage for async operation tracking

2. **Structured Logging with Pino**
   - JSON logs for easy parsing and indexing
   - Service context included in every log
   - Correlation ID included in every log entry
   - Request/response logging with duration tracking
   - Pretty-printed console output in development

3. **AsyncLocalStorage**
   - Maintains correlation ID context across async operations
   - Available to all service handlers without passing as parameter

## Architecture

### Components

#### 1. API Gateway (`api-gateway/`)
- **Location**: `api-gateway/src/server.js`
- **Features**:
  - Fastify hook to capture/create correlation ID
  - Logging of all incoming requests with correlation ID
  - Propagates correlation ID to all downstream service calls
  - Logs proxy request start, end, and errors

#### 2. Microservices (`services/*/`)
- **User Service** (`services/user-service/`)
- **Product Service** (`services/product-service/`)
- **Order Service** (`services/order-service/`)

Each service includes:
- `src/utils/correlation-id.js` - Express middleware for correlation ID
- `src/utils/logger.js` - Pino logger configuration and request logger middleware
- Updated `src/app.js` - Integrated correlation ID and logging middleware

## Usage

### Installation

```bash
# Install dependencies for all services
cd api-gateway && npm install
cd ../services/user-service && npm install
cd ../services/product-service && npm install
cd ../services/order-service && npm install
```

### Running the Services

```bash
# Terminal 1: API Gateway
cd api-gateway
npm start

# Terminal 2: User Service
cd services/user-service
npm start

# Terminal 3: Product Service
cd services/product-service
npm start

# Terminal 4: Order Service
cd services/order-service
npm start
```

### Testing Correlation ID Propagation

#### 1. Simple GET Request
```bash
curl http://localhost:3000/api/products
```

Look at the response headers - you'll see:
```
x-correlation-id: <uuid>
```

#### 2. Custom Correlation ID
Pass your own correlation ID to trace across multiple requests:
```bash
curl -H "x-correlation-id: my-trace-001" http://localhost:3000/api/products
```

The same correlation ID will be:
- Returned in response headers
- Logged in all services
- Visible in service console output

#### 3. Cross-Service Calls
Create a product (requires authentication):
```bash
# 1. Get JWT token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo"}' | jq -r '.token')

# 2. Create product with correlation ID tracking
curl -H "Authorization: Bearer $TOKEN" \
  -H "x-correlation-id: order-flow-001" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/products \
  -d '{
    "name": "Test Product",
    "category": "Test",
    "price": 99.99,
    "stock": 10
  }'
```

#### 4. View Logs with Correlation ID

In each service console, you'll see structured logs:

**User Service Log Output:**
```
[user-service] request_incoming
  correlationId: 12345678-1234-5678-1234-567812345678
  method: POST
  path: /users
  timestamp: 2024-06-03T10:30:45.123Z

[user-service] request_complete
  correlationId: 12345678-1234-5678-1234-567812345678
  method: POST
  path: /users
  status: 201
  duration: 15
```

**API Gateway Log Output:**
```
[api-gateway] request_received
  correlationId: 12345678-1234-5678-1234-567812345678
  method: POST
  path: /api/users

[api-gateway] proxy_request_start
  service: gateway
  event: proxy_request_start
  serviceUrl: http://localhost:3001
  path: /users
  method: POST
  correlationId: 12345678-1234-5678-1234-567812345678

[api-gateway] proxy_request_end
  service: gateway
  event: proxy_request_end
  serviceUrl: http://localhost:3001
  path: /users
  status: 201
  duration: 18
  correlationId: 12345678-1234-5678-1234-567812345678
```

## Implementation Details

### Correlation ID Flow

```
Client Request (with or without x-correlation-id)
    ↓
API Gateway (creates/extracts correlation ID)
    ↓ (adds x-correlation-id header)
Microservice (extracts and stores in AsyncLocalStorage)
    ↓ (all logs include correlationId)
Service Response (includes x-correlation-id header)
    ↓
Client (can track request through all logs)
```

### Logger Configuration

Each service uses Pino with:
- **Development**: Pretty-printed colored output with timestamps
- **Production**: JSON format for log aggregation systems
- **Log Level**: Configurable via `LOG_LEVEL` environment variable (default: `info`)

Set log level:
```bash
LOG_LEVEL=debug npm start
```

### AsyncLocalStorage Usage

The AsyncLocalStorage preserves the correlation ID across async boundaries:

```javascript
// In middleware:
correlationIdStorage.run(correlationId, () => {
  // All async operations within this context have access to correlationId
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

// In logger:
function getCorrelationId() {
  return correlationIdStorage.getStore() || 'unknown';
}
```

## Response Headers

All API responses include the correlation ID:

```http
HTTP/1.1 201 Created
Content-Type: application/json
x-correlation-id: 12345678-1234-5678-1234-567812345678

{
  "data": {...},
  "message": "..."
}
```

## Environment Variables

- `LOG_LEVEL` - Pino log level (`debug`, `info`, `warn`, `error`) - Default: `info`
- `NODE_ENV` - Set to `production` for JSON logs, otherwise pretty-printed
- `GATEWAY_PORT` - API Gateway port - Default: `3000`
- `USER_SERVICE_PORT` - User Service port - Default: `3001`
- `PRODUCT_SERVICE_PORT` - Product Service port - Default: `3002`
- `ORDER_SERVICE_PORT` - Order Service port - Default: `3003`

## Best Practices

1. **Client-Side**: Always capture the correlation ID from response headers for debugging
2. **Tracing**: Use consistent correlation IDs for related requests
3. **Logging Aggregation**: Use correlation ID to aggregate logs from all services
4. **Error Investigation**: Use correlation ID to reconstruct the complete request flow
5. **Performance Monitoring**: Track duration across all services using the same correlation ID

## Log Aggregation Example

Extract all logs for a specific correlation ID using tools like ELK, Datadog, or Splunk:

```
service: * AND correlationId: "my-trace-001"
```

This will show you the complete request flow across all microservices.

## Testing

Run service tests:
```bash
# Each service
cd services/user-service && npm test
cd services/product-service && npm test
cd services/order-service && npm test
```

Tests automatically disable pretty-printing and capture logs appropriately.

---

**Implementation Date**: June 3, 2026
**Technology Stack**: Pino (logging), AsyncLocalStorage (context), Express & Fastify
