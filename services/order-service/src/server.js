'use strict';

const PORT = process.env.ORDER_SERVICE_PORT || 3003;
const app = require('./app');
const { getProducer } = require('./kafka/producer');
app.use((req, _res, next) => { console.log(`[order-service] ${req.method} ${req.path}`); next(); });
require('dotenv').config();
// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ service: 'order-service', status: 'healthy', uptime: process.uptime() }));

async function start() {
  // Pre-connect producer before accepting HTTP traffic
  await getProducer();
  console.log('[App] Kafka producer ready');
 
app.listen(PORT, () => console.log(`[order-service] Running on port ${PORT}`));
}

start().catch(err => {
  console.error('[App] Startup failed:', err);
  process.exit(1);
});

