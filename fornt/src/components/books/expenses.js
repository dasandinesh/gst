import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './books.css';
import { amount, todayString } from './booksUtils';
import { useEntryShortcuts, fetchLatest, ShortcutHint } from '../common/entryShortcuts';

const GST_RATES = [0, 5, 12, 18, 28, 40];
const firstOfMonth = () => `${todayString().slice(0, 8)}01`;
const toDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const emptyForm = () => ({
  date: todayString(), account: 'expRent', amount: '', gstRate: 0, taxType: 'CGST_SGST', claimItc: true,
  paidFrom: 'cash', payee: '', payeeGstin: '', billNumber: '', note: '',
});

// Accounts → Expenses: rent, salary, electricity, freight… Each expense posts
// Dr expense (+ input GST) → Cr cash / bank / supplier, and its GST (when
// claimed) is counted as input tax credit in the GSTR-3B worksheet.
const Expenses = () => {
  const formRef = useRef(null);
  const [chart, setChart] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [list, setList] = useState([]);
  const [range, setRange] = useState({ startDate: firstOfMonth(), endDate: todayString() });
  const [status, setStatus] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJson(`/api/accounting/chart?endDate=${todayString()}`).then((r) => setChart(r.accounts)).catch(() => {});
    fetchJson('/api/suppliers').then(setSuppliers).catch(() => {});
  }, []);
  const load = useCallback(() => {
    const params = new URLSearchParams(Object.entries(range).filter(([, v]) => v));
    return fetchJson(`/api/accounting/expenses?${params}`).then(setList).catch((error) => setStatus({ type: 'error', text: error.message }));
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const byKey = useMemo(() => Object.fromEntries(chart.map((a) => [a.key, a])), [chart]);
  const expenseAccounts = chart.filter((a) => a.group === 'expense' && a.active !== false && !['purchases', 'purchaseReturns'].includes(a.key));
  const moneyAccounts = chart.filter((a) => (a.key === 'cash' || a.key === 'bank' || a.kind === 'bank') && a.active !== false);

  // Live GST / total, same maths as the server.
  const calc = useMemo(() => {
    const amt = Number(form.amount) || 0;
    const rate = Number(form.gstRate) || 0;
    const r2 = (v) => Math.round(v * 100) / 100;
    const igst = form.taxType === 'IGST' ? r2(amt * rate / 100) : 0;
    const half = form.taxType === 'IGST' ? 0 : r2(amt * rate / 200);
    return { igst, cgst: half, sgst: half, total: r2(amt + igst + half * 2) };
  }, [form.amount, form.gstRate, form.taxType]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const reset = () => { setForm(emptyForm()); setEditingId(null); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await fetchJson(editingId ? `/api/accounting/expenses/${editingId}` : '/api/accounting/expenses', {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount), gstRate: Number(form.gstRate) }),
      });
      setStatus({ type: 'success', text: `Expense ${saved.number} ${editingId ? 'updated' : 'saved'} — ₹${amount(saved.total)}.` });
      reset();
      load();
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const edit = (x) => {
    setEditingId(x._id);
    setForm({
      date: toDate(x.date), account: x.account, amount: x.amount, gstRate: x.gstRate || 0, taxType: x.taxType || 'CGST_SGST',
      claimItc: x.claimItc !== false, paidFrom: x.paidFrom, payee: x.payee || '', payeeGstin: x.payeeGstin || '', billNumber: x.billNumber || '', note: x.note || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (x) => {
    if (!window.confirm(`Delete expense ${x.number} (₹${amount(x.total)})?`)) return;
    try {
      await fetchJson(`/api/accounting/expenses/${x._id}`, { method: 'DELETE' });
      if (editingId === x._id) reset();
      load();
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    }
  };

  // F2 new, Ctrl+S save, F8 open the last expense for editing.
  useEntryShortcuts({
    isDirty: Boolean(form.amount),
    confirmNew: 'Discard this unsaved expense and start a new one?',
    onNew: () => { reset(); setTimeout(() => formRef.current?.querySelector('select, input')?.focus(), 0); },
    onSave: () => formRef.current?.requestSubmit(),
    onOpenLast: () => fetchLatest('/api/accounting/expenses', 'No expenses saved yet.').then(edit).catch((error) => setStatus({ type: 'error', text: error.message })),
  });

  const total = list.reduce((t, x) => t + (Number(x.total) || 0), 0);
  const accountName = (key) => (key === 'creditors' ? 'Not paid (supplier)' : byKey[key]?.name || key);

  return (
    <main className="acc-page books-page">
      <section className="acc-card">
        <p className="books-back"><Link to="/chart-of-accounts">Chart of accounts</Link> · <Link to="/journal-voucher">Journal voucher</Link></p>
        <h1>{editingId ? 'Edit expense' : 'New expense'}</h1>
        <p className="acc-sub">Rent, salary, electricity, freight… Add your own expense heads or bank accounts in the Chart of accounts.</p>
        <form className="acc-form" ref={formRef} onSubmit={save}>
          <label className="acc-field"><span>Date *</span><input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></label>
          <label className="acc-field"><span>Expense account *</span>
            <select value={form.account} onChange={(e) => set('account', e.target.value)}>
              {expenseAccounts.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
            </select>
          </label>
          <label className="acc-field"><span>Amount (before GST) *</span>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </label>
          <label className="acc-field"><span>GST %</span>
            <select value={form.gstRate} onChange={(e) => set('gstRate', Number(e.target.value))}>
              {GST_RATES.map((r) => <option key={r} value={r}>{r ? `${r}%` : 'No GST'}</option>)}
            </select>
          </label>
          {Number(form.gstRate) > 0 && (
            <>
              <label className="acc-field"><span>Tax type</span>
                <select value={form.taxType} onChange={(e) => set('taxType', e.target.value)}>
                  <option value="CGST_SGST">CGST + SGST (same state)</option>
                  <option value="IGST">IGST (other state)</option>
                </select>
              </label>
              <label className="books-check"><input type="checkbox" checked={form.claimItc} onChange={(e) => set('claimItc', e.target.checked)} /><span>Claim GST as input credit</span></label>
            </>
          )}
          <label className="acc-field"><span>Paid from *</span>
            <select value={form.paidFrom} onChange={(e) => set('paidFrom', e.target.value)}>
              {moneyAccounts.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
              <option value="creditors">Not paid yet (owed to supplier)</option>
            </select>
          </label>
          <label className="acc-field"><span>Paid to{form.paidFrom === 'creditors' ? ' (supplier) *' : ''}</span>
            <input list="expense-payees" value={form.payee} onChange={(e) => set('payee', e.target.value)} />
          </label>
          <datalist id="expense-payees">{suppliers.map((s) => <option key={s._id} value={s.name} />)}</datalist>
          {Number(form.gstRate) > 0 && (
            <label className="acc-field"><span>Payee GSTIN</span><input value={form.payeeGstin} maxLength={15} onChange={(e) => set('payeeGstin', e.target.value.toUpperCase())} /></label>
          )}
          <label className="acc-field"><span>Their bill no.</span><input value={form.billNumber} onChange={(e) => set('billNumber', e.target.value)} /></label>
          <label className="acc-field"><span>Note</span><input value={form.note} onChange={(e) => set('note', e.target.value)} /></label>
          <p className="acc-status" style={{ gridColumn: '1 / -1' }}>
            {Number(form.gstRate) > 0
              ? <>GST: {form.taxType === 'IGST' ? `IGST ₹${amount(calc.igst)}` : `CGST ₹${amount(calc.cgst)} + SGST ₹${amount(calc.sgst)}`}{form.claimItc ? ' (input credit)' : ' (added to the expense)'} · </>
              : null}
            <strong>Total ₹{amount(calc.total)}</strong>
          </p>
          <div className="acc-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="submit" disabled={saving} title="Ctrl+S">{saving ? 'Saving…' : editingId ? 'Update expense' : 'Save expense'}</button>
            <button type="button" className="secondary" title="F2" onClick={reset}>{editingId ? 'Cancel edit' : 'Clear'}</button>
          </div>
        </form>
        <ShortcutHint entry="expense" print={false} />
        {status.text && <p className={`acc-status ${status.type}`}>{status.text}</p>}
      </section>

      <section className="acc-card">
        <h1>Expenses</h1>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label className="acc-field"><span>From</span><input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} /></label>
          <label className="acc-field"><span>To</span><input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} /></label>
          <div className="acc-actions"><button type="submit">Show</button></div>
        </form>
        <div className="acc-table-wrap" style={{ marginTop: 12 }}>
          <table className="acc-table books-table">
            <thead><tr><th>No.</th><th>Date</th><th>Expense</th><th>Paid to</th><th>Paid from</th><th className="num">Amount</th><th className="num">GST</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center' }}>No expenses in this period.</td></tr>
              ) : list.map((x) => (
                <tr key={x._id}>
                  <td>{x.number}</td>
                  <td>{new Date(x.date).toLocaleDateString('en-IN')}</td>
                  <td>{accountName(x.account)}{x.note ? <div className="books-muted">{x.note}</div> : null}</td>
                  <td>{x.payee || '—'}{x.billNumber ? <div className="books-muted">Bill {x.billNumber}</div> : null}</td>
                  <td>{accountName(x.paidFrom)}</td>
                  <td className="num">{amount(x.amount)}</td>
                  <td className="num">{amount((x.cgst || 0) + (x.sgst || 0) + (x.igst || 0))}</td>
                  <td className="num">{amount(x.total)}</td>
                  <td className="acc-row-actions">
                    <button type="button" onClick={() => edit(x)}>edit</button>
                    <button type="button" className="danger" onClick={() => remove(x)}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan="7">Total</td><td className="num">{amount(total)}</td><td /></tr></tfoot>
          </table>
        </div>
      </section>
    </main>
  );
};

export default Expenses;
