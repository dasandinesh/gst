import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './books.css';
import { amount, todayString } from './booksUtils';
import { useEntryShortcuts, fetchLatest, ShortcutHint } from '../common/entryShortcuts';
import { formatDate } from '../../dateFormat';

const firstOfMonth = () => `${todayString().slice(0, 8)}01`;
const toDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const emptyLine = () => ({ account: '', party: '', debit: '', credit: '' });
const emptyForm = () => ({ date: todayString(), narration: '', lines: [emptyLine(), emptyLine()] });
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const PARTY_ACCOUNTS = ['debtors', 'creditors'];

// Common entries, to fill the lines in one click.
const TEMPLATES = [
  { label: 'Capital introduced (cash)', narration: 'Capital introduced', lines: [['cash', 'debit'], ['capital', 'credit']] },
  { label: 'Cash deposited in bank', narration: 'Cash deposited in bank', lines: [['bank', 'debit'], ['cash', 'credit']] },
  { label: 'Cash withdrawn from bank', narration: 'Cash withdrawn from bank', lines: [['cash', 'debit'], ['bank', 'credit']] },
  { label: 'Owner drawings (cash)', narration: 'Drawings', lines: [['drawings', 'debit'], ['cash', 'credit']] },
  { label: 'GST paid to government', narration: 'GST paid (GSTR-3B)', lines: [['outputCgst', 'debit'], ['outputSgst', 'debit'], ['outputIgst', 'debit'], ['bank', 'credit']] },
];

// Accounts → Journal Voucher: any entry that bills / expenses don't cover —
// capital, loans, bank deposits, GST paid, depreciation, corrections.
// Debits must equal credits before it can be saved.
const Journals = () => {
  const formRef = useRef(null);
  const [chart, setChart] = useState([]);
  const [parties, setParties] = useState({ customers: [], suppliers: [] });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [list, setList] = useState([]);
  const [range, setRange] = useState({ startDate: firstOfMonth(), endDate: todayString() });
  const [status, setStatus] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJson(`/api/accounting/chart?endDate=${todayString()}`).then((r) => setChart(r.accounts)).catch(() => {});
    Promise.all([fetchJson('/api/customers').catch(() => []), fetchJson('/api/suppliers').catch(() => [])])
      .then(([customers, suppliers]) => setParties({ customers, suppliers }));
  }, []);
  const load = useCallback(() => {
    const params = new URLSearchParams(Object.entries(range).filter(([, v]) => v));
    return fetchJson(`/api/accounting/journals?${params}`).then(setList).catch((error) => setStatus({ type: 'error', text: error.message }));
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const byKey = useMemo(() => Object.fromEntries(chart.map((a) => [a.key, a])), [chart]);
  const groups = [['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Equity / capital'], ['income', 'Income'], ['expense', 'Expenses']];

  const totals = useMemo(() => {
    const debit = r2(form.lines.reduce((t, l) => t + (Number(l.debit) || 0), 0));
    const credit = r2(form.lines.reduce((t, l) => t + (Number(l.credit) || 0), 0));
    return { debit, credit, diff: r2(debit - credit) };
  }, [form.lines]);

  const setLine = (index, key, value) => setForm((f) => ({
    ...f,
    lines: f.lines.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, [key]: value };
      // A line is either a debit or a credit.
      if (key === 'debit' && value) next.credit = '';
      if (key === 'credit' && value) next.debit = '';
      if (key === 'account' && !PARTY_ACCOUNTS.includes(value)) next.party = '';
      return next;
    }),
  }));
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (index) => setForm((f) => ({ ...f, lines: f.lines.length > 2 ? f.lines.filter((_, i) => i !== index) : f.lines }));
  const applyTemplate = (label) => {
    const t = TEMPLATES.find((x) => x.label === label);
    if (!t) return;
    setForm((f) => ({ ...f, narration: t.narration, lines: t.lines.map(([account]) => ({ ...emptyLine(), account })) }));
  };
  const reset = () => { setForm(emptyForm()); setEditingId(null); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, lines: form.lines.filter((l) => l.account || l.debit || l.credit).map((l) => ({ ...l, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) };
      const saved = await fetchJson(editingId ? `/api/accounting/journals/${editingId}` : '/api/accounting/journals', {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setStatus({ type: 'success', text: `Journal ${saved.number} ${editingId ? 'updated' : 'saved'} — ₹${amount(saved.total)}.` });
      reset();
      load();
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const edit = (j) => {
    setEditingId(j._id);
    setForm({ date: toDate(j.date), narration: j.narration || '', lines: j.lines.map((l) => ({ account: l.account, party: l.party || '', debit: l.debit || '', credit: l.credit || '' })) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (j) => {
    if (!window.confirm(`Delete journal ${j.number}?`)) return;
    try {
      await fetchJson(`/api/accounting/journals/${j._id}`, { method: 'DELETE' });
      if (editingId === j._id) reset();
      load();
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    }
  };

  // F2 new, Ctrl+S save, F8 open the last journal for editing.
  useEntryShortcuts({
    isDirty: form.lines.some((l) => l.debit || l.credit),
    confirmNew: 'Discard this unsaved journal and start a new one?',
    onNew: () => { reset(); setTimeout(() => formRef.current?.querySelector('input')?.focus(), 0); },
    onSave: () => formRef.current?.requestSubmit(),
    onOpenLast: () => fetchLatest('/api/accounting/journals', 'No journals saved yet.').then(edit).catch((error) => setStatus({ type: 'error', text: error.message })),
  });

  return (
    <main className="acc-page books-page">
      <section className="acc-card">
        <p className="books-back"><Link to="/chart-of-accounts">Chart of accounts</Link> · <Link to="/expenses">Expenses</Link></p>
        <h1>{editingId ? 'Edit journal voucher' : 'Journal voucher'}</h1>
        <p className="acc-sub">For entries bills and expenses don't cover: capital, loans, bank deposits / withdrawals, GST paid, depreciation, corrections. Total debit must equal total credit.</p>
        <form ref={formRef} onSubmit={save}>
          <div className="acc-form">
            <label className="acc-field"><span>Date *</span><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></label>
            <label className="acc-field"><span>Narration</span><input value={form.narration} onChange={(e) => setForm((f) => ({ ...f, narration: e.target.value }))} /></label>
            <label className="acc-field"><span>Quick fill</span>
              <select value="" onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Choose a common entry…</option>
                {TEMPLATES.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <div className="acc-table-wrap" style={{ marginTop: 10 }}>
            <table className="acc-table jv-lines">
              <thead><tr><th style={{ width: '38%' }}>Account</th><th>Customer / supplier</th><th className="num">Debit</th><th className="num">Credit</th><th /></tr></thead>
              <tbody>
                {form.lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select value={l.account} onChange={(e) => setLine(i, 'account', e.target.value)}>
                        <option value="">Select account…</option>
                        {groups.map(([g, label]) => (
                          <optgroup key={g} label={label}>
                            {chart.filter((a) => a.group === g && (a.active !== false || a.key === l.account)).map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td>
                      {PARTY_ACCOUNTS.includes(l.account) ? (
                        <input list={l.account === 'debtors' ? 'jv-customers' : 'jv-suppliers'} value={l.party} placeholder={l.account === 'debtors' ? 'Customer' : 'Supplier'} onChange={(e) => setLine(i, 'party', e.target.value)} />
                      ) : <span className="books-muted">—</span>}
                    </td>
                    <td><input type="number" min="0" step="0.01" value={l.debit} onChange={(e) => setLine(i, 'debit', e.target.value)} /></td>
                    <td><input type="number" min="0" step="0.01" value={l.credit} onChange={(e) => setLine(i, 'credit', e.target.value)} /></td>
                    <td className="acc-row-actions"><button type="button" className="danger" onClick={() => removeLine(i)} disabled={form.lines.length <= 2}>✕</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><button type="button" onClick={addLine}>+ Add line</button></td>
                  <td>{totals.diff ? <span className="jv-diff">Difference {amount(Math.abs(totals.diff))} {totals.diff > 0 ? 'more debit' : 'more credit'}</span> : totals.debit ? <span className="jv-ok">✓ Balanced</span> : null}</td>
                  <td className="num">{amount(totals.debit)}</td>
                  <td className="num">{amount(totals.credit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <datalist id="jv-customers">{parties.customers.map((c) => <option key={c._id} value={c.name} />)}</datalist>
          <datalist id="jv-suppliers">{parties.suppliers.map((s) => <option key={s._id} value={s.name} />)}</datalist>
          <div className="acc-actions" style={{ marginTop: 10 }}>
            <button type="submit" disabled={saving || Boolean(totals.diff) || !totals.debit} title="Ctrl+S">{saving ? 'Saving…' : editingId ? 'Update journal' : 'Save journal'}</button>
            <button type="button" className="secondary" title="F2" onClick={reset}>{editingId ? 'Cancel edit' : 'Clear'}</button>
          </div>
        </form>
        <ShortcutHint entry="journal" print={false} />
        {status.text && <p className={`acc-status ${status.type}`}>{status.text}</p>}
      </section>

      <section className="acc-card">
        <h1>Journal vouchers</h1>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label className="acc-field"><span>From</span><input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} /></label>
          <label className="acc-field"><span>To</span><input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} /></label>
          <div className="acc-actions"><button type="submit">Show</button></div>
        </form>
        <div className="acc-table-wrap" style={{ marginTop: 12 }}>
          <table className="acc-table books-table">
            <thead><tr><th>No.</th><th>Date</th><th>Narration</th><th>Entries</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center' }}>No journals in this period.</td></tr>
              ) : list.map((j) => (
                <tr key={j._id}>
                  <td>{j.number}</td>
                  <td>{formatDate(j.date)}</td>
                  <td>{j.narration || '—'}</td>
                  <td className="books-muted">
                    {j.lines.map((l, i) => (
                      <div key={i}>{l.debit ? 'Dr' : 'Cr'} {byKey[l.account]?.name || l.account}{l.party ? ` (${l.party})` : ''} — {amount(l.debit || l.credit)}</div>
                    ))}
                  </td>
                  <td className="num">{amount(j.total)}</td>
                  <td className="acc-row-actions">
                    <button type="button" onClick={() => edit(j)}>edit</button>
                    <button type="button" className="danger" onClick={() => remove(j)}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
};

export default Journals;
