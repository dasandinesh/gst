const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/suppliercontroller');

// Create a new supplier
router.post('/', supplierController.createSupplier);

// Get all suppliers
router.get('/', supplierController.getSuppliers);

// Get a supplier by ID
router.get('/:id', supplierController.getSupplierById);

// Update a supplier by ID
router.put('/:id', supplierController.updateSupplier);

// Delete a supplier by ID
router.delete('/:id', supplierController.deleteSupplier);

module.exports = router;
