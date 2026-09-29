const Customer = require('../model/customermodule');
const { cleanAddress } = require('../model/addressSchema');

// Create a new customer
exports.createCustomer = async (req, res) => {
    try {
        const customerData = {
            ...req.body,
            businessId: req.auth.businessId,
            oldBalance: Number(req.body.oldBalance || 0), // opening balance; grows/shrinks with sales & receipts
            shippingAddress: cleanAddress(req.body.shippingAddress),
        };
        const customer = new Customer(customerData);
        await customer.save();
        res.status(201).json(customer);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get all customers
exports.getCustomers = async (req, res) => {
    try {
        const customers = await Customer.find({ businessId: req.auth.businessId });
        res.status(200).json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get a customer by ID
exports.getCustomerById = async (req, res) => {
    try {
        const customer = await Customer.findOne({ _id: req.params.id, businessId: req.auth.businessId });

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.status(200).json(customer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update a customer by ID
exports.updateCustomer = async (req, res) => {
    try {
        const update = { ...req.body };
        delete update.businessId; // a customer can't be moved to another business
        if (update.shippingAddress !== undefined) update.shippingAddress = cleanAddress(update.shippingAddress);
        const customer = await Customer.findOneAndUpdate(
            { _id: req.params.id, businessId: req.auth.businessId },
            update,
            { new: true, runValidators: true }
        );
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.status(200).json(customer);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Delete a customer by ID
exports.deleteCustomer = async (req, res) => {
    try {
        const customer = await Customer.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.status(200).json({ message: 'Customer deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
