import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJson } from '../../api';
import '../sale/gstbillentry.css';
import './estimateBillEntry.css';
import { buildEstimateDocumentHtml, PAPER_WINDOW } from './estimateBillTemplate';
import { useEntryShortcuts, fetchLatest, ShortcutHint } from '../common/entryShortcuts';

const todayString = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().split('T')[0];
};
const toDateInput = (value) => {
  if (!value) return todayString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return todayString();
  parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
  return parsed.toISOString().split('T')[0];
};
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

// Mirrors the server's math (back/controllers/estimatebillcontroller.js) for a live
// preview — plain quantity x rate, no GST/tax. The server recalculates authoritatively
// on save, so this only drives the on-screen totals.
const computeLine = (item) => {
  const quantity = Number(item.quantity) || 0;
  const rate = Number(item.rate) || 0;
  return {
    ...item,
    quantity,
    rate,
    amount: round2(quantity * rate),
  };
};

const emptyLine = { barcode: '', name: '', quantity: '', unit: '', rate: '' };
const emptyCustomer = { name: '', customerId: '' };
const emptyBillMeta = { estimateNumber: '', date: todayString(), notes: '', cash: 0, credit: 0 };

const EstimateBillEntry = () => {
  const formRef = useRef(null);
  const customerNameRef = useRef(null);
  const barcodeRef = useRef(null);
  const productNameRef = useRef(null);
  const qtyRef = useRef(null);
  const unitRef = useRef(null);
  const priceRef = useRef(null);

  const [customerList, setCustomerList] = useState([]);
  const [productList, setProductList] = useState([]);
  const [invoiceSetting, setInvoiceSetting] = useState(null);

  const [customer, setCustomer] = useState(emptyCustomer);
  const [billMeta, setBillMeta] = useState(emptyBillMeta);
  const [lines, setLines] = useState([]);
  const [currentLine, setCurrentLine] = useState(emptyLine);
  const [editingId, setEditingId] = useState(null);
  const [saveStatus, setSaveStatus] = useState({ type: '', text: '' });
  const [customerWarning, setCustomerWarning] = useState('');
  const [productWarning, setProductWarning] = useState('');

  const [bills, setBills] = useState([]);
  const [billFilter, setBillFilter] = useState({ startDate: todayString(), endDate: todayString(), q: '' });
  const [billsStatus, setBillsStatus] = useState('');
  const [viewBill, setViewBill] = useState(null);

  useEffect(() => {
    fetchJson('/api/estimate-customers').then(setCustomerList).catch(() => setCustomerList([]));
    fetchJson('/api/estimate-products').then(setProductList).catch(() => setProductList([]));
    fetchJson('/api/invoice-settings/active').then(setInvoiceSetting).catch(() => setInvoiceSetting(null));
    customerNameRef.current?.focus();
  }, []);

  // Enter moves focus to the next field instead of submitting the form.
  const focusNextOnEnter = (e, nextRef) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef?.current?.focus();
      nextRef?.current?.select?.();
    }
  };
  // Enter on the last line field adds the line and jumps back to Barcode for the next scan.
  const addLineOnEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddLine();
      setTimeout(() => barcodeRef.current?.focus(), 0);
    }
  };

  const loadBills = useCallback(async () => {
    setBillsStatus('Loading…');
    const params = new URLSearchParams();
    if (billFilter.startDate) params.set('startDate', billFilter.startDate);
    if (billFilter.endDate) params.set('endDate', billFilter.endDate);
    if (billFilter.q.trim()) params.set('q', billFilter.q.trim());
    try {
      const data = await fetchJson(`/api/estimate-bills${params.toString() ? `?${params}` : ''}`);
      setBills(data);
      setBillsStatus(data.length ? '' : 'No estimates for this range.');
    } catch (error) {
      setBills([]);
      setBillsStatus(error.message || 'Unable to load estimates.');
    }
  }, [billFilter.startDate, billFilter.endDate, billFilter.q]);
  useEffect(() => { loadBills(); }, [loadBills]);

  const customerExists = (name) => !name || customerList.some((c) => c.name?.toLowerCase() === name.trim().toLowerCase());
  const productExists = (name) => !name || productList.some((p) => p.name?.toLowerCase() === name.trim().toLowerCase());

  const computedLines = useMemo(() => lines.map((line) => computeLine(line)), [lines]);
  const totals = useMemo(() => {
    const subtotal = round2(computedLines.reduce((sum, l) => sum + l.amount, 0));
    const grandTotal = Math.round(subtotal);
    const roundOff = round2(grandTotal - subtotal);
    return { subtotal, roundOff, grandTotal };
  }, [computedLines]);
  const balanceDue = round2(totals.grandTotal - (Number(billMeta.cash) || 0) - (Number(billMeta.credit) || 0));

  const handleCustomerNameChange = (value) => {
    setCustomer((c) => ({ ...c, name: value }));
    if (customerWarning) setCustomerWarning('');
  };
  const handleCustomerBlur = (value) => {
    const known = customerExists(value);
    setCustomerWarning(known ? '' : 'This customer is not in the list. Please add the customer first.');
    if (!known) return;
    const match = customerList.find((c) => c.name?.toLowerCase() === value.trim().toLowerCase());
    if (!match) return;
    setCustomer((c) => ({ ...c, name: match.name, customerId: match._id || '' }));
  };

  const handleProductNameChange = (value) => {
    if (productWarning) setProductWarning('');
    const match = productList.find((p) => p.name === value);
    if (match) {
      setCurrentLine({
        barcode: match.barcode || '',
        name: match.name,
        quantity: currentLine.quantity,
        unit: match.unit || '',
        rate: match.price ?? '',
      });
    } else {
      setCurrentLine((line) => ({ ...line, name: value }));
    }
  };

  // Scanning (or typing + Enter) a barcode looks the product up by its exact barcode
  // and fills in the line, so billing can run off a barcode scanner end to end.
  const handleBarcodeChange = (value) => {
    setCurrentLine((line) => ({ ...line, barcode: value }));
    if (productWarning) setProductWarning('');
  };
  const handleBarcodeEnter = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = (currentLine.barcode || '').trim();
    if (!value) { productNameRef.current?.focus(); return; }
    const match = productList.find((p) => p.barcode && p.barcode.trim().toLowerCase() === value.toLowerCase());
    if (!match) {
      setProductWarning(`No product found for barcode "${value}".`);
      return;
    }
    setCurrentLine({
      barcode: match.barcode || value,
      name: match.name,
      quantity: currentLine.quantity,
      unit: match.unit || '',
      rate: match.price ?? '',
    });
    setProductWarning('');
    setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select?.(); }, 0);
  };

  const handleAddLine = () => {
    if (!productExists(currentLine.name)) {
      setProductWarning('This product is not in the list. Please add the product first.');
      return;
    }
    if (!currentLine.name || !Number(currentLine.quantity)) {
      alert('Product name and quantity are required.');
      return;
    }
    setLines((prev) => [...prev, { ...currentLine }]);
    setCurrentLine(emptyLine);
  };
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));

  const resetForm = () => {
    setEditingId(null);
    setCustomer(emptyCustomer);
    setBillMeta(emptyBillMeta);
    setLines([]);
    setCurrentLine(emptyLine);
    setSaveStatus({ type: '', text: '' });
    setCustomerWarning('');
    setProductWarning('');
  };

  const loadBillForEdit = (bill) => {
    setEditingId(bill._id);
    setCustomer({
      name: bill.customer?.name || '',
      customerId: bill.customer?.customerId || '',
    });
    setBillMeta({
      estimateNumber: bill.billDetails?.estimateNumber || '',
      date: toDateInput(bill.billDetails?.date),
      notes: bill.billDetails?.notes || '',
      cash: bill.billDetails?.cash || 0,
      credit: bill.billDetails?.credit || 0,
    });
    setLines((bill.items || []).map((p) => ({
      name: p.name || '', quantity: p.quantity ?? '', unit: p.unit || '', rate: p.rate ?? '',
    })));
    setSaveStatus({ type: '', text: '' });
    setCustomerWarning('');
    setProductWarning('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Shared save logic — used by both the bottom form-submit Save button (no prompt)
  // and the quick Save button next to "Add" in the line-entry row (asks to confirm first).
  const performSave = async () => {
    setSaveStatus({ type: '', text: '' });
    if (!customerExists(customer.name)) {
      setCustomerWarning('This customer is not in the list. Please add the customer first.');
      return;
    }
    if (!lines.length) {
      setSaveStatus({ type: 'error', text: 'Add at least one product before saving the estimate.' });
      return;
    }
    const payload = {
      customer: { name: customer.name, customerId: customer.customerId || undefined },
      items: lines,
      billDetails: { ...billMeta },
    };
    try {
      const saved = editingId
        ? await fetchJson(`/api/estimate-bills/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetchJson('/api/estimate-bills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setSaveStatus({ type: 'success', text: `Estimate ${saved.billDetails?.estimateNumber || ''} ${editingId ? 'updated' : 'saved'} successfully.` });
      resetForm();
      loadBills();
    } catch (error) {
      setSaveStatus({ type: 'error', text: error.message || 'Unable to save estimate.' });
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    await performSave();
  };

  // Quick-save button next to "Add" — confirms before saving so a stray click
  // mid-entry doesn't submit the bill by accident.
  const handleQuickSave = async () => {
    if (!window.confirm(`${editingId ? 'Update' : 'Save'} this estimate now?`)) return;
    await performSave();
  };

  const deleteBill = async (bill) => {
    if (!window.confirm(`Delete estimate ${bill.billDetails?.estimateNumber}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/estimate-bills/${bill._id}`, { method: 'DELETE' });
      if (editingId === bill._id) resetForm();
      loadBills();
    } catch (error) {
      setBillsStatus(error.message || 'Unable to delete estimate.');
    }
  };

  // Layout/styling lives in ./estimateBillTemplate.js — edit that to change how a
  // printed estimate looks. This just opens the window (synchronously, so popup
  // blockers don't catch it) and fills it in once the estimate HTML is built;
  // the template's own onload triggers window.print().
  // `billOrLoader`: an estimate, or an async function that fetches one (Ctrl+P "print last").
  const printBill = async (billOrLoader, size = 'A4') => {
    const { width, height } = PAPER_WINDOW[size] || PAPER_WINDOW.A4;
    const win = window.open('', '_blank', `width=${width},height=${height}`);
    if (!win) { alert('Please allow popups to print the estimate.'); return; }
    win.document.write('<p style="font-family:sans-serif;padding:20px;">Preparing estimate…</p>');
    try {
      const bill = typeof billOrLoader === 'function' ? await billOrLoader() : billOrLoader;
      const customerRecord = customerList.find((c) => c.name?.toLowerCase() === (bill.customer?.name || '').trim().toLowerCase());
      const html = await buildEstimateDocumentHtml(bill, invoiceSetting || {}, customerRecord || null, size);
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
    } catch (error) {
      win.document.open();
      win.document.write(`<p style="font-family:sans-serif;padding:20px;color:#a12d27;">Unable to build the estimate: ${error.message}</p>`);
      win.document.close();
    }
  };

  // Keyboard shortcuts (common/entryShortcuts.js): F2 new, Ctrl+S save,
  // Ctrl+P print (the estimate open in the view popup, else the last one), F8 last estimate.
  const loadLastEstimate = () => fetchLatest('/api/estimate-bills', 'No estimates saved yet.');
  useEntryShortcuts({
    isDirty: lines.length > 0,
    confirmNew: 'Discard this unsaved estimate and start a new one?',
    onNew: () => { setViewBill(null); resetForm(); setTimeout(() => customerNameRef.current?.focus(), 0); },
    onSave: () => { if (!viewBill) formRef.current?.requestSubmit(); },
    onPrint: () => printBill(viewBill || loadLastEstimate, 'A4'),
    onOpenLast: () => loadLastEstimate().then(setViewBill).catch((error) => setSaveStatus({ type: 'error', text: error.message })),
  });

  return (
    <main className="gst-bill-page estimate-bill-page">
    <div className="gst-bill-layout">
      <section className="gst-bill-card">
        <form className="gst-bill-form" ref={formRef} onSubmit={handleSave} noValidate>
          <fieldset>
            <legend>Estimate details</legend>
            <div className="gst-bill-header-row">
              <div className="gst-input-field">
                <label>Customer Name:</label><br />
                <input
                  type="text"
                  className="gst-text-input"
                  list="estimate-customer-list"
                  value={customer.name}
                  ref={customerNameRef}
                  onChange={(e) => handleCustomerNameChange(e.target.value)}
                  onBlur={(e) => handleCustomerBlur(e.target.value)}
                  onKeyDown={(e) => focusNextOnEnter(e, barcodeRef)}
                />
                {customerWarning && <p className="gst-field-warning" role="alert">{customerWarning}</p>}
              </div>
              <datalist id="estimate-customer-list">{customerList.map((c) => <option key={c._id} value={c.name} />)}</datalist>

              <div className="gst-input-field gst-narrow"><label>No:</label><br /><input type="text" className="gst-text-input gst-compact-input" placeholder="Auto" value={billMeta.estimateNumber} onChange={(e) => setBillMeta((m) => ({ ...m, estimateNumber: e.target.value }))} disabled={Boolean(editingId)} /></div>
              <div className="gst-input-field gst-narrow"><label>Date:</label><br /><input type="date" className="gst-text-input gst-compact-input" value={billMeta.date} onChange={(e) => setBillMeta((m) => ({ ...m, date: e.target.value }))} /></div>
            </div>
          </fieldset>

          <fieldset>
            <div className="gst-line-entry">
              <div className="gst-input-field estimate-barcode-field">
                <label>Barcode</label><br />
                <input type="text" className="gst-text-input estimate-barcode-input" placeholder="Scan or type barcode" ref={barcodeRef} value={currentLine.barcode}
                  onChange={(e) => handleBarcodeChange(e.target.value)}
                  onKeyDown={handleBarcodeEnter} />
              </div>
              <div className="gst-input-field">
                <label>item Name</label><br />
                <input type="text" className="gst-text-input textbox-middle estimate-product-input" list="estimate-product-list" ref={productNameRef} value={currentLine.name}
                  onChange={(e) => handleProductNameChange(e.target.value)}
                  onKeyDown={(e) => focusNextOnEnter(e, qtyRef)} />
              </div>
              <datalist id="estimate-product-list">
                {productList.map((p) => <option key={p._id} value={p.name}>{`Godown qty: ${Number(p.mainGodownQuantity || 0)}${p.barcode ? ` · Barcode: ${p.barcode}` : ''}`}</option>)}</datalist>
              <div className="gst-input-field">
                <label>Qty</label><br />
                <input type="number" min="0" step="0.01" className="gst-small-input" ref={qtyRef} value={currentLine.quantity}
                  onChange={(e) => setCurrentLine((l) => ({ ...l, quantity: e.target.value }))}
                  onKeyDown={(e) => focusNextOnEnter(e, unitRef)} />
              </div>
              <div className="gst-input-field">
                <label>Unit</label><br />
                <input type="text" className="gst-small-input" ref={unitRef} value={currentLine.unit}
                  onChange={(e) => setCurrentLine((l) => ({ ...l, unit: e.target.value }))}
                  onKeyDown={(e) => focusNextOnEnter(e, priceRef)} />
              </div>
              <div className="gst-input-field">
                <label>Price</label><br />
                <input type="number" min="0" step="0.01" className="gst-small-input" ref={priceRef} value={currentLine.rate}
                  onChange={(e) => setCurrentLine((l) => ({ ...l, rate: e.target.value }))}
                  onKeyDown={addLineOnEnter} />
              </div>
              <div className="gst-input-field">
                <button type="button" className="gst-add-button" onClick={handleAddLine}>Add</button>
              </div>
              <div className="gst-input-field">
                <button type="button" className="gst-add-button estimate-quick-save-button" onClick={handleQuickSave}>
                  {editingId ? 'Update Estimate' : 'Save Estimate'}
                </button>
              </div>
            </div>
            {productWarning && <p className="gst-field-warning" role="alert">{productWarning}</p>}
          </fieldset>

          <fieldset>
            <div className="gst-table-wrapper gst-lines-table-wrapper">
              <table className="gst-table gst-lines-table">
                <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Price</th><th>Amount</th><th></th></tr></thead>
                <tbody>
                  {computedLines.length === 0 ? (
                    <tr><td colSpan="6" className="gst-no-entries">No lines added yet.</td></tr>
                  ) : computedLines.map((l, index) => (
                    <tr key={index}>
                      <td>{l.name}</td><td>{l.quantity}</td><td>{l.unit}</td><td>{money(l.rate)}</td><td>{money(l.amount)}</td>
                      <td><button type="button" className="gst-remove-line-button" title="Remove" aria-label="Remove" onClick={() => removeLine(index)}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>

          <fieldset>
            <hr></hr>
            <div className="gst-totals-row">
              <table className="gst-table gst-totals-table">
                <thead>
                  <tr><th>Subtotal</th><th>Round off</th><th>Grand total</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{money(totals.subtotal)}</td>
                    <td>{money(totals.roundOff)}</td>
                    <td className="gst-grand-total-cell">{money(totals.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="gst-totals-side">
                <div className="gst-input-field"><label>Cash received</label><input type="number" className="gst-small-input" min="0" step="0.01" value={billMeta.cash} onChange={(e) => setBillMeta((m) => ({ ...m, cash: e.target.value }))} /></div>
                <div className="gst-input-field"><label>Credit</label><input type="number" className="gst-small-input" min="0" step="0.01" value={billMeta.credit} onChange={(e) => setBillMeta((m) => ({ ...m, credit: e.target.value }))} /></div>
                <div className={`gst-balance-due ${balanceDue > 0 ? 'due' : balanceDue < 0 ? 'over' : 'settled'}`}>
                  <span>{balanceDue > 0 ? 'Balance due' : balanceDue < 0 ? 'Excess paid' : 'Balance due'}</span>
                  <strong>{money(Math.abs(balanceDue))}</strong>
                </div>
                <div className="gst-input-field gst-bill-remark-row"><label>Remark:</label><input type="text" className="gst-text-input" value={billMeta.notes} onChange={(e) => setBillMeta((m) => ({ ...m, notes: e.target.value }))} /></div>
              </div>
            </div>
          </fieldset>

          {saveStatus.text && <p className={`gst-form-status ${saveStatus.type}`} role="alert">{saveStatus.text}</p>}
          <div className="gst-form-actions">
            <button type="button" className="gst-secondary-button" onClick={resetForm}>{editingId ? 'Cancel edit' : 'Clear'}</button>
            <button type="submit" className="gst-primary-button" title="Ctrl+S">{editingId ? 'Update estimate' : 'Save estimate'}</button>
          </div>
          <ShortcutHint entry="estimate" />
        </form>
      </section>

      <section className="gst-bill-list-card">

          <button  type="button" onClick={loadBills}>Refresh</button>

        <div className="gst-bill-filter" role="search">
          <label><span>From</span><input type="date" className='bill-filter-option' value={billFilter.startDate} onChange={(e) => setBillFilter((f) => ({ ...f, startDate: e.target.value }))} /></label>
          <label><span>To</span><input type="date" className='bill-filter-option' value={billFilter.endDate} onChange={(e) => setBillFilter((f) => ({ ...f, endDate: e.target.value }))} /></label>
          <label><span>Search</span><input type="search" className='bill-filter-option' value={billFilter.q} onChange={(e) => setBillFilter((f) => ({ ...f, q: e.target.value }))} placeholder="Estimate no. or customer" /></label>
        </div>
        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead><tr><th>Estimate No.</th>
            <th>Customer</th>
            <th>Grand total</th><th>Actions</th></tr></thead>
            <tbody>
              {bills.length === 0 ? <tr><td colSpan="4" className="gst-table-state">{billsStatus || 'No estimates found.'}</td></tr> : bills.map((bill) => (
                <tr key={bill._id}>
                  <td className="gst-row-name">{bill.billDetails?.estimateNumber}</td>
                  <td>{bill.customer?.name}</td>
                  <td>{money(bill.billDetails?.grandTotal)}</td>
                  <td className="gst-row-actions">
                    <button type="button" className="gst-view-button" onClick={() => setViewBill(bill)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>

      {viewBill && (
        <div className="gst-view-overlay" onClick={() => setViewBill(null)}>
          <div className="gst-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gst-view-header">
              <h3>Estimate {viewBill.billDetails?.estimateNumber}</h3>
              <button type="button" onClick={() => setViewBill(null)}>✕</button>
            </div>
            <div className="gst-view-meta">
              <div><span>Customer</span><strong>{viewBill.customer?.name}</strong></div>
              <div><span>Date</span><strong>{toDateInput(viewBill.billDetails?.date)}</strong></div>
            </div>
            <table className="gst-view-table">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Price</th><th>Amount</th></tr></thead>
              <tbody>
                {(viewBill.items || []).map((p, index) => (
                  <tr key={index}><td>{p.name}</td><td>{p.quantity}</td><td>{p.unit}</td><td>{money(p.rate)}</td><td>{money(p.amount)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="gst-view-totals">
              <div><span>Subtotal</span><strong>{money(viewBill.billDetails?.subtotal)}</strong></div>
              <div><span>Round off</span><strong>{money(viewBill.billDetails?.roundOff)}</strong></div>
              <div><span>Grand total</span><strong>{money(viewBill.billDetails?.grandTotal)}</strong></div>
              <div><span>Cash</span><strong>{money(viewBill.billDetails?.cash)}</strong></div>
              <div><span>Credit</span><strong>{money(viewBill.billDetails?.credit)}</strong></div>
              <div><span>Opening balance</span><strong>{money(viewBill.billDetails?.openingBalance)}</strong></div>
              <div><span>Closing balance</span><strong>{money(viewBill.billDetails?.closingBalance)}</strong></div>
            </div>
            <div className="gst-view-actions">
              <button type="button" onClick={() => printBill(viewBill, 'A4')}>Print A4</button>
              <button type="button" onClick={() => printBill(viewBill, 'A5')}>Print A5</button>
              <button type="button" onClick={() => { loadBillForEdit(viewBill); setViewBill(null); }}>Edit this estimate</button>
              <button type="button" className="gst-delete-button" onClick={() => { deleteBill(viewBill); setViewBill(null); }}>Delete</button>
              <button type="button" onClick={() => setViewBill(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default EstimateBillEntry;
