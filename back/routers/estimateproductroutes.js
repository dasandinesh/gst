const express = require('express');
const router = express.Router();
const estimateProductController = require('../controllers/estimateproductcontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// Create a new estimate product
router.post('/', estimateProductController.createEstimateProduct);

// Get all estimate products
router.get('/', estimateProductController.getEstimateProducts);

// Get an estimate product by ID
router.get('/:id', estimateProductController.getEstimateProductById);

// Update an estimate product by ID
router.put('/:id', estimateProductController.updateEstimateProduct);

// Manually adjust the main godown quantity by a +/- delta
router.post('/:id/adjust-stock', estimateProductController.adjustGodownQuantity);

// Delete an estimate product by ID
router.delete('/:id', estimateProductController.deleteEstimateProduct);

module.exports = router;
