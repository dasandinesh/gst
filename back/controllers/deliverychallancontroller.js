const DeliveryChallan = require('../model/deliverychallanmodule');
const Counter = require('../model/countermodule');
const { financialYearLabel } = require('../utils/financialYear');
const { cleanBillShippingAddress } = require('../model/addressSchema');
const { cleanTransport } = require('../utils/transport');

// A delivery challan only records goods leaving with a document — it is not a sale,
// so unlike GST sales/credit notes it never touches stock or the customer's balance.

const number = (value) => Number(value) || 0;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    amount: round2(taxableValue + gstAmount)
  };
};

const prepareChallan = (body = {}) => {
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
    // E-way bill Part-B details plus the challan's own driver name/phone.
    // null (not undefined) so clearing it on edit actually removes the old details.
    transport: cleanTransport(body.transport, ['driverName', 'driverPhone']) || null,
    billDetails: {
      challanNumber: bill.challanNumber || '',
      date: bill.date || new Date(),
      taxType,
      placeOfSupply: bill.placeOfSupply || '',
      reason: bill.reason || 'Delivery Before Invoice',
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

exports.createChallan = async (req, res) => {
  try {
    const data = prepareChallan(req.body);
    if (!data.customer.name) return res.status(400).json({ error: 'Customer name is required.' });
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the delivery challan.' });
    const businessId = req.auth.businessId;
    data.businessId = businessId;
    if (!data.billDetails.challanNumber) {
      const fy = financialYearLabel(data.billDetails.date);
      const seq = await Counter.next(`${businessId}:dc:${fy}`);
      data.billDetails.challanNumber = `DC/${fy}/${String(seq).padStart(4, '0')}`;
    }
    const challan = await DeliveryChallan.create(data);
    res.status(201).json(challan);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.getChallans = async (req, res) => {
  try {
    const filter = { businessId: req.auth.businessId };
    if (req.query.q && req.query.q.trim()) {
      const rx = { $regex: escapeRegex(req.query.q.trim()), $options: 'i' };
      filter.$or = [{ 'customer.name': rx }, { 'billDetails.challanNumber': rx }, { 'transport.vehicleNumber': rx }, { 'invoice.invoiceNumber': rx }];
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.startDate || req.query.endDate) {
      filter['billDetails.date'] = {};
      if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    const sort = { 'billDetails.date': -1, createdAt: -1 };

    // Paginated report mode — opt-in via ?page=, same convention as GST sales/credit notes.
    if (req.query.page) {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
      const page = Math.max(1, Number(req.query.page) || 1);
      const [data, total] = await Promise.all([
        DeliveryChallan.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        DeliveryChallan.countDocuments(filter),
      ]);
      return res.json({ data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    res.json(await DeliveryChallan.find(filter).sort(sort));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getChallanById = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findOne({ _id: req.params.id, businessId: req.auth.businessId });
    if (!challan) return res.status(404).json({ error: 'Delivery challan not found.' });
    res.json(challan);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.updateChallan = async (req, res) => {
  try {
    const data = prepareChallan(req.body);
    if (!data.customer.name) return res.status(400).json({ error: 'Customer name is required.' });
    if (!data.items.length) return res.status(400).json({ error: 'Add at least one product before saving the delivery challan.' });
    const businessId = req.auth.businessId;
    const prev = await DeliveryChallan.findOne({ _id: req.params.id, businessId });
    if (!prev) return res.status(404).json({ error: 'Delivery challan not found.' });
    if (prev.status === 'Invoiced') return res.status(400).json({ error: `This challan is already invoiced as ${prev.invoice?.invoiceNumber || 'a GST bill'} and can no longer be edited.` });
    data.billDetails.challanNumber = prev.billDetails?.challanNumber || data.billDetails.challanNumber;

    const challan = await DeliveryChallan.findOneAndUpdate({ _id: req.params.id, businessId }, data, { new: true, runValidators: true });
    res.json(challan);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

// Status-only change (Pending / Returned / Cancelled). "Invoiced" is set only via markInvoiced.
exports.updateStatus = async (req, res) => {
  try {
    const status = String(req.body.status || '');
    if (!['Pending', 'Returned', 'Cancelled'].includes(status)) return res.status(400).json({ error: 'Status must be Pending, Returned or Cancelled.' });
    const businessId = req.auth.businessId;
    const prev = await DeliveryChallan.findOne({ _id: req.params.id, businessId });
    if (!prev) return res.status(404).json({ error: 'Delivery challan not found.' });
    if (prev.status === 'Invoiced') return res.status(400).json({ error: 'An invoiced challan cannot change status.' });
    prev.status = status;
    await prev.save();
    res.json(prev);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

// Called by the GST billing page after it saves a bill created from this challan.
exports.markInvoiced = async (req, res) => {
  try {
    const businessId = req.auth.businessId;
    const challan = await DeliveryChallan.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { status: 'Invoiced', invoice: { invoiceId: req.body.invoiceId || undefined, invoiceNumber: req.body.invoiceNumber || '' } },
      { new: true }
    );
    if (!challan) return res.status(404).json({ error: 'Delivery challan not found.' });
    res.json(challan);
  } catch (error) { res.status(400).json({ error: error.message }); }
};

exports.deleteChallan = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });
    if (!challan) return res.status(404).json({ error: 'Delivery challan not found.' });
    res.json({ message: 'Delivery challan deleted successfully.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};
