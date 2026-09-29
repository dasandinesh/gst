const Sale = require('../model/salemodule');
const Counter = require('../model/countermodule');
const Customer = require('../model/customermodule');

const number = (value) => Number(value) || 0;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// How much a bill moves the customer's balance: billed amount owed minus what was paid on the bill.
const saleImpact = (bill = {}) => number(bill.grandTotal) - number(bill.debit) - number(bill.credit);

// Adjust a customer's running balance (customermodule `oldBalance`) by `delta`.
// Returns { before, after } so callers can snapshot both on the bill.
const applyCustomerBalance = async (businessId, name, delta) => {
  if (!name) return { before: 0, after: 0 };
  const c = await Customer.findOne({ businessId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!c) return { before: 0, after: 0 };
  const before = number(c.oldBalance);
  const after = before + number(delta);
  if (delta) { c.oldBalance = after; await c.save(); }
  return { before, after };
};

// Bag rate / wage / commission are per-bag handling charges — they only apply when a
// bag count was actually entered on the line. No bags → no bag price / wage / commission.
const prepareSale = (body = {}) => {
  const items = Array.isArray(body.items) ? body.items.filter((item) => item && item.name).map((item) => {
    const quantity = number(item.quantity);
    const bags = number(item.bags);
    const rate = number(item.rate);
    const unit = item.unit || '';
    const hasBags = bags > 0;
    const bagRate = number(item.bagRate);
    const wageRate = number(item.wageRate);
    const commissionRate = number(item.commissionRate);
    // Line amount is always quantity × rate; bags never drive the price.
    return {
      name: item.name,
      comment: item.comment || '',
      tamilName: item.tamilName || '',
      quantity,
      bags,
      unit,
      rate,
      amount: quantity * rate,
      bagRate,
      bagAmount: hasBags ? bags * bagRate : 0,
      wageRate,
      wageAmount: hasBags ? bags * wageRate : 0,
      commissionRate,
      commissionAmount: hasBags ? bags * commissionRate : 0,
    };
  }) : [];

  const subtotal = items.reduce((total, item) => total + item.amount, 0);
  const totalBagAmount = items.reduce((total, item) => total + item.bagAmount, 0);
  const totalWage = items.reduce((total, item) => total + item.wageAmount, 0);
  const totalCommission = items.reduce((total, item) => total + item.commissionAmount, 0);
  const bill = body.billDetails || {};
  const freight = number(bill.freight);
  const grandTotal = subtotal + totalBagAmount + totalWage + totalCommission + freight;

  return {
    customer: { name: body.customer?.name ?? body.customerName },
    items,
    billDetails: {
      billNumber: bill.billNumber || '',
      orderNumber: bill.orderNumber || '',
      mainParty: bill.mainParty || '',
      date: bill.date || new Date(),
      billDate: bill.billDate || undefined,
      totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
      totalBags: items.reduce((total, item) => total + item.bags, 0),
      weight: number(bill.weight),
      subtotal,
      totalBagAmount,
      totalWage,
      totalCommission,
      freight,
      grandTotal,
      balance: number(bill.balance),
      debit: number(bill.debit),
      credit: number(bill.credit),
      notes: bill.notes || '',
      billed: Boolean(bill.billed),
    },
  };
};

exports.createSale = async (req, res) => {
  try {
    const data = prepareSale(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the sale.' });
    const businessId = req.auth.businessId;
    data.businessId = businessId;
    // Auto-assign the next bill serial number when the user didn't type one.
    if (!data.billDetails.billNumber) {
      data.billDetails.billNumber = String(await Counter.next(`${businessId}:sale`));
    }
    // Post this bill to the customer's running balance and snapshot before/after on the bill.
    const bal = await applyCustomerBalance(businessId, data.customer.name, saleImpact(data.billDetails));
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    data.billDetails.balance = bal.after;
    const sale = await Sale.create(data);
    res.status(201).json(sale);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getSales = async (req, res) => {
  try {
    const filter = { businessId: req.auth.businessId };
    if (req.query.customer) filter['customer.name'] = { $regex: req.query.customer.trim(), $options: 'i' };
    // Free-text search box: matches customer name or bill number.
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'customer.name': rx }, { 'billDetails.billNumber': rx }];
    }
    if (req.query.billed === 'true' || req.query.billed === 'false') {
      filter['billDetails.billed'] = req.query.billed === 'true';
    }
    // Only bills that contain an exact given product line — used by the per-product price editor.
    if (req.query.product && req.query.product.trim()) {
      filter['items.name'] = { $regex: `^${escapeRegex(req.query.product.trim())}$`, $options: 'i' };
    }
    if (req.query.startDate || req.query.endDate) {
      filter['billDetails.date'] = {};
      if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    const sort = { 'billDetails.date': -1, createdAt: -1 };

    // Paginated report mode — opt-in via ?page=, so existing callers that expect a
    // bare array (order entry's summary panel, print helpers) are unaffected.
    if (req.query.page) {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
      const page = Math.max(1, Number(req.query.page) || 1);
      const [data, total] = await Promise.all([
        Sale.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        Sale.countDocuments(filter),
      ]);
      return res.json({ data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    res.json(await Sale.find(filter).sort(sort));
  }
  catch (error) { res.status(500).json({ error: error.message }); }
};

// Distinct product names that actually appear inside a sale bill — used by the
// price editor so its datalist only offers products someone has actually sold,
// not the whole product master.
exports.getSoldProductNames = async (req, res) => {
  try {
    const names = await Sale.distinct('items.name', { businessId: req.auth.businessId });
    res.json(names.filter(Boolean).sort((a, b) => a.localeCompare(b)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSaleById = async (req, res) => {
  try { const sale = await Sale.findOne({ _id: req.params.id, businessId: req.auth.businessId }); if (!sale) return res.status(404).json({ error: 'Sale not found.' }); res.json(sale); }
  catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updateSale = async (req, res) => {
  try {
    const data = prepareSale(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the sale.' });
    const businessId = req.auth.businessId;
    const prev = await Sale.findOne({ _id: req.params.id, businessId });
    if (!prev) return res.status(404).json({ error: 'Sale not found.' });
    // Reverse the old bill's balance effect (from its original customer), then apply the new one.
    await applyCustomerBalance(businessId, prev.customer?.name, -saleImpact(prev.billDetails));
    const bal = await applyCustomerBalance(businessId, data.customer.name, saleImpact(data.billDetails));
    data.billDetails.openingBalance = bal.before;
    data.billDetails.closingBalance = bal.after;
    data.billDetails.balance = bal.after;
    const sale = await Sale.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    res.json(sale);
  }
  catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deleteSale = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const sale = await Sale.findOneAndDelete({ _id: req.params.id, businessId });
    if (!sale) return res.status(404).json({ error: 'Sale not found.' });
    await applyCustomerBalance(businessId, sale.customer?.name, -saleImpact(sale.billDetails)); // undo its balance effect
    res.json({ message: 'Sale deleted successfully.' });
  }
  catch (error) { res.status(400).json({ error: error.message }); }
};
