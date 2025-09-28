const logger = require('../config/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
    logger.error({ err }, 'Unhandled error');
    const status = err.status || 500;
    const message = err.publicMessage || 'Something went wrong';
    res.status(status).json({ error: message });
}

module.exports = errorHandler;
