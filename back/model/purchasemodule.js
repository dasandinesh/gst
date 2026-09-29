const mongoose = require('mongoose');

// One line item on a purchase bill — taxable value and CGST/SGST/IGST (input
// credit) are computed server-side in the controller, never trusted from the client.
const purchaseItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  hsnCode: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: '' },
  rate: { type: Number, required: true, min: 0 },
  gstMode: { type: String, enum: ['inclusive', 'exclusive'], default: 'exclusive' },
  gstRate: { type: Number, default: 0, min: 0, max: 100 },
  taxableValue: { type: Number, default: 0 },
  cgstRate: { type: Number, default: 0 },
  sgstRate: { type: Number, default: 0 },
  igstRate: { type: Number, default: 0 },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 },
  amount: { type: Number, default: 0 }
}, { _id: false });

// Per-GST-rate breakup (e.g. "5", "12") — used for the input-tax-credit summary.
const purchaseRateTotalsSchema = new mongoose.Schema({
  taxableValue: { type: Number, default: 0 },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 }
}, { _id: false });

const purchaseBillDetailsSchema = new mongoose.Schema({
  billNumber: { type: String },
  supplierInvoiceNumber: { type: String, default: '' }, // the supplier's own invoice number, if different
  date: { type: Date, required: true },
  taxType: { type: String, enum: ['CGST_SGST', 'IGST'], default: 'CGST_SGST' },
  placeOfSupply: { type: String, default: '' },
  totalTaxableValue: { type: Number, default: 0 },
  totalCgst: { type: Number, default: 0 },
  totalSgst: { type: Number, default: 0 },
  totalIgst: { type: Number, default: 0 },
  totalGst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  cash: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  openingBalance: { type: Number, default: 0 },
  closingBalance: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, { _id: false });

const purchaseSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  supplier: {
    name: { type: String, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' }
  },
  items: [purchaseItemSchema],
  // Dynamic GST rate totals, keyed by rate (e.g. { "5": { taxableValue, cgstAmount, sgstAmount, igstAmount } }).
  gstTotals: { type: Map, of: purchaseRateTotalsSchema },
  billDetails: purchaseBillDetailsSchema
}, { timestamps: true });

purchaseSchema.index({ businessId: 1, 'billDetails.billNumber': 1 }, { unique: true });

const PurchaseModel = mongoose.model('Purchase', purchaseSchema);
PurchaseModel.purchaseSchema = purchaseSchema;

module.exports = PurchaseModel;
