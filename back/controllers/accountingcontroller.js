const { ACCOUNTS, GROUPS, buildVouchers, trialBalance, accountLedger } = require('../utils/accounting');

// Books of accounts (Accounts → Chart of Accounts / Trial Balance). Everything is
// derived from the saved documents on each request — see utils/accounting.js.

// GET /api/accounting/chart?endDate=YYYY-MM-DD — every account with its balance on that date.
exports.getChart = async (req, res) => {
  try {
    const vouchers = await buildVouchers(req.auth.businessId);
    const tb = trialBalance(vouchers, { endDate: req.query.endDate });
    res.json({ groups: GROUPS, accounts: tb.accounts.map(({ key, name, group, sub, closing }) => ({ key, name, group, sub, balance: closing })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/accounting/trial-balance?startDate=&endDate=
exports.getTrialBalance = async (req, res) => {
  try {
    const vouchers = await buildVouchers(req.auth.businessId);
    res.json(trialBalance(vouchers, req.query));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/accounting/ledger?account=KEY&startDate=&endDate=&party=NAME
exports.getLedger = async (req, res) => {
  try {
    if (!ACCOUNTS.some((a) => a.key === req.query.account)) return res.status(400).json({ error: 'Pick an account.' });
    const vouchers = await buildVouchers(req.auth.businessId);
    res.json(accountLedger(vouchers, req.query.account, req.query, (req.query.party || '').trim()));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
