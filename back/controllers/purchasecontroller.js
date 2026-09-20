const Purchase = require('../model/purchasemodule');
const Counter = require('../model/countermodule');
const Supplier = require('../model/suppliermodule');
const Product = require('../model/productmodule');
const { financialYearLabel } = require('../utils/financialYear');

const number = (value) => Number(value) || 0;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// How much a purchase moves the supplier's running payable balance: total owed minus what was paid on it.
const purchaseImpact = (bill = {}) => number(bill.billAmount) - number(bill.cash) - number(bill.credit);

const applySupplierBalance = async (businessId, name, delta) => {
  if (!name) return { before: 0, after: 0 };
  const s = await Supplier.findOne({ businessId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!s) return { before: 0, after: 0 };
  const before = number(s.oldBalance);
  const after = before + number(delta);
  if (delta) { s.oldBalance = after; await s.save(); }
  return { before, after };
};

// Purchases add stock, matched to the product master by exact (case-insensitive) name —
// same best-effort matching applyCustomerBalance/applySupplierBalance use for parties.
// sign is +1 to add stock in (create) or -1 to reverse it (delete/update/undo).
const applyStock = async (businessId, products = [], sign = 1) => {
  await Promise.all(products.map((p) => {
    const qty = number(p.quantity);
    if (!p.name || !qty) return null;
    return Product.updateOne(
      { businessId, name: new RegExp(`^${escapeRegex(p.name.trim())}$`, 'i') },
      { $inc: { StockQunity: sign * qty } }
    );
  }));
};

// Same GST split sales use: CGST+SGST for intra-state bills, IGST alone for inter-state.
// gstMode 'inclusive' means `price` already includes GST; 'exclusive' means GST is added on top.
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

const preparePurchase = (body = {}) => {
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
  const billAmount = Math.round(rawTotal);
  const roundOff = round2(billAmount - rawTotal);

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
    supplier: {
      name: body.supplier?.name || '',
      supplierId: body.supplier?.supplierId || undefined,
      gstin: body.supplier?.gstin || '',
      state: body.supplier?.state || ''
    },
    products,
    gstTotals,
    bill_details: {
      billNumber: bill.billNumber || '',
      supplierBillNumber: bill.supplierBillNumber || '',
      date: bill.date || new Date(),
      taxType,
      placeOfSupply: bill.placeOfSupply || '',
      subtotal,
      totalCgst,
      totalSgst,
      totalIgst,
      totalGst,
      roundOff,
      billAmount,
      cash: number(bill.cash),
      credit: number(bill.credit),
      remark: bill.remark || ''
    }
  };
};

exports.createPurchase = async (req, res) => {
  try {
    const data = preparePurchase(req.body);
    if (!data.products.length) return res.status(400).json({ error: 'Add at least one product before saving the bill.' });
    const businessId = req.auth.businessId;
    data.businessId = businessId;
    if (!data.bill_details.billNumber) {
      const fy = financialYearLabel(data.bill_details.date);
      const seq = await Counter.next(`${businessId}:purchase:${fy}`);
      data.bill_details.billNumber = `PB/${fy}/${String(seq).padStart(4, '0')}`;
    }
    const bal = await applySupplierBalance(businessId, data.supplier.name, purchaseImpact(data.bill_details));
    data.bill_details.oldBalance = bal.before;
    data.bill_details.newBalance = bal.after;
    await applyStock(businessId, data.products, 1);
    const purchase = await Purchase.create(data);
    res.status(201).json(purchase);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getPurchases = async (req, res) => {
  try {
    const filter = { businessId: req.auth.businessId };
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'supplier.name': rx }, { 'bill_details.billNumber': rx }];
    }
    if (req.query.taxType === 'IGST' || req.query.taxType === 'CGST_SGST') {
      filter['bill_details.taxType'] = req.query.taxType;
    }
    if (req.query.startDate || req.query.endDate) {
      filter['bill_details.date'] = {};
      if (req.query.startDate) filter['bill_details.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['bill_details.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    const sort = { 'bill_details.date': -1, createdAt: -1 };

    // Paginated report mode — opt-in via ?page=, so existing callers that expect a
    // bare array (the entry page's quick recent-bills panel) are unaffected.
    if (req.query.page) {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
      const page = Math.max(1, Number(req.query.page) || 1);
      const [data, total] = await Promise.all([
        Purchase.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        Purchase.countDocuments(filter),
      ]);
      return res.json({ data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    res.json(await Purchase.find(filter).sort(sort));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getPurchaseById = async (req, res) => {
  try {
    const purchase = await Purchase.findOne({ _id: req.params.id, businessId: req.auth.businessId });
    if (!purchase) return res.status(404).json({ error: 'Purchase bill not found.' });
    res.json(purchase);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updatePurchase = async (req, res) => {
  try {
    const data = preparePurchase(req.body);
    if (!data.products.length) return res.status(400).json({ error: 'Add at least one product before saving the bill.' });
    const businessId = req.auth.businessId;
    const prev = await Purchase.findOne({ _id: req.params.id, businessId });
    if (!prev) return res.status(404).json({ error: 'Purchase bill not found.' });

    await applySupplierBalance(businessId, prev.supplier?.name, -purchaseImpact(prev.bill_details));
    await applyStock(businessId, prev.products, -1);
    const bal = await applySupplierBalance(businessId, data.supplier.name, purchaseImpact(data.bill_details));
    await applyStock(businessId, data.products, 1);
    data.bill_details.oldBalance = bal.before;
    data.bill_details.newBalance = bal.after;
    data.bill_details.billNumber = prev.bill_details?.billNumber || data.bill_details.billNumber;

    const purchase = await Purchase.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    res.json(purchase);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deletePurchase = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const purchase = await Purchase.findOneAndDelete({ _id: req.params.id, businessId });
    if (!purchase) return res.status(404).json({ error: 'Purchase bill not found.' });
    await applySupplierBalance(businessId, purchase.supplier?.name, -purchaseImpact(purchase.bill_details));
    await applyStock(businessId, purchase.products, -1);
    res.json({ message: 'Purchase bill deleted successfully.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
