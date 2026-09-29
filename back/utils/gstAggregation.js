// Shared rate-wise GST aggregation helpers, used by both the per-business
// report (gstreportcontroller) and the platform-wide summary (admincontroller).

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;

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
      table[rate].cgst += sign * num(t.cgstAmount);
      table[rate].sgst += sign * num(t.sgstAmount);
      table[rate].igst += sign * num(t.igstAmount);
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

module.exports = { num, round2, mergeRateTotals, finalizeRateTable, totalsOf };
