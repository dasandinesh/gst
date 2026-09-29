const express = require('express');
const router = express.Router();
const estimateCustomerController = require('../controllers/estimatecustomercontroller');
const { protect } = require('../middleware/authmiddleware');

router.use(protect);

// Create a new estimate customer
router.post('/', estimateCustomerController.createEstimateCustomer);

// Get all estimate customers
router.get('/', estimateCustomerController.getEstimateCustomers);

// Get an estimate customer by ID
router.get('/:id', estimateCustomerController.getEstimateCustomerById);

// Update an estimate customer by ID
router.put('/:id', estimateCustomerController.updateEstimateCustomer);

// Delete an estimate customer by ID
router.delete('/:id', estimateCustomerController.deleteEstimateCustomer);

module.exports = router;
