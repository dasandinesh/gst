const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  name: {
    type: String,
    required: [true, 'Driver name is required'],
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  area: {
    type: String,
    trim: true,
    default: ''
  },
}, { timestamps: true });

driverSchema.index({ name: 1 });

const DriverModel = mongoose.model('Driver', driverSchema);

module.exports = DriverModel;
