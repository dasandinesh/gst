const ProductModel = require('../model/productmodule');

const mapEntries = (entries) => Array.isArray(entries) ? entries.map((e) => ({
    serialNumber: e.serialNumber || '',
    date: e.date || '',
    patchNumber: e.patchNumber || e.batchNumber || ''
})) : undefined;

const mapProductBody = (body) => ({
    name: body.name,
    hsnCode: body.hsnCode,
    Malayalam: body.Malayalam,
    Tamil: body.Tamil,
    Scale: body.Scale,
    ScaleNo: body.ScaleNo,
    Price: body.Price,
    gstpre: body.gstpre,
    wholesalePrice: body.wholesalePrice,
    category: body.category,
    barcode: body.barcode,
    notes: body.notes,
    gstMode: body.gstMode,
    StockQunity: body.StockQunity,
    reorderLevel: body.reorderLevel,
    entries: mapEntries(body.entries)
});

exports.createProduct = async (req, res) => {
    try {
        const productData = mapProductBody(req.body || {});
        const product = new ProductModel(productData);
        await product.save();
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get all products
exports.getProducts = async (req, res) => {
    try {
        const products = await ProductModel.find().sort({ name: 1 });
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get a product by ID
exports.getProductById = async (req, res) => {
    try {
        const product = await ProductModel.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update a product by ID
exports.updateProduct = async (req, res) => {
    try {
        const update = mapProductBody(req.body || {});
        // Remove undefined keys so they don't overwrite existing values
        Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

        const product = await ProductModel.findByIdAndUpdate(
            req.params.id,
            update,
            { new: true, runValidators: true }
        );
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Manually correct stock on hand by a +/- delta (e.g. stock take, damage, opening
// balance fix) — purchases and sales adjust StockQunity on their own via their
// own controllers, this is for corrections outside that flow.
exports.adjustStock = async (req, res) => {
    try {
        const delta = Number(req.body.delta);
        if (!delta) return res.status(400).json({ error: 'A non-zero delta is required.' });
        const product = await ProductModel.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const next = Number(product.StockQunity || 0) + delta;
        if (next < 0) return res.status(400).json({ error: 'Stock cannot go below zero.' });
        product.StockQunity = next;
        await product.save();
        res.status(200).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Delete a product by ID
exports.deleteProduct = async (req, res) => {
    try {
        const product = await ProductModel.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
