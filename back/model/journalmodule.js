const mongoose = require('mongoose');

// A journal voucher (Accounts → Journal Voucher): any entry the documents don't
// cover — owner's capital, loans, cash deposited in the bank, GST paid to the
// government, depreciation, corrections. Debits must equal credits.
const journalLineSchema = new mongoose.Schema({
  account: { type: String, required: true },   // account key
  party: { type: String, default: '' },        // customer / supplier name for Debtors / Creditors lines
  debit: { type: Number, default: 0, min: 0 },
  credit: { type: Number, default: 0, min: 0 },
}, { _id: false });

const journalSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  number: { type: String },                    // JV/26-27/0001 (auto)
  date: { type: Date, required: true },
  narration: { type: String, default: '', trim: true },
  lines: [journalLineSchema],
  total: { type: Number, default: 0 },
}, { timestamps: true });

journalSchema.index({ businessId: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: 'string' } } });
journalSchema.index({ businessId: 1, date: -1 });

module.exports = mongoose.model('Journal', journalSchema);
