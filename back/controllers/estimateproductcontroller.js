const EstimateProduct = require('../model/estimateproductmodule');

const mapProductBody = (body) => ({
    name: body.name,
    barcode: body.barcode,
    unit: body.unit,
    price: body.price,
    mainGodownQuantity: body.mainGodownQuantity,
    notes: body.notes
});

// Create a new estimate product
exports.createEstimateProduct = async (req, res) => {
    try {
        const productData = { ...mapProductBody(req.body || {}), businessId: req.auth.businessId };
        const product = new EstimateProduct(productData);
        await product.save();
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get all estimate products
exports.getEstimateProducts = async (req, res) => {
    try {
        const products = await EstimateProduct.find({ businessId: req.auth.businessId }).sort({ name: 1 });
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get an estimate product by ID
exports.getEstimateProductById = async (req, res) => {
    try {
        const product = await EstimateProduct.findOne({ _id: req.params.id, businessId: req.auth.businessId });
        if (!product) {
            return res.status(404).json({ error: 'Estimate product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update an estimate product by ID
exports.updateEstimateProduct = async (req, res) => {
    try {
        const update = mapProductBody(req.body || {});
        Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

        const product = await EstimateProduct.findOneAndUpdate(
            { _id: req.params.id, businessId: req.auth.businessId },
            update,
            { new: true, runValidators: true }
        );
        if (!product) {
            return res.status(404).json({ error: 'Estimate product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Manually correct the main godown quantity by a +/- delta (stock take, damage, etc.) —
// estimate bill create/update/delete adjust it on their own via the estimate bill controller.
exports.adjustGodownQuantity = async (req, res) => {
    try {
        const delta = Number(req.body.delta);
        if (!delta) return res.status(400).json({ error: 'A non-zero delta is required.' });
        const product = await EstimateProduct.findOne({ _id: req.params.id, businessId: req.auth.businessId });
        if (!product) return res.status(404).json({ error: 'Estimate product not found' });
        const next = Number(product.mainGodownQuantity || 0) + delta;
        if (next < 0) return res.status(400).json({ error: 'Godown quantity cannot go below zero.' });
        product.mainGodownQuantity = next;
        await product.save();
        res.status(200).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Delete an estimate product by ID
exports.deleteEstimateProduct = async (req, res) => {
    try {
        const product = await EstimateProduct.findOneAndDelete({ _id: req.params.id, businessId: req.auth.businessId });
        if (!product) {
            return res.status(404).json({ error: 'Estimate product not found' });
        }
        res.status(200).json({ message: 'Estimate product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
