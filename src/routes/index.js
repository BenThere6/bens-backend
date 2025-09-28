const express = require('express');
const health = require('./health');
const budget = require('../modules/budget');

const api = express.Router();

api.use(health);
api.use(budget.basePath, budget.router);

module.exports = api;