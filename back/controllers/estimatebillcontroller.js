const EstimateBill = require('../model/estimatebillmodule');
const Counter = require('../model/countermodule');
const EstimateCustomer = require('../model/estimatecustomermodule');
const EstimateProduct = require('../model/estimateproductmodule');
const { financialYearLabel } = require('../utils/financialYear');

const number = (value) => Number(value) || 0;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// How much an estimate moves the customer's running balance: total owed minus what was paid on it.
const estimateImpact = (bill = {}) => number(bill.grandTotal) - number(bill.cash) - number(bill.credit);

const applyCustomerBalance = async (businessId, name, delta) => {
  if (!name) return { before: 0, after: 0 };
  const c = await EstimateCustomer.findOne({ businessId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!c) return { before: 0, after: 0 };
  const before = number(c.closingBalance);
  const after = before + number(delta);
  if (delta) { c.closingBalance = after; await c.save(); }
  return { before, after };
};

// Estimates draw down the "main godown quantity", matched to the estimate product
// master by exact (case-insensitive) name. sign is -1 to remove stock (create) or +1
// to reverse it (update/delete).
const applyGodownStock = async (businessId, items = [], sign = -1) => {
  await Promise.all(items.map((p) => {
    const qty = number(p.quantity);
    if (!p.name || !qty) return null;
    return EstimateProduct.updateOne(
      { businessId, name: new RegExp(`^${escapeRegex(p.name.trim())}$`, 'i') },
      { $inc: { mainGodownQuantity: sign * qty } }
    );
  }));
};

// Plain quantity x rate line — no GST/tax math.
const prepareLine = (item) => {
  const quantity = number(item.quantity);
  const rate = number(item.rate);
  return {
    name: item.name,
    quantity,
    unit: item.unit || '',
    rate,
    amount: round2(quantity * rate)
  };
};

const prepareEstimate = (body = {}) => {
  const items = Array.isArray(body.items)
    ? body.items.filter((item) => item && item.name && number(item.quantity) > 0).map((item) => prepareLine(item))
    : [];

  const subtotal = round2(items.reduce((sum, p) => sum + p.amount, 0));
  const grandTotal = Math.round(subtotal);
  const roundOff = round2(grandTotal - subtotal);

  const bill = body.billDetails || {};
  return {
    customer: {
      name: body.customer?.name || '',
      customerId: body.customer?.customerId || undefined
    },
    items,
    billDetails: {
      estimateNumber: bill.estimateNumber || '',
      date: bill.date || new Date(),
      subtotal,
      roundOff,
      grandTotal,
      cash: number(bill.cash),
      credit: number(bill.credit),
      notes: bill.notes || ''
    }
  };
};

exports.createEstimateBill = async (req, res) => {
  try {
    const data = prepareEstimate(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the estimate.' });
    const businessId = req.auth.businessId;
    data.businessId = businessId;
    if (!data.billDetails.estimateNumber) {
      const fy = financialYearLabel(data.billDetails.date);
      const seq = await Counter.next(`${businessId}:estimatebill:${fy}`);
      data.billDetails.estimateNumber = `EST/${fy}/${String(seq).padStart(4, '0')}`;
    }
    const bal = await applyCustomerBalance(businessId, data.customer.name, estimateImpact(data.billDetails));
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    await applyGodownStock(businessId, data.items, -1);
    const estimate = await EstimateBill.create(data);
    res.status(201).json(estimate);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getEstimateBills = async (req, res) => {
  try {
    const filter = { businessId: req.auth.businessId };
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'customer.name': rx }, { 'billDetails.estimateNumber': rx }];
    }
    if (req.query.startDate || req.query.endDate) {
      filter['billDetails.date'] = {};
      if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    const sort = { 'billDetails.date': -1, createdAt: -1 };

    if (req.query.page) {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
      const page = Math.max(1, Number(req.query.page) || 1);
      const [data, total] = await Promise.all([
        EstimateBill.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        EstimateBill.countDocuments(filter),
      ]);
      return res.json({ data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    res.json(await EstimateBill.find(filter).sort(sort));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getEstimateBillById = async (req, res) => {
  try {
    const estimate = await EstimateBill.findOne({ _id: req.params.id, businessId: req.auth.businessId });
    if (!estimate) return res.status(404).json({ error: 'Estimate not found.' });
    res.json(estimate);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updateEstimateBill = async (req, res) => {
  try {
    const data = prepareEstimate(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the estimate.' });
    const businessId = req.auth.businessId;
    const prev = await EstimateBill.findOne({ _id: req.params.id, businessId });
    if (!prev) return res.status(404).json({ error: 'Estimate not found.' });

    await applyCustomerBalance(businessId, prev.customer?.name, -estimateImpact(prev.billDetails));
    await applyGodownStock(businessId, prev.items, 1);
    const bal = await applyCustomerBalance(businessId, data.customer.name, estimateImpact(data.billDetails));
    await applyGodownStock(businessId, data.items, -1);
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    data.billDetails.estimateNumber = prev.billDetails?.estimateNumber || data.billDetails.estimateNumber;

    const estimate = await EstimateBill.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    res.json(estimate);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deleteEstimateBill = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const estimate = await EstimateBill.findOneAndDelete({ _id: req.params.id, businessId });
    if (!estimate) return res.status(404).json({ error: 'Estimate not found.' });
    await applyCustomerBalance(businessId, estimate.customer?.name, -estimateImpact(estimate.billDetails));
    await applyGodownStock(businessId, estimate.items, 1);
    res.json({ message: 'Estimate deleted successfully.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
