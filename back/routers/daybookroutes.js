const router = require('express').Router();
const controller = require('../controllers/daybookcontroller');

// GET /api/reports/day-book?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', controller.getDayBook);

module.exports = router;
