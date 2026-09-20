const mongoose = require('mongoose');

// A payment voucher — money paid out to a supplier. Posts to the supplier
// ledger as a debit (reduces what we owe them).
const paymentSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  payment_no: { type: String, trim: true, default: '' },
  date: { type: Date, default: Date.now },
  supplier: {
    name: { type: String, required: [true, 'Supplier name is required'], trim: true },
  },
  amount: { type: Number, required: true, min: 0 },
  mode: { type: String, trim: true, default: 'cash' }, // cash | bank | upi | cheque
  note: { type: String, trim: true, default: '' },
}, { timestamps: true });

paymentSchema.index({ 'supplier.name': 1, date: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
