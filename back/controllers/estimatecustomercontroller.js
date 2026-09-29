const EstimateCustomer = require('../model/estimatecustomermodule');

// Create a new estimate customer
exports.createEstimateCustomer = async (req, res) => {
    try {
        const openingBalance = Number(req.body.openingBalance || 0);
        const customerData = {
            ...req.body,
            businessId: req.auth.businessId,
            openingBalance,
            // Closing balance starts equal to the opening balance; estimate
            // bills move it from there.
            closingBalance: openingBalance
        };
        const customer = new EstimateCustomer(customerData);
        await customer.save();
        res.status(201).json(customer);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get all estimate customers
exports.getEstimateCustomers = async (req, res) => {
    try {
        const customers = await EstimateCustomer.find({ businessId: req.auth.businessId }).sort({ name: 1 });
        res.status(200).json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get an estimate customer by ID
exports.getEstimateCustomerById = async (req, res) => {
    try {
        const customer = await EstimateCustomer.findOne({ _id: req.params.id, businessId: req.auth.businessId });
        if (!customer) {
            return res.status(404).json({ error: 'Estimate customer not found' });
        }
        res.status(200).json(customer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update an estimate customer by ID
exports.updateEstimateCustomer = async (req, res) => {
    try {
        const update = { ...req.body };
        delete update.closingBalance; // only estimate bills move the closing balance
        const customer = await EstimateCustomer.findOneAndUpdate(
            { _id: req.params.id, businessId: req.auth.businessId },
            update,
            { new: true, runValidators: true }
        );
        if (!customer) {
            return res.status(404).json({ error: 'Estimate customer not found' });
        }
        res.status(200).json(customer);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Delete an estimate customer by ID
exports.deleteEstimateCustomer = async (req, res) => {
    try {
        const customer = await EstimateCustomer.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });
        if (!customer) {
            return res.status(404).json({ error: 'Estimate customer not found' });
        }
        res.status(200).json({ message: 'Estimate customer deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
