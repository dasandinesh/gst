const router = require('express').Router();
const controller = require('../controllers/gstreportcontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// GET /api/reports/gst?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', controller.getGstSummary);

module.exports = router;
