'use strict';

// ─── In-memory adapter (NODE_ENV=test) ───────────────────────────────────────
class InMemoryStore {
  constructor() {
    this.orders = new Map();
    this.items  = new Map();   // keyed by order_id → array of items
  }

  reset() { this.orders.clear(); this.items.clear(); }

  async query(text, params = {}) {
    const t = text.trim().toUpperCase();

    // SELECT all orders
    if (t.startsWith('SELECT') && !params.id) {
      return [...this.orders.values()].map(o => ({
        ...o,
        items: JSON.stringify(this.items.get(o.id) || []),
      }));
    }
    // SELECT single order
    if (t.startsWith('SELECT') && t.includes('WHERE') && params.id) {
      const o = this.orders.get(params.id.value);
      if (!o) return [];
      return [{ ...o, items: JSON.stringify(this.items.get(o.id) || []) }];
    }
    // INSERT order
    if (t.startsWith('INSERT INTO ORDERS')) {
      const o = {
        id:         params.id.value,
        user_id:    params.userId.value,
        status:     params.status?.value  || 'pending',
        total:      params.total?.value   || 0,
        notes:      params.notes?.value   || null,
        created_at: new Date(),
        updated_at: null,
      };
      this.orders.set(o.id, o);
      if (params.items) {
        this.items.set(o.id, JSON.parse(params.items.value));
      }
      return [{ ...o, items: params.items?.value || '[]' }];
    }
    // UPDATE order
    if (t.startsWith('UPDATE') && params.id) {
      const o = this.orders.get(params.id.value);
      if (!o) return [];
      if (params.status) o.status = params.status.value;
      if (params.notes  != null) o.notes = params.notes.value;
      o.updated_at = new Date();
      this.orders.set(o.id, o);
      return [{ ...o, items: JSON.stringify(this.items.get(o.id) || []) }];
    }
    // DELETE order
    if (t.startsWith('DELETE') && params.id) {
      const ok = this.orders.delete(params.id.value);
      return ok ? [{ id: params.id.value }] : [];
    }
    return [];
  }

  async close() {}
}

// ─── SQL Server pool (production) ────────────────────────────────────────────
let pool = null;

async function getMssqlPool() {
  if (pool) return pool;
  const sql = require('mssql');
  pool = await sql.connect({
    user:     process.env.DB_USER     || 'sa',
    password: process.env.DB_PASSWORD,
    server:   process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME     || 'orders_db',
    options: {
      encrypt:                process.env.DB_ENCRYPT    !== 'false',
      trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    },
    pool: {
      max: Number(process.env.DB_POOL_MAX) || 10,
      min: 2,
      idleTimeoutMillis: 30000,
    },
  });
  pool.on('error', err => {
    console.error('[order-service] MSSQL pool error:', err);
    pool = null;
  });
  return pool;
}

// ─── Unified query interface ──────────────────────────────────────────────────
const inMemory = new InMemoryStore();

async function query(text, params = {}) {
  if (process.env.NODE_ENV === 'test') return inMemory.query(text, params);

  const sql  = require('mssql');
  const p    = await getMssqlPool();
  const req  = p.request();

  for (const [k, { type, value }] of Object.entries(params)) {
    req.input(k, type, value);
  }
  const result = await req.query(text);
  return result.recordset;
}

async function close() {
  if (pool) { await pool.close(); pool = null; }
}

function resetForTest() { inMemory.reset(); }

module.exports = { query, close, resetForTest };
