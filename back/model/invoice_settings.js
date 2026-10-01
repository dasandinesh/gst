const mongoose = require('mongoose');

const invoice_settingSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
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
  // Logo shown in the printed bill's letterhead, stored as a data URI
  // (e.g. "data:image/png;base64,...") — small enough for a shop logo and
  // avoids needing separate file storage/hosting for one image per business.
  logo: { type: String, default: '' },
  // The serial number the next auto-generated GST bill (in the current
  // financial year) should use — lets a business continuing from paper bills
  // or another system pick up numbering where it left off instead of at 1.
  gstBillStartNumber: { type: Number, default: 1, min: 1 },
  // How auto-generated GST bill numbers look — see utils/billNumberFormat.js.
  gstBillFormat: { type: String, default: 'GB/{FY}/{NO}', trim: true },
  // Digits the running number is padded to: 0 = as is (1, 2, 3), 4 = 0001.
  gstBillDigits: { type: Number, default: 4, min: 0, max: 8 },
  // Bill series: a business can have several invoice settings (e.g. two trade
  // names under one GSTIN), each with its own letterhead and numbering. The
  // first keeps the business-wide counter; later ones get their own (see
  // utils/billNumberFormat.js counterKey).
  ownCounter: { type: Boolean, default: false },

}, { timestamps: true });

// Default global model (legacy)
const Invoice_settingModel = mongoose.model('Invoice_setting', invoice_settingSchema);


module.exports = Invoice_settingModel;
