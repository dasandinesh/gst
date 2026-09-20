const mongoose = require('mongoose');

// One product line on a debit note — same shape as a purchase line; taxable
// value and CGST/SGST/IGST are computed server-side, never trusted from the client.
const debitNoteProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  hsnCode: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  gstMode: { type: String, enum: ['inclusive', 'exclusive'], default: 'exclusive' },
  gstRate: { type: Number, default: 0, min: 0, max: 100 },
  taxableValue: { type: Number, default: 0 },
  cgstRate: { type: Number, default: 0 },
  sgstRate: { type: Number, default: 0 },
  igstRate: { type: Number, default: 0 },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
}, { _id: false });

// Per-GST-rate breakup (e.g. "5", "12") — used for the tax summary printed on the note.
const debitNoteRateTotalsSchema = new mongoose.Schema({
  taxableValue: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 }
}, { _id: false });

// A debit note must reference the original purchase bill it corrects.
const originalBillSchema = new mongoose.Schema({
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  billNumber: { type: String, required: true },
  date: { type: Date }
}, { _id: false });

const DEBIT_NOTE_REASONS = ['Purchase Return', 'Rate Difference', 'Discount Received', 'Deficiency in Goods/Services', 'Correction of Invoice', 'Other'];

const debitNoteBillDetailsSchema = new mongoose.Schema({
  debitNoteNumber: { type: String },
  date: { type: Date, required: true },
  taxType: { type: String, enum: ['CGST_SGST', 'IGST'], default: 'CGST_SGST' },
  placeOfSupply: { type: String, default: '' },
  reason: { type: String, enum: DEBIT_NOTE_REASONS, default: 'Purchase Return' },
  subtotal: { type: Number, default: 0 },
  totalCgst: { type: Number, default: 0 },
  totalSgst: { type: Number, default: 0 },
  totalIgst: { type: Number, default: 0 },
  totalGst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  debitNoteAmount: { type: Number, default: 0 },
  oldBalance: { type: Number, default: 0 },
  newBalance: { type: Number, default: 0 },
  remark: { type: String, default: '' }
}, { _id: false });

const debitNoteSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  originalBill: originalBillSchema,
  supplier: {
    name: { type: String, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' }
  },
  products: [debitNoteProductSchema],
  gstTotals: { type: Map, of: debitNoteRateTotalsSchema },
  bill_details: debitNoteBillDetailsSchema
}, { timestamps: true });

debitNoteSchema.index({ businessId: 1, 'bill_details.debitNoteNumber': 1 }, { unique: true });

const DebitNoteModel = mongoose.model('DebitNote', debitNoteSchema);
DebitNoteModel.debitNoteSchema = debitNoteSchema;
DebitNoteModel.REASONS = DEBIT_NOTE_REASONS;

module.exports = DebitNoteModel;
