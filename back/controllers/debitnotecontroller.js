const DebitNote = require('../model/debitnotemodule');
const Purchase = require('../model/purchasemodule');
const Counter = require('../model/countermodule');
const Supplier = require('../model/suppliermodule');
const Product = require('../model/productmodule');
const { financialYearLabel } = require('../utils/financialYear');

const number = (value) => Number(value) || 0;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A debit note reduces what we owe the supplier — same running balance purchases use.
const applySupplierBalance = async (businessId, name, delta) => {
  if (!name) return { before: 0, after: 0 };
  const s = await Supplier.findOne({ businessId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!s) return { before: 0, after: 0 };
  const before = number(s.oldBalance);
  const after = before + number(delta);
  if (delta) { s.oldBalance = after; await s.save(); }
  return { before, after };
};

// A debit note (typically a purchase return) sends stock back out, matched to the
// product master by exact (case-insensitive) name, same as sales/purchases/credit
// notes. sign is -1 to remove stock (create) or +1 to reverse it (delete/update/undo).
const applyStock = async (businessId, items = [], sign = -1) => {
  await Promise.all(items.map((p) => {
    const qty = number(p.quantity);
    if (!p.name || !qty) return null;
    return Product.updateOne(
      { businessId, name: new RegExp(`^${escapeRegex(p.name.trim())}$`, 'i') },
      { $inc: { StockQunity: sign * qty } }
    );
  }));
};

// Same GST split purchases use: CGST+SGST for intra-state bills, IGST alone for inter-state.
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

const prepareDebitNote = (body = {}) => {
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
    supplier: {
      name: body.supplier?.name || '',
      supplierId: body.supplier?.supplierId || undefined,
      gstin: body.supplier?.gstin || '',
      state: body.supplier?.state || ''
    },
    items,
    gstTotals,
    billDetails: {
      debitNoteNumber: bill.debitNoteNumber || '',
      date: bill.date || new Date(),
      taxType,
      placeOfSupply: bill.placeOfSupply || '',
      reason: bill.reason || 'Purchase Return',
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

// Amount a debit note removes from the supplier's running payable balance.
const debitImpact = (bill = {}) => -number(bill.grandTotal);

exports.createDebitNote = async (req, res) => {
  try {
    const data = prepareDebitNote(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the debit note.' });
    if (!data.originalBill.billNumber) return res.status(400).json({ error: 'A debit note must reference the original purchase bill number.' });
    const businessId = req.auth.businessId;
    data.businessId = businessId;
    if (!data.billDetails.debitNoteNumber) {
      const fy = financialYearLabel(data.billDetails.date);
      const seq = await Counter.next(`${businessId}:debitnote:${fy}`);
      data.billDetails.debitNoteNumber = `DN/${fy}/${String(seq).padStart(4, '0')}`;
    }
    const bal = await applySupplierBalance(businessId, data.supplier.name, debitImpact(data.billDetails));
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    await applyStock(businessId, data.items, -1);
    const note = await DebitNote.create(data);
    res.status(201).json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getDebitNotes = async (req, res) => {
  try {
    const filter = { businessId: req.auth.businessId };
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'supplier.name': rx }, { 'billDetails.debitNoteNumber': rx }, { 'originalBill.billNumber': rx }];
    }
    if (req.query.startDate || req.query.endDate) {
      filter['billDetails.date'] = {};
      if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    const sort = { 'billDetails.date': -1, createdAt: -1 };

    // Paginated report mode — opt-in via ?page=, same convention as sales/purchases/credit notes.
    if (req.query.page) {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
      const page = Math.max(1, Number(req.query.page) || 1);
      const [data, total] = await Promise.all([
        DebitNote.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        DebitNote.countDocuments(filter),
      ]);
      return res.json({ data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    res.json(await DebitNote.find(filter).sort(sort));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getDebitNoteById = async (req, res) => {
  try {
    const note = await DebitNote.findOne({ _id: req.params.id, businessId: req.auth.businessId });
    if (!note) return res.status(404).json({ error: 'Debit note not found.' });
    res.json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updateDebitNote = async (req, res) => {
  try {
    const data = prepareDebitNote(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the debit note.' });
    const businessId = req.auth.businessId;
    const prev = await DebitNote.findOne({ _id: req.params.id, businessId });
    if (!prev) return res.status(404).json({ error: 'Debit note not found.' });

    await applySupplierBalance(businessId, prev.supplier?.name, -debitImpact(prev.billDetails));
    await applyStock(businessId, prev.items, 1);
    const bal = await applySupplierBalance(businessId, data.supplier.name, debitImpact(data.billDetails));
    await applyStock(businessId, data.items, -1);
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    data.billDetails.debitNoteNumber = prev.billDetails?.debitNoteNumber || data.billDetails.debitNoteNumber;

    const note = await DebitNote.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    res.json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deleteDebitNote = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const note = await DebitNote.findOneAndDelete({ _id: req.params.id, businessId });
    if (!note) return res.status(404).json({ error: 'Debit note not found.' });
    await applySupplierBalance(businessId, note.supplier?.name, -debitImpact(note.billDetails));
    await applyStock(businessId, note.items, 1);
    res.json({ message: 'Debit note deleted successfully.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};

// Look up an original purchase bill by exact bill number, to pre-fill a new debit note.
exports.findOriginalBill = async (req, res) => {
  try {
    const billNumber = String(req.query.billNumber || '').trim();
    if (!billNumber) return res.status(400).json({ error: 'billNumber is required.' });
    const bill = await Purchase.findOne({ businessId: req.auth.businessId, 'billDetails.billNumber': new RegExp(`^${escapeRegex(billNumber)}$`, 'i') });
    if (!bill) return res.status(404).json({ error: 'No purchase bill found with that bill number.' });
    res.json(bill);
  } catch (error) { res.status(500).json({ error: error.message }); }
};
