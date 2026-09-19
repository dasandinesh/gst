const Payment = require('../model/paymentmodule');
const Counter = require('../model/countermodule');
const Supplier = require('../model/suppliermodule');

const number = (value) => Number(value) || 0;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Adjust a supplier's running payable balance (suppliermodule `oldBalance`) by `delta`.
// A payment reduces the balance, i.e. pass a negative delta.
const applySupplierBalance = async (name, delta) => {
  if (!name || !delta) return;
  const s = await Supplier.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!s) return;
  s.oldBalance = number(s.oldBalance) + delta;
  await s.save();
};

const prepare = (body = {}) => ({
  date: body.date || new Date(),
  supplier: { name: (body.supplier?.name ?? body.supplierName ?? '').trim() },
  amount: number(body.amount),
  mode: (body.mode || 'cash').trim(),
  note: (body.note || '').trim(),
});

exports.createPayment = async (req, res) => {
  try {
    const data = prepare(req.body);
    if (!data.supplier.name) return res.status(400).json({ error: 'Supplier name is required.' });
    if (!data.amount || data.amount <= 0) return res.status(400).json({ error: 'Enter an amount greater than zero.' });
    // Auto payment number when the user didn't type one.
    data.payment_no = req.body.payment_no
      ? String(req.body.payment_no).trim()
      : String(await Counter.next('payment'));
    const payment = await Payment.create(data);
    await applySupplierBalance(data.supplier.name, -data.amount); // payment made reduces balance owed
    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.supplier) filter['supplier.name'] = { $regex: req.query.supplier.trim(), $options: 'i' };
    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) filter.date.$gte = new Date(`${req.query.startDate}T00:00:00.000`);
      if (req.query.endDate) filter.date.$lte = new Date(`${req.query.endDate}T23:59:59.999`);
    }
    res.json(await Payment.find(filter).sort({ date: -1, createdAt: -1 }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    res.json(payment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const data = prepare(req.body);
    if (!data.supplier.name) return res.status(400).json({ error: 'Supplier name is required.' });
    if (!data.amount || data.amount <= 0) return res.status(400).json({ error: 'Enter an amount greater than zero.' });
    if (req.body.payment_no) data.payment_no = String(req.body.payment_no).trim();
    const prev = await Payment.findById(req.params.id);
    if (!prev) return res.status(404).json({ error: 'Payment not found.' });
    await applySupplierBalance(prev.supplier?.name, number(prev.amount));  // undo old debit
    await applySupplierBalance(data.supplier.name, -data.amount);          // apply new debit
    const payment = await Payment.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    res.json(payment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    await applySupplierBalance(payment.supplier?.name, number(payment.amount)); // undo its debit
    res.json({ message: 'Payment deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
