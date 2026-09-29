import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './books.css';
import { drCr, financialYearStart, todayString, ledgerHref } from './booksUtils';

const KINDS = [
  { value: 'bank', label: 'Bank account' },
  { value: 'expense', label: 'Expense head' },
  { value: 'income', label: 'Income head' },
  { value: 'other', label: 'Other (loan, asset, capital…)' },
];
const GROUP_OPTIONS = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability (loan, payable)' },
  { value: 'equity', label: 'Equity / capital' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];
const emptyForm = { name: '', kind: 'bank', group: 'asset', openingBalance: '', openingSide: 'dr', bankName: '', accountNumber: '', ifsc: '', active: true };

// Chart of accounts: every account, grouped, with today's balance. Built-in
// accounts get entries automatically from documents; accounts added here (banks,
// expense / income heads, loans…) are used by Expenses and Journal Vouchers.
const ChartOfAccounts = () => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState({ type: '', text: 'Loading…' });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => fetchJson(`/api/accounting/chart?endDate=${todayString()}`)
    .then((result) => { setData(result); setStatus((s) => (s.text === 'Loading…' ? { type: '', text: '' } : s)); })
    .catch((error) => setStatus({ type: 'error', text: error.message })), []);
  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const reset = () => { setForm(emptyForm); setEditingId(null); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetchJson(editingId ? `/api/accounting/accounts/${editingId}` : '/api/accounting/accounts', {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      setStatus({ type: 'success', text: `Account "${form.name}" ${editingId ? 'updated' : 'added'}.` });
      reset();
      load();
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const edit = (a) => {
    setEditingId(a.id);
    setForm({
      name: a.name, kind: a.kind || 'other', group: a.group, openingBalance: a.openingBalance || '', openingSide: a.openingSide || 'dr',
      bankName: a.bankName || '', accountNumber: a.accountNumber || '', ifsc: a.ifsc || '', active: a.active !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (a) => {
    if (!window.confirm(`Remove the account "${a.name}"?`)) return;
    try {
      await fetchJson(`/api/accounting/accounts/${a.id}`, { method: 'DELETE' });
      setStatus({ type: 'success', text: `Account "${a.name}" removed.` });
      load();
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    }
  };

  const period = { startDate: financialYearStart(), endDate: todayString() };
  const kindFixesGroup = form.kind !== 'other';

  return (
    <main className="acc-page books-page">
      <section className="acc-card">
        <h1>Chart of accounts</h1>
        <p className="acc-sub">
          Built-in accounts get their entries automatically from bills, notes, purchases, receipts and payments. Add your own bank accounts,
          expense or income heads and loans here — they are used in Expenses and Journal Vouchers. Balances are as of today; click an account for its entries.
        </p>

        <h2 className="books-subhead">{editingId ? `Edit account "${form.name}"` : 'Add an account'}</h2>
        <form className="acc-form" onSubmit={save}>
          <label className="acc-field"><span>Type</span>
            <select value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="acc-field"><span>Account name *</span>
            <input value={form.name} placeholder={form.kind === 'bank' ? 'e.g. HDFC current a/c' : 'e.g. Advertising'} onChange={(e) => set('name', e.target.value)} />
          </label>
          {!kindFixesGroup && (
            <label className="acc-field"><span>Group</span>
              <select value={form.group} onChange={(e) => set('group', e.target.value)}>
                {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </label>
          )}
          {form.kind === 'bank' && (
            <>
              <label className="acc-field"><span>Bank name</span><input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} /></label>
              <label className="acc-field"><span>Account no.</span><input value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} /></label>
              <label className="acc-field"><span>IFSC</span><input value={form.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} /></label>
            </>
          )}
          <label className="acc-field"><span>Opening balance</span>
            <input type="number" min="0" step="0.01" value={form.openingBalance} placeholder="0.00" onChange={(e) => set('openingBalance', e.target.value)} />
          </label>
          <label className="acc-field"><span>Opening is</span>
            <select value={form.openingSide} onChange={(e) => set('openingSide', e.target.value)}>
              <option value="dr">Debit (money in bank / asset / expense)</option>
              <option value="cr">Credit (loan / liability / capital / income)</option>
            </select>
          </label>
          {editingId && (
            <label className="books-check"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /><span>Active</span></label>
          )}
          <div className="acc-actions">
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update account' : 'Add account'}</button>
            {editingId && <button type="button" className="secondary" onClick={reset}>Cancel</button>}
          </div>
        </form>
        {status.text && <p className={`acc-status ${status.type}`}>{status.text}</p>}
      </section>

      {data && data.groups.map((group) => {
        const accounts = data.accounts.filter((a) => a.group === group.key);
        if (!accounts.length) return null;
        return (
          <section className="acc-card" key={group.key}>
            <h1>{group.label}</h1>
            <div className="acc-table-wrap">
              <table className="acc-table books-table">
                <thead><tr><th>Account</th><th>Type</th><th className="num">Balance today</th><th /></tr></thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.key} className={a.active === false ? 'books-inactive' : ''}>
                      <td>
                        <Link to={ledgerHref(a.key, period)}>{a.name}</Link>
                        {a.custom ? <span className="books-tag">added</span> : null}
                        {a.active === false ? <span className="books-tag">inactive</span> : null}
                        {a.accountNumber ? <div className="books-muted">{[a.bankName, a.accountNumber, a.ifsc].filter(Boolean).join(' · ')}</div> : null}
                      </td>
                      <td className="books-muted">{a.sub}</td>
                      <td className="num">{drCr(a.balance)}</td>
                      <td className="acc-row-actions">
                        {a.custom ? (
                          <>
                            <button type="button" onClick={() => edit(a)}>edit</button>
                            <button type="button" className="danger" onClick={() => remove(a)}>remove</button>
                          </>
                        ) : null}
                      </td>
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
