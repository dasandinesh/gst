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

const emptyPayment = { payment_no: '', date: todayString(), supplierName: '', amount: '', mode: 'cash', note: '' };

const PaymentEntry = () => {
  const [payments, setPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [invoiceSetting, setInvoiceSetting] = useState(null);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [filter, setFilter] = useState({ supplier: '', startDate: '', endDate: '' });
  const [editing, setEditing] = useState(null);

  const createForm = useForm({ defaultValues: emptyPayment });
  const editForm = useForm({ defaultValues: emptyPayment });

  const loadPayments = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter.supplier) params.set('supplier', filter.supplier);
    if (filter.startDate) params.set('startDate', filter.startDate);
    if (filter.endDate) params.set('endDate', filter.endDate);
    try {
      setPayments(await fetchJson(`/api/payments${params.toString() ? `?${params}` : ''}`));
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  }, [filter]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  useEffect(() => {
    fetchJson('/api/suppliers').then(setSuppliers).catch(() => {});
    fetchJson('/api/invoice-settings/active').then(setInvoiceSetting).catch(() => setInvoiceSetting(null));
  }, []);

  const total = useMemo(() => payments.reduce((t, p) => t + Number(p.amount || 0), 0), [payments]);

  const toPayload = (values) => ({
    payment_no: values.payment_no || undefined,
    date: values.date,
    supplier: { name: values.supplierName },
    amount: Number(values.amount || 0),
    mode: values.mode,
    note: values.note,
  });

  const createPayment = async (values) => {
    setStatus({ type: '', message: '' });
    try {
      const saved = await fetchJson('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(values)),
      });
      createForm.reset(emptyPayment);
      setStatus({ type: 'success', message: `Payment ${saved.payment_no} saved.` });
      loadPayments();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const openEdit = (payment) => {
    setStatus({ type: '', message: '' });
    setEditing(payment);
    editForm.reset({
      payment_no: payment.payment_no || '',
      date: toDateInput(payment.date),
      supplierName: payment.supplier?.name || '',
      amount: payment.amount ?? '',
      mode: payment.mode || 'cash',
      note: payment.note || '',
    });
  };

  const saveEdit = async (values) => {
    try {
      await fetchJson(`/api/payments/${editing._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(values)),
      });
      setEditing(null);
      setStatus({ type: 'success', message: 'Payment updated.' });
      loadPayments();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const removePayment = async (payment) => {
    if (!window.confirm(`Delete payment ${payment.payment_no}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/payments/${payment._id}`, { method: 'DELETE' });
      setStatus({ type: 'success', message: 'Payment deleted.' });
      loadPayments();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const printPayment = (payment) => {
    const shop = invoiceSetting || {};
    const address = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode].filter(Boolean).join(', ');
    const cells = [shop.phone, shop.phone_2].filter(Boolean).map((p) => `Cell : ${p}`).join('<br/>');
    const win = window.open('', '_blank', 'width=640,height=760');
    if (!win) { alert('Please allow popups to print.'); return; }
    win.document.write(`
      <html><head><title>Payment ${payment.payment_no || ''}</title><style>
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
          <h2>PAYMENT VOUCHER</h2>
          <div class="row"><span>No: <b>${payment.payment_no || ''}</b></span><span>Date: <b>${toDateInput(payment.date)}</b></span></div>
          <div class="row"><span>Paid to</span><b>${payment.supplier?.name || ''}</b></div>
          <div class="row"><span>Mode</span><b>${(payment.mode || '').toUpperCase()}</b></div>
          ${payment.note ? `<div class="row"><span>Note</span><b>${payment.note}</b></div>` : ''}
          <div class="amount-box">Rs. ${money(payment.amount)}</div>
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
        <h1>New payment</h1>
        <p className="acc-sub">Record money paid to a supplier. It posts to their ledger as a debit, reducing what you owe.</p>
        <form className="acc-form" onSubmit={createForm.handleSubmit(createPayment)}>
          <label className="acc-field"><span>Payment No.</span>
            <input placeholder="Auto" {...createForm.register('payment_no')} />
          </label>
          <label className="acc-field"><span>Date</span>
            <input type="date" {...createForm.register('date')} />
          </label>
          <label className="acc-field"><span>Supplier *</span>
            <input list="payment-suppliers" {...createForm.register('supplierName', { required: 'Supplier is required.' })} />
            {createForm.formState.errors.supplierName && <small>{createForm.formState.errors.supplierName.message}</small>}
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
            <button type="submit">Save payment</button>
            <button type="button" className="secondary" onClick={() => createForm.reset(emptyPayment)}>Clear</button>
          </div>
        </form>
        <datalist id="payment-suppliers">
          {suppliers.map((s) => <option key={s._id} value={s.name} />)}
        </datalist>
        {status.message && <p className={`acc-status ${status.type}`}>{status.message}</p>}
      </section>

      <section className="acc-card">
        <h1>Payments</h1>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); loadPayments(); }}>
          <label className="acc-field"><span>Supplier</span>
            <input list="payment-suppliers" value={filter.supplier} onChange={(e) => setFilter({ ...filter, supplier: e.target.value })} />
          </label>
          <label className="acc-field"><span>From</span>
            <input type="date" value={filter.startDate} onChange={(e) => setFilter({ ...filter, startDate: e.target.value })} />
          </label>
          <label className="acc-field"><span>To</span>
            <input type="date" value={filter.endDate} onChange={(e) => setFilter({ ...filter, endDate: e.target.value })} />
          </label>
          <div className="acc-actions">
            <button type="submit">Filter</button>
            <button type="button" className="secondary" onClick={() => setFilter({ supplier: '', startDate: '', endDate: '' })}>Reset</button>
          </div>
        </form>

        <div className="acc-table-wrap" style={{ marginTop: 12 }}>
          <table className="acc-table">
            <thead>
              <tr><th>No.</th><th>Date</th><th>Supplier</th><th>Mode</th><th>Note</th><th className="num">Amount</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center' }}>No payments.</td></tr>
              ) : payments.map((p) => (
                <tr key={p._id}>
                  <td>{p.payment_no || '—'}</td>
                  <td>{toDateInput(p.date)}</td>
                  <td>{p.supplier?.name || '—'}</td>
                  <td>{p.mode || '—'}</td>
                  <td>{p.note || '—'}</td>
                  <td className="num">{money(p.amount)}</td>
                  <td className="acc-row-actions">
                    <button type="button" onClick={() => printPayment(p)}>print</button>
                    <button type="button" onClick={() => openEdit(p)}>edit</button>
                    <button type="button" className="danger" onClick={() => removePayment(p)}>delete</button>
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
            <h2>Edit payment {editing.payment_no}</h2>
            <form className="acc-form" onSubmit={editForm.handleSubmit(saveEdit)}>
              <label className="acc-field"><span>Payment No.</span><input {...editForm.register('payment_no')} /></label>
              <label className="acc-field"><span>Date</span><input type="date" {...editForm.register('date')} /></label>
              <label className="acc-field"><span>Supplier *</span>
                <input list="payment-suppliers" {...editForm.register('supplierName', { required: 'Supplier is required.' })} />
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

export default PaymentEntry;
