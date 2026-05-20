# Node.js Microservices Application

A production-ready microservices architecture using **Fastify** as the API Gateway and **Express** for individual services.

## Architecture

```
                      ┌──────────────────────────────┐
  Client Request ───► │   API Gateway (Fastify :3000) │
                      │  • JWT Authentication          │
                      │  • Rate Limiting (100/min)     │
                      │  • CORS                        │
                      │  • Request Routing             │
                      │  • Health Aggregation          │
                      └──────┬───────┬────────┬───────┘
                             │       │        │
               ┌─────────────┘  ┌────┘   ┌───┘
               ▼                ▼        ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ User Service │  │Product Svc   │  │ Order Service│
    │  Express     │  │  Express     │  │  Express     │
    │  Port: 3001  │  │  Port: 3002  │  │  Port: 3003  │
    └──────────────┘  └──────────────┘  └──────────────┘
```

## Tech Stack

| Layer         | Technology       | Why                                           |
|---------------|------------------|-----------------------------------------------|
| API Gateway   | **Fastify v4**   | 3× faster than Express, plugin ecosystem, built-in schema validation |
| Microservices | **Express v4**   | Battle-tested, minimal, ideal for single-responsibility services |
| Auth          | JWT via `@fastify/jwt` | Stateless, scalable authentication       |
| Rate Limiting | `@fastify/rate-limit`  | Protection against abuse                 |
| Containerization | Docker Compose  | One-command deployment                  |

## Quick Start

### Local Development (without Docker)

```bash
# Install all dependencies
npm install
cd api-gateway && npm install
cd ../services/user-service && npm install
cd ../services/product-service && npm install
cd ../services/order-service && npm install

# Start all services (from root)
npm run dev
```

### Docker Compose (Recommended)

```bash
docker-compose up --build
```

## API Reference

### Gateway Base URL: `http://localhost:3000`

#### Authentication
```http
POST /auth/login
Content-Type: application/json

{ "username": "alice", "password": "any-password" }
```
Returns: `{ "token": "eyJ...", "expiresIn": 3600 }`

---

#### Users API
| Method | Path            | Auth | Description       |
|--------|-----------------|------|-------------------|
| GET    | /api/users      | ❌   | List all users    |
| GET    | /api/users/:id  | ❌   | Get user by ID    |
| POST   | /api/users      | ✅   | Create user       |
| PUT    | /api/users/:id  | ✅   | Update user       |
| DELETE | /api/users/:id  | ✅   | Delete user       |

#### Products API
| Method | Path               | Auth | Description          |
|--------|--------------------|------|----------------------|
| GET    | /api/products      | ❌   | List (filter by ?category, ?minPrice, ?maxPrice) |
| GET    | /api/products/:id  | ❌   | Get product by ID    |
| POST   | /api/products      | ✅   | Create product       |
| PUT    | /api/products/:id  | ✅   | Update product       |
| DELETE | /api/products/:id  | ✅   | Delete product       |

#### Orders API (all require JWT)
| Method | Path             | Auth | Description               |
|--------|------------------|------|---------------------------|
| GET    | /api/orders      | ✅   | List (filter by ?userId, ?status) |
| GET    | /api/orders/:id  | ✅   | Get order by ID           |
| POST   | /api/orders      | ✅   | Place order               |
| PATCH  | /api/orders/:id  | ✅   | Update order status       |

#### System
| Method | Path         | Description                      |
|--------|--------------|----------------------------------|
| GET    | /health      | Gateway + all services health    |
| GET    | /            | Service info & route map         |

---

## Example Workflow

```bash
# 1. Get a JWT token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret"}' | jq -r .token)

# 2. List products (no auth needed)
curl http://localhost:3000/api/products

# 3. Create a product (JWT required)
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Gaming Mouse","category":"Peripherals","price":79.99,"stock":150}'

# 4. Place an order
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":"p1","quantity":2,"price":1299.99}'

# 5. Check all service health
curl http://localhost:3000/health
```

## Environment Variables

| Variable              | Default              | Description              |
|-----------------------|----------------------|--------------------------|
| `GATEWAY_PORT`        | `3000`               | API Gateway port         |
| `JWT_SECRET`          | `supersecretkey`     | JWT signing secret       |
| `USER_SERVICE_PORT`   | `3001`               | User service port        |
| `PRODUCT_SERVICE_PORT`| `3002`               | Product service port     |
| `ORDER_SERVICE_PORT`  | `3003`               | Order service port       |

## Project Structure

```
microservices-app/
├── api-gateway/              # Fastify API Gateway
│   ├── src/server.js         # Gateway entrypoint with routing, auth, rate limiting
│   ├── Dockerfile
│   └── package.json
├── services/
│   ├── user-service/         # User CRUD (Express)
│   │   ├── src/server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── product-service/      # Product CRUD + filtering (Express)
│   │   ├── src/server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   └── order-service/        # Order management + status workflow (Express)
│       ├── src/server.js
│       ├── Dockerfile
│       └── package.json
├── docker-compose.yml
├── package.json              # Workspace root
└── README.md
```

## Production Considerations

- Replace in-memory stores with real databases (PostgreSQL, MongoDB)
- Add a message broker (RabbitMQ/Kafka) for async inter-service communication
- Add distributed tracing (OpenTelemetry / Jaeger)
- Use a secrets manager for JWT_SECRET (AWS Secrets Manager, Vault)
- Add circuit breaker pattern (opossum) for resilient proxy calls
- Enable Fastify schema-based request validation for all routes
