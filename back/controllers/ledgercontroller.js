const Sale = require('../model/salemodule');
const GstSale = require('../model/salesmodule');
const CreditNote = require('../model/creditnotemodule');
const Receipt = require('../model/receiptmodule');
const Customer = require('../model/customermodule');
const Purchase = require('../model/purchasemodule');
const DebitNote = require('../model/debitnotemodule');
const Payment = require('../model/paymentmodule');
const Supplier = require('../model/suppliermodule');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const num = (v) => Number(v) || 0;

// Running account statement for one customer:
//   opening balance  + sales billed (debit)  - payments & receipts (credit)  = balance
exports.getCustomerLedger = async (req, res) => {
  try {
    const name = (req.query.customer || '').trim();
    if (!name) return res.status(400).json({ error: 'A customer name is required.' });

    const exact = new RegExp(`^${escapeRegex(name)}$`, 'i');
    const [customer, sales, gstSales, creditNotes, receipts] = await Promise.all([
      Customer.findOne({ name: exact }),
      Sale.find({ 'customer.name': exact }),
      GstSale.find({ 'customer.name': exact }),
      CreditNote.find({ 'customer.name': exact }),
      Receipt.find({ 'customer.name': exact }),
    ]);

    // Build every ledger line (unfiltered), then split by the requested range.
    // Every source here posts to the same customer.oldBalance (see applyCustomerBalance
    // in salecontroller/gstsalecontroller/creditnotecontroller) — all four must be
    // represented or the derived opening balance below won't reconcile.
    const lines = [];
    sales.forEach((s) => {
      const b = s.bill_details || {};
      lines.push({
        date: b.date, kind: 'sale', ref: b.order_sno || '',
        particulars: `Sale bill ${b.order_sno || ''}`.trim(),
        debit: num(b.bill_amount), credit: 0,
      });
      const paid = num(b.debit) + num(b.credit);
      if (paid > 0) {
        lines.push({
          date: b.date, kind: 'bill-payment', ref: b.order_sno || '',
          particulars: `Paid with bill ${b.order_sno || ''}`.trim(),
          debit: 0, credit: paid,
        });
      }
    });
    gstSales.forEach((s) => {
      const b = s.bill_details || {};
      lines.push({
        date: b.date, kind: 'gst-sale', ref: b.billNumber || '',
        particulars: `GST bill ${b.billNumber || ''}`.trim(),
        debit: num(b.billAmount), credit: 0,
      });
      const paid = num(b.cash) + num(b.credit);
      if (paid > 0) {
        lines.push({
          date: b.date, kind: 'bill-payment', ref: b.billNumber || '',
          particulars: `Paid with bill ${b.billNumber || ''}`.trim(),
          debit: 0, credit: paid,
        });
      }
    });
    creditNotes.forEach((n) => {
      const b = n.bill_details || {};
      lines.push({
        date: b.date, kind: 'credit-note', ref: b.creditNoteNumber || '',
        particulars: `Credit note ${b.creditNoteNumber || ''} (against ${n.originalBill?.billNumber || ''})`.trim(),
        debit: 0, credit: num(b.creditNoteAmount),
      });
    });
    receipts.forEach((r) => {
      lines.push({
        date: r.date, kind: 'receipt', ref: r.receipt_no || '',
        particulars: `Receipt ${r.receipt_no || ''}${r.mode ? ` (${r.mode})` : ''}`.trim(),
        debit: 0, credit: num(r.amount),
      });
    });
    lines.sort((a, b) => new Date(a.date) - new Date(b.date));

    const start = req.query.startDate ? new Date(`${req.query.startDate}T00:00:00.000`) : null;
    const end = req.query.endDate ? new Date(`${req.query.endDate}T23:59:59.999`) : null;

    // customer.oldBalance is the *current* running balance (post everything).
    // Work back to the original opening so the statement reconciles to it.
    const netAllTime = lines.reduce((t, l) => t + l.debit - l.credit, 0);
    let opening = num(customer && customer.oldBalance) - netAllTime;
    const shown = [];
    lines.forEach((line) => {
      const d = new Date(line.date);
      if (start && d < start) {
        opening += line.debit - line.credit; // rolls into opening for the period
        return;
      }
      if (end && d > end) return;
      shown.push(line);
    });

    let running = opening;
    const entries = shown.map((line) => {
      running += line.debit - line.credit;
      return { ...line, balance: running };
    });

    res.json({
      customer: customer
        ? { name: customer.name, phone: customer.phone || '' }
        : { name, phone: '' },
      opening,
      entries,
      totalDebit: entries.reduce((t, e) => t + e.debit, 0),
      totalCredit: entries.reduce((t, e) => t + e.credit, 0),
      closing: running,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Running account statement for one supplier:
//   opening balance  + purchases billed (credit, increases what we owe)
//                     - payments & debit notes (debit, reduces what we owe)  = balance payable
// Debit/credit here follow standard double-entry for a creditor account — the
// mirror image of the customer ledger above, where a sale is the debit side.
exports.getSupplierLedger = async (req, res) => {
  try {
    const name = (req.query.supplier || '').trim();
    if (!name) return res.status(400).json({ error: 'A supplier name is required.' });

    const exact = new RegExp(`^${escapeRegex(name)}$`, 'i');
    const [supplier, purchases, debitNotes, payments] = await Promise.all([
      Supplier.findOne({ name: exact }),
      Purchase.find({ 'supplier.name': exact }),
      DebitNote.find({ 'supplier.name': exact }),
      Payment.find({ 'supplier.name': exact }),
    ]);

    // Every source here posts to the same supplier.oldBalance (see applySupplierBalance
    // in purchasecontroller/debitnotecontroller/paymentcontroller) — all three must be
    // represented or the derived opening balance below won't reconcile.
    const lines = [];
    purchases.forEach((p) => {
      const b = p.bill_details || {};
      lines.push({
        date: b.date, kind: 'purchase', ref: b.billNumber || '',
        particulars: `Purchase bill ${b.billNumber || ''}`.trim(),
        debit: 0, credit: num(b.billAmount),
      });
      const paid = num(b.cash) + num(b.credit);
      if (paid > 0) {
        lines.push({
          date: b.date, kind: 'bill-payment', ref: b.billNumber || '',
          particulars: `Paid with bill ${b.billNumber || ''}`.trim(),
          debit: paid, credit: 0,
        });
      }
    });
    debitNotes.forEach((n) => {
      const b = n.bill_details || {};
      lines.push({
        date: b.date, kind: 'debit-note', ref: b.debitNoteNumber || '',
        particulars: `Debit note ${b.debitNoteNumber || ''} (against ${n.originalBill?.billNumber || ''})`.trim(),
        debit: num(b.debitNoteAmount), credit: 0,
      });
    });
    payments.forEach((p) => {
      lines.push({
        date: p.date, kind: 'payment', ref: p.payment_no || '',
        particulars: `Payment ${p.payment_no || ''}${p.mode ? ` (${p.mode})` : ''}`.trim(),
        debit: num(p.amount), credit: 0,
      });
    });
    lines.sort((a, b) => new Date(a.date) - new Date(b.date));

    const start = req.query.startDate ? new Date(`${req.query.startDate}T00:00:00.000`) : null;
    const end = req.query.endDate ? new Date(`${req.query.endDate}T23:59:59.999`) : null;

    // supplier.oldBalance is the *current* running payable (post everything).
    // Work back to the original opening so the statement reconciles to it.
    const netAllTime = lines.reduce((t, l) => t + l.credit - l.debit, 0);
    let opening = num(supplier && supplier.oldBalance) - netAllTime;
    const shown = [];
    lines.forEach((line) => {
      const d = new Date(line.date);
      if (start && d < start) {
        opening += line.credit - line.debit; // rolls into opening for the period
        return;
      }
      if (end && d > end) return;
      shown.push(line);
    });

    let running = opening;
    const entries = shown.map((line) => {
      running += line.credit - line.debit;
      return { ...line, balance: running };
    });

    res.json({
      supplier: supplier
        ? { name: supplier.name, phone: supplier.phone || '' }
        : { name, phone: '' },
      opening,
      entries,
      totalDebit: entries.reduce((t, e) => t + e.debit, 0),
      totalCredit: entries.reduce((t, e) => t + e.credit, 0),
      closing: running,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
