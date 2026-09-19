const mongoose = require('mongoose');

// One product line on a credit note — same shape as a GST sale line; taxable
// value and CGST/SGST/IGST are computed server-side, never trusted from the client.
const creditNoteProductSchema = new mongoose.Schema({
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
const creditNoteRateTotalsSchema = new mongoose.Schema({
  taxableValue: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 }
}, { _id: false });

// GST rule 53 requires a credit note to reference the original invoice it corrects.
const originalBillSchema = new mongoose.Schema({
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'GstSale' },
  billNumber: { type: String, required: true },
  date: { type: Date }
}, { _id: false });

const CREDIT_NOTE_REASONS = ['Sales Return', 'Post-Sale Discount', 'Deficiency in Goods/Services', 'Change in Place of Supply', 'Correction of Invoice', 'Other'];

const creditNoteBillDetailsSchema = new mongoose.Schema({
  creditNoteNumber: { type: String, unique: true },
  date: { type: Date, required: true },
  taxType: { type: String, enum: ['CGST_SGST', 'IGST'], default: 'CGST_SGST' },
  placeOfSupply: { type: String, default: '' },
  reason: { type: String, enum: CREDIT_NOTE_REASONS, default: 'Sales Return' },
  subtotal: { type: Number, default: 0 },
  totalCgst: { type: Number, default: 0 },
  totalSgst: { type: Number, default: 0 },
  totalIgst: { type: Number, default: 0 },
  totalGst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  creditNoteAmount: { type: Number, default: 0 },
  oldBalance: { type: Number, default: 0 },
  newBalance: { type: Number, default: 0 },
  remark: { type: String, default: '' }
}, { _id: false });

const creditNoteSchema = new mongoose.Schema({
  originalBill: originalBillSchema,
  customer: {
    name: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' }
  },
  products: [creditNoteProductSchema],
  gstTotals: { type: Map, of: creditNoteRateTotalsSchema },
  bill_details: creditNoteBillDetailsSchema
}, { timestamps: true });

const CreditNoteModel = mongoose.model('CreditNote', creditNoteSchema);
CreditNoteModel.creditNoteSchema = creditNoteSchema;
CreditNoteModel.REASONS = CREDIT_NOTE_REASONS;

module.exports = CreditNoteModel;
