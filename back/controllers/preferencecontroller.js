const Business = require('../model/businessmodel');

// Screen preferences for the active business (Master → Entry Settings).
// Missing keys fall back to these defaults, so older businesses see every section.
const DEFAULTS = {
  gstBillEntry: { showBillList: true, showReferences: true, showTransport: true, showPayment: true, showRemark: true },
  dcEntry: { showList: true, showTransport: true, showRemark: true },
  buyerPoEntry: { showList: true, showPaymentTerms: true, showRemark: true },
};

const withDefaults = (prefs = {}) => Object.fromEntries(
  Object.entries(DEFAULTS).map(([page, fields]) => [page, Object.fromEntries(
    Object.entries(fields).map(([key, fallback]) => [key, typeof prefs[page]?.[key] === 'boolean' ? prefs[page][key] : fallback]),
  )]),
);

exports.getPreferences = async (req, res) => {
  try {
    const business = await Business.findById(req.auth.businessId).lean();
    if (!business) return res.status(404).json({ error: 'Business not found.' });
    res.json(withDefaults(business.preferences));
  } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.updatePreferences = async (req, res) => {
  try {
    if (req.auth.role !== 'owner') return res.status(403).json({ error: 'Only the business owner can change entry settings.' });
    // Only known pages/keys are saved, and only as true/false.
    const preferences = withDefaults(req.body);
    const business = await Business.findByIdAndUpdate(req.auth.businessId, { preferences }, { new: true, runValidators: true }).lean();
    if (!business) return res.status(404).json({ error: 'Business not found.' });
    res.json(withDefaults(business.preferences));
  } catch (error) { res.status(400).json({ error: error.message }); }
};
