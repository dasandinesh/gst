const mongoose = require('mongoose');
const { billShippingAddressSchema } = require('./addressSchema');

// One ordered line on a buyer's purchase order — same shape as a GST sale line,
// plus how much of it has been billed so far. Taxable value and CGST/SGST/IGST
// are computed server-side, never trusted from the client.
const poItemSchema = new mongoose.Schema({
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
  amount: { type: Number, default: 0 },
  billedQuantity: { type: Number, default: 0, min: 0 }
}, { _id: false });

// Open → Partly Billed → Billed follow from billedQuantity; Closed (short-closed,
// no more supply expected) and Cancelled are set by hand.
const PO_STATUSES = ['Open', 'Partly Billed', 'Billed', 'Closed', 'Cancelled'];

const poBillDetailsSchema = new mongoose.Schema({
  poNumber: { type: String, required: true, trim: true }, // the buyer's own PO number
  date: { type: Date, required: true },
  deliveryDate: { type: Date }, // delivery expected by
  taxType: { type: String, enum: ['CGST_SGST', 'IGST'], default: 'CGST_SGST' },
  placeOfSupply: { type: String, default: '' },
  paymentTerms: { type: String, default: '' },
  totalTaxableValue: { type: Number, default: 0 },
  totalCgst: { type: Number, default: 0 },
  totalSgst: { type: Number, default: 0 },
  totalIgst: { type: Number, default: 0 },
  totalGst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, { _id: false });

const buyerPoSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  customer: {
    name: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' }
  },
  shippingAddress: billShippingAddressSchema,
  items: [poItemSchema],
  billDetails: poBillDetailsSchema,
  status: { type: String, enum: PO_STATUSES, default: 'Open' },
  // GST bills raised against this PO (one PO can be supplied over several bills).
  invoices: [{
    _id: false,
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GstSale' },
    invoiceNumber: { type: String, default: '' },
    date: { type: Date }
  }]
}, { timestamps: true });

buyerPoSchema.index({ businessId: 1, 'billDetails.date': -1 });

const BuyerPoModel = mongoose.model('BuyerPurchaseOrder', buyerPoSchema);
BuyerPoModel.STATUSES = PO_STATUSES;

module.exports = BuyerPoModel;
