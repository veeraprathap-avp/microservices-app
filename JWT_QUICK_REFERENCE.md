# JWT Authentication - Quick Reference

## What is JWT?

JWT (JSON Web Token) is a stateless way to authenticate users:
- **Client logs in** → Server creates token with secret
- **Client stores token** → In localStorage or cookies
- **Client sends token** → In `Authorization: Bearer <token>` header
- **Server verifies token** → Using the same secret
- **Token expires** → After set duration (usually 1 hour)

---

## The Secret: One Key, Two Jobs

```javascript
const JWT_SECRET = 'my-super-secret-key-min-32-chars';

// JOB 1: SIGN (Create) ✍️
const token = fastify.jwt.sign({ sub: 'alice', role: 'user' });
// Uses JWT_SECRET to create signature → "eyJhbGc..."

// JOB 2: VERIFY (Check) ✓
const payload = fastify.jwt.verify(token);
// Uses SAME JWT_SECRET to verify signature → { sub: 'alice', role: 'user' }
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ 1. LOGIN FLOW                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client POST /auth/login                                    │
│  { "username": "alice", "password": "secret" }              │
│           ↓                                                  │
│  Server validates credentials ✓                             │
│           ↓                                                  │
│  Server signs token with JWT_SECRET                         │
│           ↓                                                  │
│  Client receives & stores token                             │
│  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."                │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. AUTHENTICATED REQUEST FLOW                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client sends:                                              │
│  GET /api/users                                             │
│  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6Ik... │
│           ↓                                                  │
│  Server's fastify.authenticate decorator:                   │
│    1. Extracts token from header                            │
│    2. Verifies signature using JWT_SECRET                   │
│    3. Checks if token is expired                            │
│           ↓                                                  │
│  ✓ Valid → request.user = { sub: 'alice', role: 'user' }  │
│  ✗ Invalid → 401 Unauthorized response                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
api-gateway/src/
├── server.js                 ← Main server, uses auth module
├── utils/
│   └── auth.js              ← Auth logic (NEW - organized here)
└── utils/
    ├── correlation-id.js
    └── logger.js
```

---

## Before vs After

### BEFORE (Mixed in server.js)

```javascript
// ❌ All auth logic scattered
import fastifyJWT from '@fastify/jwt';

async function registerPlugins() {
  await fastify.register(fastifyJWT, { secret: JWT_SECRET });
}

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

### AFTER (Organized in auth.js)

```javascript
// ✅ Clean, reusable, testable
import { initializeJWT, decorateAuthenticateMethod, generateToken } from './utils/auth.js';

async function registerPlugins() {
  await initializeJWT(fastify, JWT_SECRET);
  decorateAuthenticateMethod(fastify);
}

fastify.post('/auth/login', async (request, reply) => {
  const token = generateToken(fastify, { sub: username, role: 'user' });
  return { token, expiresIn: 3600 };
});
```

---

## API Functions

### 1. Initialize JWT
```javascript
import { initializeJWT } from './utils/auth.js';

await initializeJWT(fastify, JWT_SECRET);
// Sets up JWT plugin with the secret
```

### 2. Add Authentication Decorator
```javascript
import { decorateAuthenticateMethod } from './utils/auth.js';

decorateAuthenticateMethod(fastify);
// Now fastify.authenticate is available for protected routes
```

### 3. Generate Token
```javascript
import { generateToken } from './utils/auth.js';

const token = generateToken(fastify, { sub: 'alice', role: 'user' });
// Returns: "eyJhbGc..."
```

### 4. Verify Token Manually
```javascript
import { verifyToken } from './utils/auth.js';

try {
  const payload = verifyToken(fastify, token);
  console.log(payload.sub); // 'alice'
} catch (err) {
  console.error('Token invalid:', err);
}
```

### 5. Extract Token from Request
```javascript
import { extractToken } from './utils/auth.js';

const token = extractToken(request);
// Returns token without "Bearer " prefix
```

---

## Using Protected Routes

```javascript
// ✅ Public route (no authentication)
fastify.get('/api/products', async (request, reply) => {
  return { data: [...] };
});

// ✅ Protected route (requires valid token)
fastify.get('/api/orders', 
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const userId = request.user.sub;      // ← Token payload available
    const userRole = request.user.role;   // ← From decoded JWT
    return { userId, userRole, data: [...] };
  }
);
```

---

## Testing

### Get Token
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret"}'

# Response:
# {
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "expiresIn": 3600
# }
```

### Use Token
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/orders

# Success ✓ - Returns data with user info
```

### Invalid Token
```bash
curl -H "Authorization: Bearer invalid-token-xyz" \
  http://localhost:3000/api/orders

# Error ✗ - HTTP 401 Unauthorized
# {
#   "statusCode": 401,
#   "error": "Unauthorized",
#   "message": "Invalid or expired token"
# }
```

---

## Key Takeaways

| Aspect | Details |
|--------|---------|
| **Secret** | One key for both signing AND verifying |
| **Token** | Created by server, sent to client, used in Authorization header |
| **Verification** | Server re-verifies token on each request using the same secret |
| **Expiration** | Token expires after set time (default 1h) |
| **Location** | `utils/auth.js` - organized, reusable, testable |
| **Usage** | `{ onRequest: [fastify.authenticate] }` for protected routes |

---

## Common Questions

**Q: Is the secret transmitted with the token?**
- A: No! Secret stays on server. Token is: `header.payload.signature` where signature is created from header+payload+secret, but secret itself is not in the token.

**Q: Can I use the same secret for signing and verifying?**
- A: Yes! That's exactly how HMAC works. Same secret for both.

**Q: What if I lose the secret?**
- A: All existing tokens become invalid. Users must login again.

**Q: Can someone modify the token?**
- A: They can try, but signature won't match. Server will reject it.

**Q: How long should tokens last?**
- A: Typically 1-24 hours. Shorter = more secure but more logins. Longer = convenient but riskier.

---

For detailed documentation, see [JWT_AUTHENTICATION.md](JWT_AUTHENTICATION.md)
