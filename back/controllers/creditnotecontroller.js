const CreditNote = require('../model/creditnotemodule');
const GstSale = require('../model/salesmodule');
const Counter = require('../model/countermodule');
const Customer = require('../model/customermodule');
const Product = require('../model/productmodule');
const { financialYearLabel } = require('../utils/financialYear');

const number = (value) => Number(value) || 0;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A credit note reduces what the customer owes — same running balance GST sales use.
const applyCustomerBalance = async (businessId, name, delta) => {
  if (!name) return { before: 0, after: 0 };
  const c = await Customer.findOne({ businessId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!c) return { before: 0, after: 0 };
  const before = number(c.oldBalance);
  const after = before + number(delta);
  if (delta) { c.oldBalance = after; await c.save(); }
  return { before, after };
};

// A credit note (typically a sales return) puts stock back, matched to the product
// master by exact (case-insensitive) name, same as sales/purchases. sign is +1 to
// add stock back (create) or -1 to reverse it.
const applyStock = async (businessId, items = [], sign = 1) => {
  await Promise.all(items.map((p) => {
    const qty = number(p.quantity);
    if (!p.name || !qty) return null;
    return Product.updateOne(
      { businessId, name: new RegExp(`^${escapeRegex(p.name.trim())}$`, 'i') },
      { $inc: { StockQunity: sign * qty } }
    );
  }));
};

// Same GST split sales use: CGST+SGST for intra-state bills, IGST alone for inter-state.
const prepareLine = (item, taxType) => {
  const quantity = number(item.quantity);
  const rate = number(item.rate);
  const gstRate = number(item.gstRate);
  const gross = quantity * rate;
  const isInclusive = item.gstMode === 'inclusive';
  const taxableValue = isInclusive ? gross / (1 + gstRate / 100) : gross;
  const gstAmount = isInclusive ? gross - taxableValue : (taxableValue * gstRate) / 100;
  const interState = taxType === 'IGST';

  return {
    name: item.name,
    hsnCode: item.hsnCode || '',
    quantity,
    unit: item.unit || '',
    rate,
    gstMode: isInclusive ? 'inclusive' : 'exclusive',
    gstRate,
    taxableValue: round2(taxableValue),
    cgstRate: interState ? 0 : round2(gstRate / 2),
    sgstRate: interState ? 0 : round2(gstRate / 2),
    igstRate: interState ? gstRate : 0,
    cgstAmount: interState ? 0 : round2(gstAmount / 2),
    sgstAmount: interState ? 0 : round2(gstAmount / 2),
    igstAmount: interState ? round2(gstAmount) : 0,
    amount: round2(taxableValue + gstAmount)
  };
};

const prepareCreditNote = (body = {}) => {
  const taxType = body.billDetails?.taxType === 'IGST' ? 'IGST' : 'CGST_SGST';
  const items = Array.isArray(body.items)
    ? body.items.filter((item) => item && item.name && number(item.quantity) > 0).map((item) => prepareLine(item, taxType))
    : [];

  const totalTaxableValue = round2(items.reduce((sum, p) => sum + p.taxableValue, 0));
  const totalCgst = round2(items.reduce((sum, p) => sum + p.cgstAmount, 0));
  const totalSgst = round2(items.reduce((sum, p) => sum + p.sgstAmount, 0));
  const totalIgst = round2(items.reduce((sum, p) => sum + p.igstAmount, 0));
  const totalGst = round2(totalCgst + totalSgst + totalIgst);
  const rawTotal = totalTaxableValue + totalGst;
  const grandTotal = Math.round(rawTotal);
  const roundOff = round2(grandTotal - rawTotal);

  const gstTotals = {};
  items.forEach((p) => {
    const key = String(p.gstRate);
    if (!gstTotals[key]) gstTotals[key] = { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 };
    gstTotals[key].taxableValue += p.taxableValue;
    gstTotals[key].cgstAmount += p.cgstAmount;
    gstTotals[key].sgstAmount += p.sgstAmount;
    gstTotals[key].igstAmount += p.igstAmount;
  });
  Object.values(gstTotals).forEach((totals) => {
    totals.taxableValue = round2(totals.taxableValue);
    totals.cgstAmount = round2(totals.cgstAmount);
    totals.sgstAmount = round2(totals.sgstAmount);
    totals.igstAmount = round2(totals.igstAmount);
  });

  const bill = body.billDetails || {};
  return {
    originalBill: {
      billId: body.originalBill?.billId || undefined,
      billNumber: body.originalBill?.billNumber || '',
      date: body.originalBill?.date || undefined
    },
    customer: {
      name: body.customer?.name || '',
      customerId: body.customer?.customerId || undefined,
      gstin: body.customer?.gstin || '',
      state: body.customer?.state || ''
    },
    items,
    gstTotals,
    billDetails: {
      creditNoteNumber: bill.creditNoteNumber || '',
      date: bill.date || new Date(),
      taxType,
      placeOfSupply: bill.placeOfSupply || '',
      reason: bill.reason || 'Sales Return',
      totalTaxableValue,
      totalCgst,
      totalSgst,
      totalIgst,
      totalGst,
      roundOff,
      grandTotal,
      notes: bill.notes || ''
    }
  };
};

// Amount a credit note removes from the customer's running balance.
// GSTR-1-imported notes never moved it (see creditnotemodule.js), so they count as zero.
const creditImpact = (bill = {}) => (bill.imported ? 0 : -number(bill.grandTotal));

exports.createCreditNote = async (req, res) => {
  try {
    const data = prepareCreditNote(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the credit note.' });
    if (!data.originalBill.billNumber) return res.status(400).json({ error: 'A credit note must reference the original bill number.' });
    const businessId = req.auth.businessId;
    data.businessId = businessId;
    if (!data.billDetails.creditNoteNumber) {
      const fy = financialYearLabel(data.billDetails.date);
      const seq = await Counter.next(`${businessId}:creditnote:${fy}`);
      data.billDetails.creditNoteNumber = `CN/${fy}/${String(seq).padStart(4, '0')}`;
    }
    const bal = await applyCustomerBalance(businessId, data.customer.name, creditImpact(data.billDetails));
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    await applyStock(businessId, data.items, 1);
    const note = await CreditNote.create(data);
    res.status(201).json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getCreditNotes = async (req, res) => {
  try {
    const filter = { businessId: req.auth.businessId };
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'customer.name': rx }, { 'billDetails.creditNoteNumber': rx }, { 'originalBill.billNumber': rx }];
    }
    if (req.query.startDate || req.query.endDate) {
      filter['billDetails.date'] = {};
      if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    const sort = { 'billDetails.date': -1, createdAt: -1 };

    // Paginated report mode — opt-in via ?page=, same convention as GST sales/purchases.
    if (req.query.page) {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
      const page = Math.max(1, Number(req.query.page) || 1);
      const [data, total] = await Promise.all([
        CreditNote.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        CreditNote.countDocuments(filter),
      ]);
      return res.json({ data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    res.json(await CreditNote.find(filter).sort(sort));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getCreditNoteById = async (req, res) => {
  try {
    const note = await CreditNote.findOne({ _id: req.params.id, businessId: req.auth.businessId });
    if (!note) return res.status(404).json({ error: 'Credit note not found.' });
    res.json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updateCreditNote = async (req, res) => {
  try {
    const data = prepareCreditNote(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the credit note.' });
    const businessId = req.auth.businessId;
    const prev = await CreditNote.findOne({ _id: req.params.id, businessId });
    if (!prev) return res.status(404).json({ error: 'Credit note not found.' });

    await applyCustomerBalance(businessId, prev.customer?.name, -creditImpact(prev.billDetails));
    await applyStock(businessId, prev.items, -1);
    const bal = await applyCustomerBalance(businessId, data.customer.name, creditImpact(data.billDetails));
    await applyStock(businessId, data.items, 1);
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    data.billDetails.creditNoteNumber = prev.billDetails?.creditNoteNumber || data.billDetails.creditNoteNumber;

    const note = await CreditNote.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    res.json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deleteCreditNote = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const note = await CreditNote.findOneAndDelete({ _id: req.params.id, businessId });
    if (!note) return res.status(404).json({ error: 'Credit note not found.' });
    await applyCustomerBalance(businessId, note.customer?.name, -creditImpact(note.billDetails));
    await applyStock(businessId, note.items, -1);
    res.json({ message: 'Credit note deleted successfully.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};

// Look up an original GST sale bill by exact bill number, to pre-fill a new credit note.
exports.findOriginalBill = async (req, res) => {
  try {
    const billNumber = String(req.query.billNumber || '').trim();
    if (!billNumber) return res.status(400).json({ error: 'billNumber is required.' });
    const bill = await GstSale.findOne({ businessId: req.auth.businessId, 'billDetails.invoiceNumber': new RegExp(`^${escapeRegex(billNumber)}$`, 'i') });
    if (!bill) return res.status(404).json({ error: 'No GST bill found with that bill number.' });
    res.json(bill);
  } catch (error) { res.status(500).json({ error: error.message }); }
};
