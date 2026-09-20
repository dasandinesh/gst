const express = require('express');
const router = express.Router();
const productController = require('../controllers/productcontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// Create a new product
router.post('/',  productController.createProduct);

// Get all products
router.get('/', productController.getProducts);

// Get a product by ID
router.get('/:id', productController.getProductById);

// Update a product by ID
router.put('/:id', productController.updateProduct);

// Manually adjust stock on hand by a +/- delta
router.post('/:id/adjust-stock', productController.adjustStock);

// Delete a product by ID
router.delete('/:id', productController.deleteProduct);

module.exports = router;