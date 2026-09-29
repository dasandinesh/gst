const express = require('express');
const router = express.Router();
const deliveryChallanController = require('../controllers/deliverychallancontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

router.post('/', deliveryChallanController.createChallan);
router.get('/', deliveryChallanController.getChallans);
router.get('/:id', deliveryChallanController.getChallanById);
router.put('/:id', deliveryChallanController.updateChallan);
router.put('/:id/status', deliveryChallanController.updateStatus);
router.put('/:id/mark-invoiced', deliveryChallanController.markInvoiced);
router.delete('/:id', deliveryChallanController.deleteChallan);

module.exports = router;
