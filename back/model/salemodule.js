const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    comment: { type: String },
    barcode: { type: String },
    hsnCode: { type: String },  
    quantity: { type: String, required: true },
    single_price: { type: String, required: true },
    scale: { type: String },
    tgstpre: { type: String },
    crossprice: { type: String },
    crossprice_total: { type: String },
    scaleno: { type: String },
    cgst: { type: String },
    sgst: { type: String },
    single_bag_amount: { type: String },
    bagprice: { type: String },
    single_wages_amount: { type: String },
    Wages: { type: String },
    single_commission_amount: { type: String },
    commission: { type: String },
    price: { type: String }
}, { _id: false });

// Dynamic GST rate totals per category (cgst/sgst/igst) keyed by GST rate (e.g., "5", "12")
const gstRateTotalsSchema = new mongoose.Schema({
    cgst: { type: String },
    sgst: { type: String },
    igst: { type: String }
}, { _id: false });


const billDetailsSchema = new mongoose.Schema({
    bill_number: { type: String },
    date: { type: String, required: true },
    bill_date: { type: String, required: true },
    total_quantity: { type: String },
    transport: { type: String },
    totalbagprice: { type: String },
    totalWages: { type: String },
    totalcommission: { type: String },
    totalcgst: { type: String },
    totalsgst: { type: String },
    totaligst: { type: String },
    totalgst: { type: String },
    // Use a Map so only available GST categories are stored.
    // Example: gstTotals: { "5": { cgst: "100", sgst: "100", igst: "0" }, "12": { ... } }
    gstTotals: { type: Map, of: gstRateTotalsSchema },
    credit: { type: String },
    cash: { type: String },
    old_balance: { type: String },
    new_balance: { type: String },
    subtotal: { type: String },
    roundOff: { type: String },
    bill_amount: { type: String, required: true }
}, { _id: false });

const SaleSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    customer: {
        name: { type: String, required: true },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }
    },
    products: [productSchema],
    bill_details: billDetailsSchema
}, { timestamps: true });

SaleSchema.index({ businessId: 1, 'bill_details.bill_number': 1 }, { unique: true });

// Auto-increment bill number, scoped to this sale's own business so each
// business's bill numbers start from SB-0001 independently.
SaleSchema.pre('save', async function(next) {
    if (this.isNew && !this.bill_details.bill_number) {
        try {
            const lastSale = await this.constructor.findOne({ businessId: this.businessId }, {}, { sort: { 'createdAt': -1 } });
            let billNumber = 1;
            
            if (lastSale && lastSale.bill_details.bill_number) {
                const lastBillNum = parseInt(lastSale.bill_details.bill_number.replace('SB-', ''));
                billNumber = lastBillNum + 1;
            }
            
            this.bill_details.bill_number = `SB-${billNumber.toString().padStart(4, '0')}`;
        } catch (error) {
            return next(error);
        }
    }
    next();
});

// Default export remains the global connection-bound model (backward compatible)
const SaleModel = mongoose.model('Sale', SaleSchema);
// Also expose the schema so tenant-aware controllers can bind it to req.tenantConn
SaleModel.SaleSchema = SaleSchema;

module.exports = SaleModel;
