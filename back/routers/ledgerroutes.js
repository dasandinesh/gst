const router = require('express').Router();
const controller = require('../controllers/ledgercontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// GET /api/ledger?customer=NAME&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', controller.getCustomerLedger);

// GET /api/ledger/supplier?supplier=NAME&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/supplier', controller.getSupplierLedger);

module.exports = router;
