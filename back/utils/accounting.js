// Double-entry books, built from the documents the app already saves.
//
// Nothing extra is stored: every report re-reads the bills, notes, receipts and
// payments and turns each one into a balanced voucher (debits = credits). So an
// edited or deleted bill is reflected immediately and the books can't drift
// from the documents.
//
//   Document               Voucher (Dr → Cr)
//   GST bill               Debtors → Sales + Output GST (+ round off)
//     cash / credit box    Cash / Bank → Debtors            ("Credit" = bank / UPI / card)
//   Credit note            Sales returns + Output GST → Debtors
//   Purchase bill          Purchases + Input GST → Creditors
//     cash / credit box    Creditors → Cash / Bank
//   Debit note             Creditors → Purchase returns + Input GST
//   Receipt                Cash / Bank → Debtors            (mode 'cash' → Cash, else Bank)
//   Payment                Creditors → Cash / Bank
//   Non-GST sale bill      Debtors → Sales (non-GST); debit / credit box → Cash / Bank
//   Opening balances       each customer's / supplier's balance from before the
//                          first document ↔ Opening balance adjustment
//
// Bills / credit notes imported from GSTR-1 never moved customer balances, so they
// are booked as sales that were already settled: the settlement goes to
// "Imported bills – settled earlier" instead of Cash, leaving Debtors unchanged.
// Estimates are quotations with their own separate customers, so they are not
// part of the books.
const GstSale = require('../model/salesmodule');
const CreditNote = require('../model/creditnotemodule');
const Purchase = require('../model/purchasemodule');
const DebitNote = require('../model/debitnotemodule');
const Receipt = require('../model/receiptmodule');
const Payment = require('../model/paymentmodule');
const Sale = require('../model/salemodule');
const Customer = require('../model/customermodule');
const Supplier = require('../model/suppliermodule');

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;
const partyKey = (name) => String(name || '').trim().toLowerCase();

// The chart of accounts. `group` decides where it appears (and its normal side:
// assets / expenses are debit balances, the rest credit balances).
const ACCOUNTS = [
  { key: 'cash', name: 'Cash in hand', group: 'asset', sub: 'Cash & bank' },
  { key: 'bank', name: 'Bank (UPI / card / cheque)', group: 'asset', sub: 'Cash & bank' },
  { key: 'debtors', name: 'Sundry Debtors (customers)', group: 'asset', sub: 'Receivables' },
  { key: 'inputCgst', name: 'Input CGST', group: 'asset', sub: 'GST input credit' },
  { key: 'inputSgst', name: 'Input SGST', group: 'asset', sub: 'GST input credit' },
  { key: 'inputIgst', name: 'Input IGST', group: 'asset', sub: 'GST input credit' },
  { key: 'importedSettled', name: 'Imported bills – settled earlier', group: 'asset', sub: 'Suspense' },
  { key: 'creditors', name: 'Sundry Creditors (suppliers)', group: 'liability', sub: 'Payables' },
  { key: 'outputCgst', name: 'Output CGST', group: 'liability', sub: 'GST payable' },
  { key: 'outputSgst', name: 'Output SGST', group: 'liability', sub: 'GST payable' },
  { key: 'outputIgst', name: 'Output IGST', group: 'liability', sub: 'GST payable' },
  { key: 'sales', name: 'Sales (GST bills)', group: 'income', sub: 'Sales' },
  { key: 'salesOther', name: 'Sales (non-GST bills)', group: 'income', sub: 'Sales' },
  { key: 'salesReturns', name: 'Sales returns & discounts', group: 'income', sub: 'Sales' },
  { key: 'roundOff', name: 'Round off', group: 'income', sub: 'Other income' },
  { key: 'purchases', name: 'Purchases', group: 'expense', sub: 'Purchases' },
  { key: 'purchaseReturns', name: 'Purchase returns', group: 'expense', sub: 'Purchases' },
  { key: 'openingBalance', name: 'Opening balance adjustment', group: 'equity', sub: 'Capital' },
];
const ACCOUNT_BY_KEY = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a]));
const GROUPS = [
  { key: 'asset', label: 'Assets', debitNormal: true },
  { key: 'liability', label: 'Liabilities', debitNormal: false },
  { key: 'equity', label: 'Equity / Capital', debitNormal: false },
  { key: 'income', label: 'Income', debitNormal: false },
  { key: 'expense', label: 'Expenses', debitNormal: true },
];

// Opening balances sit before every document, so any period's "opening" includes them.
const OPENING_DATE = new Date(0);

// ---------------------------------------------------------------- voucher builders

// One voucher: lines are { account, debit, credit, party? }. Zero lines are dropped.
const voucher = (date, type, number, party, narration, lines) => ({
  date, type, number: number || '', party: party || '', narration,
  lines: lines.filter((l) => round2(l.debit) || round2(l.credit)).map((l) => ({
    account: l.account, debit: round2(l.debit), credit: round2(l.credit), party: l.party || '',
  })),
});
const dr = (account, amount, party) => ({ account, debit: amount, credit: 0, party });
const cr = (account, amount, party) => ({ account, debit: 0, credit: amount, party });
// A positive amount on the debit side, a negative one on the credit side (round off).
const drOrCr = (account, amount) => (amount >= 0 ? dr(account, amount) : cr(account, -amount));
const payAccount = (mode) => (String(mode || 'cash').toLowerCase() === 'cash' ? 'cash' : 'bank');

// Tax lines of a GST document, and the round off that makes the voucher balance exactly.
const taxParts = (b) => {
  const taxable = round2(b.totalTaxableValue);
  const cgst = round2(b.totalCgst);
  const sgst = round2(b.totalSgst);
  const igst = round2(b.totalIgst);
  const total = round2(b.grandTotal);
  return { taxable, cgst, sgst, igst, total, round: round2(total - taxable - cgst - sgst - igst) };
};

const gstSaleVoucher = (s) => {
  const b = s.billDetails || {};
  const party = s.customer?.name || '';
  const t = taxParts(b);
  const lines = [
    dr('debtors', t.total, party),
    cr('sales', t.taxable), cr('outputCgst', t.cgst), cr('outputSgst', t.sgst), cr('outputIgst', t.igst),
    drOrCr('roundOff', -t.round), // added on top of the tax → income (credit)
  ];
  if (b.imported) {
    lines.push(dr('importedSettled', t.total), cr('debtors', t.total, party));
  } else {
    lines.push(dr('cash', num(b.cash)), cr('debtors', num(b.cash), party));
    lines.push(dr('bank', num(b.credit)), cr('debtors', num(b.credit), party));
  }
  return voucher(b.date, 'GST bill', b.invoiceNumber, party, `GST bill ${b.invoiceNumber || ''} — ${party}`, lines);
};

const creditNoteVoucher = (n) => {
  const b = n.billDetails || {};
  const party = n.customer?.name || '';
  const t = taxParts(b);
  const lines = [
    dr('salesReturns', t.taxable), dr('outputCgst', t.cgst), dr('outputSgst', t.sgst), dr('outputIgst', t.igst),
    drOrCr('roundOff', t.round),
    cr('debtors', t.total, party),
  ];
  if (b.imported) lines.push(dr('debtors', t.total, party), cr('importedSettled', t.total));
  return voucher(b.date, 'Credit note', b.creditNoteNumber, party, `Credit note ${b.creditNoteNumber || ''} — ${party}`, lines);
};

const purchaseVoucher = (p) => {
  const b = p.billDetails || {};
  const party = p.supplier?.name || '';
  const t = taxParts(b);
  return voucher(b.date, 'Purchase', b.billNumber, party, `Purchase ${b.billNumber || ''}${b.supplierInvoiceNumber ? ` (supplier inv. ${b.supplierInvoiceNumber})` : ''} — ${party}`, [
    dr('purchases', t.taxable), dr('inputCgst', t.cgst), dr('inputSgst', t.sgst), dr('inputIgst', t.igst),
    drOrCr('roundOff', t.round),
    cr('creditors', t.total, party),
    dr('creditors', num(b.cash), party), cr('cash', num(b.cash)),
    dr('creditors', num(b.credit), party), cr('bank', num(b.credit)),
  ]);
};

const debitNoteVoucher = (n) => {
  const b = n.billDetails || {};
  const party = n.supplier?.name || '';
  const t = taxParts(b);
  return voucher(b.date, 'Debit note', b.debitNoteNumber, party, `Debit note ${b.debitNoteNumber || ''} — ${party}`, [
    dr('creditors', t.total, party),
    cr('purchaseReturns', t.taxable), cr('inputCgst', t.cgst), cr('inputSgst', t.sgst), cr('inputIgst', t.igst),
    drOrCr('roundOff', -t.round),
  ]);
};

const receiptVoucher = (r) => {
  const party = r.customer?.name || '';
  return voucher(r.date, 'Receipt', r.receipt_no, party, `Receipt ${r.receipt_no || ''} (${r.mode || 'cash'}) — ${party}`, [
    dr(payAccount(r.mode), num(r.amount)), cr('debtors', num(r.amount), party),
  ]);
};

const paymentVoucher = (p) => {
  const party = p.supplier?.name || '';
  return voucher(p.date, 'Payment', p.payment_no, party, `Payment ${p.payment_no || ''} (${p.mode || 'cash'}) — ${party}`, [
    dr('creditors', num(p.amount), party), cr(payAccount(p.mode), num(p.amount)),
  ]);
};

const saleVoucher = (s) => {
  const b = s.billDetails || {};
  const party = s.customer?.name || '';
  const total = round2(b.grandTotal);
  return voucher(b.date, 'Sale bill', b.billNumber, party, `Sale bill ${b.billNumber || ''} — ${party}`, [
    dr('debtors', total, party), cr('salesOther', total),
    dr('cash', num(b.debit)), cr('debtors', num(b.debit), party),
    dr('bank', num(b.credit)), cr('debtors', num(b.credit), party),
  ]);
};

// ---------------------------------------------------------------- opening balances

// customer.oldBalance / supplier.oldBalance are *running* balances, moved by every
// document (see applyCustomerBalance / applySupplierBalance in the controllers).
// Subtracting what the documents moved gives the balance the party started with.
const openingVouchers = ({ customers, suppliers, sales, gstSales, creditNotes, receipts, purchases, debitNotes, payments }) => {
  const moved = (list) => list.reduce((m, [name, amount]) => {
    const key = partyKey(name);
    m[key] = (m[key] || 0) + amount;
    return m;
  }, {});
  const customerMoves = moved([
    ...gstSales.filter((s) => !s.billDetails?.imported).map((s) => [s.customer?.name, num(s.billDetails?.grandTotal) - num(s.billDetails?.cash) - num(s.billDetails?.credit)]),
    ...sales.map((s) => [s.customer?.name, num(s.billDetails?.grandTotal) - num(s.billDetails?.debit) - num(s.billDetails?.credit)]),
    ...creditNotes.filter((n) => !n.billDetails?.imported).map((n) => [n.customer?.name, -num(n.billDetails?.grandTotal)]),
    ...receipts.map((r) => [r.customer?.name, -num(r.amount)]),
  ]);
  const supplierMoves = moved([
    ...purchases.map((p) => [p.supplier?.name, num(p.billDetails?.grandTotal) - num(p.billDetails?.cash) - num(p.billDetails?.credit)]),
    ...debitNotes.map((n) => [n.supplier?.name, -num(n.billDetails?.grandTotal)]),
    ...payments.map((p) => [p.supplier?.name, -num(p.amount)]),
  ]);

  const vouchers = [];
  customers.forEach((c) => {
    const opening = round2(num(c.oldBalance) - (customerMoves[partyKey(c.name)] || 0));
    if (!opening) return;
    // Positive: the customer owed us (debtor). Negative: advance received.
    vouchers.push(voucher(OPENING_DATE, 'Opening', '', c.name, `Opening balance — ${c.name}`, [
      drOrCr('debtors', opening), drOrCr('openingBalance', -opening),
    ].map((l) => (l.account === 'debtors' ? { ...l, party: c.name } : l))));
  });
  suppliers.forEach((s) => {
    const opening = round2(num(s.oldBalance) - (supplierMoves[partyKey(s.name)] || 0));
    if (!opening) return;
    // Positive: we owed the supplier (creditor). Negative: advance paid.
    vouchers.push(voucher(OPENING_DATE, 'Opening', '', s.name, `Opening balance — ${s.name}`, [
      drOrCr('openingBalance', opening), drOrCr('creditors', -opening),
    ].map((l) => (l.account === 'creditors' ? { ...l, party: s.name } : l))));
  });
  return vouchers;
};

// ---------------------------------------------------------------- loading + reports

// Every voucher for a business, oldest first.
const buildVouchers = async (businessId) => {
  const q = { businessId };
  const [gstSales, creditNotes, purchases, debitNotes, receipts, payments, sales, customers, suppliers] = await Promise.all([
    GstSale.find(q, 'customer.name billDetails').lean(),
    CreditNote.find(q, 'customer.name billDetails').lean(),
    Purchase.find(q, 'supplier.name billDetails').lean(),
    DebitNote.find(q, 'supplier.name billDetails').lean(),
    Receipt.find(q, 'customer.name receipt_no date amount mode').lean(),
    Payment.find(q, 'supplier.name payment_no date amount mode').lean(),
    Sale.find(q, 'customer.name billDetails').lean(),
    Customer.find(q, 'name oldBalance').lean(),
    Supplier.find(q, 'name oldBalance').lean(),
  ]);
  const vouchers = [
    ...openingVouchers({ customers, suppliers, sales, gstSales, creditNotes, receipts, purchases, debitNotes, payments }),
    ...gstSales.map(gstSaleVoucher),
    ...creditNotes.map(creditNoteVoucher),
    ...purchases.map(purchaseVoucher),
    ...debitNotes.map(debitNoteVoucher),
    ...receipts.map(receiptVoucher),
    ...payments.map(paymentVoucher),
    ...sales.map(saleVoucher),
  ].filter((v) => v.lines.length);
  vouchers.sort((a, b) => new Date(a.date) - new Date(b.date));
  return vouchers;
};

// Date window: start inclusive (00:00), end inclusive (23:59:59.999). Missing = open-ended.
const periodOf = ({ startDate, endDate } = {}) => ({
  start: startDate ? new Date(`${startDate}T00:00:00.000`) : null,
  end: endDate ? new Date(`${endDate}T23:59:59.999`) : null,
});

// Per account: opening (before start), debit & credit in the period, closing — all as
// signed Dr − Cr amounts, plus the debit / credit column the closing belongs in.
const trialBalance = (vouchers, range) => {
  const { start, end } = periodOf(range);
  const rows = Object.fromEntries(ACCOUNTS.map((a) => [a.key, { ...a, opening: 0, debit: 0, credit: 0 }]));
  vouchers.forEach((v) => {
    const d = new Date(v.date);
    if (end && d > end) return;
    const before = start && d < start;
    v.lines.forEach((l) => {
      const row = rows[l.account];
      if (before) row.opening += l.debit - l.credit;
      else { row.debit += l.debit; row.credit += l.credit; }
    });
  });
  const list = ACCOUNTS.map((a) => {
    const r = rows[a.key];
    const closing = round2(r.opening + r.debit - r.credit);
    return {
      key: a.key, name: a.name, group: a.group, sub: a.sub,
      opening: round2(r.opening), debit: round2(r.debit), credit: round2(r.credit), closing,
      closingDebit: closing > 0 ? closing : 0, closingCredit: closing < 0 ? -closing : 0,
    };
  });
  const sum = (field) => round2(list.reduce((t, r) => t + r[field], 0));
  const totals = { debit: sum('debit'), credit: sum('credit'), closingDebit: sum('closingDebit'), closingCredit: sum('closingCredit') };
  return { groups: GROUPS, accounts: list, totals, balanced: Math.abs(totals.closingDebit - totals.closingCredit) < 0.01 };
};

// One account's statement for a period (optionally one party's lines only, for Debtors / Creditors).
const accountLedger = (vouchers, accountKey, range, partyName) => {
  const account = ACCOUNT_BY_KEY[accountKey];
  if (!account) throw new Error('Unknown account.');
  const { start, end } = periodOf(range);
  const wanted = partyName ? partyKey(partyName) : null;
  let opening = 0;
  const entries = [];
  vouchers.forEach((v) => {
    const d = new Date(v.date);
    if (end && d > end) return;
    v.lines.forEach((l) => {
      if (l.account !== accountKey) return;
      if (wanted && partyKey(l.party) !== wanted) return;
      if (start && d < start) { opening += l.debit - l.credit; return; }
      entries.push({ date: v.date, type: v.type, number: v.number, party: l.party || v.party, narration: v.narration, debit: l.debit, credit: l.credit });
    });
  });
  let running = round2(opening);
  const withBalance = entries.map((e) => {
    running = round2(running + e.debit - e.credit);
    return { ...e, balance: running, date: new Date(e.date).getTime() === OPENING_DATE.getTime() ? null : e.date };
  });
  return {
    account: { key: account.key, name: account.name, group: account.group, sub: account.sub },
    party: partyName || '',
    opening: round2(opening),
    entries: withBalance,
    totalDebit: round2(entries.reduce((t, e) => t + e.debit, 0)),
    totalCredit: round2(entries.reduce((t, e) => t + e.credit, 0)),
    closing: running,
  };
};

module.exports = {
  ACCOUNTS, GROUPS, buildVouchers, trialBalance, accountLedger,
  // exported for tests
  gstSaleVoucher, creditNoteVoucher, purchaseVoucher, debitNoteVoucher, receiptVoucher, paymentVoucher, saleVoucher, openingVouchers,
};
