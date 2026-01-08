const express = require('express');
const { validate, Joi } = require('../../middlewares/validate');
const controller = require('./controller');

const router = express.Router();

// example: GET /api/budget/envelopes?month=2025-09
router.get(
    '/envelopes',
    validate(Joi.object({ query: Joi.object({ month: Joi.string().pattern(/^\d{4}-\d{2}$/).optional() }) })),
    controller.listEnvelopes
);

router.get('/categories', controller.listCategories);

router.put(
    '/envelopes/:id/budget',
    validate(Joi.object({
        params: Joi.object({ id: Joi.string().required() }),
        body: Joi.object({
            month: Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
            plannedCents: Joi.number().integer().min(0).required()
        })
    })),
    controller.setEnvelopeBudget
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

// --- Accounts (helper so you can grab accountId) ---
router.get('/accounts', controller.listAccounts);

// --- Transactions ---
router.get(
    '/transactions',
    validate(Joi.object({
        query: Joi.object({
            from: Joi.string().isoDate().optional(),
            to: Joi.string().isoDate().optional(),
            status: Joi.string().valid('pending', 'posted').optional(),
            accountId: Joi.string().optional(),
            categoryId: Joi.string().optional(),
            merchant: Joi.string().optional(), // normalized contains
            q: Joi.string().optional(),        // memo/displayName contains
            page: Joi.number().integer().min(1).default(1),
            pageSize: Joi.number().integer().min(1).max(200).default(50)
        })
    })),
    controller.listTransactions
);

router.post(
    '/transactions',
    validate(Joi.object({
        body: Joi.object({
            accountId: Joi.string().required(),
            postedAt: Joi.string().isoDate().required(),
            amountCents: Joi.number().integer().required(), // negative = spend, positive = income/refund
            status: Joi.string().valid('pending', 'posted').default('posted'),
            merchantName: Joi.string().optional(),
            memo: Joi.string().allow('').optional(),
            categoryId: Joi.string().optional(),
            splits: Joi.array().items(Joi.object({
                categoryId: Joi.string().required(),
                amountCents: Joi.number().integer().required(),
                memo: Joi.string().allow('').optional()
            })).optional(),
            tags: Joi.array().items(Joi.string()).optional()
        })
    })),
    controller.createTransaction
);

router.patch(
    '/transactions/:id',
    validate(Joi.object({
        params: Joi.object({ id: Joi.string().required() }),
        body: Joi.object({
            categoryId: Joi.string().allow(null).optional(),
            memo: Joi.string().allow('').optional(),
            isReviewed: Joi.boolean().optional(),
            splits: Joi.array().items(Joi.object({
                categoryId: Joi.string().required(),
                amountCents: Joi.number().integer().required(),
                memo: Joi.string().allow('').optional()
            })).optional(),
            tags: Joi.array().items(Joi.string()).optional()
        })
    })),
    controller.updateTransaction
);

module.exports = router;
