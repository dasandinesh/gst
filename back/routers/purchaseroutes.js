const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchasecontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

router.post('/', purchaseController.createPurchase);
router.get('/', purchaseController.getPurchases);
router.get('/:id', purchaseController.getPurchaseById);
router.put('/:id', purchaseController.updatePurchase);
router.delete('/:id', purchaseController.deletePurchase);

module.exports = router;
