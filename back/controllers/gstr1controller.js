const GstSale = require('../model/salesmodule');
const CreditNote = require('../model/creditnotemodule');
const Customer = require('../model/customermodule');
const Business = require('../model/businessmodel');
const Counter = require('../model/countermodule');
const InvoiceSetting = require('../model/invoice_settings');
const { buildGstr1, parseGstr1, toReturnPeriod, cleanGstin } = require('../utils/gstr1');
const { checkGstr1 } = require('../utils/gstr1Checklist');

// The GSTIN the return is filed under. Signup's GSTIN field is optional and
// can't be edited later, so most businesses only have it on the letterhead in
// Invoice Settings — fall back to the default one there, then any with a GSTIN.
const sellerProfile = async (businessId) => {
  const business = await Business.findById(businessId);
  if (cleanGstin(business?.gstin)) return { gstin: business.gstin, state: business.state };
  const settings = await InvoiceSetting.find({ businessId, gstin: { $nin: [null, ''] } }).sort({ isDefault: -1, createdAt: 1 }).limit(1);
  if (settings.length) return { gstin: settings[0].gstin, state: settings[0].state };
  return { gstin: '', state: business?.state || '' };
};
const NO_GSTIN = 'No GSTIN found. Add your GSTIN in Invoice Settings (the letterhead used on your bills), then try again.';

const dateFilter = (req) => {
  const filter = { businessId: req.auth.businessId };
  if (req.query.startDate || req.query.endDate) {
    filter['billDetails.date'] = {};
    if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
    if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
  }
  return filter;
};

// GET /api/reports/gst/gstr1?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Returns { json, warnings, counts } — `json` is the file to upload on the GST
// portal; warnings list bills the portal is likely to reject.
exports.exportGstr1 = async (req, res) => {
  try {
    if (!req.query.startDate || !req.query.endDate) return res.status(400).json({ error: 'Pick a From and To date for the return period.' });
    const businessId = req.auth.businessId;
    const filter = dateFilter(req);
    const [business, sales, creditNotes] = await Promise.all([
      sellerProfile(businessId),
      GstSale.find(filter).sort({ 'billDetails.date': 1 }),
      CreditNote.find(filter).sort({ 'billDetails.date': 1 }),
    ]);
    if (!cleanGstin(business.gstin)) return res.status(400).json({ error: NO_GSTIN });

    // Credit notes to unregistered buyers are classified by their original bill,
    // which may be from an earlier period.
    const originalNumbers = creditNotes.filter((c) => !cleanGstin(c.customer?.gstin)).map((c) => c.originalBill?.billNumber).filter(Boolean);
    const originalSales = originalNumbers.length
      ? await GstSale.find({ businessId, 'billDetails.invoiceNumber': { $in: originalNumbers } })
      : [];

    const fp = toReturnPeriod(new Date(`${req.query.endDate}T12:00:00.000Z`));
    const result = buildGstr1({ business, sales, creditNotes, originalSales, fp });
    res.json({ ...result, fp, billCount: sales.length, creditNoteCount: creditNotes.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// GET /api/reports/gst/gstr1/check?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// The checklist to run before exporting: { issues, counts } — see utils/gstr1Checklist.js.
exports.checkGstr1 = async (req, res) => {
  try {
    if (!req.query.startDate || !req.query.endDate) return res.status(400).json({ error: 'Pick a From and To date for the return period.' });
    const filter = dateFilter(req);
    const [business, sales, creditNotes] = await Promise.all([
      sellerProfile(req.auth.businessId),
      GstSale.find(filter).sort({ 'billDetails.date': 1 }).lean(),
      CreditNote.find(filter).sort({ 'billDetails.date': 1 }).lean(),
    ]);
    res.json(checkGstr1({ business, sales, creditNotes }));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Auto-numbered bills look like GB/26-27/0042 (sales) or CN/26-27/0007 (credit
// notes). Importing one must push that series' counter past it, or the next bill
// entered by hand would be given the same number.
const bumpCounters = async (businessId, numbers, prefix, counterName) => {
  const highest = {};
  const pattern = new RegExp(`^${prefix}/(\\d{2}-\\d{2})/(\\d+)$`);
  numbers.forEach((n) => {
    const m = pattern.exec(n);
    if (m) highest[m[1]] = Math.max(highest[m[1]] || 0, Number(m[2]));
  });
  await Promise.all(Object.entries(highest).map(([fy, seq]) => Counter.updateOne(
    { _id: `${businessId}:${counterName}:${fy}` },
    { $max: { seq } },
    { upsert: true }
  )));
};

// POST /api/reports/gst/gstr1/import[?preview=1]  body: the GSTR-1 JSON file.
// Creates GST sale bills (B2B, B2CL) and credit notes (CDNR, CDNUR). Bills whose
// number already exists are skipped, so importing the same file twice is safe.
// With ?preview=1 nothing is saved — it only reports what would happen.
exports.importGstr1 = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const parsed = parseGstr1(req.body);

    const ownGstin = cleanGstin((await sellerProfile(businessId)).gstin);
    if (!ownGstin) return res.status(400).json({ error: NO_GSTIN });
    if (parsed.gstin !== ownGstin) {
      return res.status(400).json({ error: `This file is for GSTIN ${parsed.gstin}, but your business GSTIN is ${ownGstin}.` });
    }

    const [existingBills, existingNotes, customers] = await Promise.all([
      GstSale.distinct('billDetails.invoiceNumber', { businessId, 'billDetails.invoiceNumber': { $in: parsed.sales.map((s) => s.doc.billDetails.invoiceNumber) } }),
      CreditNote.distinct('billDetails.creditNoteNumber', { businessId, 'billDetails.creditNoteNumber': { $in: parsed.creditNotes.map((c) => c.doc.billDetails.creditNoteNumber) } }),
      Customer.find({ businessId, gst_no: { $nin: [null, ''] } }, 'name gst_no'),
    ]);

    const customerByGstin = new Map(customers.map((c) => [cleanGstin(c.gst_no), c]));
    const withCustomer = ({ ctin, doc }) => {
      const match = ctin && customerByGstin.get(ctin);
      doc.customer.name = match ? match.name : (ctin ? `GSTIN ${ctin}` : `B2C customer (${doc.customer.state || 'unknown state'})`);
      if (match) doc.customer.customerId = match._id;
      doc.businessId = businessId;
      return doc;
    };

    // Skip numbers already in the app, and repeats inside the file itself.
    const pick = (items, existing, field) => {
      const seen = new Set(existing);
      const fresh = [];
      const duplicates = [];
      items.forEach((item) => {
        const n = item.doc.billDetails[field];
        if (seen.has(n)) { duplicates.push(n); return; }
        seen.add(n);
        fresh.push(withCustomer(item));
      });
      return { fresh, duplicates };
    };
    const sales = pick(parsed.sales, existingBills, 'invoiceNumber');
    const notes = pick(parsed.creditNotes, existingNotes, 'creditNoteNumber');

    const summary = {
      fp: parsed.fp,
      sales: sales.fresh.length,
      creditNotes: notes.fresh.length,
      duplicates: [...sales.duplicates, ...notes.duplicates],
      skipped: parsed.skipped,
      unmatchedGstins: [...new Set([...sales.fresh, ...notes.fresh].filter((d) => !d.customer.customerId && d.customer.gstin).map((d) => d.customer.gstin))],
    };
    if (req.query.preview) return res.json({ preview: true, ...summary });

    if (sales.fresh.length) await GstSale.insertMany(sales.fresh, { ordered: false });
    if (notes.fresh.length) await CreditNote.insertMany(notes.fresh, { ordered: false });
    await Promise.all([
      bumpCounters(businessId, sales.fresh.map((d) => d.billDetails.invoiceNumber), 'GB', 'gstsale'),
      bumpCounters(businessId, notes.fresh.map((d) => d.billDetails.creditNoteNumber), 'CN', 'creditnote'),
    ]);

    res.status(201).json({ preview: false, ...summary });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
