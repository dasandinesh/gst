import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import '../reports/reports.css';
import './books.css';
import { amount, financialYearStart, todayString, ledgerHref } from './booksUtils';

// Shared by the P&L and balance sheet: "Estimate from stock" fills a stock box
// with quantity in hand × latest purchase rate.
export const useStockEstimate = () => {
  const [estimate, setEstimate] = useState(null);
  const load = useCallback(() => fetchJson('/api/accounting/stock-estimate').then(setEstimate).catch(() => setEstimate(null)), []);
  return [estimate, load];
};
export const StockEstimateNote = ({ estimate }) => (estimate ? (
  <p className="books-muted">
    Estimate: ₹{amount(estimate.value)} — {estimate.valued} of {estimate.products} product(s) in stock valued at their latest purchase rate.
    {estimate.missingCount ? ` ${estimate.missingCount} never purchased (no rate): ${estimate.missing.join(', ')}${estimate.missingCount > estimate.missing.length ? '…' : ''}.` : ''}
    {' '}It uses today's stock quantity, so it's right for today, not for an earlier date.
  </p>
) : null);

const Rows = ({ rows, range, negate }) => rows.map((r) => (
  <tr key={r.key}>
    <td className="pl-indent"><Link to={ledgerHref(r.key, range)}>{r.name}</Link></td>
    <td className="num">{amount(negate ? -r.amount : r.amount)}</td>
  </tr>
));

// Accounts → Profit & Loss for a period: sales − cost of goods sold = gross
// profit; + other income − expenses = net profit.
const ProfitLoss = () => {
  const [range, setRange] = useState({ startDate: financialYearStart(), endDate: todayString() });
  const [stock, setStock] = useState({ openingStock: '', closingStock: '' });
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [estimate, loadEstimate] = useStockEstimate();

  const load = useCallback(async () => {
    setStatus('Loading…');
    try {
      const params = new URLSearchParams({ ...range, openingStock: stock.openingStock || 0, closingStock: stock.closingStock || 0 });
      setData(await fetchJson(`/api/accounting/profit-loss?${params}`));
      setStatus('');
    } catch (error) {
      setData(null);
      setStatus(error.message);
    }
  }, [range, stock]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Estimate closing stock": fetch the estimate; the effect puts it in the box.
  useEffect(() => { if (estimate) setStock((s) => ({ ...s, closingStock: estimate.value })); }, [estimate]);

  return (
    <main className="acc-page books-page">
      <section className="acc-card">
        <p className="books-back"><Link to="/balance-sheet">Balance sheet</Link> · <Link to="/trial-balance">Trial balance</Link></p>
        <h1>Profit &amp; Loss</h1>
        <p className="acc-sub">Sales − cost of goods sold = gross profit; + other income − expenses = net profit. Enter the stock values for a correct profit.</p>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label className="acc-field"><span>From</span><input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} /></label>
          <label className="acc-field"><span>To</span><input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} /></label>
          <label className="acc-field"><span>Opening stock (₹)</span><input type="number" min="0" step="0.01" value={stock.openingStock} placeholder="0.00" onChange={(e) => setStock((s) => ({ ...s, openingStock: e.target.value }))} /></label>
          <label className="acc-field"><span>Closing stock (₹)</span><input type="number" min="0" step="0.01" value={stock.closingStock} placeholder="0.00" onChange={(e) => setStock((s) => ({ ...s, closingStock: e.target.value }))} /></label>
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
          <div className="reports-summary-grid pl-summary">
            <div className="reports-stat"><span>Net sales</span><strong>₹{amount(data.netSales)}</strong></div>
            <div className="reports-stat"><span>Gross profit</span><strong>₹{amount(data.grossProfit)}</strong></div>
            <div className={`reports-stat ${data.netProfit >= 0 ? 'reports-stat-highlight' : 'pl-loss'}`}>
              <span>{data.netProfit >= 0 ? 'Net profit' : 'Net loss'}</span><strong>₹{amount(Math.abs(data.netProfit))}</strong>
            </div>
          </div>
          <div className="acc-table-wrap">
            <table className="acc-table books-table pl-table">
              <tbody>
                <tr className="books-group-row"><td colSpan="2">Sales</td></tr>
                <Rows rows={data.sales} range={range} />
                <tr className="pl-total"><td>Net sales</td><td className="num">{amount(data.netSales)}</td></tr>

                <tr className="books-group-row"><td colSpan="2">Cost of goods sold</td></tr>
                <tr><td className="pl-indent">Opening stock</td><td className="num">{amount(data.openingStock)}</td></tr>
                <Rows rows={data.purchases} range={range} />
                <tr><td className="pl-indent">Less: closing stock</td><td className="num">({amount(data.closingStock)})</td></tr>
                <tr className="pl-total"><td>Cost of goods sold</td><td className="num">{amount(data.costOfGoodsSold)}</td></tr>

                <tr className="pl-grand"><td>Gross profit</td><td className="num">{amount(data.grossProfit)}</td></tr>

                {data.otherIncome.length > 0 && (
                  <>
                    <tr className="books-group-row"><td colSpan="2">Other income</td></tr>
                    <Rows rows={data.otherIncome} range={range} />
                    <tr className="pl-total"><td>Total other income</td><td className="num">{amount(data.totalOtherIncome)}</td></tr>
                  </>
                )}

                <tr className="books-group-row"><td colSpan="2">Expenses</td></tr>
                {data.expenses.length ? <Rows rows={data.expenses} range={range} /> : <tr><td className="pl-indent books-muted" colSpan="2">No expenses — add them in Accounts → Expenses.</td></tr>}
                <tr className="pl-total"><td>Total expenses</td><td className="num">{amount(data.totalExpenses)}</td></tr>

                <tr className="pl-grand"><td>{data.netProfit >= 0 ? 'Net profit' : 'Net loss'}</td><td className="num">{amount(data.netProfit)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="books-muted">Amounts are before GST (GST is not income or expense — it sits in the GST accounts on the balance sheet).</p>
        </section>
      )}
    </main>
  );
};

export default ProfitLoss;
