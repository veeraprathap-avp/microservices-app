'use strict';

const sql  = require('mssql');
const fs   = require('fs');
const path = require('path');

async function migrate() {
  // Connect without specifying DB first (to create it if needed)
  const pool = await sql.connect({
    user:     process.env.DB_USER     || 'sa',
    password: process.env.DB_PASSWORD || 'YourStrong!Passw0rd',
    server:   process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 1433,
    options: { encrypt: false, trustServerCertificate: true },
  });

  const migrationDir = path.join(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`[order-service] Running ${files.length} migration(s)…`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    // Split on GO statements (T-SQL batch separator)
    const batches = content.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);
    console.log(`  → ${file} (${batches.length} batches)`);
    for (const batch of batches) {
      await pool.request().query(batch);
    }
  }

  console.log('[order-service] Migrations complete.');
  await pool.close();
}

migrate().catch(err => { console.error(err); process.exit(1); });
