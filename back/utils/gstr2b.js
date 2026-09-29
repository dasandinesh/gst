// GSTR-2B purchase match: compares the GSTR-2B JSON downloaded from the GST
// portal (what your suppliers reported) with the purchase bills in the app.
//
//   matched         same supplier GSTIN + invoice number, amounts within ₹1
//   mismatch        found, but taxable value or tax differs by more than ₹1
//   possible        same supplier and same amount, but the invoice number differs
//   missingInBooks  in 2B, not entered as a purchase here (check and enter it)
//   notIn2b         purchase here (in the period), not in 2B — the supplier has not
//                   filed it yet: don't claim that input credit this month
//   unregistered    purchases with no supplier GSTIN (no input credit anyway)
//
// 2B JSON shape: { data: { gstin, rtnprd, docdata: { b2b: [{ ctin, trdnm,
//   inv: [{ inum, dt, val, itcavl, rev, items: [{ rt, txval, igst, cgst, sgst, cess }] }] }],
//   cdnr: [{ ctin, trdnm, nt: [{ ntnum, typ, dt, val, items: [...] }] }] } } }
// (older files have the same content without the outer "data").
const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;
const cleanGstin = (v) => String(v || '').trim().toUpperCase();
const TOLERANCE = 1;

// "INV/001", "inv-1", "INV 0001" → "INV1": letters and numbers only, leading zeros dropped.
const invoiceKey = (value) => (String(value || '').toUpperCase().match(/[A-Z]+|\d+/g) || [])
  .map((t) => (/\d/.test(t) ? t.replace(/^0+(?=\d)/, '') : t)).join('');

const fromGstDate = (text) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(text || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

const itemTotals = (items = []) => items.reduce((t, it) => ({
  taxableValue: t.taxableValue + num(it.txval),
  igst: t.igst + num(it.igst),
  cgst: t.cgst + num(it.cgst),
  sgst: t.sgst + num(it.sgst),
}), { taxableValue: 0, igst: 0, cgst: 0, sgst: 0 });
const roundT = (t) => ({ taxableValue: round2(t.taxableValue), igst: round2(t.igst), cgst: round2(t.cgst), sgst: round2(t.sgst) });
const taxOf = (t) => round2(t.igst + t.cgst + t.sgst);

// The 2B file → { gstin, period, invoices, notes }.
const parseGstr2b = (json) => {
  const root = json && json.data ? json.data : json;
  const doc = root && (root.docdata || root.docData);
  if (!root || !doc || !Array.isArray(doc.b2b || [])) throw new Error('This is not a GSTR-2B JSON file. Download it from the GST portal: Returns → GSTR-2B → Download → JSON.');
  const invoices = [];
  (doc.b2b || []).forEach((s) => (s.inv || []).forEach((inv) => {
    invoices.push({
      ctin: cleanGstin(s.ctin), supplier: s.trdnm || '', number: String(inv.inum || ''), date: fromGstDate(inv.dt),
      value: round2(inv.val), itcAvailable: inv.itcavl !== 'N', reverseCharge: inv.rev === 'Y',
      ...roundT(itemTotals(inv.items)),
    });
  }));
  const notes = [];
  (doc.cdnr || []).forEach((s) => (s.nt || []).forEach((nt) => {
    notes.push({
      ctin: cleanGstin(s.ctin), supplier: s.trdnm || '', number: String(nt.ntnum || ''), type: nt.typ === 'D' ? 'Debit note' : 'Credit note',
      date: fromGstDate(nt.dt), value: round2(nt.val), ...roundT(itemTotals(nt.items)),
    });
  }));
  if (!invoices.length && !notes.length) throw new Error('The GSTR-2B file has no supplier invoices.');
  return { gstin: cleanGstin(root.gstin), period: String(root.rtnprd || ''), invoices, notes };
};

// A purchase bill in the shape the match compares.
const bookInvoice = (p) => {
  const b = p.billDetails || {};
  return {
    id: String(p._id), ctin: cleanGstin(p.supplier?.gstin), supplier: p.supplier?.name || '',
    number: b.supplierInvoiceNumber || b.billNumber || '', ourNumber: b.billNumber || '',
    date: b.date ? new Date(b.date).toISOString().slice(0, 10) : '',
    value: round2(b.grandTotal),
    taxableValue: round2(b.totalTaxableValue), igst: round2(b.totalIgst), cgst: round2(b.totalCgst), sgst: round2(b.totalSgst),
  };
};

// allPurchases: every purchase (2B can list invoices from earlier months);
// periodPurchases: the ones dated in the chosen period (for "not in 2B").
const matchGstr2b = ({ twoB, allPurchases, periodPurchases }) => {
  const books = allPurchases.map(bookInvoice);
  const byKey = new Map();
  books.filter((b) => b.ctin).forEach((b) => byKey.set(`${b.ctin}|${invoiceKey(b.number)}`, b));
  const used = new Set();

  const matched = [];
  const mismatch = [];
  const possible = [];
  const missingInBooks = [];
  twoB.invoices.forEach((inv) => {
    const book = byKey.get(`${inv.ctin}|${invoiceKey(inv.number)}`);
    if (book) {
      used.add(book.id);
      const diff = { taxableValue: round2(inv.taxableValue - book.taxableValue), tax: round2(taxOf(inv) - taxOf(book)) };
      (Math.abs(diff.taxableValue) <= TOLERANCE && Math.abs(diff.tax) <= TOLERANCE ? matched : mismatch).push({ twoB: inv, book, diff });
      return;
    }
    // Same supplier, same amounts, different number → probably a typo in the number.
    const guess = books.find((b) => !used.has(b.id) && b.ctin === inv.ctin
      && Math.abs(b.taxableValue - inv.taxableValue) <= TOLERANCE && Math.abs(taxOf(b) - taxOf(inv)) <= TOLERANCE);
    if (guess) { used.add(guess.id); possible.push({ twoB: inv, book: guess }); return; }
    missingInBooks.push(inv);
  });

  const periodBooks = periodPurchases.map(bookInvoice);
  const notIn2b = periodBooks.filter((b) => b.ctin && !used.has(b.id) && taxOf(b) > 0);
  const unregistered = periodBooks.filter((b) => !b.ctin);

  const sumTax = (list) => roundT(list.reduce((t, x) => ({ taxableValue: t.taxableValue + x.taxableValue, igst: t.igst + x.igst, cgst: t.cgst + x.cgst, sgst: t.sgst + x.sgst }), { taxableValue: 0, igst: 0, cgst: 0, sgst: 0 }));
  const available = twoB.invoices.filter((i) => i.itcAvailable && !i.reverseCharge);
  return {
    gstin: twoB.gstin,
    period: twoB.period,
    counts: {
      twoB: twoB.invoices.length, matched: matched.length, mismatch: mismatch.length, possible: possible.length,
      missingInBooks: missingInBooks.length, notIn2b: notIn2b.length, unregistered: unregistered.length, notes: twoB.notes.length,
    },
    itc: {
      as2b: sumTax(available),                         // what the portal will let you claim
      asBooks: sumTax(periodBooks.filter((b) => b.ctin)), // what your purchases say for the period
      notIn2b: sumTax(notIn2b),                        // hold back until the supplier files
    },
    matched, mismatch, possible, missingInBooks, notIn2b, unregistered,
    notes: twoB.notes,
  };
};

module.exports = { parseGstr2b, matchGstr2b, invoiceKey };
