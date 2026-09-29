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

module.exports = router;
