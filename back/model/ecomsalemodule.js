const mongoose = require('mongoose');

// One month of sales made through an e-commerce operator (marketplace) that
// collects TCS — imported from the operator's sales + returns report (see
// utils/ecomReport.js). Stored as net totals only (sales − returns), which is
// all GSTR-1 needs for these B2C supplies: B2CS rows (tagged with the
// operator's GSTIN), Table 14, and the HSN summary.
const ecomRowSchema = new mongoose.Schema({
  pos: { type: String, required: true },        // 2-digit place of supply (buyer's state)
  state: { type: String, default: '' },         // its name, for display
  rate: { type: Number, required: true },
  inter: { type: Boolean, default: false },     // IGST (another state) vs CGST + SGST
  taxableValue: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
}, { _id: false });

const ecomHsnSchema = new mongoose.Schema({
  hsnCode: { type: String, required: true },
  rate: { type: Number, required: true },
  quantity: { type: Number, default: 0 },
  taxableValue: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
}, { _id: false });

const ecomSaleSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  etin: { type: String, required: true },       // e-commerce operator's GSTIN (TCS registration)
  fp: { type: String, required: true },         // return period MMYYYY
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  sellerName: { type: String, default: '' },
  files: [{ type: String }],
  counts: {
    sales: { type: Number, default: 0 },
    returns: { type: Number, default: 0 },
    adjustments: { type: Number, default: 0 },
  },
  rows: [ecomRowSchema],
  hsn: [ecomHsnSchema],
  totals: {
    taxableValue: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
  },
}, { timestamps: true });

// Importing the same operator's month again replaces it.
ecomSaleSchema.index({ businessId: 1, fp: 1, etin: 1 }, { unique: true });

module.exports = mongoose.model('EcomSale', ecomSaleSchema);
