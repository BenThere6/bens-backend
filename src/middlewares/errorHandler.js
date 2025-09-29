const logger = require('../config/logger');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
    logger.error({ err }, 'Unhandled error');
    const status = err.status || 500;
    const payload = { error: env.NODE_ENV === 'development' ? err.message : 'Something went wrong' };
    res.status(status).json(payload);
}
module.exports = errorHandler;