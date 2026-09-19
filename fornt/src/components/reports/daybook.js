import React, { useCallback, useState } from 'react';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './reports.css';

const money = (n) => Number(n || 0).toFixed(2);
const displayDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const todayString = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().split('T')[0];
};

const TYPE_CLASS = {
  'GST Sale': 'daybook-tag-out', 'Sale': 'daybook-tag-out', 'Payment': 'daybook-tag-out', 'Debit Note': 'daybook-tag-out',
  'Purchase': 'daybook-tag-in', 'Receipt': 'daybook-tag-in', 'Credit Note': 'daybook-tag-in',
};

// One chronological feed of every voucher — sales, purchases, credit/debit notes,
// receipts and payments — for a day or range, same idea as Tally's Day Book.
const DayBook = () => {
  const [range, setRange] = useState({ startDate: todayString(), endDate: todayString() });
  const [typeFilter, setTypeFilter] = useState('');
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus('Loading…');
    const params = new URLSearchParams();
    if (range.startDate) params.set('startDate', range.startDate);
    if (range.endDate) params.set('endDate', range.endDate);
    try {
      const result = await fetchJson(`/api/reports/day-book?${params}`);
      setData(result);
      setStatus(result.entries.length ? '' : 'No transactions in this range.');
    } catch (error) {
      setData(null);
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  const types = data ? Object.keys(data.summary) : [];
  const entries = data ? data.entries.filter((e) => !typeFilter || e.type === typeFilter) : [];

  return (
    <main className="acc-page reports-page">
      <section className="acc-card">
        <h1>Day book</h1>
        <p className="acc-sub">Every sale, purchase, credit/debit note, receipt and payment, in one chronological feed.</p>
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

      {data && (
        <section className="acc-card">
          <div className="reports-summary-grid">
            {types.map((type) => (
              <button
                key={type}
                type="button"
                className={`reports-stat reports-stat-button ${typeFilter === type ? 'is-active' : ''}`}
                onClick={() => setTypeFilter((t) => (t === type ? '' : type))}
              >
                <span>{type}</span>
                <strong>{money(data.summary[type].amount)}</strong>
                <small>{data.summary[type].count} entr{data.summary[type].count === 1 ? 'y' : 'ies'}</small>
              </button>
            ))}
          </div>

          <div className="acc-table-wrap" style={{ marginTop: 14 }}>
            <table className="acc-table">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Ref</th><th>Party</th><th>Mode</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center' }}>No transactions.</td></tr>
                ) : entries.map((e, i) => (
                  <tr key={i}>
                    <td>{displayDate(e.date)}</td>
                    <td><span className={`daybook-tag ${TYPE_CLASS[e.type] || ''}`}>{e.type}</span></td>
                    <td>{e.refNo || '—'}</td>
                    <td>{e.party || '—'}</td>
                    <td>{e.mode || '—'}</td>
                    <td className="num">{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
};

export default DayBook;
