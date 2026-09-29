import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './reports.css';

const amt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad2 = (n) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-08" → the From / To dates of that month, or of its quarter (Apr–Jun, Jul–Sep, …).
const periodOf = (monthValue, quarterly) => {
  const [y, m] = monthValue.split('-').map(Number);
  const firstMonth = quarterly ? Math.floor((m - 1) / 3) * 3 + 1 : m;
  const lastMonth = quarterly ? firstMonth + 2 : m;
  const lastDay = new Date(y, lastMonth, 0).getDate();
  return {
    startDate: `${y}-${pad2(firstMonth)}-01`,
    endDate: `${y}-${pad2(lastMonth)}-${pad2(lastDay)}`,
    label: quarterly ? `${MONTHS[firstMonth - 1]} – ${MONTHS[lastMonth - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`,
    // 3B due date: 20th of the next month (quarterly filers: 22nd / 24th, by state).
    due: new Date(y, lastMonth, quarterly ? 22 : 20),
  };
};
const previousMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

// One tax row: taxable value + IGST / CGST / SGST / Cess, as the portal's tables show them.
const TaxRow = ({ label, t, noValue }) => (
  <tr>
    <td>{label}</td>
    <td className="num">{noValue ? '' : amt(t.taxableValue)}</td>
    <td className="num">{amt(t.igst)}</td>
    <td className="num">{amt(t.cgst)}</td>
    <td className="num">{amt(t.sgst)}</td>
    <td className="num">{amt(0)}</td>
  </tr>
);
const TaxHead = ({ first, noValue }) => (
  <thead><tr><th>{first}</th><th className="num">{noValue ? '' : 'Total taxable value'}</th><th className="num">Integrated tax</th><th className="num">Central tax</th><th className="num">State / UT tax</th><th className="num">Cess</th></tr></thead>
);

// GSTR-3B worksheet (Reports → GSTR-3B): the figures for each table of the
// return for a month (or quarter), to copy into the GST portal.
const Gstr3b = () => {
  const [month, setMonth] = useState(previousMonth());
  const [quarterly, setQuarterly] = useState(false);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const period = periodOf(month, quarterly);

  const load = useCallback(async () => {
    setStatus('Loading…');
    try {
      const p = periodOf(month, quarterly);
      setData(await fetchJson(`/api/reports/gst/gstr3b?startDate=${p.startDate}&endDate=${p.endDate}`));
      setStatus('');
    } catch (error) {
      setData(null);
      setStatus(error.message);
    }
  }, [month, quarterly]);
  useEffect(() => { load(); }, [load]);

  const s = data?.t61;
  const cashTotal = s ? s.cash.igst + s.cash.cgst + s.cash.sgst : 0;

  return (
    <main className="acc-page reports-page">
      <section className="acc-card">
        <h1>GSTR-3B worksheet</h1>
        <p className="acc-sub">
          The figures for each table of GSTR-3B, from your GST bills, credit notes, purchases, debit notes and imported marketplace sales.
          Copy them into the portal (Returns → GSTR-3B → Prepare Online). The portal pre-fills 3B from your GSTR-1 and GSTR-2B — compare, and correct if they differ.
        </p>
        <div className="acc-form">
          <label className="acc-field"><span>{quarterly ? 'Any month of the quarter' : 'Return month'}</span>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
          <label className="acc-field"><span>Filing</span>
            <select value={quarterly ? 'q' : 'm'} onChange={(e) => setQuarterly(e.target.value === 'q')}>
              <option value="m">Monthly</option>
              <option value="q">Quarterly (QRMP)</option>
            </select>
          </label>
        </div>
        <p className="acc-status">
          Period: <strong>{period.label}</strong> ({period.startDate} to {period.endDate}) · due by <strong>{period.due.toLocaleDateString('en-IN')}</strong>
          {quarterly ? ' (22nd or 24th depending on your state)' : ''}
          {data ? ` · GSTIN ${data.gstin}` : ''}
        </p>
        {status && <p className={`acc-status${data ? '' : ' error'}`}>{status}</p>}
      </section>

      {data && (
        <>
          <section className="acc-card">
            <div className="reports-summary-grid">
              <div className="reports-stat">
                <span>Tax on outward supplies</span>
                <strong>₹{amt(s.payable.igst + s.payable.cgst + s.payable.sgst)}</strong>
                <small>{data.counts.bills} bill(s), {data.counts.creditNotes} credit note(s){data.marketplace.months ? ` + marketplace ₹${amt(data.marketplace.taxableValue)}` : ''}</small>
              </div>
              <div className="reports-stat">
                <span>Input tax credit (ITC)</span>
                <strong>₹{amt(s.credit.igst + s.credit.cgst + s.credit.sgst)}</strong>
                <small>{data.counts.purchases} purchase(s), {data.counts.debitNotes} debit note(s)</small>
              </div>
              <div className="reports-stat reports-stat-highlight">
                <span>Pay in cash (6.1)</span>
                <strong>₹{amt(cashTotal)}</strong>
                <small>IGST {amt(s.cash.igst)} · CGST {amt(s.cash.cgst)} · SGST {amt(s.cash.sgst)}</small>
              </div>
            </div>
            {data.notes.map((n) => <p key={n} className="acc-status error">{n}</p>)}
          </section>

          <section className="acc-card">
            <h1>3.1 Details of outward supplies and inward supplies liable to reverse charge</h1>
            <div className="acc-table-wrap">
              <table className="acc-table gstr3b-table">
                <TaxHead first="Nature of supplies" />
                <tbody>
                  <TaxRow label="(a) Outward taxable supplies (other than zero rated, nil rated and exempted)" t={data.t31.a} />
                  <TaxRow label="(b) Outward taxable supplies (zero rated)" t={data.t31.b} />
                  <TaxRow label="(c) Other outward supplies (nil rated, exempted)" t={data.t31.c} />
                  <TaxRow label="(d) Inward supplies (liable to reverse charge)" t={data.t31.d} />
                  <TaxRow label="(e) Non-GST outward supplies" t={data.t31.e} />
                </tbody>
              </table>
            </div>
            <p className="gstr3b-note">(b), (d) and (e) are 0 — the software has no export, reverse-charge or non-GST entries. Enter them on the portal yourself if you have any. Marketplace (TCS) sales are included in (a).</p>
          </section>

          <section className="acc-card">
            <h1>3.2 Inter-state supplies to unregistered persons</h1>
            <div className="acc-table-wrap">
              <table className="acc-table gstr3b-table">
                <thead><tr><th>Place of supply (state)</th><th className="num">Total taxable value</th><th className="num">Integrated tax</th></tr></thead>
                <tbody>
                  {data.t32.length === 0 ? (
                    <tr><td colSpan="3" style={{ textAlign: 'center' }}>None this period.</td></tr>
                  ) : data.t32.map((r) => (
                    <tr key={r.pos}><td>{r.pos} – {r.state}</td><td className="num">{amt(r.taxableValue)}</td><td className="num">{amt(r.igst)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="gstr3b-note">Supplies to composition dealers and UIN holders are not tracked separately — enter them on the portal if you have any.</p>
          </section>

          <section className="acc-card">
            <h1>4. Eligible ITC</h1>
            <div className="acc-table-wrap">
              <table className="acc-table gstr3b-table">
                <TaxHead first="Details" noValue />
                <tbody>
                  <TaxRow label="(A)(5) All other ITC" t={data.t4.a5} noValue />
                  <TaxRow label="(B) ITC reversed" t={data.t4.b} noValue />
                  <TaxRow label="(C) Net ITC available (A) − (B)" t={data.t4.net} noValue />
                </tbody>
              </table>
            </div>
            <p className="gstr3b-note">
              From your purchase bills minus debit notes{data.counts.gstExpenses ? `, plus GST on ${data.counts.gstExpenses} expense bill(s) (Accounts → Expenses)` : ''}. <strong>Claim only what appears in your GSTR-2B</strong> on the portal — if a supplier has not filed, that credit must wait.
              Imports (4(A)(1)–(2)), reverse charge (4(A)(3)) and reversals (4(B)) are not calculated.
            </p>
          </section>

          <section className="acc-card">
            <h1>5. Exempt, nil-rated and non-GST inward supplies</h1>
            <div className="acc-table-wrap">
              <table className="acc-table gstr3b-table">
                <thead><tr><th>Nature of supplies</th><th className="num">Inter-state</th><th className="num">Intra-state</th></tr></thead>
                <tbody>
                  <tr><td>Exempt, nil rated (0% purchases)</td><td className="num">{amt(data.t5.inter)}</td><td className="num">{amt(data.t5.intra)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="acc-card">
            <h1>6.1 Payment of tax</h1>
            <div className="acc-table-wrap">
              <table className="acc-table gstr3b-table">
                <thead>
                  <tr>
                    <th>Tax</th><th className="num">Tax payable</th>
                    <th className="num">Paid with IGST credit</th><th className="num">Paid with CGST credit</th><th className="num">Paid with SGST credit</th>
                    <th className="num">Pay in cash</th>
                  </tr>
                </thead>
                <tbody>
                  {[['igst', 'Integrated tax'], ['cgst', 'Central tax'], ['sgst', 'State / UT tax']].map(([k, label]) => (
                    <tr key={k}>
                      <td>{label}</td>
                      <td className="num">{amt(s.payable[k])}</td>
                      <td className="num">{amt(s.creditUsed.igst[k])}</td>
                      <td className="num">{k === 'sgst' ? '—' : amt(s.creditUsed.cgst[k])}</td>
                      <td className="num">{k === 'cgst' ? '—' : amt(s.creditUsed.sgst[k])}</td>
                      <td className="num"><strong>{amt(s.cash[k])}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{amt(s.payable.igst + s.payable.cgst + s.payable.sgst)}</td>
                    <td colSpan="3" />
                    <td className="num">{amt(cashTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="gstr3b-note">
              Credit is used in the order the GST Act requires: IGST credit first (against IGST, then CGST / SGST), then CGST credit (CGST, then IGST), then SGST credit (SGST, then IGST).
              CGST credit can never pay SGST, nor SGST credit CGST.
              {(s.creditCarriedForward.igst || s.creditCarriedForward.cgst || s.creditCarriedForward.sgst)
                ? ` Unused credit carried to next month: IGST ${amt(s.creditCarriedForward.igst)}, CGST ${amt(s.creditCarriedForward.cgst)}, SGST ${amt(s.creditCarriedForward.sgst)}.`
                : ''}
            </p>
            {data.marketplace.months > 0 && (
              <p className="acc-status">
                Marketplace TCS: about <strong>₹{amt(data.marketplace.tcsEstimate)}</strong> (0.5% of ₹{amt(data.marketplace.taxableValue)}) was collected by the marketplace.
                Accept it on the portal (Services → Returns → TCS/TDS credit received); it goes into your cash ledger and can pay part of the cash above.
              </p>
            )}
            <p className="gstr3b-note">Interest and late fee are not calculated — the portal adds them if you file after the due date.</p>
          </section>
        </>
      )}
    </main>
  );
};

export default Gstr3b;
