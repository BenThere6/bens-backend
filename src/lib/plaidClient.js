const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

function getBasePath() {
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
  if (env === 'production') return PlaidEnvironments.production;
  if (env === 'development') return PlaidEnvironments.development;
  return PlaidEnvironments.sandbox;
}

const configuration = new Configuration({
  basePath: getBasePath(),
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

module.exports = new PlaidApi(configuration);