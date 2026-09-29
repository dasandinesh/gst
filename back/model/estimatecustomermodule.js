const mongoose = require('mongoose');

const estimateCustomerSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  name: { type: String, required: true },
  createDate: { type: Date, default: Date.now },
  phone: { type: String },
  door: { type: String },
  street: { type: String },
  area: { type: String },
  district: { type: String },
  state: { type: String },
  pincode: { type: String },
  pan_it_no: { type: String },
  // Set once when the customer is created; stays fixed after that.
  openingBalance: { type: Number, default: 0 },
  // Running balance, auto-maintained by estimate bill create/update/delete
  // (mirrors how customermodule's oldBalance is maintained by salecontroller).
  closingBalance: { type: Number, default: 0 }
}, { timestamps: true });

const EstimateCustomerModel = mongoose.model('EstimateCustomer', estimateCustomerSchema);

module.exports = EstimateCustomerModel;
