const router = require('express').Router();
const controller = require('../controllers/gstreportcontroller');
const gstr1 = require('../controllers/gstr1controller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// GET /api/reports/gst?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', controller.getGstSummary);

// GSTR-1 JSON in the GST portal's offline-upload format.
router.get('/gstr1', gstr1.exportGstr1);
router.get('/gstr1/check', gstr1.checkGstr1);
router.post('/gstr1/import', gstr1.importGstr1);

module.exports = router;
