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
}, { timestamps: true });

module.exports = mongoose.model('Business', businessSchema);
