import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './books.css';
import { amount, drCr, financialYearStart, todayString, ledgerHref } from './booksUtils';

// Trial balance: every account's opening, debits, credits and closing for a
// period, grouped Assets / Liabilities / Equity / Income / Expenses. Total
// closing debits must equal total closing credits.
const TrialBalance = () => {
  const [range, setRange] = useState({ startDate: financialYearStart(), endDate: todayString() });
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [hideZero, setHideZero] = useState(true);

  const load = useCallback(async () => {
    setStatus('Loading…');
    try {
      const params = new URLSearchParams(range);
      setData(await fetchJson(`/api/accounting/trial-balance?${params}`));
      setStatus('');
    } catch (error) {
      setData(null);
      setStatus(error.message);
    }
  }, [range]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = (a) => !hideZero || a.opening || a.debit || a.credit || a.closing;

  return (
    <main className="acc-page books-page">
      <section className="acc-card">
        <h1>Trial balance</h1>
        <p className="acc-sub">All accounts for the period, built automatically from your bills, notes, receipts and payments. Click an account to see its entries.</p>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label className="acc-field"><span>From</span>
            <input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} />
          </label>
          <label className="acc-field"><span>To</span>
            <input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} />
          </label>
          <div className="acc-actions"><button type="submit">Show</button></div>
          <label className="books-check">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
            <span>Hide accounts with no balance</span>
          </label>
        </form>
        {status && <p className={`acc-status${data ? '' : ' error'}`}>{status}</p>}
      </section>

      {data && (
        <section className="acc-card">
          <p className={`acc-status ${data.balanced ? 'success' : 'error'}`}>
            {data.balanced
              ? `✓ Balanced — total debits ${amount(data.totals.closingDebit)} = total credits ${amount(data.totals.closingCredit)}.`
              : `Not balanced — debits ${amount(data.totals.closingDebit)}, credits ${amount(data.totals.closingCredit)}. Please report this.`}
          </p>
          <div className="acc-table-wrap">
            <table className="acc-table books-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num">Opening</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th className="num">Closing Dr</th>
                  <th className="num">Closing Cr</th>
                </tr>
              </thead>
              {data.groups.map((group) => {
                const rows = data.accounts.filter((a) => a.group === group.key && visible(a));
                if (!rows.length) return null;
                return (
                  <tbody key={group.key}>
                    <tr className="books-group-row"><td colSpan="6">{group.label}</td></tr>
                    {rows.map((a) => (
                      <tr key={a.key}>
                        <td><Link to={ledgerHref(a.key, range)}>{a.name}</Link></td>
                        <td className="num">{drCr(a.opening)}</td>
                        <td className="num">{a.debit ? amount(a.debit) : '—'}</td>
                        <td className="num">{a.credit ? amount(a.credit) : '—'}</td>
                        <td className="num">{a.closingDebit ? amount(a.closingDebit) : ''}</td>
                        <td className="num">{a.closingCredit ? amount(a.closingCredit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td className="num">{amount(data.totals.debit)}</td>
                  <td className="num">{amount(data.totals.credit)}</td>
                  <td className="num">{amount(data.totals.closingDebit)}</td>
                  <td className="num">{amount(data.totals.closingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </main>
  );
};

export default TrialBalance;
