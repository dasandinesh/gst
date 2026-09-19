import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import './accounts.css';

const toDateInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};
const money = (n) => Number(n || 0).toFixed(2);

const SupplierLedger = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [invoiceSetting, setInvoiceSetting] = useState(null);
  const [query, setQuery] = useState({ supplier: '', startDate: '', endDate: '' });
  const [ledger, setLedger] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetchJson('/api/suppliers').then(setSuppliers).catch(() => {});
    fetchJson('/api/invoice-settings/active').then(setInvoiceSetting).catch(() => setInvoiceSetting(null));
  }, []);

  const load = useCallback(async () => {
    if (!query.supplier.trim()) { setStatus('Pick a supplier.'); return; }
    setStatus('Loading…');
    const params = new URLSearchParams({ supplier: query.supplier.trim() });
    if (query.startDate) params.set('startDate', query.startDate);
    if (query.endDate) params.set('endDate', query.endDate);
    try {
      const data = await fetchJson(`/api/ledger/supplier?${params}`);
      setLedger(data);
      setStatus(data.entries.length ? '' : 'No transactions in this period.');
    } catch (error) {
      setLedger(null);
      setStatus(error.message);
    }
  }, [query]);

  const printLedger = () => {
    if (!ledger) return;
    const shop = invoiceSetting || {};
    const cells = [shop.phone, shop.phone_2].filter(Boolean).map((p) => `Cell : ${p}`).join(' &nbsp; ');
    const rows = ledger.entries.map((e) => `
      <tr>
        <td>${toDateInput(e.date)}</td>
        <td>${e.particulars}</td>
        <td class="r">${e.debit ? money(e.debit) : ''}</td>
        <td class="r">${e.credit ? money(e.credit) : ''}</td>
        <td class="r">${money(e.balance)}</td>
      </tr>`).join('');
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) { alert('Please allow popups to print.'); return; }
    win.document.write(`
      <html><head><title>Ledger — ${ledger.supplier.name}</title><style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #000; }
        h2 { margin: 0; font-family: Georgia, serif; }
        .head { display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
        .who { margin: 8px 0; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 4px 6px; }
        th { background: #eee; }
        .r { text-align: right; }
        tfoot td { font-weight: bold; }
      </style></head><body>
        <div class="head">
          <div><h2>${shop.name || ''}</h2><div>${shop.area || ''}</div></div>
          <div class="r" style="font-weight:bold">${cells}</div>
        </div>
        <div class="who">
          <b>Ledger: ${ledger.supplier.name}</b>${ledger.supplier.phone ? ` &nbsp; ${ledger.supplier.phone}` : ''}<br/>
          ${query.startDate || query.endDate ? `Period: ${query.startDate || '…'} to ${query.endDate || '…'}` : 'All transactions'}
        </div>
        <table>
          <thead><tr><th>Date</th><th>Particulars</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead>
          <tbody>
            <tr><td></td><td><b>Opening balance</b></td><td class="r"></td><td class="r"></td><td class="r">${money(ledger.opening)}</td></tr>
            ${rows}
          </tbody>
          <tfoot>
            <tr><td colspan="2" class="r">Total</td><td class="r">${money(ledger.totalDebit)}</td><td class="r">${money(ledger.totalCredit)}</td><td class="r"></td></tr>
            <tr><td colspan="4" class="r">Closing balance (payable)</td><td class="r">${money(ledger.closing)}</td></tr>
          </tfoot>
        </table>
        <script>window.onload = function () { window.print(); }</script>
      </body></html>
    `);
    win.document.close();
    win.focus();
  };

  return (
    <main className="acc-page">
      <section className="acc-card">
        <h1>Supplier ledger</h1>
        <p className="acc-sub">Opening balance + purchases billed (credit) − payments &amp; debit notes (debit) = balance payable.</p>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label className="acc-field"><span>Supplier *</span>
            <input list="ledger-suppliers" value={query.supplier} onChange={(e) => setQuery({ ...query, supplier: e.target.value })} />
          </label>
          <label className="acc-field"><span>From</span>
            <input type="date" value={query.startDate} onChange={(e) => setQuery({ ...query, startDate: e.target.value })} />
          </label>
          <label className="acc-field"><span>To</span>
            <input type="date" value={query.endDate} onChange={(e) => setQuery({ ...query, endDate: e.target.value })} />
          </label>
          <div className="acc-actions">
            <button type="submit">Show</button>
            {ledger && <button type="button" className="secondary" onClick={printLedger}>Print</button>}
          </div>
        </form>
        <datalist id="ledger-suppliers">
          {suppliers.map((s) => <option key={s._id} value={s.name} />)}
        </datalist>
        {status && <p className="acc-status error">{status}</p>}
      </section>

      {ledger && (
        <section className="acc-card">
          <h1>{ledger.supplier.name}{ledger.supplier.phone ? ` · ${ledger.supplier.phone}` : ''}</h1>
          <div className="acc-table-wrap">
            <table className="acc-table">
              <thead>
                <tr><th>Date</th><th>Particulars</th><th>Ref</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                <tr><td /><td><b>Opening balance</b></td><td /><td className="num" /><td className="num" /><td className="num">{money(ledger.opening)}</td></tr>
                {ledger.entries.map((e, i) => (
                  <tr key={i}>
                    <td>{toDateInput(e.date)}</td>
                    <td>{e.particulars}</td>
                    <td>{e.ref || '—'}</td>
                    <td className="num">{e.debit ? money(e.debit) : ''}</td>
                    <td className="num">{e.credit ? money(e.credit) : ''}</td>
                    <td className="num">{money(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan="3" className="num">Total</td><td className="num">{money(ledger.totalDebit)}</td><td className="num">{money(ledger.totalCredit)}</td><td className="num" /></tr>
                <tr><td colSpan="5" className="num">Closing balance (payable)</td><td className="num">{money(ledger.closing)}</td></tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </main>
  );
};

export default SupplierLedger;
