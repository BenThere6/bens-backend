const service = require('./service');

async function createLinkToken(req, res, next) {
  try {
    const data = await service.createLinkToken(req.validated.body);
    res.json(data);
  } catch (err) { next(err); }
}

async function exchangePublicToken(req, res, next) {
  try {
    const data = await service.exchangePublicToken(req.validated.body);
    res.status(201).json(data);
  } catch (err) { next(err); }
}

async function syncItem(req, res, next) {
  try {
    const data = await service.syncItem(req.validated.body);
    res.json(data);
  } catch (err) { next(err); }
}

async function webhook(req, res, next) {
  try {
    // for now just ack; later you’ll trigger sync when updates available
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { createLinkToken, exchangePublicToken, syncItem, webhook };
