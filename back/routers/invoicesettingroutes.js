const express = require('express');
const router = express.Router();
const invoiceSettingController = require('../controllers/invoicesettingcontroller');

// Create a new invoice setting (only if none exists)
router.post('/', invoiceSettingController.createInvoiceSetting);

// List all invoice settings
router.get('/', invoiceSettingController.getInvoiceSettings);

// The single setting bills print from (must be registered before '/:id')
router.get('/active', invoiceSettingController.getActiveInvoiceSetting);

// Get an invoice setting by ID
router.get('/:id', invoiceSettingController.getInvoiceSettingById);

// Mark an invoice setting as the default (used when more than one exists)
router.put('/:id/set-default', invoiceSettingController.setDefaultInvoiceSetting);

// Update an invoice setting by ID
router.put('/:id', invoiceSettingController.updateInvoiceSetting);

// Delete an invoice setting by ID
router.delete('/:id', invoiceSettingController.deleteInvoiceSetting);

module.exports = router;
