const mongoose = require('mongoose');
const { shippingAddressSchema } = require('./addressSchema');

const customerSchema = new mongoose.Schema({
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
  // Default delivery address; empty means goods go to the billing address above.
  shippingAddress: { type: shippingAddressSchema, default: () => ({}) },
  oldBalance: { type: Number, default: 0 },
  pan_it_no: { type: String },
  gst_no: { type: String },
  // Bank Details
  bankDetails: {
    bankName: { type: String },
    accountHolderName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    branchName: { type: String },
    accountType: {
      type: String,
      enum: ['', 'Savings', 'Current', 'Other'],
      default: ''
    }
  }
}, { timestamps: true });

// Default global model (legacy)
const CustomerModel = mongoose.model('Customer', customerSchema);


module.exports = CustomerModel;
