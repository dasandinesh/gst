const router = require('express').Router();
const controller = require('../controllers/daybookcontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// GET /api/reports/day-book?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', controller.getDayBook);

module.exports = router;
