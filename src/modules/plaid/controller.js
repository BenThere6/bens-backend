const service = require('./service');

async function createLinkToken(req, res, next) {
  try {
    const data = await service.createLinkToken(req.validated.body);
    res.json(data);
  } catch (err) {
    const plaidData = err?.response?.data;
    const plaidStatus = err?.response?.status || 500;

    console.error('Plaid createLinkToken status:', plaidStatus);
    console.error('Plaid createLinkToken data:', JSON.stringify(plaidData, null, 2));

    return res.status(plaidStatus).json({
      error: 'plaid_link_token_failed',
      plaid: plaidData || null,
      message: err.message,
    });
  }
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

async function sandboxPublicToken(req, res, next) {
  try {
    const data = await service.sandboxPublicToken();
    res.json(data);
  } catch (err) { next(err); }
}

module.exports = { createLinkToken, exchangePublicToken, syncItem, webhook, sandboxPublicToken };