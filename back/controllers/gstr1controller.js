const GstSale = require('../model/salesmodule');
const CreditNote = require('../model/creditnotemodule');
const Customer = require('../model/customermodule');
const Business = require('../model/businessmodel');
const Counter = require('../model/countermodule');
const InvoiceSetting = require('../model/invoice_settings');
const { buildGstr1, parseGstr1, toReturnPeriod, cleanGstin } = require('../utils/gstr1');
const { checkGstr1 } = require('../utils/gstr1Checklist');
const EcomSale = require('../model/ecomsalemodule');
const Purchase = require('../model/purchasemodule');
const DebitNote = require('../model/debitnotemodule');
const { buildGstr3b } = require('../utils/gstr3b');
const Expense = require('../model/expensemodule');
const { parseGstr2b, matchGstr2b } = require('../utils/gstr2b');
const { parseEcomReport } = require('../utils/ecomReport');

// Marketplace months that overlap the From–To period.
const ecomFilter = (req) => {
  const filter = { businessId: req.auth.businessId };
  if (req.query.startDate) filter.periodEnd = { $gte: new Date(`${req.query.startDate}T00:00:00.000Z`) };
  if (req.query.endDate) filter.periodStart = { $lte: new Date(`${req.query.endDate}T23:59:59.999Z`) };
  return filter;
};

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
    const ecomSales = await EcomSale.find(ecomFilter(req)).lean();
    const result = buildGstr1({ business, sales, creditNotes, originalSales, ecomSales, fp });
    res.json({ ...result, fp, billCount: sales.length, creditNoteCount: creditNotes.length, ecomMonths: ecomSales.length });
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
    const [business, sales, creditNotes, ecomSales] = await Promise.all([
      sellerProfile(req.auth.businessId),
      GstSale.find(filter).sort({ 'billDetails.date': 1 }).lean(),
      CreditNote.find(filter).sort({ 'billDetails.date': 1 }).lean(),
      EcomSale.find(ecomFilter(req), 'fp etin totals').lean(),
    ]);
    const result = checkGstr1({ business, sales, creditNotes });
    // Marketplace months were checked when imported; report them so the summary covers the whole return.
    result.counts.ecomMonths = ecomSales.length;
    result.counts.ecomTaxableValue = Math.round(ecomSales.reduce((t, e) => t + (Number(e.totals?.taxableValue) || 0), 0) * 100) / 100;
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// GET /api/reports/gst/gstr3b?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// GSTR-3B worksheet for the period — see utils/gstr3b.js.
exports.getGstr3b = async (req, res) => {
  try {
    if (!req.query.startDate || !req.query.endDate) return res.status(400).json({ error: 'Pick the return month.' });
    const businessId = req.auth.businessId;
    const filter = dateFilter(req);
    const expenseFilter = { businessId, date: filter['billDetails.date'] };
    const [business, sales, creditNotes, purchases, debitNotes, ecomSales, expenses] = await Promise.all([
      sellerProfile(businessId),
      GstSale.find(filter).lean(),
      CreditNote.find(filter).lean(),
      Purchase.find(filter).lean(),
      DebitNote.find(filter).lean(),
      EcomSale.find(ecomFilter(req)).lean(),
      Expense.find(expenseFilter).lean(),
    ]);
    if (!cleanGstin(business.gstin)) return res.status(400).json({ error: NO_GSTIN });
    const fp = toReturnPeriod(new Date(`${req.query.endDate}T12:00:00.000Z`));
    res.json({ fp, gstin: cleanGstin(business.gstin), ...buildGstr3b({ sellerGstin: business.gstin, sales, creditNotes, purchases, debitNotes, ecomSales, expenses }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// POST /api/reports/gst/gstr2b/match?startDate=&endDate=   body: the GSTR-2B JSON file
// Compares the suppliers' invoices in GSTR-2B with the purchase bills here — see
// utils/gstr2b.js. Nothing is saved.
exports.matchGstr2b = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const twoB = parseGstr2b(req.body);
    const { gstin } = await sellerProfile(businessId);
    if (twoB.gstin && cleanGstin(gstin) && twoB.gstin !== cleanGstin(gstin)) {
      return res.status(400).json({ error: `This GSTR-2B is for GSTIN ${twoB.gstin}, but your business GSTIN is ${cleanGstin(gstin)}.` });
    }
    // Period for "in books, not in 2B": the From–To given, else the 2B month.
    let { startDate, endDate } = req.query;
    if ((!startDate || !endDate) && /^\d{6}$/.test(twoB.period)) {
      const m = Number(twoB.period.slice(0, 2));
      const y = Number(twoB.period.slice(2));
      startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      endDate = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    }
    const allPurchases = await Purchase.find({ businessId }, 'supplier billDetails').lean();
    const start = startDate ? new Date(`${startDate}T00:00:00.000`) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
    const periodPurchases = allPurchases.filter((p) => {
      const d = p.billDetails?.date ? new Date(p.billDetails.date) : null;
      return d && (!start || d >= start) && (!end || d <= end);
    });
    res.json({ startDate, endDate, ...matchGstr2b({ twoB, allPurchases, periodPurchases }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// POST /api/reports/gst/ecom/import[?preview=1]  body: { sales: [...], returns: [...], files: [names] }
// Reads a marketplace's monthly TCS sales (+ returns) report into a net month
// summary for GSTR-1. With ?preview=1 nothing is saved. Importing the same
// operator's month again replaces the earlier import.
exports.importEcom = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const { gstin } = await sellerProfile(businessId);
    if (!cleanGstin(gstin)) return res.status(400).json({ error: NO_GSTIN });
    const summary = parseEcomReport({ sales: req.body?.sales, returns: req.body?.returns || [], sellerGstin: gstin });
    const existing = await EcomSale.findOne({ businessId, fp: summary.fp, etin: summary.etin }, '_id updatedAt').lean();
    if (req.query.preview) return res.json({ preview: true, replaces: Boolean(existing), ...summary });

    const { warnings, ...data } = summary;
    const saved = await EcomSale.findOneAndUpdate(
      { businessId, fp: summary.fp, etin: summary.etin },
      { ...data, businessId, files: (req.body.files || []).map(String).slice(0, 5) },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(existing ? 200 : 201).json({ preview: false, replaced: Boolean(existing), warnings, saved });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// GET /api/reports/gst/ecom?startDate=&endDate= — imported marketplace months in the period.
exports.listEcom = async (req, res) => {
  try {
    res.json(await EcomSale.find(ecomFilter(req)).sort({ periodStart: -1, etin: 1 }).lean());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/reports/gst/ecom/:id
exports.deleteEcom = async (req, res) => {
  try {
    const removed = await EcomSale.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });
    if (!removed) return res.status(404).json({ error: 'Import not found.' });
    res.json({ ok: true });
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
