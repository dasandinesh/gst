const mongoose = require('mongoose');

const invoice_settingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  gstin: { type: String, default: '' },
  phone: { type: String },
  phone_2:{type:String},
  door: { type: String },
  street: { type: String },
  area: { type: String },
  district: { type: String },
  state: { type: String },
  pincode: { type: String },
  header:{ type: String },
  fooder:{ type: String },
  isDefault: { type: Boolean, default: false },

}, { timestamps: true });

// Default global model (legacy)
const Invoice_settingModel = mongoose.model('Invoice_setting', invoice_settingSchema);


module.exports = Invoice_settingModel;
