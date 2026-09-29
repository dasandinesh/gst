const { GROUPS, buildBooks, loadChart, trialBalance, accountLedger } = require('../utils/accounting');
const LedgerAccount = require('../model/ledgeraccountmodule');
const Expense = require('../model/expensemodule');
const Journal = require('../model/journalmodule');
const Counter = require('../model/countermodule');
const { financialYearLabel } = require('../utils/financialYear');
const { profitAndLoss, balanceSheet, estimateStock } = require('../utils/financialStatements');

// Books of accounts (Accounts → Chart of Accounts / Trial Balance / Account
// Ledger / Expenses / Journal Voucher). Reports are derived from the saved
// documents on each request — see utils/accounting.js.

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;
const fail = (res, error, status = 400) => res.status(status).json({ error: error.message || String(error) });

// ------------------------------------------------------------------ reports

// GET /api/accounting/chart?endDate=YYYY-MM-DD — every account with its balance on that date.
exports.getChart = async (req, res) => {
  try {
    const { accounts, vouchers } = await buildBooks(req.auth.businessId);
    const tb = trialBalance(vouchers, { endDate: req.query.endDate }, accounts);
    const details = Object.fromEntries((await LedgerAccount.find({ businessId: req.auth.businessId }).lean()).map((a) => [`c_${a._id}`, a]));
    res.json({
      groups: GROUPS,
      accounts: tb.accounts.map(({ key, name, group, sub, kind, custom, active, closing }) => ({
        key, name, group, sub, kind, custom, active, balance: closing,
        ...(details[key] ? {
          id: details[key]._id, openingBalance: details[key].openingBalance, openingSide: details[key].openingSide,
          bankName: details[key].bankName, accountNumber: details[key].accountNumber, ifsc: details[key].ifsc,
        } : {}),
      })),
    });
  } catch (error) {
    fail(res, error, 500);
  }
};

// GET /api/accounting/trial-balance?startDate=&endDate=
exports.getTrialBalance = async (req, res) => {
  try {
    const { accounts, vouchers } = await buildBooks(req.auth.businessId);
    res.json(trialBalance(vouchers, req.query, accounts));
  } catch (error) {
    fail(res, error, 500);
  }
};

// GET /api/accounting/ledger?account=KEY&startDate=&endDate=&party=NAME
exports.getLedger = async (req, res) => {
  try {
    const { accounts, vouchers } = await buildBooks(req.auth.businessId);
    if (!accounts.some((a) => a.key === req.query.account)) return res.status(400).json({ error: 'Pick an account.' });
    res.json(accountLedger(vouchers, req.query.account, req.query, (req.query.party || '').trim(), accounts));
  } catch (error) {
    fail(res, error);
  }
};

// GET /api/accounting/profit-loss?startDate=&endDate=&openingStock=&closingStock=
exports.getProfitAndLoss = async (req, res) => {
  try {
    const { accounts, vouchers } = await buildBooks(req.auth.businessId);
    res.json(profitAndLoss(vouchers, accounts, req.query, { openingStock: num(req.query.openingStock), closingStock: num(req.query.closingStock) }));
  } catch (error) {
    fail(res, error, 500);
  }
};

// GET /api/accounting/balance-sheet?endDate=&closingStock=&startingStock=
exports.getBalanceSheet = async (req, res) => {
  try {
    const { accounts, vouchers } = await buildBooks(req.auth.businessId);
    res.json(balanceSheet(vouchers, accounts, req.query, { closingStock: num(req.query.closingStock), startingStock: num(req.query.startingStock) }));
  } catch (error) {
    fail(res, error, 500);
  }
};

// GET /api/accounting/stock-estimate — today's stock value from quantities × latest purchase rates.
exports.getStockEstimate = async (req, res) => {
  try {
    res.json(await estimateStock(req.auth.businessId));
  } catch (error) {
    fail(res, error, 500);
  }
};

// ------------------------------------------------------------------ business-added accounts

const accountFields = (body) => {
  const group = String(body.group || '');
  const kind = ['bank', 'expense', 'income', 'other'].includes(body.kind) ? body.kind : 'other';
  // Kind decides the group for banks / expenses / incomes.
  const fixedGroup = { bank: 'asset', expense: 'expense', income: 'income' }[kind];
  return {
    name: String(body.name || '').trim(),
    group: fixedGroup || group,
    kind,
    openingBalance: Math.max(0, round2(body.openingBalance)),
    openingSide: body.openingSide === 'cr' ? 'cr' : 'dr',
    bankName: kind === 'bank' ? String(body.bankName || '').trim() : '',
    accountNumber: kind === 'bank' ? String(body.accountNumber || '').trim() : '',
    ifsc: kind === 'bank' ? String(body.ifsc || '').trim().toUpperCase() : '',
    ...(body.active === undefined ? {} : { active: Boolean(body.active) }),
  };
};
const duplicateName = (error) => (error.code === 11000 ? new Error('An account with this name already exists.') : error);

// POST /api/accounting/accounts
exports.createAccount = async (req, res) => {
  try {
    const data = accountFields(req.body);
    if (!data.name) return res.status(400).json({ error: 'Enter the account name.' });
    const chart = await loadChart(req.auth.businessId);
    if (chart.some((a) => a.name.toLowerCase() === data.name.toLowerCase())) return res.status(400).json({ error: 'An account with this name already exists.' });
    res.status(201).json(await LedgerAccount.create({ ...data, businessId: req.auth.businessId }));
  } catch (error) {
    fail(res, duplicateName(error));
  }
};

// PUT /api/accounting/accounts/:id
exports.updateAccount = async (req, res) => {
  try {
    const data = accountFields(req.body);
    if (!data.name) return res.status(400).json({ error: 'Enter the account name.' });
    const updated = await LedgerAccount.findOneAndUpdate({ _id: req.params.id, businessId: req.auth.businessId }, data, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Account not found.' });
    res.json(updated);
  } catch (error) {
    fail(res, duplicateName(error));
  }
};

// DELETE /api/accounting/accounts/:id — only when nothing is posted to it (else deactivate it).
exports.deleteAccount = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const key = `c_${req.params.id}`;
    const [inExpenses, inJournals] = await Promise.all([
      Expense.exists({ businessId, $or: [{ account: key }, { paidFrom: key }] }),
      Journal.exists({ businessId, 'lines.account': key }),
    ]);
    if (inExpenses || inJournals) return res.status(400).json({ error: 'This account has entries. Untick "Active" to hide it instead of deleting.' });
    const removed = await LedgerAccount.findOneAndDelete({ _id: req.params.id, businessId });
    if (!removed) return res.status(404).json({ error: 'Account not found.' });
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
};

// ------------------------------------------------------------------ expenses

const periodFilter = (req, field) => {
  const filter = { businessId: req.auth.businessId };
  if (req.query.startDate || req.query.endDate) {
    filter[field] = {};
    if (req.query.startDate) filter[field].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
    if (req.query.endDate) filter[field].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
  }
  return filter;
};

// Checks an expense against the chart and works out its GST and total.
const prepareExpense = (body, chart) => {
  const byKey = Object.fromEntries(chart.map((a) => [a.key, a]));
  const account = byKey[body.account];
  if (!account || account.group !== 'expense') throw new Error('Pick an expense account.');
  const paidFrom = String(body.paidFrom || 'cash');
  const from = byKey[paidFrom];
  const moneyAccount = paidFrom === 'cash' || paidFrom === 'bank' || (from && from.kind === 'bank');
  if (!moneyAccount && paidFrom !== 'creditors') throw new Error('Pick where it was paid from: cash, a bank account, or "Not paid yet (supplier)".');
  const amount = round2(body.amount);
  if (!(amount > 0)) throw new Error('Enter the amount.');
  const payee = String(body.payee || '').trim();
  if (paidFrom === 'creditors' && !payee) throw new Error('Enter the supplier (payee) — the amount is owed to them.');
  if (!body.date) throw new Error('Enter the date.');
  const gstRate = Math.max(0, Math.min(100, num(body.gstRate)));
  const taxType = body.taxType === 'IGST' ? 'IGST' : 'CGST_SGST';
  const half = round2(amount * gstRate / 200);
  const igst = taxType === 'IGST' ? round2(amount * gstRate / 100) : 0;
  const cgst = taxType === 'IGST' ? 0 : half;
  const sgst = taxType === 'IGST' ? 0 : half;
  return {
    date: body.date, account: account.key, paidFrom, payee,
    payeeGstin: String(body.payeeGstin || '').trim().toUpperCase(),
    billNumber: String(body.billNumber || '').trim(),
    amount, gstRate, taxType, claimItc: body.claimItc !== false,
    cgst, sgst, igst, total: round2(amount + cgst + sgst + igst),
    note: String(body.note || '').trim(),
  };
};

// GET /api/accounting/expenses?startDate=&endDate=
exports.listExpenses = async (req, res) => {
  try {
    res.json(await Expense.find(periodFilter(req, 'date')).sort({ date: -1, createdAt: -1 }).lean());
  } catch (error) {
    fail(res, error, 500);
  }
};

// POST /api/accounting/expenses
exports.createExpense = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const data = prepareExpense(req.body, await loadChart(businessId));
    const fy = financialYearLabel(data.date);
    data.number = `EXP/${fy}/${String(await Counter.next(`${businessId}:expense:${fy}`)).padStart(4, '0')}`;
    res.status(201).json(await Expense.create({ ...data, businessId }));
  } catch (error) {
    fail(res, error);
  }
};

// PUT /api/accounting/expenses/:id
exports.updateExpense = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const data = prepareExpense(req.body, await loadChart(businessId));
    const updated = await Expense.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Expense not found.' });
    res.json(updated);
  } catch (error) {
    fail(res, error);
  }
};

// DELETE /api/accounting/expenses/:id
exports.deleteExpense = async (req, res) => {
  try {
    const removed = await Expense.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });
    if (!removed) return res.status(404).json({ error: 'Expense not found.' });
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
};

// ------------------------------------------------------------------ journal vouchers

// Checks a journal: known accounts, each line a debit or a credit, debits = credits.
const prepareJournal = (body, chart) => {
  const keys = new Set(chart.map((a) => a.key));
  if (!body.date) throw new Error('Enter the date.');
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((l) => ({ account: String(l.account || ''), party: String(l.party || '').trim(), debit: round2(l.debit), credit: round2(l.credit) }))
    .filter((l) => l.account || l.debit || l.credit);
  if (lines.length < 2) throw new Error('A journal needs at least two lines (one debit, one credit).');
  lines.forEach((l, i) => {
    if (!keys.has(l.account)) throw new Error(`Line ${i + 1}: pick an account.`);
    if (l.debit < 0 || l.credit < 0) throw new Error(`Line ${i + 1}: amounts cannot be negative.`);
    if ((l.debit > 0) === (l.credit > 0)) throw new Error(`Line ${i + 1}: enter either a debit or a credit amount.`);
  });
  const debit = round2(lines.reduce((t, l) => t + l.debit, 0));
  const credit = round2(lines.reduce((t, l) => t + l.credit, 0));
  if (Math.abs(debit - credit) >= 0.01) throw new Error(`Debits (${debit.toFixed(2)}) and credits (${credit.toFixed(2)}) must be equal.`);
  return { date: body.date, narration: String(body.narration || '').trim(), lines, total: debit };
};

// GET /api/accounting/journals?startDate=&endDate=
exports.listJournals = async (req, res) => {
  try {
    res.json(await Journal.find(periodFilter(req, 'date')).sort({ date: -1, createdAt: -1 }).lean());
  } catch (error) {
    fail(res, error, 500);
  }
};

// POST /api/accounting/journals
exports.createJournal = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const data = prepareJournal(req.body, await loadChart(businessId));
    const fy = financialYearLabel(data.date);
    data.number = `JV/${fy}/${String(await Counter.next(`${businessId}:journal:${fy}`)).padStart(4, '0')}`;
    res.status(201).json(await Journal.create({ ...data, businessId }));
  } catch (error) {
    fail(res, error);
  }
};

// PUT /api/accounting/journals/:id
exports.updateJournal = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const data = prepareJournal(req.body, await loadChart(businessId));
    const updated = await Journal.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Journal not found.' });
    res.json(updated);
  } catch (error) {
    fail(res, error);
  }
};

// DELETE /api/accounting/journals/:id
exports.deleteJournal = async (req, res) => {
  try {
    const removed = await Journal.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });
    if (!removed) return res.status(404).json({ error: 'Journal not found.' });
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
};

// Exported for tests.
exports.prepareExpense = prepareExpense;
exports.prepareJournal = prepareJournal;
