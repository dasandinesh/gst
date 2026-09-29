import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import '../reports/reports.css';
import './books.css';
import { amount, financialYearStart, todayString, ledgerHref } from './booksUtils';
import { useStockEstimate, StockEstimateNote } from './profitloss';

const Side = ({ title, rows, total, totalLabel, range }) => (
  <table className="acc-table books-table pl-table">
    <thead><tr><th>{title}</th><th className="num">₹</th></tr></thead>
    <tbody>
      {rows.length === 0 ? <tr><td colSpan="2" className="books-muted">Nothing yet.</td></tr> : rows.map((r) => (
        <tr key={r.key}>
          <td>
            {['stock', 'profit', 'startingStock'].includes(r.key) ? r.name : <Link to={ledgerHref(r.key, range)}>{r.name}</Link>}
            <div className="books-muted">{r.sub}</div>
          </td>
          <td className="num">{amount(r.amount)}</td>
        </tr>
      ))}
    </tbody>
    <tfoot><tr><td>{totalLabel}</td><td className="num">{amount(total)}</td></tr></tfoot>
  </table>
);

// Accounts → Balance sheet on a date: what the business owns (assets) =
// what it owes (liabilities) + the owner's share (capital + profit to date).
const BalanceSheet = () => {
  const [endDate, setEndDate] = useState(todayString());
  const [stock, setStock] = useState({ closingStock: '', startingStock: '' });
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [estimate, loadEstimate] = useStockEstimate();

  const load = useCallback(async () => {
    setStatus('Loading…');
    try {
      const params = new URLSearchParams({ endDate, closingStock: stock.closingStock || 0, startingStock: stock.startingStock || 0 });
      setData(await fetchJson(`/api/accounting/balance-sheet?${params}`));
      setStatus('');
    } catch (error) {
      setData(null);
      setStatus(error.message);
    }
  }, [endDate, stock]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (estimate) setStock((s) => ({ ...s, closingStock: estimate.value })); }, [estimate]);

  const range = { startDate: financialYearStart(), endDate };

  return (
    <main className="acc-page books-page">
      <section className="acc-card">
        <p className="books-back"><Link to="/profit-loss">Profit &amp; Loss</Link> · <Link to="/trial-balance">Trial balance</Link></p>
        <h1>Balance sheet</h1>
        <p className="acc-sub">What the business owns (assets) = what it owes (liabilities) + the owner's share (capital + profit to date), on the date you pick.</p>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label className="acc-field"><span>As on</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <label className="acc-field"><span>Closing stock on that date (₹)</span><input type="number" min="0" step="0.01" value={stock.closingStock} placeholder="0.00" onChange={(e) => setStock((s) => ({ ...s, closingStock: e.target.value }))} /></label>
          <label className="acc-field"><span>Stock when you started using the software (₹)</span><input type="number" min="0" step="0.01" value={stock.startingStock} placeholder="0.00" onChange={(e) => setStock((s) => ({ ...s, startingStock: e.target.value }))} /></label>
          <div className="acc-actions">
            <button type="submit">Show</button>
            <button type="button" className="secondary" onClick={loadEstimate}>Estimate closing stock</button>
          </div>
        </form>
        <StockEstimateNote estimate={estimate} />
        {status && <p className={`acc-status${data ? '' : ' error'}`}>{status}</p>}
      </section>

      {data && (
        <section className="acc-card">
          <p className={`acc-status ${data.balanced ? 'success' : 'error'}`}>
            {data.balanced
              ? `✓ Balanced — assets ₹${amount(data.totalAssets)} = liabilities + capital ₹${amount(data.totalLiabilitiesAndEquity)}.`
              : `Not balanced — assets ₹${amount(data.totalAssets)}, liabilities + capital ₹${amount(data.totalLiabilitiesAndEquity)}. Please report this.`}
          </p>
          <div className="bs-grid">
            <div>
              <Side title="Liabilities" rows={data.liabilities} total={data.totalLiabilities} totalLabel="Total liabilities" range={range} />
              <Side title="Capital & profit" rows={data.equity} total={data.totalEquity} totalLabel="Total capital" range={range} />
              <table className="acc-table pl-table"><tfoot><tr><td>Liabilities + capital</td><td className="num">{amount(data.totalLiabilitiesAndEquity)}</td></tr></tfoot></table>
            </div>
            <div>
              <Side title="Assets" rows={data.assets} total={data.totalAssets} totalLabel="Total assets" range={range} />
            </div>
          </div>
          <p className="books-muted">
            Output GST is a liability until paid to the government; input GST is an asset until used. Record GST payments with a Journal voucher (Quick fill → GST paid to government).
          </p>
        </section>
      )}
    </main>
  );
};

export default BalanceSheet;
