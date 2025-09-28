// simple Joi validator wrapper for route inputs
const Joi = require('joi');

function validate(schema) {
    return (req, res, next) => {
        const payload = {
            body: req.body,
            query: req.query,
            params: req.params
        };
        const { error, value } = schema.validate(payload, {
            abortEarly: false,
            allowUnknown: true,
            stripUnknown: true
        });
        if (error) {
            const msg = error.details.map(d => d.message).join(', ');
            return res.status(400).json({ error: msg });
        }
        req.validated = value;
        next();
    };
}

module.exports = { validate, Joi };
