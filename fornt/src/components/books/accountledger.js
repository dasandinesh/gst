import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './books.css';
import { amount, drCr, displayDate, financialYearStart, todayString } from './booksUtils';

// One account's statement: opening, every entry in the period with a running
// balance, and closing. For Debtors / Creditors it can be narrowed to one party.
// URL: /account-ledger?account=KEY&startDate=&endDate=&party=
const AccountLedger = () => {
  const [params, setParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    account: params.get('account') || 'cash',
    startDate: params.get('startDate') || financialYearStart(),
    endDate: params.get('endDate') || todayString(),
    party: params.get('party') || '',
  });
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetchJson(`/api/accounting/chart?endDate=${todayString()}`).then((r) => setAccounts(r.accounts)).catch(() => {});
  }, []);

  const load = useCallback(async (values) => {
    setStatus('Loading…');
    try {
      const query = new URLSearchParams(Object.entries(values).filter(([, v]) => v));
      setData(await fetchJson(`/api/accounting/ledger?${query}`));
      setStatus('');
    } catch (error) {
      setData(null);
      setStatus(error.message);
    }
  }, []);

  // Reload whenever the URL changes (links from the trial balance / chart).
  useEffect(() => {
    const values = {
      account: params.get('account') || 'cash',
      startDate: params.get('startDate') || financialYearStart(),
      endDate: params.get('endDate') || todayString(),
      party: params.get('party') || '',
    };
    setForm(values);
    load(values);
  }, [params, load]);

  const submit = (e) => {
    e.preventDefault();
    setParams(Object.fromEntries(Object.entries(form).filter(([, v]) => v)));
  };
  const partyAccount = form.account === 'debtors' || form.account === 'creditors';

  return (
    <main className="acc-page books-page">
      <section className="acc-card">
        <p className="books-back"><Link to="/trial-balance">← Trial balance</Link> · <Link to="/chart-of-accounts">Chart of accounts</Link></p>
        <h1>Account ledger{data ? ` — ${data.account.name}` : ''}</h1>
        <form className="acc-form" onSubmit={submit}>
          <label className="acc-field"><span>Account</span>
            <select value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value, party: '' }))}>
              {accounts.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
            </select>
          </label>
          <label className="acc-field"><span>From</span>
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </label>
          <label className="acc-field"><span>To</span>
            <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </label>
          {partyAccount && (
            <label className="acc-field"><span>{form.account === 'debtors' ? 'Customer (optional)' : 'Supplier (optional)'}</span>
              <input type="text" value={form.party} placeholder="All" onChange={(e) => setForm((f) => ({ ...f, party: e.target.value }))} />
            </label>
          )}
          <div className="acc-actions"><button type="submit">Show</button></div>
        </form>
        {status && <p className={`acc-status${data ? '' : ' error'}`}>{status}</p>}
      </section>

      {data && (
        <section className="acc-card">
          <div className="acc-table-wrap">
            <table className="acc-table books-table">
              <thead>
                <tr><th>Date</th><th>Voucher</th><th>No.</th><th>Particulars</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                <tr className="books-group-row">
                  <td colSpan="6">Opening balance</td>
                  <td className="num">{drCr(data.opening)}</td>
                </tr>
                {data.entries.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center' }}>No entries in this period.</td></tr>
                ) : data.entries.map((e, index) => (
                  <tr key={index}>
                    <td>{displayDate(e.date)}</td>
                    <td>{e.type}</td>
                    <td>{e.number || '—'}</td>
                    <td>{e.narration}</td>
                    <td className="num">{e.debit ? amount(e.debit) : ''}</td>
                    <td className="num">{e.credit ? amount(e.credit) : ''}</td>
                    <td className="num">{drCr(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4">Total / closing balance</td>
                  <td className="num">{amount(data.totalDebit)}</td>
                  <td className="num">{amount(data.totalCredit)}</td>
                  <td className="num">{drCr(data.closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </main>
  );
};

export default AccountLedger;
