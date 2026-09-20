const Supplier = require('../model/suppliermodule');

// Create a new supplier
exports.createSupplier = async (req, res) => {
    try {
        const supplierData = {
            ...req.body,
            businessId: req.auth.businessId,
            oldBalance: Number(req.body.oldBalance || 0), // opening payable balance; grows/shrinks with purchases
        };
        const supplier = new Supplier(supplierData);
        await supplier.save();
        res.status(201).json(supplier);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get all suppliers
exports.getSuppliers = async (req, res) => {
    try {
        const suppliers = await Supplier.find({ businessId: req.auth.businessId });
        res.status(200).json(suppliers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get a supplier by ID
exports.getSupplierById = async (req, res) => {
    try {
        const supplier = await Supplier.findOne({ _id: req.params.id, businessId: req.auth.businessId });
        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }
        res.status(200).json(supplier);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update a supplier by ID
exports.updateSupplier = async (req, res) => {
    try {
        const supplier = await Supplier.findOneAndUpdate(
            { _id: req.params.id, businessId: req.auth.businessId },
            req.body,
            { new: true }
        );
        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }
        res.status(200).json(supplier);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Delete a supplier by ID
exports.deleteSupplier = async (req, res) => {
    try {
        const supplier = await Supplier.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });
        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }
        res.status(200).json({ message: 'Supplier deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
