import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './books.css';
import { drCr, financialYearStart, todayString, ledgerHref } from './booksUtils';

// Chart of accounts: every account, grouped, with today's balance. The accounts
// are fixed for now; entries are posted to them automatically from documents.
const ChartOfAccounts = () => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Loading…');

  useEffect(() => {
    fetchJson(`/api/accounting/chart?endDate=${todayString()}`)
      .then((result) => { setData(result); setStatus(''); })
      .catch((error) => setStatus(error.message));
  }, []);

  const period = { startDate: financialYearStart(), endDate: todayString() };

  return (
    <main className="acc-page books-page">
      <section className="acc-card">
        <h1>Chart of accounts</h1>
        <p className="acc-sub">
          The accounts your books use. Bills, credit / debit notes, purchases, receipts and payments post to them automatically (double entry).
          Balances are as of today; click an account for its entries this financial year.
        </p>
        {status && <p className={`acc-status${data ? '' : ' error'}`}>{status}</p>}
      </section>

      {data && data.groups.map((group) => {
        const accounts = data.accounts.filter((a) => a.group === group.key);
        return (
          <section className="acc-card" key={group.key}>
            <h1>{group.label}</h1>
            <div className="acc-table-wrap">
              <table className="acc-table books-table">
                <thead><tr><th>Account</th><th>Type</th><th className="num">Balance today</th></tr></thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.key}>
                      <td><Link to={ledgerHref(a.key, period)}>{a.name}</Link></td>
                      <td className="books-muted">{a.sub}</td>
                      <td className="num">{drCr(a.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </main>
  );
};

export default ChartOfAccounts;
