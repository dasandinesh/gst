const GstSale = require('../model/salesmodule');
const CreditNote = require('../model/creditnotemodule');
const Purchase = require('../model/purchasemodule');
const DebitNote = require('../model/debitnotemodule');

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round((num(v)) * 100) / 100;

const dateFilter = (req) => {
  const filter = { businessId: req.auth.businessId };
  if (req.query.startDate || req.query.endDate) {
    filter['bill_details.date'] = {};
    if (req.query.startDate) filter['bill_details.date'].$gte = new Date(`${req.query.startDate}T00:00:00.000`);
    if (req.query.endDate) filter['bill_details.date'].$lte = new Date(`${req.query.endDate}T23:59:59.999`);
  }
  return filter;
};

// Merges each doc's `gstTotals` Map (keyed by rate) into one rate -> totals table,
// scaled by `sign` (+1 for sales/purchases, -1 for their credit/debit notes so the
// result nets out to the true outward/inward position for the period).
const mergeRateTotals = (docs, sign, table) => {
  docs.forEach((doc) => {
    const totals = doc.gstTotals;
    if (!totals) return;
    const entries = totals instanceof Map ? totals.entries() : Object.entries(totals);
    for (const [rate, t] of entries) {
      if (!table[rate]) table[rate] = { rate: Number(rate), taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
      table[rate].taxableValue += sign * num(t.taxableValue);
      table[rate].cgst += sign * num(t.cgst);
      table[rate].sgst += sign * num(t.sgst);
      table[rate].igst += sign * num(t.igst);
    }
  });
};

const finalizeRateTable = (table) => Object.values(table)
  .map((t) => ({
    rate: t.rate,
    taxableValue: round2(t.taxableValue),
    cgst: round2(t.cgst),
    sgst: round2(t.sgst),
    igst: round2(t.igst),
    total: round2(t.taxableValue + t.cgst + t.sgst + t.igst),
  }))
  .sort((a, b) => a.rate - b.rate);

const totalsOf = (rows) => rows.reduce((acc, r) => ({
  taxableValue: round2(acc.taxableValue + r.taxableValue),
  cgst: round2(acc.cgst + r.cgst),
  sgst: round2(acc.sgst + r.sgst),
  igst: round2(acc.igst + r.igst),
  total: round2(acc.total + r.total),
}), { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

// Net HSN-wise summary (per GSTR-1 table 12): outward supply lines minus whatever
// was reversed against them by credit notes in the same period.
const mergeHsnSummary = (docsWithSign) => {
  const table = {};
  docsWithSign.forEach(([docs, sign]) => {
    docs.forEach((doc) => {
      (doc.products || []).forEach((p) => {
        const key = `${p.hsnCode || '—'}|${num(p.gstRate)}`;
        if (!table[key]) table[key] = { hsnCode: p.hsnCode || '—', gstRate: num(p.gstRate), unit: p.unit || '', quantity: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        table[key].quantity += sign * num(p.quantity);
        table[key].taxableValue += sign * num(p.taxableValue);
        table[key].cgst += sign * num(p.cgstAmount);
        table[key].sgst += sign * num(p.sgstAmount);
        table[key].igst += sign * num(p.igstAmount);
        table[key].total += sign * num(p.total);
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

// GSTR-1/3B-style summary for a period: net outward supplies (GST sales minus
// credit notes), net inward supplies / input tax credit (purchases minus debit
// notes), the resulting net tax payable per head, and an outward HSN-wise summary.
exports.getGstSummary = async (req, res) => {
  try {
    const filter = dateFilter(req);
    const [gstSales, creditNotes, purchases, debitNotes] = await Promise.all([
      GstSale.find(filter),
      CreditNote.find(filter),
      Purchase.find(filter),
      DebitNote.find(filter),
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

    const hsnSummary = mergeHsnSummary([[gstSales, 1], [creditNotes, -1]]);

    res.json({
      period: { startDate: req.query.startDate || null, endDate: req.query.endDate || null },
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
      hsnSummary,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
