'use strict';
// Entry point — import app and start listening
const app = require('./app');
const PORT = process.env.USER_SERVICE_PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`[user-service] Running on port ${PORT}`));
}
module.exports = app;
