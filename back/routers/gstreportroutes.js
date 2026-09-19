const router = require('express').Router();
const controller = require('../controllers/gstreportcontroller');

// GET /api/reports/gst?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', controller.getGstSummary);

module.exports = router;
