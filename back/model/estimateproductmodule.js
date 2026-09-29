const mongoose = require('mongoose');

const estimateProductSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: [true, 'Product name is required'], trim: true },
  barcode: { type: String, trim: true, default: '' },
  unit: { type: String, trim: true, default: '' },
  price: { type: Number, required: [true, 'Price is required'], min: 0 },
  // "Main godown quantity" — the stock counter estimate bills draw down from.
  // Entirely separate from the real productmodule's StockQunity.
  mainGodownQuantity: { type: Number, required: [true, 'Main godown quantity is required'], min: 0, default: 0 },
  notes: { type: String, trim: true, default: '' }
}, { timestamps: true });

estimateProductSchema.index({ name: 1 });

const EstimateProductModel = mongoose.model('EstimateProduct', estimateProductSchema);

module.exports = EstimateProductModel;
