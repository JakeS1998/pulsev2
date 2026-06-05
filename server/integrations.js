const providers = {
  xero: {
    name: 'Xero',
    status: 'stub',
    scopes: ['accounting.transactions', 'accounting.reports.read', 'offline_access'],
    normalises: ['invoices', 'bank transactions', 'profit and loss', 'balance sheet', 'VAT']
  },
  truelayer: {
    name: 'TrueLayer',
    status: 'stub',
    scopes: ['accounts', 'balance', 'transactions', 'offline_access'],
    normalises: ['bank accounts', 'cash balances', 'transactions']
  }
};

function listProviders() { return providers; }
function syncProvider(provider) { return { provider, status: 'queued', message: 'OAuth client and sync worker should be configured with provider credentials.' }; }
module.exports = { listProviders, syncProvider };
