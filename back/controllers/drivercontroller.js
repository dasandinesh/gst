const Driver = require('../model/drivermodule');

// Create a new driver
exports.createDriver = async (req, res) => {
    try {
        const driver = new Driver({ ...req.body, businessId: req.auth.businessId });
        await driver.save();
        res.status(201).json(driver);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get all drivers
exports.getDrivers = async (req, res) => {
    try {
        const drivers = await Driver.find({ businessId: req.auth.businessId }).sort({ name: 1 });
        res.status(200).json(drivers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get a driver by ID
exports.getDriverById = async (req, res) => {
    try {
        const driver = await Driver.findOne({ _id: req.params.id, businessId: req.auth.businessId });
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        res.status(200).json(driver);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update a driver by ID
exports.updateDriver = async (req, res) => {
    try {
        const driver = await Driver.findOneAndUpdate(
            { _id: req.params.id, businessId: req.auth.businessId },
            req.body,
            { new: true, runValidators: true }
        );
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        res.status(200).json(driver);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Delete a driver by ID
exports.deleteDriver = async (req, res) => {
    try {
        const driver = await Driver.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        res.status(200).json({ message: 'Driver deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
