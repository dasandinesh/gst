const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createDate: { type: Date, default: Date.now },
  phone: { type: String },
  door: { type: String },
  street: { type: String },
  area: { type: String },
  district: { type: String },
  state: { type: String },
  pincode: { type: String },
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
