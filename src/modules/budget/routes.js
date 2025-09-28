const express = require('express');
const { validate, Joi } = require('../../middlewares/validate');
const controller = require('./controller');

const router = express.Router();

// example: GET /api/budget/envelopes?month=2025-09
router.get(
    '/envelopes',
    validate(Joi.object({ query: Joi.object({ month: Joi.string().isoDate().optional() }) })),
    controller.listEnvelopes
);

// example: POST /api/budget/rules
router.post(
    '/rules',
    validate(Joi.object({
        body: Joi.object({
            priority: Joi.number().integer().min(1).required(),
            tests: Joi.object().required(),   // you’ll flesh this out
            actions: Joi.object().required(),
            isActive: Joi.boolean().default(true)
        })
    })),
    controller.createRule
);

module.exports = router;
