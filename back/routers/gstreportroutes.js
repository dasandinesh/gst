const router = require('express').Router();
const controller = require('../controllers/gstreportcontroller');
const gstr1 = require('../controllers/gstr1controller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// GET /api/reports/gst?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', controller.getGstSummary);
// GET /api/reports/gst/monthly?months=6 — monthly totals for the dashboard chart
router.get('/monthly', controller.getMonthlyTotals);

// GSTR-1 JSON in the GST portal's offline-upload format.
router.get('/gstr1', gstr1.exportGstr1);
router.get('/gstr1/check', gstr1.checkGstr1);
router.get('/gstr3b', gstr1.getGstr3b);
router.post('/gstr2b/match', gstr1.matchGstr2b);
// Marketplace (e-commerce operator) sales reports, included in the GSTR-1 export
router.post('/ecom/import', gstr1.importEcom);
router.get('/ecom', gstr1.listEcom);
router.delete('/ecom/:id', gstr1.deleteEcom);
router.post('/gstr1/import', gstr1.importGstr1);

module.exports = router;
