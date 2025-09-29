const service = require('./service');

async function listEnvelopes(req, res, next) {
    try {
        const month = req.validated?.query?.month || null;
        const data = await service.listEnvelopes({ month });
        res.json(data);
    } catch (err) { next(err); }
}

async function createRule(req, res, next) {
    try {
        const payload = req.validated.body;
        const rule = await service.createRule(payload);
        res.status(201).json(rule);
    } catch (err) { next(err); }
}

async function listAccounts(_req, res, next) {
    try {
        const data = await service.listAccounts();
        res.json(data);
    } catch (err) { next(err); }
}

async function listTransactions(req, res, next) {
    try {
        const data = await service.listTransactions(req.validated.query);
        res.json(data);
    } catch (err) { next(err); }
}

async function createTransaction(req, res, next) {
    try {
        const tx = await service.createTransaction(req.validated.body);
        res.status(201).json(tx);
    } catch (err) { next(err); }
}

async function updateTransaction(req, res, next) {
    try {
        const { id } = req.validated.params;
        const tx = await service.updateTransaction(id, req.validated.body);
        res.json(tx);
    } catch (err) { next(err); }
}

module.exports = {
    listEnvelopes,
    createRule,
    listAccounts,
    listTransactions,
    createTransaction,
    updateTransaction
};