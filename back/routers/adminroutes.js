const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admincontroller');
const { protectAdmin } = require('../middleware/authmiddleware');

router.post('/login', adminController.adminLogin);
router.post('/logout', adminController.adminLogout);
router.get('/me', protectAdmin, adminController.adminMe);
router.get('/users', protectAdmin, adminController.listUsers);
router.patch('/users/:id/status', protectAdmin, adminController.setUserStatus);
router.delete('/users/:id', protectAdmin, adminController.deleteUser);
router.get('/gst-summary', protectAdmin, adminController.platformGstSummary);

module.exports = router;
