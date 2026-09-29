// GSTR-3B worksheet: the figures for each table of the return, built from the
// period's documents, laid out the way the portal asks for them.
//
//   3.1(a) Outward taxable supplies      GST bills (rate > 0) − credit notes + marketplace sales
//   3.1(c) Nil rated / exempt            the 0% part of the same documents
//   3.2    Inter-state B2C by state      IGST bills with no customer GSTIN (+ marketplace, inter-state)
//   4(A)(5) ITC – all other ITC          purchases − debit notes (tax part)
//   5      Exempt / nil inward           0% purchases, split inter / intra state
//   6.1    Payment of tax                liability − ITC, used in the order the GST Act requires
//
// Not produced (the software has no data for them): zero-rated exports 3.1(b),
// reverse charge 3.1(d) / 4(A)(3), non-GST supplies 3.1(e), ITC reversals 4(B),
// cess, interest and late fee — each is shown as 0 with a note.
const { stateCode, stateName } = require('./gstStateCodes');

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;
const cleanGstin = (v) => String(v || '').trim().toUpperCase();
const zero = () => ({ taxableValue: 0, igst: 0, cgst: 0, sgst: 0 });
const add = (target, t, sign) => {
  target.taxableValue += sign * num(t.taxableValue);
  target.igst += sign * num(t.igst);
  target.cgst += sign * num(t.cgst);
  target.sgst += sign * num(t.sgst);
};
const roundHead = (t) => ({ taxableValue: round2(t.taxableValue), igst: round2(t.igst), cgst: round2(t.cgst), sgst: round2(t.sgst) });

// A document's rate → { taxableValue, igst, cgst, sgst }. Uses its stored
// gstTotals; falls back to adding up its lines.
const rateEntries = (doc) => {
  const totals = doc.gstTotals;
  if (totals && (totals instanceof Map ? totals.size : Object.keys(totals).length)) {
    const entries = totals instanceof Map ? [...totals.entries()] : Object.entries(totals);
    return entries.map(([rate, t]) => ({ rate: num(rate), taxableValue: num(t.taxableValue), igst: num(t.igstAmount), cgst: num(t.cgstAmount), sgst: num(t.sgstAmount) }));
  }
  const byRate = {};
  (doc.items || []).forEach((p) => {
    const rate = num(p.gstRate);
    if (!byRate[rate]) byRate[rate] = { rate, taxableValue: 0, igst: 0, cgst: 0, sgst: 0 };
    byRate[rate].taxableValue += num(p.taxableValue);
    byRate[rate].igst += num(p.igstAmount);
    byRate[rate].cgst += num(p.cgstAmount);
    byRate[rate].sgst += num(p.sgstAmount);
  });
  return Object.values(byRate);
};

// Uses input tax credit against the tax payable in the order sections 49 / 49A /
// 49B and rule 88A require, and returns what is left to pay in cash.
//   1. IGST credit → IGST, then CGST and SGST (put first where their own credit falls short).
//   2. CGST credit → CGST, then IGST.   (never SGST)
//   3. SGST credit → SGST, then IGST.   (never CGST)
const setOff = (payable, credit) => {
  const due = { igst: payable.igst, cgst: payable.cgst, sgst: payable.sgst };
  const left = { igst: credit.igst, cgst: credit.cgst, sgst: credit.sgst };
  const used = {
    igst: { igst: 0, cgst: 0, sgst: 0 },
    cgst: { igst: 0, cgst: 0, sgst: 0 },
    sgst: { igst: 0, cgst: 0, sgst: 0 },
  };
  const take = (from, to, amount) => {
    const x = Math.max(0, Math.min(left[from], due[to], amount === undefined ? Infinity : amount));
    left[from] -= x; due[to] -= x; used[from][to] += x;
  };
  take('igst', 'igst');
  // IGST credit left over: first to the head its own credit can't fully cover, then the rest.
  take('igst', 'cgst', Math.max(0, due.cgst - left.cgst));
  take('igst', 'sgst', Math.max(0, due.sgst - left.sgst));
  take('igst', 'cgst');
  take('igst', 'sgst');
  take('cgst', 'cgst');
  take('cgst', 'igst');
  take('sgst', 'sgst');
  take('sgst', 'igst');
  const r = (o) => ({ igst: round2(o.igst), cgst: round2(o.cgst), sgst: round2(o.sgst) });
  return {
    creditUsed: { igst: r(used.igst), cgst: r(used.cgst), sgst: r(used.sgst) },
    cash: r(due),
    creditCarriedForward: r(left),
  };
};

// Builds the worksheet. `sellerGstin` gives the home state (intra vs inter-state).
const buildGstr3b = ({ sellerGstin, sales, creditNotes, purchases, debitNotes, ecomSales = [], expenses = [] }) => {
  const sellerState = cleanGstin(sellerGstin).slice(0, 2);
  const taxable = zero();          // 3.1(a)
  const nilRated = zero();         // 3.1(c)
  const interB2c = {};             // 3.2, by state
  const addInterB2c = (pos, t, sign) => {
    if (!pos) return;
    if (!interB2c[pos]) interB2c[pos] = { pos, state: stateName(pos), taxableValue: 0, igst: 0 };
    interB2c[pos].taxableValue += sign * num(t.taxableValue);
    interB2c[pos].igst += sign * num(t.igst);
  };

  const outward = (doc, sign) => {
    const b = doc.billDetails || {};
    const unregistered = !cleanGstin(doc.customer?.gstin);
    const inter = b.taxType === 'IGST';
    const pos = stateCode(b.placeOfSupply) || stateCode(doc.customer?.state);
    rateEntries(doc).forEach((t) => {
      if (!t.rate) { add(nilRated, t, sign); return; }
      add(taxable, t, sign);
      if (unregistered && inter && pos && pos !== sellerState) addInterB2c(pos, t, sign);
    });
  };
  sales.forEach((doc) => outward(doc, 1));
  creditNotes.forEach((doc) => outward(doc, -1));
  ecomSales.forEach((e) => (e.rows || []).forEach((r) => {
    const t = { taxableValue: r.taxableValue, igst: r.igst, cgst: r.cgst, sgst: r.sgst };
    if (!num(r.rate)) { add(nilRated, t, 1); return; }
    add(taxable, t, 1);
    if (r.inter) addInterB2c(r.pos, t, 1);
  }));

  const itc = zero();              // 4(A)(5)
  const exemptInward = { inter: 0, intra: 0 }; // 5
  const inward = (doc, sign) => {
    const inter = doc.billDetails?.taxType === 'IGST';
    rateEntries(doc).forEach((t) => {
      if (!t.rate) { exemptInward[inter ? 'inter' : 'intra'] += sign * num(t.taxableValue); return; }
      add(itc, t, sign);
    });
  };
  purchases.forEach((doc) => inward(doc, 1));
  debitNotes.forEach((doc) => inward(doc, -1));
  // Expense bills with GST (rent, repairs, freight…) whose credit is claimed.
  expenses.filter((x) => x.claimItc !== false && (num(x.cgst) || num(x.sgst) || num(x.igst))).forEach((x) => {
    add(itc, { taxableValue: x.amount, igst: x.igst, cgst: x.cgst, sgst: x.sgst }, 1);
  });

  const t31a = roundHead(taxable);
  const t4 = roundHead(itc);
  const payable = { igst: Math.max(0, t31a.igst), cgst: Math.max(0, t31a.cgst), sgst: Math.max(0, t31a.sgst) };
  const credit = { igst: Math.max(0, t4.igst), cgst: Math.max(0, t4.cgst), sgst: Math.max(0, t4.sgst) };

  const marketplaceTaxable = round2(ecomSales.reduce((t, e) => t + num(e.totals?.taxableValue), 0));
  const notes = [];
  if (t31a.igst < 0 || t31a.cgst < 0 || t31a.sgst < 0) notes.push('Credit notes are more than sales in this period for at least one tax head — 3B cannot show negative tax; the portal adjusts it. Check with your accountant.');
  if (t4.igst < 0 || t4.cgst < 0 || t4.sgst < 0) notes.push('Debit notes are more than purchases for at least one tax head — treated as zero ITC for that head.');

  return {
    sellerState,
    t31: {
      a: t31a,
      b: zero(),
      c: roundHead(nilRated),
      d: zero(),
      e: zero(),
    },
    t32: Object.values(interB2c)
      .map((r) => ({ pos: r.pos, state: r.state, taxableValue: round2(r.taxableValue), igst: round2(r.igst) }))
      .filter((r) => r.taxableValue || r.igst)
      .sort((a, b) => a.pos.localeCompare(b.pos)),
    t4: { a5: t4, b: zero(), net: t4 },
    t5: { inter: round2(exemptInward.inter), intra: round2(exemptInward.intra) },
    t61: { payable, credit, ...setOff(payable, credit) },
    marketplace: {
      months: ecomSales.length,
      taxableValue: marketplaceTaxable,
      // TCS the marketplace collects (0.5% of net taxable value: CGST 0.25 + SGST 0.25, or IGST 0.5).
      // It shows in the electronic cash ledger once accepted, and can pay the cash part of 6.1.
      tcsEstimate: round2(marketplaceTaxable * 0.005),
    },
    counts: {
      bills: sales.length, creditNotes: creditNotes.length, purchases: purchases.length, debitNotes: debitNotes.length,
      gstExpenses: expenses.filter((x) => x.claimItc !== false && (num(x.cgst) || num(x.sgst) || num(x.igst))).length,
    },
    notes,
  };
};

module.exports = { buildGstr3b, setOff };
