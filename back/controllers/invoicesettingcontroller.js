const mongoose = require('mongoose');
const InvoiceSetting = require('../model/invoice_settings');
const Counter = require('../model/countermodule');
const GstSale = require('../model/salesmodule');
const { financialYearLabel } = require('../utils/financialYear');
const { normalizeGstin } = require('../utils/gstin');
const { DEFAULT_FORMAT, DEFAULT_DIGITS, formatError, counterKey, cleanFormat, seriesOverlap } = require('../utils/billNumberFormat');

// Each invoice setting is a "bill series": letterhead + GST bill numbering.
// Most businesses have one; a business with two trade names under one GSTIN
// can add more (Invoice Settings → Advanced). Responses leave the logo out
// (it can be up to 1MB) and say `hasLogo` instead; the logo has its own
// endpoint and is fetched only when printing.

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
    // Server-managed fields.
    delete out.ownCounter;
    delete out.isDefault;
    delete out.businessId;
    return out;
};

const numbering = (s) => ({ format: s.gstBillFormat ?? DEFAULT_FORMAT, digits: s.gstBillDigits ?? DEFAULT_DIGITS });

// The rules that keep several series legal under one GSTIN. `candidate` is the
// setting as it would be saved; `others` the business's other settings.
const seriesProblem = (candidate, others) => {
    const gstin = String(candidate.gstin || '').trim();
    const differentGstin = others.find((o) => gstin && o.gstin && o.gstin !== gstin);
    if (differentGstin) {
        return `All bill series must use the same GSTIN (${differentGstin.gstin}). A business in another state or with another GSTIN needs its own account.`;
    }
    const clash = others.find((o) => seriesOverlap(numbering(candidate), numbering(o)));
    if (clash) {
        return `This number format can give the same bill numbers as the "${clash.name}" series. Give each series its own letters, e.g. "{NO}" and "A{NO}".`;
    }
    return '';
};

// Settings of a business without the logo, plus hasLogo.
const lightSettings = (businessId, extraMatch = {}) => InvoiceSetting.aggregate([
    { $match: { businessId: new mongoose.Types.ObjectId(String(businessId)), ...extraMatch } },
    { $sort: { createdAt: 1 } },
    { $addFields: { hasLogo: { $gt: [{ $strLenBytes: { $ifNull: ['$logo', ''] } }, 0] } } },
    { $project: { logo: 0 } },
]);
const withoutLogo = (doc) => {
    const { logo, ...rest } = doc.toObject ? doc.toObject() : doc;
    return { ...rest, hasLogo: Boolean(logo) };
};

exports.createInvoiceSetting = async (req, res) => {
    try {
        const businessId = req.auth.businessId;
        const others = await InvoiceSetting.find({ businessId }, '-logo');
        const data = withCleanGstin(req.body || {});
        const problem = others.length ? seriesProblem(data, others) : '';
        if (problem) return res.status(400).json({ error: problem });
        const setting = await InvoiceSetting.create({
            ...data,
            businessId,
            isDefault: others.length === 0,
            // The first series keeps the business-wide counter; added series count on their own.
            ownCounter: others.length > 0,
        });
        res.status(201).json(withoutLogo(setting));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// GET /api/invoice-settings[?withLogo=1] — every series (Invoice Settings page needs the logos).
exports.getInvoiceSettings = async (req, res) => {
    try {
        if (req.query.withLogo) {
            return res.status(200).json(await InvoiceSetting.find({ businessId: req.auth.businessId }).sort({ createdAt: 1 }));
        }
        res.status(200).json(await lightSettings(req.auth.businessId));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// The series bills print from by default: whichever is flagged default, else the only one.
exports.getActiveInvoiceSetting = async (req, res) => {
    try {
        const settings = await lightSettings(req.auth.businessId);
        if (settings.length === 0) {
            return res.status(404).json({ error: 'No invoice settings configured. Create one before printing a bill.' });
        }
        const active = settings.find((s) => s.isDefault) || (settings.length === 1 ? settings[0] : null);
        if (!active) return res.status(409).json({ error: 'Multiple invoice settings found and none is marked default. Mark one default.' });
        res.status(200).json({ ...active, seriesCount: settings.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getInvoiceSettingById = async (req, res) => {
    try {
        const setting = await InvoiceSetting.findOne({ _id: req.params.id, businessId: req.auth.businessId }, '-logo');
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        res.status(200).json(withoutLogo(setting));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/invoice-settings/:id/logo — just the logo, for printing.
exports.getInvoiceSettingLogo = async (req, res) => {
    try {
        const setting = await InvoiceSetting.findOne({ _id: req.params.id, businessId: req.auth.businessId }, 'logo updatedAt');
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        res.status(200).json({ logo: setting.logo || '', updatedAt: setting.updatedAt });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateInvoiceSetting = async (req, res) => {
    try {
        const businessId = req.auth.businessId;
        const current = await InvoiceSetting.findOne({ _id: req.params.id, businessId }, '-logo');
        if (!current) return res.status(404).json({ error: 'Invoice setting not found.' });
        const data = withCleanGstin(req.body || {});
        const others = await InvoiceSetting.find({ businessId, _id: { $ne: current._id } }, '-logo');
        const problem = others.length ? seriesProblem({ ...current.toObject(), ...data }, others) : '';
        if (problem) return res.status(400).json({ error: problem });
        const setting = await InvoiceSetting.findOneAndUpdate({ _id: current._id, businessId }, data, { new: true, runValidators: true });
        res.status(200).json(withoutLogo(setting));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Unsets isDefault on every other setting and sets it on this one.
exports.setDefaultInvoiceSetting = async (req, res) => {
    try {
        const setting = await InvoiceSetting.findOne({ _id: req.params.id, businessId: req.auth.businessId }, '-logo');
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        await InvoiceSetting.updateMany({ _id: { $ne: setting._id }, businessId: req.auth.businessId }, { isDefault: false });
        setting.isDefault = true;
        await setting.save();
        res.status(200).json(withoutLogo(setting));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Saves a series' number format and the serial number its NEXT auto-generated
// GST bill will use, by seeding the same counter gstsalecontroller reads from —
// so it takes effect immediately without touching past bills.
exports.setGstBillStartNumber = async (req, res) => {
    try {
        const businessId = req.auth.businessId;
        const startNumber = Number(req.body.startNumber);
        if (!Number.isInteger(startNumber) || startNumber < 1) {
            return res.status(400).json({ error: 'Starting number must be a whole number of 1 or more.' });
        }
        const format = cleanFormat(req.body.format ?? DEFAULT_FORMAT);
        const digits = Number(req.body.digits ?? DEFAULT_DIGITS);
        const badFormat = formatError(format, digits);
        if (badFormat) return res.status(400).json({ error: badFormat });

        const current = await InvoiceSetting.findOne({ _id: req.params.id, businessId }, '-logo');
        if (!current) return res.status(404).json({ error: 'Invoice setting not found.' });
        const others = await InvoiceSetting.find({ businessId, _id: { $ne: current._id } }, '-logo');
        const problem = others.length ? seriesProblem({ ...current.toObject(), gstBillFormat: format, gstBillDigits: digits }, others) : '';
        if (problem) return res.status(400).json({ error: problem });

        const setting = await InvoiceSetting.findOneAndUpdate(
            { _id: current._id, businessId },
            { gstBillStartNumber: startNumber, gstBillFormat: format, gstBillDigits: digits },
            { new: true, runValidators: true }
        );
        const fy = financialYearLabel();
        await Counter.findByIdAndUpdate(
            counterKey(businessId, format, fy, setting),
            { seq: startNumber - 1 },
            { upsert: true }
        );
        res.status(200).json(withoutLogo(setting));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteInvoiceSetting = async (req, res) => {
    try {
        const businessId = req.auth.businessId;
        const setting = await InvoiceSetting.findOne({ _id: req.params.id, businessId }, '-logo');
        if (!setting) return res.status(404).json({ error: 'Invoice setting not found.' });
        // With other series left, a series that bills use can't go: those bills
        // would lose their letterhead and numbering.
        const others = await InvoiceSetting.countDocuments({ businessId, _id: { $ne: setting._id } });
        if (others > 0) {
            const used = await GstSale.countDocuments({ businessId, 'billDetails.seriesId': setting._id });
            if (used) return res.status(400).json({ error: `${used} GST bill(s) use the "${setting.name}" series, so it can't be deleted. You can edit it instead.` });
        }
        await InvoiceSetting.deleteOne({ _id: setting._id, businessId });
        // Promote another setting to default so the app doesn't lose its fallback.
        if (setting.isDefault) {
            const next = await InvoiceSetting.findOne({ businessId }, '_id').sort({ createdAt: 1 });
            if (next) await InvoiceSetting.updateOne({ _id: next._id }, { isDefault: true });
        }
        res.status(200).json({ message: 'Invoice setting deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
