const express = require('express');
const router = express.Router();
const gstSaleController = require('../controllers/gstsalecontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

router.post('/', gstSaleController.createGstSale);
router.get('/', gstSaleController.getGstSales);
router.get('/:id', gstSaleController.getGstSaleById);
router.put('/:id', gstSaleController.updateGstSale);
router.delete('/:id', gstSaleController.deleteGstSale);

module.exports = router;
