const Sale = require('../model/salemodule');
const GstSale = require('../model/salesmodule');
const Purchase = require('../model/purchasemodule');
const CreditNote = require('../model/creditnotemodule');
const DebitNote = require('../model/debitnotemodule');
const Receipt = require('../model/receiptmodule');
const Payment = require('../model/paymentmodule');

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;

// One chronological feed of every voucher type in the system for a day/range —
// same idea as Tally's Day Book. Each source already carries its own date field
// under a different path, so this just normalizes them into one flat entry shape.
exports.getDayBook = async (req, res) => {
  try {
    const start = req.query.startDate ? new Date(`${req.query.startDate}T00:00:00.000`) : null;
    const end = req.query.endDate ? new Date(`${req.query.endDate}T23:59:59.999`) : null;
    const billFilter = { businessId: req.auth.businessId };
    if (start || end) {
      billFilter['bill_details.date'] = {};
      if (start) billFilter['bill_details.date'].$gte = start;
      if (end) billFilter['bill_details.date'].$lte = end;
    }
    const plainFilter = { businessId: req.auth.businessId };
    if (start || end) {
      plainFilter.date = {};
      if (start) plainFilter.date.$gte = start;
      if (end) plainFilter.date.$lte = end;
    }
    const [sales, gstSales, purchases, creditNotes, debitNotes, receipts, payments] = await Promise.all([
      Sale.find(billFilter),
      GstSale.find(billFilter),
      Purchase.find(billFilter),
      CreditNote.find(billFilter),
      DebitNote.find(billFilter),
      Receipt.find(plainFilter),
      Payment.find(plainFilter),
    ]);

    const entries = [];
    sales.forEach((s) => {
      const b = s.bill_details || {};
      entries.push({ date: b.date, type: 'Sale', refNo: b.order_sno || '', party: s.customer?.name || '', amount: round2(b.bill_amount), direction: 'out' });
    });
    gstSales.forEach((s) => {
      const b = s.bill_details || {};
      entries.push({ date: b.date, type: 'GST Sale', refNo: b.billNumber || '', party: s.customer?.name || '', amount: round2(b.billAmount), direction: 'out' });
    });
    purchases.forEach((p) => {
      const b = p.bill_details || {};
      entries.push({ date: b.date, type: 'Purchase', refNo: b.billNumber || '', party: p.supplier?.name || '', amount: round2(b.billAmount), direction: 'in' });
    });
    creditNotes.forEach((n) => {
      const b = n.bill_details || {};
      entries.push({ date: b.date, type: 'Credit Note', refNo: b.creditNoteNumber || '', party: n.customer?.name || '', amount: round2(b.creditNoteAmount), direction: 'in' });
    });
    debitNotes.forEach((n) => {
      const b = n.bill_details || {};
      entries.push({ date: b.date, type: 'Debit Note', refNo: b.debitNoteNumber || '', party: n.supplier?.name || '', amount: round2(b.debitNoteAmount), direction: 'out' });
    });
    receipts.forEach((r) => {
      entries.push({ date: r.date, type: 'Receipt', refNo: r.receipt_no || '', party: r.customer?.name || '', amount: round2(r.amount), mode: r.mode || '', direction: 'in' });
    });
    payments.forEach((p) => {
      entries.push({ date: p.date, type: 'Payment', refNo: p.payment_no || '', party: p.supplier?.name || '', amount: round2(p.amount), mode: p.mode || '', direction: 'out' });
    });

    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    const summary = {};
    entries.forEach((e) => {
      if (!summary[e.type]) summary[e.type] = { count: 0, amount: 0 };
      summary[e.type].count += 1;
      summary[e.type].amount = round2(summary[e.type].amount + e.amount);
    });

    res.json({ entries, summary, total: entries.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
