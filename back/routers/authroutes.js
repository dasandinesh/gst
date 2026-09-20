const express = require('express');
const router = express.Router();
const authController = require('../controllers/authcontroller');
const { protect } = require('../middleware/authmiddleware');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/select-business', authController.selectBusiness);
router.post('/logout', authController.logout);
router.get('/me', protect, authController.me);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
