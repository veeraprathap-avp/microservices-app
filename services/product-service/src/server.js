'use strict';
const app = require('./app'); 
const PORT = process.env.PRODUCT_SERVICE_PORT || 3002;

app.use((req, _res, next) => { console.log(`[product-service] ${req.method} ${req.path}`); next(); });

app.listen(PORT, () => console.log(`[product-service] Running on port ${PORT}`));
