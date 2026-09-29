const Order = require('../model/ordermodule');
const Counter = require('../model/countermodule');

const number = (value) => Number(value) || 0;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Bag rate / wage / commission are per-bag handling charges — they only make sense for
// items that are actually counted and handled in bags/boxes. A loose, weight-sold scale
// like "mixters" never incurs them, even if a stray bag count was entered on that line.
const BAG_SCALES = new Set(['bag', 'o bag', 'box', 'leaves']);
const isBagScale = (unit) => BAG_SCALES.has((unit || '').trim().toLowerCase());

const prepareOrder = (body = {}) => {
  const items = Array.isArray(body.items) ? body.items.filter((item) => item && item.name).map((item) => {
    const quantity = number(item.quantity);
    const bags = number(item.bags);
    const rate = number(item.rate);
    const unit = item.unit || '';
    const bagBased = isBagScale(unit);
    const bagRate = number(item.bagRate);
    const wageRate = number(item.wageRate);
    const commissionRate = number(item.commissionRate);
    const billQty = quantity || bags; // weight-billed items use quantity; bag-billed items fall back to bag count.
    return {
      name: item.name,
      comment: item.comment || '',
      tamilName: item.tamilName || '',
      quantity,
      bags,
      unit,
      rate,
      amount: billQty * rate,
      bagRate,
      bagAmount: bagBased ? bags * bagRate : 0,
      wageRate,
      wageAmount: bagBased ? bags * wageRate : 0,
      commissionRate,
      commissionAmount: bagBased ? bags * commissionRate : 0,
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

exports.createOrder = async (req, res) => {
  try {
    const data = prepareOrder(req.body);
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the order.' });
    data.businessId = req.auth.businessId;
    // Auto-assign the next bill serial number when the user didn't type one.
    if (!data.billDetails.billNumber) {
      data.billDetails.billNumber = String(await Counter.next(`${req.auth.businessId}:order`));
    }
    const order = await Order.create(data);
    res.status(201).json(order);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getOrders = async (req, res) => {
  try {
    const filter = { businessId: req.auth.businessId };
    if (req.query.customer) filter['customer.name'] = { $regex: req.query.customer.trim(), $options: 'i' };
    // Only bills that contain an exact given product line — used by the per-product price editor.
    if (req.query.product && req.query.product.trim()) {
      filter['items.name'] = { $regex: `^${escapeRegex(req.query.product.trim())}$`, $options: 'i' };
    }
    if (req.query.startDate || req.query.endDate) {
      filter['billDetails.date'] = {};
      if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    res.json(await Order.find(filter).sort({ 'billDetails.date': -1, createdAt: -1 }));
  }
  catch (error) { res.status(500).json({ error: error.message }); }
};

// Distinct product names that actually appear inside an order bill — used by the
// price editor so its datalist only offers products someone has actually ordered.
exports.getOrderedProductNames = async (req, res) => {
  try {
    const names = await Order.distinct('items.name', { businessId: req.auth.businessId });
    res.json(names.filter(Boolean).sort((a, b) => a.localeCompare(b)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getOrderById = async (req, res) => {
  try { const order = await Order.findOne({ _id: req.params.id, businessId: req.auth.businessId }); if (!order) return res.status(404).json({ error: 'Order not found.' }); res.json(order); }
  catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updateOrder = async (req, res) => {
  try { const data = prepareOrder(req.body); if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the order.' }); const order = await Order.findOneAndUpdate({ _id: req.params.id, businessId: req.auth.businessId }, data, { new: true, runValidators: true }); if (!order) return res.status(404).json({ error: 'Order not found.' }); res.json(order); }
  catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deleteOrder = async (req, res) => {
  try { const order = await Order.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId }); if (!order) return res.status(404).json({ error: 'Order not found.' }); res.json({ message: 'Order deleted successfully.' }); }
  catch (error) { res.status(400).json({ error: error.message }); }
};
