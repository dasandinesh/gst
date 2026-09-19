const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createDate: { type: Date, default: Date.now },
  phone: { type: String },
  gstin: { type: String },
  door: { type: String },
  street: { type: String },
  area: { type: String },
  district: { type: String },
  state: { type: String },
  pincode: { type: String },
  oldBalance: { type: Number, default: 0 }   // running payable balance — updated by every purchase
}, { timestamps: true });

const SupplierModel = mongoose.model('Supplier', supplierSchema);

module.exports = SupplierModel;
