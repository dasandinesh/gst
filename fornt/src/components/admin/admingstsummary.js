import React, { useCallback, useState } from 'react';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import '../reports/reports.css';

const money = (n) => Number(n || 0).toFixed(2);

const todayString = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().split('T')[0];
};
const firstOfMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

// Platform-wide GST summary: net outward/inward tax and net payable across
// every business, plus a per-business breakdown for the admin to see which
// tenants owe what. Mirrors GstReports (components/reports/gstreports.js) but
// scoped to the whole platform via /api/admin/gst-summary instead of one
// business's /api/reports/gst.
const AdminGstSummary = () => {
  const [range, setRange] = useState({ startDate: firstOfMonth(), endDate: todayString() });
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus('Loading…');
    const params = new URLSearchParams();
    if (range.startDate) params.set('startDate', range.startDate);
    if (range.endDate) params.set('endDate', range.endDate);
    try {
      const data = await fetchJson(`/api/admin/gst-summary?${params}`);
      setReport(data);
      setStatus('');
    } catch (error) {
      setReport(null);
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  return (
    <main className="acc-page reports-page">
      <section className="acc-card">
        <h1>GST summary — all businesses</h1>
        <p className="acc-sub">Net outward supplies, input tax credit, and net tax payable across every business on the platform.</p>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label className="acc-field"><span>From</span>
            <input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} />
          </label>
          <label className="acc-field"><span>To</span>
            <input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} />
          </label>
          <div className="acc-actions">
            <button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Show'}</button>
          </div>
        </form>
        {status && <p className="acc-status error">{status}</p>}
      </section>

      {report && (
        <>
          <section className="acc-card">
            <div className="reports-summary-grid">
              <div className="reports-stat">
                <span>Businesses / users</span>
                <strong>{report.stats.businessCount} / {report.stats.userCount}</strong>
                <small>registered on the platform</small>
              </div>
              <div className="reports-stat">
                <span>Outward tax (output)</span>
                <strong>{money(report.outward.totals.cgst + report.outward.totals.sgst + report.outward.totals.igst)}</strong>
                <small>{report.outward.billCount} bill{report.outward.billCount === 1 ? '' : 's'}, {report.outward.creditNoteCount} credit note{report.outward.creditNoteCount === 1 ? '' : 's'}</small>
              </div>
              <div className="reports-stat">
                <span>Inward tax (ITC available)</span>
                <strong>{money(report.inward.totals.cgst + report.inward.totals.sgst + report.inward.totals.igst)}</strong>
                <small>{report.inward.billCount} bill{report.inward.billCount === 1 ? '' : 's'}, {report.inward.debitNoteCount} debit note{report.inward.debitNoteCount === 1 ? '' : 's'}</small>
              </div>
              <div className="reports-stat reports-stat-highlight">
                <span>Net GST payable</span>
                <strong>{money(report.netPayable.total)}</strong>
                <small>CGST {money(report.netPayable.cgst)} · SGST {money(report.netPayable.sgst)} · IGST {money(report.netPayable.igst)}</small>
              </div>
            </div>
          </section>

          <section className="acc-card">
            <h1>Per-business breakdown</h1>
            <div className="acc-table-wrap">
              <table className="acc-table">
                <thead>
                  <tr>
                    <th>Business</th><th>GSTIN</th>
                    <th className="num">Outward tax</th><th className="num">Inward tax</th><th className="num">Net payable</th>
                    <th className="num">Bills</th><th className="num">Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {report.businessBreakdown.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center' }}>No transactions in this period.</td></tr>
                  ) : report.businessBreakdown.map((b) => (
                    <tr key={b.businessId}>
                      <td>{b.name}</td>
                      <td>{b.gstin || '—'}</td>
                      <td className="num">{money(b.outwardTax)}</td>
                      <td className="num">{money(b.inwardTax)}</td>
                      <td className="num">{money(b.netPayable)}</td>
                      <td className="num">{b.billCount}</td>
                      <td className="num">{b.purchaseCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
};

export default AdminGstSummary;
