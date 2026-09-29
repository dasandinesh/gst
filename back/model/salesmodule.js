const mongoose = require('mongoose');
const { billShippingAddressSchema } = require('./addressSchema');

// One line item on a GST bill — taxable value and CGST/SGST/IGST are
// computed server-side in the controller, never trusted from the client.
const gstItemSchema = new mongoose.Schema({
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

// Per-GST-rate breakup (e.g. "5", "12") — used for the tax summary printed on the bill.
const gstRateTotalsSchema = new mongoose.Schema({
  taxableValue: { type: Number, default: 0 },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 }
}, { _id: false });

// E-way bill Part-B transport details (optional, printed on the invoice).
const transportSchema = new mongoose.Schema({
  mode: { type: String, enum: ['road', 'rail', 'air', 'ship'], default: 'road' },
  vehicleType: { type: String, enum: ['regular', 'odc'], default: 'regular' },
  vehicleNumber: { type: String, default: '' },
  transporterId: { type: String, default: '' },
  transporterName: { type: String, default: '' },
  docNumber: { type: String, default: '' },
  docDate: { type: Date },
  distanceKm: { type: Number, default: 0, min: 0, max: 4000 }
}, { _id: false });

const gstBillDetailsSchema = new mongoose.Schema({
  invoiceNumber: { type: String },
  date: { type: Date, required: true },
  taxType: { type: String, enum: ['CGST_SGST', 'IGST'], default: 'CGST_SGST' },
  placeOfSupply: { type: String, default: '' },
  // Optional references printed on the invoice (not required by GST Rule 46):
  // the delivery challan the goods left on, and the buyer's purchase order.
  deliveryChallanNumber: { type: String, default: '' },
  deliveryChallanDate: { type: Date },
  purchaseOrderNumber: { type: String, default: '' },
  purchaseOrderDate: { type: Date },
  transport: transportSchema,
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
  notes: { type: String, default: '' },
  // Created by GSTR-1 JSON import — historical data that never moved the
  // customer's balance, so deleting it must not move the balance either.
  imported: { type: Boolean, default: false }
}, { _id: false });

const gstSaleSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  customer: {
    name: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' }
  },
  shippingAddress: billShippingAddressSchema,
  items: [gstItemSchema],
  // Dynamic GST rate totals, keyed by rate (e.g. { "5": { taxableValue, cgstAmount, sgstAmount, igstAmount } }).
  gstTotals: { type: Map, of: gstRateTotalsSchema },
  billDetails: gstBillDetailsSchema
}, { timestamps: true });

gstSaleSchema.index({ businessId: 1, 'billDetails.invoiceNumber': 1 }, { unique: true });

const GstSaleModel = mongoose.model('GstSale', gstSaleSchema);
GstSaleModel.gstSaleSchema = gstSaleSchema;

module.exports = GstSaleModel;
