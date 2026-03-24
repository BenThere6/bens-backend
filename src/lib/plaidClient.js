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

console.log('PLAID_ENV:', process.env.PLAID_ENV);
console.log('PLAID_CLIENT_ID prefix:', process.env.PLAID_CLIENT_ID?.slice(0, 6));
console.log('PLAID_SECRET prefix:', process.env.PLAID_SECRET?.slice(0, 6));

module.exports = new PlaidApi(configuration);