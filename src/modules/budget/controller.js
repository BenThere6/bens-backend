const service = require('./service');

async function listEnvelopes(req, res, next) {
    try {
        const month = req.validated?.query?.month || null;
        const data = await service.listEnvelopes({ month });
        res.json(data);
    } catch (err) {
        next(err);
    }
}

async function createRule(req, res, next) {
    try {
        const payload = req.validated.body;
        const rule = await service.createRule(payload);
        res.status(201).json(rule);
    } catch (err) {
        next(err);
    }
}

module.exports = { listEnvelopes, createRule };
