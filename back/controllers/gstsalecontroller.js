const GstSale = require('../model/salesmodule');
const Counter = require('../model/countermodule');
const Customer = require('../model/customermodule');
const Product = require('../model/productmodule');
const { financialYearLabel } = require('../utils/financialYear');

const number = (value) => Number(value) || 0;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// How much a bill moves the customer's running balance: total owed minus what was paid on it.
const saleImpact = (bill = {}) => number(bill.billAmount) - number(bill.cash) - number(bill.credit);

const applyCustomerBalance = async (name, delta) => {
  if (!name) return { before: 0, after: 0 };
  const c = await Customer.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!c) return { before: 0, after: 0 };
  const before = number(c.oldBalance);
  const after = before + number(delta);
  if (delta) { c.oldBalance = after; await c.save(); }
  return { before, after };
};

// Sales draw down stock, matched to the product master by exact (case-insensitive)
// name — same best-effort matching applyCustomerBalance uses for the customer.
// sign is -1 to remove stock (create) or +1 to reverse it.
const applyStock = async (products = [], sign = -1) => {
  await Promise.all(products.map((p) => {
    const qty = number(p.quantity);
    if (!p.name || !qty) return null;
    return Product.updateOne(
      { name: new RegExp(`^${escapeRegex(p.name.trim())}$`, 'i') },
      { $inc: { StockQunity: sign * qty } }
    );
  }));
};

// GST splits CGST+SGST for intra-state bills, or IGST alone for inter-state bills.
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

const prepareSale = (body = {}) => {
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
    customer: {
      name: body.customer?.name || '',
      customerId: body.customer?.customerId || undefined,
      gstin: body.customer?.gstin || '',
      state: body.customer?.state || ''
    },
    products,
    gstTotals,
    bill_details: {
      billNumber: bill.billNumber || '',
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

exports.createGstSale = async (req, res) => {
  try {
    const data = prepareSale(req.body);
    if (!data.products.length) return res.status(400).json({ error: 'Add at least one product before saving the bill.' });
    if (!data.bill_details.billNumber) {
      const fy = financialYearLabel(data.bill_details.date);
      const seq = await Counter.next(`gstsale:${fy}`);
      data.bill_details.billNumber = `GB/${fy}/${String(seq).padStart(4, '0')}`;
    }
    const bal = await applyCustomerBalance(data.customer.name, saleImpact(data.bill_details));
    data.bill_details.oldBalance = bal.before;
    data.bill_details.newBalance = bal.after;
    await applyStock(data.products, -1);
    const sale = await GstSale.create(data);
    res.status(201).json(sale);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getGstSales = async (req, res) => {
  try {
    const filter = {};
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'customer.name': rx }, { 'bill_details.billNumber': rx }];
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
        GstSale.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        GstSale.countDocuments(filter),
      ]);
      return res.json({ data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    res.json(await GstSale.find(filter).sort(sort));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getGstSaleById = async (req, res) => {
  try {
    const sale = await GstSale.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Bill not found.' });
    res.json(sale);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updateGstSale = async (req, res) => {
  try {
    const data = prepareSale(req.body);
    if (!data.products.length) return res.status(400).json({ error: 'Add at least one product before saving the bill.' });
    const prev = await GstSale.findById(req.params.id);
    if (!prev) return res.status(404).json({ error: 'Bill not found.' });

    await applyCustomerBalance(prev.customer?.name, -saleImpact(prev.bill_details));
    await applyStock(prev.products, 1);
    const bal = await applyCustomerBalance(data.customer.name, saleImpact(data.bill_details));
    await applyStock(data.products, -1);
    data.bill_details.oldBalance = bal.before;
    data.bill_details.newBalance = bal.after;
    data.bill_details.billNumber = prev.bill_details?.billNumber || data.bill_details.billNumber;

    const sale = await GstSale.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    res.json(sale);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deleteGstSale = async (req, res) => {
  try {
    const sale = await GstSale.findByIdAndDelete(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Bill not found.' });
    await applyCustomerBalance(sale.customer?.name, -saleImpact(sale.bill_details));
    await applyStock(sale.products, 1);
    res.json({ message: 'GST bill deleted successfully.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
