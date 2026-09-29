const express = require('express');
const router = express.Router();
const preferenceController = require('../controllers/preferencecontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// The active business's screen preferences (which sections entry pages show)
router.get('/', preferenceController.getPreferences);

// Save them (business owner only)
router.put('/', preferenceController.updatePreferences);

module.exports = router;
