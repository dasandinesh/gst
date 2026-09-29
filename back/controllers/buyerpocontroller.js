const BuyerPo = require('../model/buyerpomodule');
const GstSale = require('../model/salesmodule');
const { cleanBillShippingAddress } = require('../model/addressSchema');

// A buyer's purchase order only records what a customer has ordered — it is not a
// sale, so it never touches stock or the customer's balance. GST bills raised
// against it (via the GST billing page) are tracked line by line in billedQuantity.

const number = (value) => Number(value) || 0;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Same GST split sales use: CGST+SGST for intra-state, IGST alone for inter-state.
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
    amount: round2(taxableValue + gstAmount),
    billedQuantity: 0
  };
};

const preparePo = (body = {}) => {
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
    billDetails: {
      poNumber: String(bill.poNumber || '').trim(),
      date: bill.date || new Date(),
      deliveryDate: bill.deliveryDate || undefined,
      taxType,
      placeOfSupply: bill.placeOfSupply || '',
      paymentTerms: bill.paymentTerms || '',
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

const validate = (data) => {
  if (!data.customer.name) return 'Customer name is required.';
  if (!data.billDetails.poNumber) return "Enter the buyer's PO number.";
  if (!data.items.length) return 'Add at least one product before saving the purchase order.';
  return '';
};

// A buyer never sends two POs with the same number, so a repeat is almost always a double entry.
const findDuplicate = (businessId, data, excludeId) => BuyerPo.findOne({
  businessId,
  _id: { $ne: excludeId },
  'customer.name': { $regex: `^${escapeRegex(data.customer.name.trim())}$`, $options: 'i' },
  'billDetails.poNumber': { $regex: `^${escapeRegex(data.billDetails.poNumber)}$`, $options: 'i' }
});

// Open / Partly Billed / Billed from the billed quantities; Closed and Cancelled are kept.
const deriveStatus = (po) => {
  if (po.status === 'Closed' || po.status === 'Cancelled') return po.status;
  const items = po.items || [];
  if (items.length && items.every((p) => number(p.billedQuantity) >= number(p.quantity))) return 'Billed';
  if (items.some((p) => number(p.billedQuantity) > 0)) return 'Partly Billed';
  return 'Open';
};

exports.createPo = async (req, res) => {
  try {
    const data = preparePo(req.body);
    const invalid = validate(data);
    if (invalid) return res.status(400).json({ error: invalid });
    const businessId = req.auth.businessId;
    const duplicate = await findDuplicate(businessId, data);
    if (duplicate) return res.status(400).json({ error: `PO ${data.billDetails.poNumber} from ${data.customer.name} is already entered.` });
    data.businessId = businessId;
    const po = await BuyerPo.create(data);
    res.status(201).json(po);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getPos = async (req, res) => {
  try {
    const filter = { businessId: req.auth.businessId };
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'customer.name': rx }, { 'billDetails.poNumber': rx }, { 'invoices.invoiceNumber': rx }];
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customerId) filter['customer.customerId'] = req.query.customerId;
    if (req.query.startDate || req.query.endDate) {
      filter['billDetails.date'] = {};
      if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    const sort = { 'billDetails.date': -1, createdAt: -1 };

    // Paginated report mode — opt-in via ?page=, same convention as delivery challans.
    if (req.query.page) {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
      const page = Math.max(1, Number(req.query.page) || 1);
      const [data, total] = await Promise.all([
        BuyerPo.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        BuyerPo.countDocuments(filter),
      ]);
      return res.json({ data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    res.json(await BuyerPo.find(filter).sort(sort));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getPoById = async (req, res) => {
  try {
    const po = await BuyerPo.findOne({ _id: req.params.id, businessId: req.auth.businessId });
    if (!po) return res.status(404).json({ error: 'Purchase order not found.' });
    res.json(po);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updatePo = async (req, res) => {
  try {
    const data = preparePo(req.body);
    const invalid = validate(data);
    if (invalid) return res.status(400).json({ error: invalid });
    const businessId = req.auth.businessId;
    const prev = await BuyerPo.findOne({ _id: req.params.id, businessId });
    if (!prev) return res.status(404).json({ error: 'Purchase order not found.' });
    if (prev.invoices?.length) return res.status(400).json({ error: 'This PO already has GST bills against it and can no longer be edited.' });
    if (prev.status === 'Cancelled') return res.status(400).json({ error: 'A cancelled PO cannot be edited. Reopen it first.' });
    const duplicate = await findDuplicate(businessId, data, prev._id);
    if (duplicate) return res.status(400).json({ error: `PO ${data.billDetails.poNumber} from ${data.customer.name} is already entered.` });

    const po = await BuyerPo.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    res.json(po);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

// Manual status change: Closed (short-close), Cancelled, or Open to reopen either of them.
exports.updateStatus = async (req, res) => {
  try {
    const status = String(req.body.status || '');
    if (!['Open', 'Closed', 'Cancelled'].includes(status)) return res.status(400).json({ error: 'Status must be Open, Closed or Cancelled.' });
    const businessId = req.auth.businessId;
    const po = await BuyerPo.findOne({ _id: req.params.id, businessId });
    if (!po) return res.status(404).json({ error: 'Purchase order not found.' });
    if (status === 'Cancelled' && po.invoices?.length) return res.status(400).json({ error: 'This PO already has GST bills against it. Close it instead of cancelling.' });
    // Reopening goes back to whatever the billed quantities say.
    po.status = status;
    po.status = deriveStatus(po);
    await po.save();
    res.json(po);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

// Called by the GST billing page after it saves a bill created from this PO. The
// billed quantities are read from the saved bill itself, not from the request.
exports.markBilled = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const po = await BuyerPo.findOne({ _id: req.params.id, businessId });
    if (!po) return res.status(404).json({ error: 'Purchase order not found.' });
    if (po.status === 'Cancelled') return res.status(400).json({ error: 'This PO is cancelled.' });
    const sale = await GstSale.findOne({ _id: req.body.invoiceId, businessId });
    if (!sale) return res.status(404).json({ error: 'GST bill not found.' });
    if (po.invoices.some((inv) => String(inv.invoiceId) === String(sale._id))) return res.json(po);

    // Each bill line fills the matching PO lines (by product name) up to what is still pending.
    (sale.items || []).forEach((line) => {
      let left = number(line.quantity);
      po.items.forEach((item) => {
        if (left <= 0 || !sameName(item.name, line.name)) return;
        const take = Math.min(left, Math.max(0, number(item.quantity) - number(item.billedQuantity)));
        item.billedQuantity = round2(number(item.billedQuantity) + take);
        left -= take;
      });
    });
    po.invoices.push({ invoiceId: sale._id, invoiceNumber: sale.billDetails?.invoiceNumber || '', date: sale.billDetails?.date });
    po.status = deriveStatus(po);
    await po.save();
    res.json(po);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deletePo = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const po = await BuyerPo.findOne({ _id: req.params.id, businessId });
    if (!po) return res.status(404).json({ error: 'Purchase order not found.' });
    if (po.invoices?.length) return res.status(400).json({ error: 'This PO already has GST bills against it and cannot be deleted.' });
    await po.deleteOne();
    res.json({ message: 'Purchase order deleted successfully.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
