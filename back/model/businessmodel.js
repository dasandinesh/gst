const mongoose = require('mongoose');

// The tenant: one signed-up company/shop. Every business-owned record
// elsewhere in the app (customers, products, bills, ...) is meant to carry
// this document's _id as `businessId` once that scoping is added.
const businessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  gstin: { type: String },
  phone: { type: String },
  door: { type: String },
  street: { type: String },
  area: { type: String },
  district: { type: String },
  state: { type: String },
  pincode: { type: String },
  // Screen preferences (Master → Entry Settings): which optional sections an
  // entry page shows. Everything is on by default.
  preferences: {
    gstBillEntry: {
      showBillList: { type: Boolean, default: true },
      showReferences: { type: Boolean, default: true },
      showTransport: { type: Boolean, default: true },
      showPayment: { type: Boolean, default: true },
      showRemark: { type: Boolean, default: true },
    },
    dcEntry: {
      showList: { type: Boolean, default: true },
      showTransport: { type: Boolean, default: true },
      showRemark: { type: Boolean, default: true },
    },
    buyerPoEntry: {
      showList: { type: Boolean, default: true },
      showPaymentTerms: { type: Boolean, default: true },
      showRemark: { type: Boolean, default: true },
    },
  },
}, { timestamps: true });

module.exports = mongoose.model('Business', businessSchema);
