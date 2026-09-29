const mongoose = require('mongoose');
const { orderItemSchema } = require('./ordermodule');

// A sale bill has the same line shape as an order bill (weight/bags, rate, bag/wage/commission charges);
// unlike an order it posts to the customer's running balance, so it snapshots the balance before/after.
const saleSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  customer: {
    name: { type: String, required: [true, 'Customer name is required'], trim: true },
  },
  billDetails: {
    billNumber: { type: String, trim: true, default: '' },
    orderNumber: { type: String, trim: true, default: '' },
    mainParty: { type: String, trim: true, default: '' },
    date: { type: Date, default: Date.now },
    billDate: { type: Date },
    totalQuantity: { type: Number, default: 0 },
    totalBags: { type: Number, default: 0 },
    weight: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    totalBagAmount: { type: Number, default: 0 },
    totalWage: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    freight: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    openingBalance: { type: Number, default: 0 },
    closingBalance: { type: Number, default: 0 },
    balance: { type: Number, default: 0 }, // same as closingBalance; kept for the order-style entry screen
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: '' },
    billed: { type: Boolean, default: false },
  },
  items: { type: [orderItemSchema], default: [] },
}, { timestamps: true });

saleSchema.index({ businessId: 1, 'billDetails.billNumber': 1 }, { unique: true });

const SaleModel = mongoose.model('Sale', saleSchema);
SaleModel.saleSchema = saleSchema;

module.exports = SaleModel;
