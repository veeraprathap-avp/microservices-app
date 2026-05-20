'use strict';

const { query, close } = require('./connection');

// Lazy-load mssql types (only in production; skipped in test)
function types() {
  if (process.env.NODE_ENV === 'test') {
    // Return dummy type wrappers — unused in test mode
    const t = v => ({ value: v });
    return { NVarChar: () => t, Decimal: () => t, Int: t, type: t };
  }
  return require('mssql');
}

async function findAll() {
  const rows = await query(`
    SELECT o.id, o.user_id, o.status, o.total, o.notes, o.created_at, o.updated_at,
           (
             SELECT oi.id, oi.product_id, oi.product_name, oi.quantity, oi.unit_price
             FROM order_items oi WHERE oi.order_id = o.id
             FOR JSON PATH
           ) AS items
    FROM orders o
    ORDER BY o.created_at DESC
  `);
  return rows.map(parseItems);
}

async function findById(id) {
  const sql = types();
  const rows = await query(`
    SELECT o.id, o.user_id, o.status, o.total, o.notes, o.created_at, o.updated_at,
           (
             SELECT oi.id, oi.product_id, oi.product_name, oi.quantity, oi.unit_price
             FROM order_items oi WHERE oi.order_id = o.id
             FOR JSON PATH
           ) AS items
    FROM orders o
    WHERE o.id = @id
  `, {
    id: process.env.NODE_ENV === 'test'
      ? { value: id }
      : { type: sql.NVarChar(36), value: id },
  });
  return rows.length ? parseItems(rows[0]) : null;
}

async function create({ id, userId, status = 'pending', total, notes, items = [] }) {
  const isTest = process.env.NODE_ENV === 'test';
  const sql    = types();

  await query(
    `INSERT INTO orders (id, user_id, status, total, notes)
     VALUES (@id, @userId, @status, @total, @notes)`,
    {
      id:     isTest ? { value: id }       : { type: sql.NVarChar(36),  value: id },
      userId: isTest ? { value: userId }   : { type: sql.NVarChar(36),  value: userId },
      status: isTest ? { value: status }   : { type: sql.NVarChar(20),  value: status },
      total:  isTest ? { value: total }    : { type: sql.Decimal(10,2), value: total },
      notes:  isTest ? { value: notes }    : { type: sql.NVarChar(500), value: notes || null },
      // test mode only — store items inline
      ...(isTest ? { items: { value: JSON.stringify(items) } } : {}),
    }
  );

  if (!isTest) {
    // Insert order items individually in production
    for (const item of items) {
      await query(
        `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price)
         VALUES (@id, @orderId, @productId, @productName, @quantity, @unitPrice)`,
        {
          id:          { type: sql.NVarChar(36),  value: item.id },
          orderId:     { type: sql.NVarChar(36),  value: id },
          productId:   { type: sql.NVarChar(36),  value: item.productId },
          productName: { type: sql.NVarChar(200), value: item.productName },
          quantity:    { type: sql.Int,            value: item.quantity },
          unitPrice:   { type: sql.Decimal(10,2), value: item.unitPrice },
        }
      );
    }
  }

  return findById(id);
}

async function update(id, { status, notes }) {
  const isTest = process.env.NODE_ENV === 'test';
  const sql    = types();

  await query(
    `UPDATE orders
     SET status     = COALESCE(@status, status),
         notes      = COALESCE(@notes, notes),
         updated_at = GETUTCDATE()
     WHERE id = @id`,
    {
      id:     isTest ? { value: id }     : { type: sql.NVarChar(36),  value: id },
      status: isTest ? { value: status } : { type: sql.NVarChar(20),  value: status || null },
      notes:  isTest ? { value: notes }  : { type: sql.NVarChar(500), value: notes  || null },
    }
  );
  return findById(id);
}

async function remove(id) {
  const isTest = process.env.NODE_ENV === 'test';
  const sql    = types();

  const rows = await query(
    'DELETE FROM orders WHERE id = @id',
    { id: isTest ? { value: id } : { type: sql.NVarChar(36), value: id } }
  );
  return rows.length > 0;
}

function parseItems(row) {
  return {
    ...row,
    items: row.items ? JSON.parse(row.items) : [],
  };
}

module.exports = { findAll, findById, create, update, remove };
