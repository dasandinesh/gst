const router = require('express').Router();
const controller = require('../controllers/accountingcontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// Chart of accounts with balances on a date
router.get('/chart', controller.getChart);

// Trial balance for a period
router.get('/trial-balance', controller.getTrialBalance);

// One account's statement for a period (optionally one customer / supplier)
router.get('/ledger', controller.getLedger);

// Financial statements
router.get('/profit-loss', controller.getProfitAndLoss);
router.get('/balance-sheet', controller.getBalanceSheet);
router.get('/stock-estimate', controller.getStockEstimate);

// Accounts the business adds (banks, expense / income heads, loans, …)
router.post('/accounts', controller.createAccount);
router.put('/accounts/:id', controller.updateAccount);
router.delete('/accounts/:id', controller.deleteAccount);

// Expense vouchers
router.get('/expenses', controller.listExpenses);
router.post('/expenses', controller.createExpense);
router.put('/expenses/:id', controller.updateExpense);
router.delete('/expenses/:id', controller.deleteExpense);

// Journal vouchers
router.get('/journals', controller.listJournals);
router.post('/journals', controller.createJournal);
router.put('/journals/:id', controller.updateJournal);
router.delete('/journals/:id', controller.deleteJournal);

module.exports = router;
