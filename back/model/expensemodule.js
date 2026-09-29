const mongoose = require('mongoose');

// An expense voucher (Accounts → Expenses): rent, salary, electricity, freight…
// Posts Dr expense account (+ Dr input GST when the bill has GST) → Cr the
// account it was paid from (cash, a bank, or Creditors when not yet paid).
const expenseSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  number: { type: String },                                  // EXP/26-27/0001 (auto)
  date: { type: Date, required: true },
  account: { type: String, required: true },                 // expense account key
  paidFrom: { type: String, required: true, default: 'cash' }, // cash / bank / c_<id> / creditors
  payee: { type: String, default: '', trim: true },          // who was paid (supplier name when on credit)
  payeeGstin: { type: String, default: '', trim: true },
  billNumber: { type: String, default: '', trim: true },     // the payee's bill / invoice number
  amount: { type: Number, required: true, min: 0 },           // taxable value (before GST)
  gstRate: { type: Number, default: 0, min: 0, max: 100 },
  taxType: { type: String, enum: ['CGST_SGST', 'IGST'], default: 'CGST_SGST' },
  claimItc: { type: Boolean, default: true },                // GST goes to input credit (else it's part of the expense)
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  note: { type: String, default: '', trim: true },
}, { timestamps: true });

expenseSchema.index({ businessId: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: 'string' } } });
expenseSchema.index({ businessId: 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
