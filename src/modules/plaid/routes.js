const express = require('express');
const { validate, Joi } = require('../../middlewares/validate');
const controller = require('./controller');

const router = express.Router();

// POST /api/plaid/linkToken
router.post(
  '/linkToken',
  validate(Joi.object({
    body: Joi.object({
      // keep it simple for now
      countryCodes: Joi.array().items(Joi.string()).default(['US']),
      // you can override products later; default to transactions
      products: Joi.array().items(Joi.string()).default(['transactions']),
    }).default({}),
  })),
  controller.createLinkToken
);

// POST /api/plaid/exchange
router.post(
  '/exchange',
  validate(Joi.object({
    body: Joi.object({
      publicToken: Joi.string().required(),
      institutionName: Joi.string().allow('', null).optional(),
    }),
  })),
  controller.exchangePublicToken
);

// POST /api/plaid/sync
router.post(
  '/sync',
  validate(Joi.object({
    body: Joi.object({
      plaidItemId: Joi.string().required(), // your internal PlaidItem.id
      recalcMonth: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(), // optional YYYY-MM
    }),
  })),
  controller.syncItem
);

// POST /api/plaid/webhook (optional now; useful later)
router.post('/webhook', controller.webhook);

// POST /api/plaid/_sandbox/publicToken  (dev-only helper)
router.post('/_sandbox/publicToken', controller.sandboxPublicToken);

module.exports = router;