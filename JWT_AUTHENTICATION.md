# JWT Authentication in API Gateway

## Quick Summary

**Single Secret, Two Uses:**
```javascript
const JWT_SECRET = 'supersecretkey'; // One secret for both operations

// Use 1: SIGN (Create tokens)
const token = fastify.jwt.sign({ sub: 'alice', role: 'user' }, { expiresIn: '1h' });
// Result: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzE3NDE2OTQ1LCJleHAiOjE3MTc0MjA1NDV9..."

// Use 2: VERIFY (Check tokens)
const payload = fastify.jwt.verify(token); // Uses SAME secret
// Result: { sub: 'alice', role: 'user', iat: 1717416945, exp: 1717420545 }
```

---

## Architecture

### Before (Inline in server.js)
```javascript
// ❌ Mixed concerns - auth logic scattered in server.js
await fastify.register(fastifyJWT, { secret: JWT_SECRET });

fastify.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

fastify.post('/auth/login', async (request, reply) => {
  const token = fastify.jwt.sign({ sub: username, role: 'user' }, { expiresIn: '1h' });
  return { token, expiresIn: 3600 };
});
```

### After (Organized in auth module)
```javascript
// ✅ Clean separation - auth logic in utils/auth.js
import { initializeJWT, decorateAuthenticateMethod, generateToken } from './utils/auth.js';

// In registerPlugins():
await initializeJWT(fastify, JWT_SECRET);
decorateAuthenticateMethod(fastify);

// In /auth/login route:
const token = generateToken(fastify, { sub: username, role: 'user' });
```

---

## JWT Flow Explained

### 1. Token Generation (Login)

```
Client Request:
POST /auth/login
Content-Type: application/json
{ "username": "alice", "password": "secret" }

         ↓

Server Process:
1. Validate username/password
2. Create payload: { sub: 'alice', role: 'user' }
3. Sign with JWT_SECRET: fastify.jwt.sign(payload, { expiresIn: '1h' })
4. Encode to: "eyJhbGc..." (base64url encoded header.payload.signature)

         ↓

Server Response:
HTTP 200
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Token Structure:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJzdWIiOiJhbGljZSIsInJvbGUiOiJ1c2VyIn0 . 5VVv1234...

Header          |  Payload           | Signature
{ "alg": "HS256"| { "sub": "alice"   | Generated using:
  "typ": "JWT" }| "role": "user" }   | HMAC-SHA256(
                |                    | secret, 
                |                    | header.payload)
```

### 2. Token Verification (Protected Routes)

```
Client Request:
GET /api/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

         ↓

Server Process (in fastify.authenticate decorator):
1. Extract token from "Authorization: Bearer <token>" header
2. Split token into: header.payload.signature
3. Verify signature using JWT_SECRET:
   - Recalculate: HMAC-SHA256(JWT_SECRET, header.payload)
   - Compare with provided signature
4. Decode payload and check expiration

         ↓ (If valid)

Handler Execution:
request.user = { sub: 'alice', role: 'user', iat: ..., exp: ... }
// Route handler executes

         ↓ (If invalid)

Error Response:
HTTP 401
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

---

## API Reference

### `initializeJWT(fastify, jwtSecret)`

Registers the JWT plugin with Fastify.

```javascript
await initializeJWT(fastify, process.env.JWT_SECRET);
```

**What it does:**
- Registers `@fastify/jwt` plugin
- Stores the secret for signing AND verifying
- Sets default 1h expiration
- Adds `fastify.jwt.sign()` and `fastify.jwt.verify()` methods
- Sets up custom error handling for JWT errors

---

### `decorateAuthenticateMethod(fastify)`

Adds the `authenticate` decorator to Fastify for protected routes.

```javascript
decorateAuthenticateMethod(fastify);

// Now use in routes:
fastify.get('/api/protected', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  console.log(request.user); // { sub: 'alice', role: 'user', ... }
  return { data: 'protected' };
});
```

**What it does:**
- Creates `fastify.authenticate` function
- Can be used as middleware: `{ onRequest: [fastify.authenticate] }`
- Automatically reads and verifies `Authorization: Bearer <token>`
- Sets `request.user` with decoded payload
- Throws 401 if token is invalid/missing/expired

---

### `generateToken(fastify, payload, options)`

Creates a new JWT token.

```javascript
// Default usage (1h expiration)
const token = generateToken(fastify, { sub: 'alice', role: 'user' });

// Custom expiration
const token = generateToken(fastify, { sub: 'alice', role: 'admin' }, { expiresIn: '24h' });
```

**Parameters:**
- `fastify` - Fastify instance
- `payload` - Object to encode (typically: `{ sub: username, role: role, ... }`)
- `options` - Optional override for sign options

**Returns:** JWT token string

---

### `verifyToken(fastify, token)`

Manually verify a token outside of a request context.

```javascript
try {
  const payload = verifyToken(fastify, tokenString);
  console.log(payload.sub); // 'alice'
} catch (err) {
  console.error('Invalid token:', err.message);
}
```

**Returns:** Decoded payload object
**Throws:** Error if token is invalid/expired

---

### `extractToken(request)`

Extract token from request headers.

```javascript
const token = extractToken(request); // Returns token without "Bearer " prefix
```

**Returns:** Token string or null if not found

---

## Usage Examples

### 1. Login and Get Token

```javascript
// Client side:
const response = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'secret' })
});

const { token } = await response.json();
// token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

// Store token (localStorage, sessionStorage, etc.)
localStorage.setItem('authToken', token);
```

### 2. Make Authenticated Request

```javascript
// Client side:
const token = localStorage.getItem('authToken');

const response = await fetch('http://localhost:3000/api/users', {
  headers: {
    'Authorization': `Bearer ${token}` // ← Include token here
  }
});

const data = await response.json();
```

### 3. Protected Route Handler

```javascript
// Server side (server.js):
fastify.get('/api/users', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  // If we reach here, token was valid
  const userId = request.user.sub;
  const userRole = request.user.role;
  
  // Process request with user info
  return { userId, userRole, data: [...] };
});
```

### 4. Optional Authentication

```javascript
// Route that works with or without token
fastify.get('/api/public-data', async (request, reply) => {
  let userId = null;
  
  if (request.headers.authorization) {
    try {
      await request.jwtVerify();
      userId = request.user.sub;
    } catch (err) {
      // Token provided but invalid - handle gracefully
    }
  }
  
  return { data: [...], userId };
});
```

---

## Security Best Practices

### 1. Secret Management
```javascript
// ❌ DON'T: Hardcode in production
const JWT_SECRET = 'supersecretkey';

// ✅ DO: Use environment variables
const JWT_SECRET = process.env.JWT_SECRET;

// ✅ DO: Use strong, random secrets (minimum 32 characters)
// Generate: openssl rand -base64 32
```

### 2. Token Storage (Client)
```javascript
// ❌ DON'T: Store in localStorage (XSS vulnerability)
localStorage.setItem('token', token);

// ✅ DO: Store in httpOnly cookie (cannot be accessed by JavaScript)
// Server sets: Set-Cookie: authToken=<token>; HttpOnly; Secure; SameSite=Strict
```

### 3. Token Expiration
```javascript
// ✅ DO: Set reasonable expiration times
generateToken(fastify, payload, { expiresIn: '1h' });   // Short-lived access token
generateToken(fastify, payload, { expiresIn: '7d' });   // Longer for refresh tokens
```

### 4. HTTPS in Production
```javascript
// ✅ DO: Always use HTTPS in production
// Tokens can be stolen if transmitted over HTTP
```

---

## Testing

### Test JWT Manually

```bash
# 1. Get a token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret"}' | jq -r '.token')

echo "Token: $TOKEN"

# 2. Use token to access protected route
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/users

# 3. Try with invalid token (should get 401)
curl -H "Authorization: Bearer invalid-token" http://localhost:3000/api/users
# Expected: HTTP 401 Unauthorized
```

### Decode Token (see payload)

```bash
# Use jwt.io or command line:
echo $TOKEN | cut -d. -f2 | base64 -d | jq

# Output:
# {
#   "sub": "alice",
#   "role": "user",
#   "iat": 1717416945,
#   "exp": 1717420545
# }
```

---

## Troubleshooting

### Token Expired
```
Error: Token is expired
Solution: Get a new token via /auth/login
```

### Invalid Signature
```
Error: Invalid signature
Solution: 
- Token was tampered with
- Different JWT_SECRET used
- Ensure JWT_SECRET matches on server
```

### Missing Authorization Header
```
Error: No Authorization header
Solution: Include header: Authorization: Bearer <token>
```

---

**Implementation Date:** June 3, 2026
**Authentication Type:** JWT (JSON Web Token) with HMAC-SHA256
**Default Expiration:** 1 hour for access tokens
