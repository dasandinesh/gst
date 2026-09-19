const InvoiceSetting = require('../model/invoice_settings');

exports.createInvoiceSetting = async (req, res) => {
    try {
        const count = await InvoiceSetting.countDocuments();
        const setting = await InvoiceSetting.create({ ...(req.body || {}), isDefault: count === 0 });
        res.status(201).json(setting);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getInvoiceSettings = async (req, res) => {
    try {
        const settings = await InvoiceSetting.find().sort({ createdAt: 1 });
        res.status(200).json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// The invoice settings bills currently print from: whichever is flagged
// default, else the only one that exists.
exports.getActiveInvoiceSetting = async (req, res) => {
    try {
        const settings = await InvoiceSetting.find().sort({ createdAt: 1 });
        if (settings.length === 0) {
            return res.status(404).json({ error: 'No invoice settings configured. Create one before printing a bill.' });
        }
        const byDefault = settings.find((s) => s.isDefault);
        if (byDefault) return res.status(200).json(byDefault);
        if (settings.length === 1) return res.status(200).json(settings[0]);
        return res.status(409).json({ error: 'Multiple invoice settings found and none is marked default. Mark one default.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getInvoiceSettingById = async (req, res) => {
    try {
        const setting = await InvoiceSetting.findById(req.params.id);
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        res.status(200).json(setting);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateInvoiceSetting = async (req, res) => {
    try {
        const setting = await InvoiceSetting.findByIdAndUpdate(
            req.params.id,
            req.body || {},
            { new: true, runValidators: true }
        );
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        res.status(200).json(setting);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Unsets isDefault on every other setting and sets it on this one.
exports.setDefaultInvoiceSetting = async (req, res) => {
    try {
        const setting = await InvoiceSetting.findById(req.params.id);
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        await InvoiceSetting.updateMany({ _id: { $ne: setting._id } }, { isDefault: false });
        setting.isDefault = true;
        await setting.save();
        res.status(200).json(setting);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteInvoiceSetting = async (req, res) => {
    try {
        const setting = await InvoiceSetting.findByIdAndDelete(req.params.id);
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        // Promote another setting to default so the app doesn't lose its fallback.
        if (setting.isDefault) {
            const next = await InvoiceSetting.findOne().sort({ createdAt: 1 });
            if (next) { next.isDefault = true; await next.save(); }
        }
        res.status(200).json({ message: 'Invoice setting deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
