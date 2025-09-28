const env = require('./config/env');
const logger = require('./config/logger');
const app = require('./app');

const server = app.listen(env.PORT, () => {
  logger.info(`Ben's Backend listening on http://localhost:${env.PORT}`);
});

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
});
