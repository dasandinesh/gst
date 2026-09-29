const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  comment: { type: String, trim: true, default: '' },
  tamilName: { type: String, trim: true, default: '' }, // snapshot of the product's Tamil name at billing time.
  quantity: { type: Number, default: 0, min: 0 }, // weight
  bags: { type: Number, default: 0, min: 0 },
  unit: { type: String, trim: true, default: '' }, // mixer/bag/box/…
  rate: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 }, // (weight || bags) * rate
  bagRate: { type: Number, default: 0, min: 0 },
  bagAmount: { type: Number, default: 0, min: 0 }, // bags * bagRate
  wageRate: { type: Number, default: 0, min: 0 }, // per bag
  wageAmount: { type: Number, default: 0, min: 0 }, // bags * wageRate
  commissionRate: { type: Number, default: 0, min: 0 }, // per bag
  commissionAmount: { type: Number, default: 0, min: 0 }, // bags * commissionRate
}, { _id: true });

const orderSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  customer: {
    name: { type: String, required: [true, 'Customer name is required'], trim: true },
  },
  billDetails: {
    billNumber: { type: String, trim: true, default: '' }, // Bill No.
    orderNumber: { type: String, trim: true, default: '' },
    mainParty: { type: String, trim: true, default: '' },
    date: { type: Date, default: Date.now },
    billDate: { type: Date },
    totalQuantity: { type: Number, default: 0 },
    totalBags: { type: Number, default: 0 },
    weight: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 }, // sum of line amounts
    totalBagAmount: { type: Number, default: 0 },
    totalWage: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    freight: { type: Number, default: 0 }, // manual header-level charge
    grandTotal: { type: Number, default: 0 }, // subtotal + totalBagAmount + totalWage + totalCommission + freight
    balance: { type: Number, default: 0 }, // customer's balance snapshot at billing time (display only, not adjusted here)
    debit: { type: Number, default: 0 }, // Debit (Paymt)
    credit: { type: Number, default: 0 }, // Credit (Cash)
    notes: { type: String, trim: true, default: '' },
    billed: { type: Boolean, default: false }, // Confirm
  },
  items: { type: [orderItemSchema], default: [] },
}, { timestamps: true });

orderSchema.index({ 'billDetails.date': -1, 'billDetails.billNumber': 1 });

const OrderModel = mongoose.model('Order', orderSchema);
OrderModel.orderItemSchema = orderItemSchema;

module.exports = OrderModel;
