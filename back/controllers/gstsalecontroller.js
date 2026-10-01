const GstSale = require('../model/salesmodule');
const Counter = require('../model/countermodule');
const Customer = require('../model/customermodule');
const Product = require('../model/productmodule');
const InvoiceSetting = require('../model/invoice_settings');
const { financialYearLabel } = require('../utils/financialYear');
const { formatBillNumber, counterKey } = require('../utils/billNumberFormat');
const { cleanBillShippingAddress } = require('../model/addressSchema');
const { cleanTransport } = require('../utils/transport');

const number = (value) => Number(value) || 0;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// How much a bill moves the customer's running balance: total owed minus what was paid on it.
// GSTR-1-imported bills never moved it (see salesmodule.js), so they count as zero.
const saleImpact = (bill = {}) => (bill.imported ? 0 : number(bill.grandTotal) - number(bill.cash) - number(bill.credit));

const applyCustomerBalance = async (businessId, name, delta) => {
  if (!name) return { before: 0, after: 0 };
  const c = await Customer.findOne({ businessId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!c) return { before: 0, after: 0 };
  const before = number(c.oldBalance);
  const after = before + number(delta);
  if (delta) { c.oldBalance = after; await c.save(); }
  return { before, after };
};

// Sales draw down stock, matched to the product master by exact (case-insensitive)
// name — same best-effort matching applyCustomerBalance uses for the customer.
// sign is -1 to remove stock (create) or +1 to reverse it.
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

// GST splits CGST+SGST for intra-state bills, or IGST alone for inter-state bills.
// gstMode 'inclusive' means `rate` already includes GST; 'exclusive' means GST is added on top.
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

const prepareSale = (body = {}) => {
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
    customer: {
      name: body.customer?.name || '',
      customerId: body.customer?.customerId || undefined,
      gstin: body.customer?.gstin || '',
      state: body.customer?.state || ''
    },
    shippingAddress: cleanBillShippingAddress(body.shippingAddress),
    items,
    gstTotals,
    billDetails: {
      invoiceNumber: bill.invoiceNumber || '',
      date: bill.date || new Date(),
      taxType,
      placeOfSupply: bill.placeOfSupply || '',
      deliveryChallanNumber: (bill.deliveryChallanNumber || '').trim(),
      deliveryChallanDate: bill.deliveryChallanDate || undefined,
      purchaseOrderNumber: (bill.purchaseOrderNumber || '').trim(),
      purchaseOrderDate: bill.purchaseOrderDate || undefined,
      transport: cleanTransport(bill.transport),
      totalTaxableValue,
      totalCgst,
      totalSgst,
      totalIgst,
      totalGst,
      roundOff,
      grandTotal,
      cash: number(bill.cash),
      credit: number(bill.credit),
      notes: bill.notes || ''
    }
  };
};

exports.createGstSale = async (req, res) => {
  try {
    const data = prepareSale(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the bill.' });
    const businessId = req.auth.businessId;
    data.businessId = businessId;
    if (!data.billDetails.invoiceNumber) {
      const fy = financialYearLabel(data.billDetails.date);
      // Number format from the invoice setting bills print from (the default one, else the first).
      const setting = await InvoiceSetting.findOne({ businessId }, 'gstBillFormat gstBillDigits').sort({ isDefault: -1, createdAt: 1 });
      const format = setting?.gstBillFormat;
      // Skip numbers already taken (e.g. after switching back to an older format).
      for (let tries = 0; tries < 100; tries += 1) {
        const seq = await Counter.next(counterKey(businessId, format, fy));
        data.billDetails.invoiceNumber = formatBillNumber(format, fy, seq, setting?.gstBillDigits);
        if (!(await GstSale.exists({ businessId, 'billDetails.invoiceNumber': data.billDetails.invoiceNumber }))) break;
      }
    }
    const bal = await applyCustomerBalance(businessId, data.customer.name, saleImpact(data.billDetails));
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    await applyStock(businessId, data.items, -1);
    const sale = await GstSale.create(data);
    res.status(201).json(sale);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getGstSales = async (req, res) => {
  try {
    const filter = { businessId: req.auth.businessId };
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'customer.name': rx }, { 'billDetails.invoiceNumber': rx }, { 'billDetails.purchaseOrderNumber': rx }, { 'billDetails.deliveryChallanNumber': rx }, { 'billDetails.transport.vehicleNumber': rx }];
    }
    if (req.query.taxType === 'IGST' || req.query.taxType === 'CGST_SGST') {
      filter['billDetails.taxType'] = req.query.taxType;
    }
    if (req.query.startDate || req.query.endDate) {
      filter['billDetails.date'] = {};
      if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    const sort = { 'billDetails.date': -1, createdAt: -1 };

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
    const sale = await GstSale.findOne({ _id: req.params.id, businessId: req.auth.businessId });
    if (!sale) return res.status(404).json({ error: 'Bill not found.' });
    res.json(sale);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updateGstSale = async (req, res) => {
  try {
    const data = prepareSale(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the bill.' });
    const businessId = req.auth.businessId;
    const prev = await GstSale.findOne({ _id: req.params.id, businessId });
    if (!prev) return res.status(404).json({ error: 'Bill not found.' });

    await applyCustomerBalance(businessId, prev.customer?.name, -saleImpact(prev.billDetails));
    await applyStock(businessId, prev.items, 1);
    const bal = await applyCustomerBalance(businessId, data.customer.name, saleImpact(data.billDetails));
    await applyStock(businessId, data.items, -1);
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    data.billDetails.invoiceNumber = prev.billDetails?.invoiceNumber || data.billDetails.invoiceNumber;

    const sale = await GstSale.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    res.json(sale);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deleteGstSale = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const sale = await GstSale.findOneAndDelete({ _id: req.params.id, businessId });
    if (!sale) return res.status(404).json({ error: 'Bill not found.' });
    await applyCustomerBalance(businessId, sale.customer?.name, -saleImpact(sale.billDetails));
    await applyStock(businessId, sale.items, 1);
    res.json({ message: 'GST bill deleted successfully.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
