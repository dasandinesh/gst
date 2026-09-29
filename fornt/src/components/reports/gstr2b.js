import React, { useState } from 'react';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './reports.css';

const amt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tax = (t) => (Number(t.igst) || 0) + (Number(t.cgst) || 0) + (Number(t.sgst) || 0);
const date = (d) => (d ? d.split('-').reverse().join('-') : '—');
const monthLabel = (p) => (p && p.length === 6 ? `${p.slice(0, 2)}/${p.slice(2)}` : p || '');

const Section = ({ tone, title, help, count, children }) => (
  <section className={`acc-card gstr2b-section gstr2b-${tone}`}>
    <h1>{title} <span className="gstr2b-count">{count}</span></h1>
    {help && <p className="acc-sub">{help}</p>}
    {count ? <div className="acc-table-wrap">{children}</div> : <p className="books-muted">None.</p>}
  </section>
);
const InvCols = () => <><th>Supplier</th><th>GSTIN</th><th>Invoice no.</th><th>Date</th><th className="num">Taxable</th><th className="num">GST</th></>;
const InvCells = ({ x }) => <><td>{x.supplier || '—'}</td><td>{x.ctin || '—'}</td><td>{x.number || '—'}</td><td>{date(x.date)}</td><td className="num">{amt(x.taxableValue)}</td><td className="num">{amt(tax(x))}</td></>;

// Reports → GSTR-2B Match: upload the GSTR-2B JSON from the GST portal and see
// which purchase bills your suppliers have reported — so you claim only the
// input tax credit that 2B allows.
const Gstr2b = () => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setStatus({ type: '', text: 'Matching…' });
    setFileName(file.name);
    try {
      const body = await file.text();
      try { JSON.parse(body); } catch { throw new Error('That file is not valid JSON. Download GSTR-2B as JSON from the portal.'); }
      setData(await fetchJson('/api/reports/gst/gstr2b/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
      setStatus(null);
    } catch (error) {
      setData(null);
      setStatus({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const c = data?.counts;
  return (
    <main className="acc-page reports-page">
      <section className="acc-card">
        <h1>GSTR-2B purchase match</h1>
        <p className="acc-sub">
          On gst.gov.in open Returns → GSTR-2B for the month → Download → <strong>JSON</strong>, then choose that file here.
          It is compared with your purchase bills (supplier GSTIN + their invoice number). Nothing is saved.
        </p>
        <div className="acc-actions reports-file-actions">
          <label className="reports-file-upload">
            <span>GSTR-2B JSON file</span>
            <input type="file" accept=".json" onChange={upload} disabled={busy} />
          </label>
        </div>
        {status && <p className={`acc-status ${status.type}`}>{status.text}</p>}
      </section>

      {data && (
        <>
          <section className="acc-card">
            <p className="acc-status">
              <strong>{fileName}</strong> · GSTR-2B for <strong>{monthLabel(data.period)}</strong>{data.gstin ? ` · GSTIN ${data.gstin}` : ''} ·
              purchases checked from {date(data.startDate)} to {date(data.endDate)}
            </p>
            <div className="reports-summary-grid">
              <div className="reports-stat reports-stat-highlight">
                <span>ITC you can claim (as per 2B)</span>
                <strong>₹{amt(tax(data.itc.as2b))}</strong>
                <small>IGST {amt(data.itc.as2b.igst)} · CGST {amt(data.itc.as2b.cgst)} · SGST {amt(data.itc.as2b.sgst)}</small>
              </div>
              <div className="reports-stat">
                <span>ITC in your purchase bills</span>
                <strong>₹{amt(tax(data.itc.asBooks))}</strong>
                <small>registered suppliers, this period</small>
              </div>
              <div className="reports-stat">
                <span>Hold back (supplier not filed)</span>
                <strong>₹{amt(tax(data.itc.notIn2b))}</strong>
                <small>{c.notIn2b} bill(s) — claim when they appear in a later 2B</small>
              </div>
            </div>
            <p className="books-muted">
              {c.twoB} invoice(s) in 2B: {c.matched} matched, {c.mismatch} amount different, {c.possible} possible match, {c.missingInBooks} not in your books.
              Use the 2B figure in GSTR-3B table 4 (the GSTR-3B worksheet shows the figure from your bills).
            </p>
          </section>

          <Section tone="bad" title="Amount different" count={c.mismatch} help="Same supplier and invoice number, but the amounts differ by more than ₹1. Check the bill — either your entry or the supplier's GSTR-1 is wrong.">
            <table className="acc-table">
              <thead><tr><InvCols /><th className="num">Your taxable</th><th className="num">Your GST</th><th className="num">Diff (GST)</th></tr></thead>
              <tbody>{data.mismatch.map((m) => (
                <tr key={`${m.twoB.ctin}-${m.twoB.number}`}><InvCells x={m.twoB} /><td className="num">{amt(m.book.taxableValue)}</td><td className="num">{amt(tax(m.book))}</td><td className="num"><strong>{amt(m.diff.tax)}</strong></td></tr>
              ))}</tbody>
            </table>
          </Section>

          <Section tone="warn" title="Possible match — invoice number differs" count={c.possible} help="Same supplier and same amount, but the invoice number is different. Usually a typo: correct the supplier invoice number on your purchase bill.">
            <table className="acc-table">
              <thead><tr><InvCols /><th>Your entry</th></tr></thead>
              <tbody>{data.possible.map((m) => (
                <tr key={`${m.twoB.ctin}-${m.twoB.number}`}><InvCells x={m.twoB} /><td>{m.book.number} ({m.book.ourNumber}, {date(m.book.date)})</td></tr>
              ))}</tbody>
            </table>
          </Section>

          <Section tone="warn" title="In GSTR-2B, not in your books" count={c.missingInBooks} help="Your supplier reported these invoices, but there is no purchase bill for them here. Enter them (Purchase Entry) if you received the goods, or ask the supplier if not.">
            <table className="acc-table"><thead><tr><InvCols /></tr></thead>
              <tbody>{data.missingInBooks.map((x) => <tr key={`${x.ctin}-${x.number}`}><InvCells x={x} /></tr>)}</tbody>
            </table>
          </Section>

          <Section tone="bad" title="In your books, not in GSTR-2B" count={c.notIn2b} help="The supplier has not filed these in their GSTR-1 yet. Don't claim this input credit now — ask the supplier to file, then claim it when it shows in a later GSTR-2B.">
            <table className="acc-table"><thead><tr><InvCols /><th>Your bill no.</th></tr></thead>
              <tbody>{data.notIn2b.map((x) => <tr key={x.id}><InvCells x={x} /><td>{x.ourNumber}</td></tr>)}</tbody>
            </table>
          </Section>

          <Section tone="ok" title="Matched" count={c.matched} help="In both, with the same amounts (within ₹1). Safe to claim.">
            <table className="acc-table"><thead><tr><InvCols /><th>Your bill no.</th></tr></thead>
              <tbody>{data.matched.map((m) => <tr key={`${m.twoB.ctin}-${m.twoB.number}`}><InvCells x={m.twoB} /><td>{m.book.ourNumber}</td></tr>)}</tbody>
            </table>
          </Section>

          {c.notes > 0 && (
            <Section tone="info" title="Credit / debit notes from suppliers" count={c.notes} help="Notes your suppliers issued (returns, discounts). A credit note reduces your input credit — record it as a Debit Note here if you haven't.">
              <table className="acc-table"><thead><tr><th>Type</th><InvCols /></tr></thead>
                <tbody>{data.notes.map((x) => <tr key={`${x.ctin}-${x.number}`}><td>{x.type}</td><InvCells x={x} /></tr>)}</tbody>
              </table>
            </Section>
          )}

          {c.unregistered > 0 && (
            <Section tone="info" title="Purchases without supplier GSTIN" count={c.unregistered} help="Unregistered suppliers — no input credit on these. If the supplier does have a GSTIN, add it to the purchase bill.">
              <table className="acc-table"><thead><tr><InvCols /><th>Your bill no.</th></tr></thead>
                <tbody>{data.unregistered.map((x) => <tr key={x.id}><InvCells x={x} /><td>{x.ourNumber}</td></tr>)}</tbody>
              </table>
            </Section>
          )}
        </>
      )}
    </main>
  );
};

export default Gstr2b;
