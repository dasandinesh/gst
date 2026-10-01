const InvoiceSetting = require('../model/invoice_settings');
const Counter = require('../model/countermodule');
const { financialYearLabel } = require('../utils/financialYear');
const { normalizeGstin } = require('../utils/gstin');
const { DEFAULT_FORMAT, DEFAULT_DIGITS, formatError, counterKey, cleanFormat } = require('../utils/billNumberFormat');

// Validates/upper-cases the GSTIN only when the request actually sends one.
// Also checks the bill number format / digits when sent (throws with the reason).
const withCleanGstin = (body = {}) => {
    const out = 'gstin' in body ? { ...body, gstin: normalizeGstin(body.gstin) } : { ...body };
    if ('gstBillFormat' in out || 'gstBillDigits' in out) {
        const format = cleanFormat(out.gstBillFormat ?? DEFAULT_FORMAT);
        const digits = Number(out.gstBillDigits ?? DEFAULT_DIGITS);
        const bad = formatError(format, digits);
        if (bad) throw new Error(bad);
        out.gstBillFormat = format;
        out.gstBillDigits = digits;
    }
    return out;
};

exports.createInvoiceSetting = async (req, res) => {
    try {
        const count = await InvoiceSetting.countDocuments({ businessId: req.auth.businessId });
        const setting = await InvoiceSetting.create({ ...withCleanGstin(req.body || {}), businessId: req.auth.businessId, isDefault: count === 0 });
        res.status(201).json(setting);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getInvoiceSettings = async (req, res) => {
    try {
        const settings = await InvoiceSetting.find({ businessId: req.auth.businessId }).sort({ createdAt: 1 });
        res.status(200).json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// The invoice settings bills currently print from: whichever is flagged
// default, else the only one that exists.
exports.getActiveInvoiceSetting = async (req, res) => {
    try {
        const settings = await InvoiceSetting.find({ businessId: req.auth.businessId }).sort({ createdAt: 1 });
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
        const setting = await InvoiceSetting.findOne({ _id: req.params.id, businessId: req.auth.businessId });
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        res.status(200).json(setting);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateInvoiceSetting = async (req, res) => {
    try {
        const setting = await InvoiceSetting.findOneAndUpdate(
            { _id: req.params.id, businessId: req.auth.businessId },
            withCleanGstin(req.body || {}),
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
        const setting = await InvoiceSetting.findOne({ _id: req.params.id, businessId: req.auth.businessId });
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        await InvoiceSetting.updateMany({ _id: { $ne: setting._id }, businessId: req.auth.businessId }, { isDefault: false });
        setting.isDefault = true;
        await setting.save();
        res.status(200).json(setting);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Saves the GST bill number format and the serial number the NEXT
// auto-generated GST bill will use, by seeding the same counter
// gstsalecontroller reads from — so it takes effect immediately without
// touching past bills.
exports.setGstBillStartNumber = async (req, res) => {
    try {
        const startNumber = Number(req.body.startNumber);
        if (!Number.isInteger(startNumber) || startNumber < 1) {
            return res.status(400).json({ error: 'Starting number must be a whole number of 1 or more.' });
        }
        const format = cleanFormat(req.body.format ?? DEFAULT_FORMAT);
        const digits = Number(req.body.digits ?? DEFAULT_DIGITS);
        const badFormat = formatError(format, digits);
        if (badFormat) return res.status(400).json({ error: badFormat });

        const setting = await InvoiceSetting.findOneAndUpdate(
            { _id: req.params.id, businessId: req.auth.businessId },
            { gstBillStartNumber: startNumber, gstBillFormat: format, gstBillDigits: digits },
            { new: true, runValidators: true }
        );
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });

        const fy = financialYearLabel();
        await Counter.findByIdAndUpdate(
            counterKey(req.auth.businessId, format, fy),
            { seq: startNumber - 1 },
            { upsert: true }
        );
        res.status(200).json(setting);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteInvoiceSetting = async (req, res) => {
    try {
        const setting = await InvoiceSetting.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        // Promote another setting to default so the app doesn't lose its fallback.
        if (setting.isDefault) {
            const next = await InvoiceSetting.findOne({ businessId: req.auth.businessId }).sort({ createdAt: 1 });
            if (next) { next.isDefault = true; await next.save(); }
        }
        res.status(200).json({ message: 'Invoice setting deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
