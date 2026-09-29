const bcrypt = require('bcryptjs');
const User = require('../model/usermodel');
const Membership = require('../model/membershipmodel');
const Business = require('../model/businessmodel');
const GstSale = require('../model/salesmodule');
const CreditNote = require('../model/creditnotemodule');
const Purchase = require('../model/purchasemodule');
const DebitNote = require('../model/debitnotemodule');
const { signAdminToken, adminCookieOptions, clearCookieOptions } = require('../config/jwt');
const { num, round2, mergeRateTotals, finalizeRateTable, totalsOf } = require('../utils/gstAggregation');

const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email });

// Only a user with isSuperAdmin can sign in here — this is a platform-level
// login, deliberately separate from the per-business /api/auth/login.
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email: String(email).toLowerCase().trim(), isSuperAdmin: true });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) return res.status(401).json({ error: 'Invalid email or password.' });
    if (user.isDisabled) return res.status(403).json({ error: 'This admin account has been disabled.' });

    const token = signAdminToken({ userId: user._id });
    res.cookie('admin_token', token, adminCookieOptions());
    res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.adminMe = async (req, res) => {
  try {
    const user = await User.findById(req.adminAuth.userId);
    if (!user || !user.isSuperAdmin || user.isDisabled) {
      return res.status(401).json({ error: 'Session is no longer valid.' });
    }
    res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.adminLogout = (req, res) => {
  res.clearCookie('admin_token', clearCookieOptions());
  res.status(200).json({ ok: true });
};

// Every registered user, with the businesses they belong to and their role
// in each — the platform-wide view a per-business owner can't get.
exports.listUsers = async (req, res) => {
  try {
    const [users, memberships] = await Promise.all([
      User.find().select('-passwordHash -resetPasswordTokenHash -resetPasswordExpires').sort({ createdAt: -1 }),
      Membership.find().populate('business'),
    ]);

    const membershipsByUser = {};
    memberships.forEach((m) => {
      if (!m.business) return;
      const key = String(m.user);
      if (!membershipsByUser[key]) membershipsByUser[key] = [];
      membershipsByUser[key].push({ businessId: m.business._id, businessName: m.business.name, role: m.role });
    });

    res.status(200).json(users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      isSuperAdmin: u.isSuperAdmin,
      isDisabled: u.isDisabled,
      createdAt: u.createdAt,
      businesses: membershipsByUser[String(u._id)] || [],
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Enable/disable a user's login — to both the normal app and, if they're also
// a super admin, the admin panel itself. Never lets an admin lock themself out.
exports.setUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isDisabled } = req.body;
    if (typeof isDisabled !== 'boolean') return res.status(400).json({ error: 'isDisabled must be true or false.' });
    if (String(id) === String(req.adminAuth.userId) && isDisabled) {
      return res.status(400).json({ error: 'You cannot disable your own admin account.' });
    }

    const user = await User.findByIdAndUpdate(id, { isDisabled }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.status(200).json({ id: user._id, isDisabled: user.isDisabled });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (String(id) === String(req.adminAuth.userId)) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await Membership.deleteMany({ user: id });
    await user.deleteOne();
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const dateFilter = (req) => {
  const filter = {};
  if (req.query.startDate || req.query.endDate) {
    filter['billDetails.date'] = {};
    if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
    if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
  }
  return filter;
};

const addToBucket = (bucket, doc, sign) => {
  const totals = doc.gstTotals;
  if (!totals) return;
  const values = totals instanceof Map ? totals.values() : Object.values(totals);
  for (const t of values) {
    bucket.cgst += sign * num(t.cgstAmount);
    bucket.sgst += sign * num(t.sgstAmount);
    bucket.igst += sign * num(t.igstAmount);
  }
};

// Platform-wide GSTR-1/3B-style summary, same shape as the per-business one
// (/api/reports/gst) but across every business, plus a per-business
// breakdown so an admin can see which tenants owe what.
exports.platformGstSummary = async (req, res) => {
  try {
    const filter = dateFilter(req);
    const [gstSales, creditNotes, purchases, debitNotes, businesses, userCount] = await Promise.all([
      GstSale.find(filter),
      CreditNote.find(filter),
      Purchase.find(filter),
      DebitNote.find(filter),
      Business.find(),
      User.countDocuments(),
    ]);

    const outwardTable = {};
    mergeRateTotals(gstSales, 1, outwardTable);
    mergeRateTotals(creditNotes, -1, outwardTable);
    const outwardRows = finalizeRateTable(outwardTable);

    const inwardTable = {};
    mergeRateTotals(purchases, 1, inwardTable);
    mergeRateTotals(debitNotes, -1, inwardTable);
    const inwardRows = finalizeRateTable(inwardTable);

    const outwardTotals = totalsOf(outwardRows);
    const inwardTotals = totalsOf(inwardRows);

    const netPayable = {
      cgst: round2(outwardTotals.cgst - inwardTotals.cgst),
      sgst: round2(outwardTotals.sgst - inwardTotals.sgst),
      igst: round2(outwardTotals.igst - inwardTotals.igst),
    };
    netPayable.total = round2(netPayable.cgst + netPayable.sgst + netPayable.igst);

    // Per-business breakdown: same net-payable math, scoped per businessId.
    const perBusiness = {};
    const ensure = (id) => {
      if (!perBusiness[id]) {
        perBusiness[id] = {
          outward: { cgst: 0, sgst: 0, igst: 0 },
          inward: { cgst: 0, sgst: 0, igst: 0 },
          billCount: 0, creditNoteCount: 0, purchaseCount: 0, debitNoteCount: 0,
        };
      }
      return perBusiness[id];
    };
    gstSales.forEach((doc) => { const b = ensure(String(doc.businessId)); addToBucket(b.outward, doc, 1); b.billCount += 1; });
    creditNotes.forEach((doc) => { const b = ensure(String(doc.businessId)); addToBucket(b.outward, doc, -1); b.creditNoteCount += 1; });
    purchases.forEach((doc) => { const b = ensure(String(doc.businessId)); addToBucket(b.inward, doc, 1); b.purchaseCount += 1; });
    debitNotes.forEach((doc) => { const b = ensure(String(doc.businessId)); addToBucket(b.inward, doc, -1); b.debitNoteCount += 1; });

    const businessById = {};
    businesses.forEach((b) => { businessById[String(b._id)] = b; });

    const businessBreakdown = Object.entries(perBusiness).map(([id, v]) => {
      const outwardTax = round2(v.outward.cgst + v.outward.sgst + v.outward.igst);
      const inwardTax = round2(v.inward.cgst + v.inward.sgst + v.inward.igst);
      const business = businessById[id];
      return {
        businessId: id,
        name: business ? business.name : 'Unknown business',
        gstin: business ? (business.gstin || '') : '',
        outwardTax,
        inwardTax,
        netPayable: round2(outwardTax - inwardTax),
        billCount: v.billCount,
        creditNoteCount: v.creditNoteCount,
        purchaseCount: v.purchaseCount,
        debitNoteCount: v.debitNoteCount,
      };
    }).sort((a, b) => b.netPayable - a.netPayable);

    res.status(200).json({
      period: { startDate: req.query.startDate || null, endDate: req.query.endDate || null },
      stats: { businessCount: businesses.length, userCount },
      outward: {
        rateWise: outwardRows,
        totals: outwardTotals,
        billCount: gstSales.length,
        creditNoteCount: creditNotes.length,
      },
      inward: {
        rateWise: inwardRows,
        totals: inwardTotals,
        billCount: purchases.length,
        debitNoteCount: debitNotes.length,
      },
      netPayable,
      businessBreakdown,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
