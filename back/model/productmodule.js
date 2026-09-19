const mongoose = require('mongoose');

// Sub-schema for entries array
const entrySchema = new mongoose.Schema({
  serialNumber: {
    type: String,
    trim: true
  },
  date: {
    type: String,
    trim: true
  },
  patchNumber: {
    type: String,
    trim: true
  }
}, { _id: false });

const productSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Basic Information
  name: { 
    type: String, 
    required: [true, 'Product name is required'],
    trim: true 
  },
  hsnCode: {
    type: String,
    trim: true,
    default: ''
  },
  Malayalam: { 
    type: String, 
    trim: true,
    default: '' 
  },
  Tamil: { 
    type: String, 
    trim: true,
    default: '' 
  },
  Scale: { 
    type: String, 
    trim: true,
    default: '' 
  },
  ScaleNo: { 
    type: Number,
    default: 0
  },
  
  // Pricing Information
  Price: { 
    type: Number, 
    required: [true, 'Price is required'],
    min: 0 
  },
  gstpre: {
    type: Number,
    required: [true, 'GST percentage is required'],
    min: 0,
    max: 100,
    default: 0
  },
  cgst: {
    type: Number,
    default: 0
  },
  sgst: {
    type: Number,
    default: 0
  },

  wholesalePrice: {
    type: Number,
    default: 0
  },
  
  category: { 
    type: String,
    trim: true,
    default: 'Electronics'
  },
  barcode: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  gstMode: {
    type: String,
    enum: ['inclusive', 'exclusive'],
    default: 'exclusive'
  },
  
  // Inventory
  StockQunity: { 
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: 0,
    default: 0 
  },
  reorderLevel: {
    type: Number,
    min: 0,
    default: 0
  },
  
  // Array of entries
  entries: [entrySchema]
  
}, { 
  timestamps: true 
});

// Pre-save hook to calculate cgst and sgst based on gstpre
productSchema.pre('save', function(next) {
  if (this.gstpre) {
    const gstRate = this.gstpre / 2; // Split GST into CGST and SGST
    this.cgst = gstRate;
    this.sgst = gstRate;
  }
  next();
});

// Create index for better query performance
productSchema.index({ name: 1, category: 1 });

// Default global model (legacy)
const ProductModel = mongoose.model('Product', productSchema);
// Expose schema for tenant-aware binding
ProductModel.productSchema = productSchema;

module.exports = ProductModel;
