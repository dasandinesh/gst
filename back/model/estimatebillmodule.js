const mongoose = require('mongoose');

// One line item on an estimate — no GST/tax math, just quantity x rate.
const estimateItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: '' },
  rate: { type: Number, required: true, min: 0 },
  amount: { type: Number, default: 0 }
}, { _id: false });

const estimateBillDetailsSchema = new mongoose.Schema({
  estimateNumber: { type: String },
  date: { type: Date, required: true },
  subtotal: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  cash: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  // Estimate customer's running balance snapshot at the time this estimate was made.
  openingBalance: { type: Number, default: 0 },
  closingBalance: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, { _id: false });

const estimateBillSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  customer: {
    name: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'EstimateCustomer' }
  },
  items: [estimateItemSchema],
  billDetails: estimateBillDetailsSchema
}, { timestamps: true });

estimateBillSchema.index({ businessId: 1, 'billDetails.estimateNumber': 1 }, { unique: true });

const EstimateBillModel = mongoose.model('EstimateBill', estimateBillSchema);

module.exports = EstimateBillModel;
