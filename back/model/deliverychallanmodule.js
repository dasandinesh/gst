const mongoose = require('mongoose');
const { billShippingAddressSchema } = require('./addressSchema');

// One line item on a delivery challan — same shape as a GST sale line; taxable
// value and CGST/SGST/IGST are computed server-side, never trusted from the client.
const dcItemSchema = new mongoose.Schema({
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

// GST rule 55 — the purposes goods may move under a challan instead of an invoice.
const DC_REASONS = ['Delivery Before Invoice', 'Supply on Approval', 'Job Work', 'Branch Transfer', 'Sample', 'Other'];
const DC_STATUSES = ['Pending', 'Invoiced', 'Returned', 'Cancelled'];

const dcBillDetailsSchema = new mongoose.Schema({
  challanNumber: { type: String },
  date: { type: Date, required: true },
  taxType: { type: String, enum: ['CGST_SGST', 'IGST'], default: 'CGST_SGST' },
  placeOfSupply: { type: String, default: '' },
  reason: { type: String, enum: DC_REASONS, default: 'Delivery Before Invoice' },
  totalTaxableValue: { type: Number, default: 0 },
  totalCgst: { type: Number, default: 0 },
  totalSgst: { type: Number, default: 0 },
  totalIgst: { type: Number, default: 0 },
  totalGst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, { _id: false });

const deliveryChallanSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  customer: {
    name: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' }
  },
  shippingAddress: billShippingAddressSchema,
  items: [dcItemSchema],
  // E-way bill Part-B details (same fields as a GST sale's billDetails.transport)
  // plus the driver who takes the goods.
  transport: {
    mode: { type: String, enum: ['road', 'rail', 'air', 'ship'], default: 'road' },
    vehicleType: { type: String, enum: ['regular', 'odc'], default: 'regular' },
    vehicleNumber: { type: String, default: '' },
    transporterId: { type: String, default: '' },
    transporterName: { type: String, default: '' },
    docNumber: { type: String, default: '' },
    docDate: { type: Date },
    distanceKm: { type: Number, default: 0, min: 0, max: 4000 },
    driverName: { type: String, default: '' },
    driverPhone: { type: String, default: '' }
  },
  billDetails: dcBillDetailsSchema,
  status: { type: String, enum: DC_STATUSES, default: 'Pending' },
  // Set once the challan is converted into a GST sale bill.
  invoice: {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GstSale' },
    invoiceNumber: { type: String, default: '' }
  }
}, { timestamps: true });

deliveryChallanSchema.index({ businessId: 1, 'billDetails.challanNumber': 1 }, { unique: true });

const DeliveryChallanModel = mongoose.model('DeliveryChallan', deliveryChallanSchema);
DeliveryChallanModel.REASONS = DC_REASONS;
DeliveryChallanModel.STATUSES = DC_STATUSES;

module.exports = DeliveryChallanModel;
