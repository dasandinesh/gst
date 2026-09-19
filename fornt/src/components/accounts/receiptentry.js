import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import './accounts.css';

const MODES = ['cash', 'bank', 'upi', 'cheque'];

const todayString = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().split('T')[0];
};
const toDateInput = (value) => {
  if (!value) return todayString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return todayString();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};
const money = (n) => Number(n || 0).toFixed(2);

const emptyReceipt = { receipt_no: '', date: todayString(), customerName: '', amount: '', mode: 'cash', note: '' };

const ReceiptEntry = () => {
  const [receipts, setReceipts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoiceSetting, setInvoiceSetting] = useState(null);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [filter, setFilter] = useState({ customer: '', startDate: '', endDate: '' });
  const [editing, setEditing] = useState(null);

  const createForm = useForm({ defaultValues: emptyReceipt });
  const editForm = useForm({ defaultValues: emptyReceipt });

  const loadReceipts = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter.customer) params.set('customer', filter.customer);
    if (filter.startDate) params.set('startDate', filter.startDate);
    if (filter.endDate) params.set('endDate', filter.endDate);
    try {
      setReceipts(await fetchJson(`/api/receipts${params.toString() ? `?${params}` : ''}`));
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  }, [filter]);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  useEffect(() => {
    fetchJson('/api/customers').then(setCustomers).catch(() => {});
    fetchJson('/api/invoice-settings/active').then(setInvoiceSetting).catch(() => setInvoiceSetting(null));
  }, []);

  const total = useMemo(() => receipts.reduce((t, r) => t + Number(r.amount || 0), 0), [receipts]);

  const toPayload = (values) => ({
    receipt_no: values.receipt_no || undefined,
    date: values.date,
    customer: { name: values.customerName },
    amount: Number(values.amount || 0),
    mode: values.mode,
    note: values.note,
  });

  const createReceipt = async (values) => {
    setStatus({ type: '', message: '' });
    try {
      const saved = await fetchJson('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(values)),
      });
      createForm.reset(emptyReceipt);
      setStatus({ type: 'success', message: `Receipt ${saved.receipt_no} saved.` });
      loadReceipts();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const openEdit = (receipt) => {
    setStatus({ type: '', message: '' });
    setEditing(receipt);
    editForm.reset({
      receipt_no: receipt.receipt_no || '',
      date: toDateInput(receipt.date),
      customerName: receipt.customer?.name || '',
      amount: receipt.amount ?? '',
      mode: receipt.mode || 'cash',
      note: receipt.note || '',
    });
  };

  const saveEdit = async (values) => {
    try {
      await fetchJson(`/api/receipts/${editing._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(values)),
      });
      setEditing(null);
      setStatus({ type: 'success', message: 'Receipt updated.' });
      loadReceipts();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const removeReceipt = async (receipt) => {
    if (!window.confirm(`Delete receipt ${receipt.receipt_no}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/receipts/${receipt._id}`, { method: 'DELETE' });
      setStatus({ type: 'success', message: 'Receipt deleted.' });
      loadReceipts();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const printReceipt = (receipt) => {
    const shop = invoiceSetting || {};
    const address = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode].filter(Boolean).join(', ');
    const cells = [shop.phone, shop.phone_2].filter(Boolean).map((p) => `Cell : ${p}`).join('<br/>');
    const win = window.open('', '_blank', 'width=640,height=760');
    if (!win) { alert('Please allow popups to print.'); return; }
    win.document.write(`
      <html><head><title>Receipt ${receipt.receipt_no || ''}</title><style>
        @page { size: A5; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #000; font-size: 13px; margin: 0; }
        .box { border: 1px solid #000; padding: 14px; }
        .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #000; padding-bottom: 8px; }
        .name { font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: bold; }
        .area { font-weight: bold; }
        .cell { text-align: right; font-weight: bold; font-size: 11px; }
        h2 { text-align: center; letter-spacing: 3px; margin: 12px 0; font-size: 16px; }
        .row { display: flex; justify-content: space-between; margin: 6px 0; }
        .amount-box { margin-top: 14px; padding: 8px; border: 1px solid #000; font-size: 16px; font-weight: bold; text-align: center; }
        .sign { margin-top: 40px; text-align: right; font-weight: bold; }
        .foot { text-align: center; font-style: italic; margin-top: 12px; font-size: 11px; }
      </style></head><body>
        <div class="box">
          <div class="top">
            <div>
              <div class="name">${shop.name || ''}</div>
              <div class="area">${shop.area || ''}</div>
              ${address ? `<div style="font-size:11px">${address}</div>` : ''}
            </div>
            <div class="cell">${cells}</div>
          </div>
          <h2>RECEIPT</h2>
          <div class="row"><span>No: <b>${receipt.receipt_no || ''}</b></span><span>Date: <b>${toDateInput(receipt.date)}</b></span></div>
          <div class="row"><span>Received from</span><b>${receipt.customer?.name || ''}</b></div>
          <div class="row"><span>Mode</span><b>${(receipt.mode || '').toUpperCase()}</b></div>
          ${receipt.note ? `<div class="row"><span>Note</span><b>${receipt.note}</b></div>` : ''}
          <div class="amount-box">Rs. ${money(receipt.amount)}</div>
          <div class="sign">Signature</div>
          ${shop.fooder ? `<div class="foot">${shop.fooder}</div>` : ''}
        </div>
        <script>window.onload = function () { window.print(); }</script>
      </body></html>
    `);
    win.document.close();
    win.focus();
  };

  return (
    <main className="acc-page">
      <section className="acc-card">
        <h1>New receipt</h1>
        <p className="acc-sub">Record money received from a customer. It posts to their ledger as a credit.</p>
        <form className="acc-form" onSubmit={createForm.handleSubmit(createReceipt)}>
          <label className="acc-field"><span>Receipt No.</span>
            <input placeholder="Auto" {...createForm.register('receipt_no')} />
          </label>
          <label className="acc-field"><span>Date</span>
            <input type="date" {...createForm.register('date')} />
          </label>
          <label className="acc-field"><span>Customer *</span>
            <input list="receipt-customers" {...createForm.register('customerName', { required: 'Customer is required.' })} />
            {createForm.formState.errors.customerName && <small>{createForm.formState.errors.customerName.message}</small>}
          </label>
          <label className="acc-field"><span>Amount *</span>
            <input type="number" step="0.01" min="0" {...createForm.register('amount', { required: 'Amount is required.', min: { value: 0.01, message: 'Must be greater than 0.' } })} />
            {createForm.formState.errors.amount && <small>{createForm.formState.errors.amount.message}</small>}
          </label>
          <label className="acc-field"><span>Mode</span>
            <select {...createForm.register('mode')}>{MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </label>
          <label className="acc-field"><span>Note</span>
            <input {...createForm.register('note')} />
          </label>
          <div className="acc-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="submit">Save receipt</button>
            <button type="button" className="secondary" onClick={() => createForm.reset(emptyReceipt)}>Clear</button>
          </div>
        </form>
        <datalist id="receipt-customers">
          {customers.map((c) => <option key={c._id} value={c.name} />)}
        </datalist>
        {status.message && <p className={`acc-status ${status.type}`}>{status.message}</p>}
      </section>

      <section className="acc-card">
        <h1>Receipts</h1>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); loadReceipts(); }}>
          <label className="acc-field"><span>Customer</span>
            <input list="receipt-customers" value={filter.customer} onChange={(e) => setFilter({ ...filter, customer: e.target.value })} />
          </label>
          <label className="acc-field"><span>From</span>
            <input type="date" value={filter.startDate} onChange={(e) => setFilter({ ...filter, startDate: e.target.value })} />
          </label>
          <label className="acc-field"><span>To</span>
            <input type="date" value={filter.endDate} onChange={(e) => setFilter({ ...filter, endDate: e.target.value })} />
          </label>
          <div className="acc-actions">
            <button type="submit">Filter</button>
            <button type="button" className="secondary" onClick={() => setFilter({ customer: '', startDate: '', endDate: '' })}>Reset</button>
          </div>
        </form>

        <div className="acc-table-wrap" style={{ marginTop: 12 }}>
          <table className="acc-table">
            <thead>
              <tr><th>No.</th><th>Date</th><th>Customer</th><th>Mode</th><th>Note</th><th className="num">Amount</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center' }}>No receipts.</td></tr>
              ) : receipts.map((r) => (
                <tr key={r._id}>
                  <td>{r.receipt_no || '—'}</td>
                  <td>{toDateInput(r.date)}</td>
                  <td>{r.customer?.name || '—'}</td>
                  <td>{r.mode || '—'}</td>
                  <td>{r.note || '—'}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td className="acc-row-actions">
                    <button type="button" onClick={() => printReceipt(r)}>print</button>
                    <button type="button" onClick={() => openEdit(r)}>edit</button>
                    <button type="button" className="danger" onClick={() => removeReceipt(r)}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan="5">Total</td><td className="num">{money(total)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      </section>

      {editing && (
        <div className="acc-modal-backdrop" onMouseDown={() => setEditing(null)}>
          <div className="acc-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Edit receipt {editing.receipt_no}</h2>
            <form className="acc-form" onSubmit={editForm.handleSubmit(saveEdit)}>
              <label className="acc-field"><span>Receipt No.</span><input {...editForm.register('receipt_no')} /></label>
              <label className="acc-field"><span>Date</span><input type="date" {...editForm.register('date')} /></label>
              <label className="acc-field"><span>Customer *</span>
                <input list="receipt-customers" {...editForm.register('customerName', { required: 'Customer is required.' })} />
              </label>
              <label className="acc-field"><span>Amount *</span>
                <input type="number" step="0.01" min="0" {...editForm.register('amount', { required: true, min: 0.01 })} />
              </label>
              <label className="acc-field"><span>Mode</span>
                <select {...editForm.register('mode')}>{MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
              </label>
              <label className="acc-field"><span>Note</span><input {...editForm.register('note')} /></label>
              <div className="acc-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="submit">Save changes</button>
                <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};

export default ReceiptEntry;
