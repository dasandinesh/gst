const mongoose = require('mongoose');

// One product line on a GST bill — taxable value and CGST/SGST/IGST are
// computed server-side in the controller, never trusted from the client.
const gstProductSchema = new mongoose.Schema({
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

// Per-GST-rate breakup (e.g. "5", "12") — used for the tax summary printed on the bill.
const gstRateTotalsSchema = new mongoose.Schema({
  taxableValue: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 }
}, { _id: false });

const gstBillDetailsSchema = new mongoose.Schema({
  billNumber: { type: String, unique: true },
  date: { type: Date, required: true },
  taxType: { type: String, enum: ['CGST_SGST', 'IGST'], default: 'CGST_SGST' },
  placeOfSupply: { type: String, default: '' },
  subtotal: { type: Number, default: 0 },
  totalCgst: { type: Number, default: 0 },
  totalSgst: { type: Number, default: 0 },
  totalIgst: { type: Number, default: 0 },
  totalGst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  billAmount: { type: Number, default: 0 },
  cash: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  oldBalance: { type: Number, default: 0 },
  newBalance: { type: Number, default: 0 },
  remark: { type: String, default: '' }
}, { _id: false });

const gstSaleSchema = new mongoose.Schema({
  customer: {
    name: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' }
  },
  products: [gstProductSchema],
  // Dynamic GST rate totals, keyed by rate (e.g. { "5": { taxableValue, cgst, sgst, igst } }).
  gstTotals: { type: Map, of: gstRateTotalsSchema },
  bill_details: gstBillDetailsSchema
}, { timestamps: true });

const GstSaleModel = mongoose.model('GstSale', gstSaleSchema);
GstSaleModel.gstSaleSchema = gstSaleSchema;

module.exports = GstSaleModel;
