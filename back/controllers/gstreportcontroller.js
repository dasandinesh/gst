const mongoose = require('mongoose');
const GstSale = require('../model/salesmodule');
const CreditNote = require('../model/creditnotemodule');
const Purchase = require('../model/purchasemodule');
const DebitNote = require('../model/debitnotemodule');
const EcomSale = require('../model/ecomsalemodule');
const { num, round2, mergeRateTotals, finalizeRateTable, totalsOf } = require('../utils/gstAggregation');

// An imported marketplace month (EcomSale) in the shape the aggregation helpers
// read from a bill: gstTotals keyed by rate, and items for the HSN summary.
const ecomAsDoc = (e) => {
  const gstTotals = {};
  (e.rows || []).forEach((r) => {
    const t = gstTotals[r.rate] || (gstTotals[r.rate] = { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 });
    t.taxableValue += num(r.taxableValue);
    t.cgstAmount += num(r.cgst);
    t.sgstAmount += num(r.sgst);
    t.igstAmount += num(r.igst);
  });
  const items = (e.hsn || []).map((h) => ({
    hsnCode: h.hsnCode, gstRate: h.rate, unit: 'Nos', quantity: h.quantity, taxableValue: h.taxableValue,
    cgstAmount: h.cgst, sgstAmount: h.sgst, igstAmount: h.igst, amount: num(h.taxableValue) + num(h.cgst) + num(h.sgst) + num(h.igst),
  }));
  return { gstTotals, items };
};

const dateFilter = (req) => {
  const filter = { businessId: req.auth.businessId };
  if (req.query.startDate || req.query.endDate) {
    filter['billDetails.date'] = {};
    if (req.query.startDate) filter['billDetails.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
    if (req.query.endDate) filter['billDetails.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
  }
  return filter;
};

// Net HSN-wise summary (per GSTR-1 table 12): outward supply lines minus whatever
// was reversed against them by credit notes in the same period.
const mergeHsnSummary = (docsWithSign) => {
  const table = {};
  docsWithSign.forEach(([docs, sign]) => {
    docs.forEach((doc) => {
      (doc.items || []).forEach((p) => {
        const key = `${p.hsnCode || '—'}|${num(p.gstRate)}`;
        if (!table[key]) table[key] = { hsnCode: p.hsnCode || '—', gstRate: num(p.gstRate), unit: p.unit || '', quantity: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        table[key].quantity += sign * num(p.quantity);
        table[key].taxableValue += sign * num(p.taxableValue);
        table[key].cgst += sign * num(p.cgstAmount);
        table[key].sgst += sign * num(p.sgstAmount);
        table[key].igst += sign * num(p.igstAmount);
        table[key].total += sign * num(p.amount);
        if (!table[key].unit && p.unit) table[key].unit = p.unit;
      });
    });
  });
  return Object.values(table)
    .map((row) => ({
      ...row,
      quantity: round2(row.quantity),
      taxableValue: round2(row.taxableValue),
      cgst: round2(row.cgst),
      sgst: round2(row.sgst),
      igst: round2(row.igst),
      total: round2(row.total),
    }))
    .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.gstRate - b.gstRate);
};

// GET /api/reports/gst/monthly?months=6 — taxable value per calendar month for
// the dashboard chart: sales (GST bills + marketplace − credit notes) and
// purchases (− debit notes), the same figures as the GST summary below. The
// database adds them up, so only a few numbers per month come back.
exports.getMonthlyTotals = async (req, res) => {
  try {
    const count = Math.max(1, Math.min(24, Number(req.query.months) || 6));
    const businessId = new mongoose.Types.ObjectId(String(req.auth.businessId));
    const now = new Date();
    const ist = new Date(now.getTime() + 330 * 60 * 1000); // read with getUTC* = Indian calendar date
    const months = Array.from({ length: count }, (_, i) => {
      const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - (count - 1 - i), 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    // Bill dates are calendar dates in IST; widen the range by a day and group in IST.
    const start = new Date(`${months[0]}-01T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - 1);
    const end = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const byMonth = (Model) => Model.aggregate([
      { $match: { businessId, 'billDetails.date': { $gte: start, $lte: end } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$billDetails.date', timezone: '+05:30' } },
        taxable: { $sum: '$billDetails.totalTaxableValue' },
      } },
    ]);
    const [sales, credits, purchases, debits, ecom] = await Promise.all([
      byMonth(GstSale),
      byMonth(CreditNote),
      byMonth(Purchase),
      byMonth(DebitNote),
      EcomSale.aggregate([
        { $match: { businessId, periodStart: { $gte: start, $lte: end } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$periodStart', timezone: 'UTC' } }, taxable: { $sum: '$totals.taxableValue' } } },
      ]),
    ]);
    const lookup = (rows) => new Map(rows.map((r) => [r._id, num(r.taxable)]));
    const [s, c, p, d, e] = [sales, credits, purchases, debits, ecom].map(lookup);
    res.json(months.map((m) => ({
      month: m,
      sales: round2((s.get(m) || 0) + (e.get(m) || 0) - (c.get(m) || 0)),
      purchases: round2((p.get(m) || 0) - (d.get(m) || 0)),
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GSTR-1/3B-style summary for a period: net outward supplies (GST sales minus
// credit notes), net inward supplies / input tax credit (purchases minus debit
// notes), the resulting net tax payable per head, and an outward HSN-wise summary.
exports.getGstSummary = async (req, res) => {
  try {
    const filter = dateFilter(req);
    const ecomQuery = { businessId: req.auth.businessId };
    if (req.query.startDate) ecomQuery.periodEnd = { $gte: new Date(`${req.query.startDate}T00:00:00.000Z`) };
    if (req.query.endDate) ecomQuery.periodStart = { $lte: new Date(`${req.query.endDate}T23:59:59.999Z`) };
    const [gstSales, creditNotes, purchases, debitNotes, ecomSales] = await Promise.all([
      GstSale.find(filter),
      CreditNote.find(filter),
      Purchase.find(filter),
      DebitNote.find(filter),
      EcomSale.find(ecomQuery).lean(),
    ]);
    const ecomDocs = ecomSales.map(ecomAsDoc);

    const outwardTable = {};
    mergeRateTotals(gstSales, 1, outwardTable);
    mergeRateTotals(ecomDocs, 1, outwardTable);
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

    const hsnSummary = mergeHsnSummary([[gstSales, 1], [ecomDocs, 1], [creditNotes, -1]]);

    res.json({
      period: { startDate: req.query.startDate || null, endDate: req.query.endDate || null },
      outward: {
        rateWise: outwardRows,
        totals: outwardTotals,
        billCount: gstSales.length,
        creditNoteCount: creditNotes.length,
        ecomMonthCount: ecomSales.length,
        ecomTaxableValue: round2(ecomSales.reduce((t, e) => t + num(e.totals?.taxableValue), 0)),
      },
      inward: {
        rateWise: inwardRows,
        totals: inwardTotals,
        billCount: purchases.length,
        debitNoteCount: debitNotes.length,
      },
      netPayable,
      hsnSummary,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
