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
const applyCustomerBalance = async (name, delta) => {
  if (!name) return { before: 0, after: 0 };
  const c = await Customer.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!c) return { before: 0, after: 0 };
  const before = number(c.oldBalance);
  const after = before + number(delta);
  if (delta) { c.oldBalance = after; await c.save(); }
  return { before, after };
};

// A credit note (typically a sales return) puts stock back, matched to the product
// master by exact (case-insensitive) name, same as sales/purchases. sign is +1 to
// add stock back (create) or -1 to reverse it.
const applyStock = async (products = [], sign = 1) => {
  await Promise.all(products.map((p) => {
    const qty = number(p.quantity);
    if (!p.name || !qty) return null;
    return Product.updateOne(
      { name: new RegExp(`^${escapeRegex(p.name.trim())}$`, 'i') },
      { $inc: { StockQunity: sign * qty } }
    );
  }));
};

// Same GST split sales use: CGST+SGST for intra-state bills, IGST alone for inter-state.
const prepareLine = (item, taxType) => {
  const quantity = number(item.quantity);
  const price = number(item.price);
  const gstRate = number(item.gstRate);
  const gross = quantity * price;
  const isInclusive = item.gstMode === 'inclusive';
  const taxableValue = isInclusive ? gross / (1 + gstRate / 100) : gross;
  const gstAmount = isInclusive ? gross - taxableValue : (taxableValue * gstRate) / 100;
  const interState = taxType === 'IGST';

  return {
    name: item.name,
    hsnCode: item.hsnCode || '',
    quantity,
    unit: item.unit || '',
    price,
    gstMode: isInclusive ? 'inclusive' : 'exclusive',
    gstRate,
    taxableValue: round2(taxableValue),
    cgstRate: interState ? 0 : round2(gstRate / 2),
    sgstRate: interState ? 0 : round2(gstRate / 2),
    igstRate: interState ? gstRate : 0,
    cgstAmount: interState ? 0 : round2(gstAmount / 2),
    sgstAmount: interState ? 0 : round2(gstAmount / 2),
    igstAmount: interState ? round2(gstAmount) : 0,
    total: round2(taxableValue + gstAmount)
  };
};

const prepareCreditNote = (body = {}) => {
  const taxType = body.bill_details?.taxType === 'IGST' ? 'IGST' : 'CGST_SGST';
  const products = Array.isArray(body.products)
    ? body.products.filter((item) => item && item.name && number(item.quantity) > 0).map((item) => prepareLine(item, taxType))
    : [];

  const subtotal = round2(products.reduce((sum, p) => sum + p.taxableValue, 0));
  const totalCgst = round2(products.reduce((sum, p) => sum + p.cgstAmount, 0));
  const totalSgst = round2(products.reduce((sum, p) => sum + p.sgstAmount, 0));
  const totalIgst = round2(products.reduce((sum, p) => sum + p.igstAmount, 0));
  const totalGst = round2(totalCgst + totalSgst + totalIgst);
  const rawTotal = subtotal + totalGst;
  const creditNoteAmount = Math.round(rawTotal);
  const roundOff = round2(creditNoteAmount - rawTotal);

  const gstTotals = {};
  products.forEach((p) => {
    const key = String(p.gstRate);
    if (!gstTotals[key]) gstTotals[key] = { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
    gstTotals[key].taxableValue += p.taxableValue;
    gstTotals[key].cgst += p.cgstAmount;
    gstTotals[key].sgst += p.sgstAmount;
    gstTotals[key].igst += p.igstAmount;
  });
  Object.values(gstTotals).forEach((totals) => {
    totals.taxableValue = round2(totals.taxableValue);
    totals.cgst = round2(totals.cgst);
    totals.sgst = round2(totals.sgst);
    totals.igst = round2(totals.igst);
  });

  const bill = body.bill_details || {};
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
    products,
    gstTotals,
    bill_details: {
      creditNoteNumber: bill.creditNoteNumber || '',
      date: bill.date || new Date(),
      taxType,
      placeOfSupply: bill.placeOfSupply || '',
      reason: bill.reason || 'Sales Return',
      subtotal,
      totalCgst,
      totalSgst,
      totalIgst,
      totalGst,
      roundOff,
      creditNoteAmount,
      remark: bill.remark || ''
    }
  };
};

// Amount a credit note removes from the customer's running balance.
const creditImpact = (bill = {}) => -number(bill.creditNoteAmount);

exports.createCreditNote = async (req, res) => {
  try {
    const data = prepareCreditNote(req.body);
    if (!data.products.length) return res.status(400).json({ error: 'Add at least one product before saving the credit note.' });
    if (!data.originalBill.billNumber) return res.status(400).json({ error: 'A credit note must reference the original bill number.' });
    if (!data.bill_details.creditNoteNumber) {
      const fy = financialYearLabel(data.bill_details.date);
      const seq = await Counter.next(`creditnote:${fy}`);
      data.bill_details.creditNoteNumber = `CN/${fy}/${String(seq).padStart(4, '0')}`;
    }
    const bal = await applyCustomerBalance(data.customer.name, creditImpact(data.bill_details));
    data.bill_details.oldBalance = bal.before;
    data.bill_details.newBalance = bal.after;
    await applyStock(data.products, 1);
    const note = await CreditNote.create(data);
    res.status(201).json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getCreditNotes = async (req, res) => {
  try {
    const filter = {};
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'customer.name': rx }, { 'bill_details.creditNoteNumber': rx }, { 'originalBill.billNumber': rx }];
    }
    if (req.query.startDate || req.query.endDate) {
      filter['bill_details.date'] = {};
      if (req.query.startDate) filter['bill_details.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['bill_details.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    const sort = { 'bill_details.date': -1, createdAt: -1 };

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
    const note = await CreditNote.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Credit note not found.' });
    res.json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updateCreditNote = async (req, res) => {
  try {
    const data = prepareCreditNote(req.body);
    if (!data.products.length) return res.status(400).json({ error: 'Add at least one product before saving the credit note.' });
    const prev = await CreditNote.findById(req.params.id);
    if (!prev) return res.status(404).json({ error: 'Credit note not found.' });

    await applyCustomerBalance(prev.customer?.name, -creditImpact(prev.bill_details));
    await applyStock(prev.products, -1);
    const bal = await applyCustomerBalance(data.customer.name, creditImpact(data.bill_details));
    await applyStock(data.products, 1);
    data.bill_details.oldBalance = bal.before;
    data.bill_details.newBalance = bal.after;
    data.bill_details.creditNoteNumber = prev.bill_details?.creditNoteNumber || data.bill_details.creditNoteNumber;

    const note = await CreditNote.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    res.json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deleteCreditNote = async (req, res) => {
  try {
    const note = await CreditNote.findByIdAndDelete(req.params.id);
    if (!note) return res.status(404).json({ error: 'Credit note not found.' });
    await applyCustomerBalance(note.customer?.name, -creditImpact(note.bill_details));
    await applyStock(note.products, -1);
    res.json({ message: 'Credit note deleted successfully.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};

// Look up an original GST sale bill by exact bill number, to pre-fill a new credit note.
exports.findOriginalBill = async (req, res) => {
  try {
    const billNumber = String(req.query.billNumber || '').trim();
    if (!billNumber) return res.status(400).json({ error: 'billNumber is required.' });
    const bill = await GstSale.findOne({ 'bill_details.billNumber': new RegExp(`^${escapeRegex(billNumber)}$`, 'i') });
    if (!bill) return res.status(404).json({ error: 'No GST bill found with that bill number.' });
    res.json(bill);
  } catch (error) { res.status(500).json({ error: error.message }); }
};
