import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJson } from '../../api';
import '../sale/gstbillentry.css';

const REASONS = ['Purchase Return', 'Rate Difference', 'Discount Received', 'Deficiency in Goods/Services', 'Correction of Invoice', 'Other'];

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

// Mirrors the server's GST math (back/controllers/debitnotecontroller.js) for a live preview.
const computeLine = (item, taxType) => {
  const quantity = Number(item.quantity) || 0;
  const price = Number(item.price) || 0;
  const gstRate = Number(item.gstRate) || 0;
  const gross = quantity * price;
  const isInclusive = item.gstMode === 'inclusive';
  const taxableValue = isInclusive ? gross / (1 + gstRate / 100) : gross;
  const gstAmount = isInclusive ? gross - taxableValue : (taxableValue * gstRate) / 100;
  const interState = taxType === 'IGST';
  return {
    ...item,
    quantity,
    price,
    gstRate,
    taxableValue: round2(taxableValue),
    cgstRate: interState ? 0 : round2(gstRate / 2),
    sgstRate: interState ? 0 : round2(gstRate / 2),
    igstRate: interState ? gstRate : 0,
    cgstAmount: interState ? 0 : round2(gstAmount / 2),
    sgstAmount: interState ? 0 : round2(gstAmount / 2),
    igstAmount: interState ? round2(gstAmount) : 0,
    total: round2(taxableValue + gstAmount),
  };
};

const emptyLine = { name: '', hsnCode: '', quantity: '', unit: '', price: '', gstMode: 'exclusive', gstRate: '' };
const emptySupplier = { name: '', supplierId: '', gstin: '', state: '' };
const emptyOriginalBill = { billId: '', billNumber: '', date: '' };
const emptyBillMeta = { debitNoteNumber: '', date: todayString(), taxType: 'CGST_SGST', placeOfSupply: '', reason: 'Purchase Return', remark: '' };

const DebitNoteEntry = () => {
  const originalBillRef = useRef(null);
  const productNameRef = useRef(null);
  const hsnRef = useRef(null);
  const qtyRef = useRef(null);
  const unitRef = useRef(null);
  const priceRef = useRef(null);
  const gstModeRef = useRef(null);
  const gstRateRef = useRef(null);

  const [productList, setProductList] = useState([]);

  const [originalBillInput, setOriginalBillInput] = useState('');
  const [originalBill, setOriginalBill] = useState(emptyOriginalBill);
  const [originalBillWarning, setOriginalBillWarning] = useState('');
  const [originalBillLoading, setOriginalBillLoading] = useState(false);

  const [supplier, setSupplier] = useState(emptySupplier);
  const [billMeta, setBillMeta] = useState(emptyBillMeta);
  const [lines, setLines] = useState([]);
  const [currentLine, setCurrentLine] = useState(emptyLine);
  const [editingId, setEditingId] = useState(null);
  const [saveStatus, setSaveStatus] = useState({ type: '', text: '' });
  const [productWarning, setProductWarning] = useState('');

  const [notes, setNotes] = useState([]);
  const [noteFilter, setNoteFilter] = useState({ startDate: todayString(), endDate: todayString(), q: '' });
  const [notesStatus, setNotesStatus] = useState('');
  const [viewNote, setViewNote] = useState(null);

  useEffect(() => {
    fetchJson('/api/products').then(setProductList).catch(() => setProductList([]));
    originalBillRef.current?.focus();
  }, []);

  const focusNextOnEnter = (e, nextRef) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef?.current?.focus();
      nextRef?.current?.select?.();
    }
  };
  const addLineOnEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddLine();
      setTimeout(() => productNameRef.current?.focus(), 0);
    }
  };

  const loadNotes = useCallback(async () => {
    setNotesStatus('Loading…');
    const params = new URLSearchParams();
    if (noteFilter.startDate) params.set('startDate', noteFilter.startDate);
    if (noteFilter.endDate) params.set('endDate', noteFilter.endDate);
    if (noteFilter.q.trim()) params.set('q', noteFilter.q.trim());
    try {
      const data = await fetchJson(`/api/debit-notes${params.toString() ? `?${params}` : ''}`);
      setNotes(data);
      setNotesStatus(data.length ? '' : 'No debit notes for this range.');
    } catch (error) {
      setNotes([]);
      setNotesStatus(error.message || 'Unable to load debit notes.');
    }
  }, [noteFilter.startDate, noteFilter.endDate, noteFilter.q]);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  const productExists = (name) => !name || productList.some((p) => p.name?.toLowerCase() === name.trim().toLowerCase());

  const computedLines = useMemo(() => lines.map((line) => computeLine(line, billMeta.taxType)), [lines, billMeta.taxType]);
  const totals = useMemo(() => {
    const subtotal = round2(computedLines.reduce((sum, l) => sum + l.taxableValue, 0));
    const totalCgst = round2(computedLines.reduce((sum, l) => sum + l.cgstAmount, 0));
    const totalSgst = round2(computedLines.reduce((sum, l) => sum + l.sgstAmount, 0));
    const totalIgst = round2(computedLines.reduce((sum, l) => sum + l.igstAmount, 0));
    const totalGst = round2(totalCgst + totalSgst + totalIgst);
    const rawTotal = subtotal + totalGst;
    const debitNoteAmount = Math.round(rawTotal);
    const roundOff = round2(debitNoteAmount - rawTotal);
    return { subtotal, totalCgst, totalSgst, totalIgst, totalGst, roundOff, debitNoteAmount };
  }, [computedLines]);

  const handleLoadOriginalBill = async () => {
    const billNumber = originalBillInput.trim();
    if (!billNumber) { setOriginalBillWarning('Enter a bill number to load.'); return; }
    setOriginalBillWarning('');
    setOriginalBillLoading(true);
    try {
      const bill = await fetchJson(`/api/debit-notes/find-original-bill?billNumber=${encodeURIComponent(billNumber)}`);
      setOriginalBill({ billId: bill._id, billNumber: bill.bill_details?.billNumber || billNumber, date: bill.bill_details?.date || '' });
      setSupplier({
        name: bill.supplier?.name || '',
        supplierId: bill.supplier?.supplierId || '',
        gstin: bill.supplier?.gstin || '',
        state: bill.supplier?.state || '',
      });
      setBillMeta((m) => ({ ...m, taxType: bill.bill_details?.taxType || 'CGST_SGST', placeOfSupply: bill.bill_details?.placeOfSupply || '' }));
      setLines((bill.products || []).map((p) => ({
        name: p.name || '', hsnCode: p.hsnCode || '', quantity: p.quantity ?? '', unit: p.unit || '', price: p.price ?? '', gstMode: p.gstMode || 'exclusive', gstRate: p.gstRate ?? '',
      })));
      productNameRef.current?.focus();
    } catch (error) {
      setOriginalBillWarning(error.message || 'Original bill not found.');
      setOriginalBill(emptyOriginalBill);
    } finally {
      setOriginalBillLoading(false);
    }
  };

  const handleProductNameChange = (value) => {
    if (productWarning) setProductWarning('');
    const match = productList.find((p) => p.name === value);
    if (match) {
      setCurrentLine({
        name: match.name,
        hsnCode: match.hsnCode || '',
        quantity: currentLine.quantity,
        unit: match.Scale || '',
        price: match.Price ?? '',
        gstMode: match.gstMode || 'exclusive',
        gstRate: match.gstpre ?? '',
      });
    } else {
      setCurrentLine((line) => ({ ...line, name: value }));
    }
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
    setOriginalBillInput('');
    setOriginalBill(emptyOriginalBill);
    setOriginalBillWarning('');
    setSupplier(emptySupplier);
    setBillMeta(emptyBillMeta);
    setLines([]);
    setCurrentLine(emptyLine);
    setSaveStatus({ type: '', text: '' });
    setProductWarning('');
  };

  const loadNoteForEdit = (note) => {
    setEditingId(note._id);
    setOriginalBillInput(note.originalBill?.billNumber || '');
    setOriginalBill({
      billId: note.originalBill?.billId || '',
      billNumber: note.originalBill?.billNumber || '',
      date: note.originalBill?.date || '',
    });
    setSupplier({
      name: note.supplier?.name || '',
      supplierId: note.supplier?.supplierId || '',
      gstin: note.supplier?.gstin || '',
      state: note.supplier?.state || '',
    });
    setBillMeta({
      debitNoteNumber: note.bill_details?.debitNoteNumber || '',
      date: toDateInput(note.bill_details?.date),
      taxType: note.bill_details?.taxType || 'CGST_SGST',
      placeOfSupply: note.bill_details?.placeOfSupply || '',
      reason: note.bill_details?.reason || 'Purchase Return',
      remark: note.bill_details?.remark || '',
    });
    setLines((note.products || []).map((p) => ({
      name: p.name || '', hsnCode: p.hsnCode || '', quantity: p.quantity ?? '', unit: p.unit || '', price: p.price ?? '', gstMode: p.gstMode || 'exclusive', gstRate: p.gstRate ?? '',
    })));
    setSaveStatus({ type: '', text: '' });
    setOriginalBillWarning('');
    setProductWarning('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaveStatus({ type: '', text: '' });
    if (!originalBill.billNumber) {
      setOriginalBillWarning('Load the original bill before saving.');
      return;
    }
    if (!lines.length) {
      setSaveStatus({ type: 'error', text: 'Add at least one product before saving the debit note.' });
      return;
    }
    const payload = {
      originalBill: { billId: originalBill.billId || undefined, billNumber: originalBill.billNumber, date: originalBill.date || undefined },
      supplier: { name: supplier.name, supplierId: supplier.supplierId || undefined, gstin: supplier.gstin, state: supplier.state },
      products: lines,
      bill_details: { ...billMeta },
    };
    try {
      const saved = editingId
        ? await fetchJson(`/api/debit-notes/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetchJson('/api/debit-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setSaveStatus({ type: 'success', text: `Debit note ${saved.bill_details?.debitNoteNumber || ''} ${editingId ? 'updated' : 'saved'} successfully.` });
      resetForm();
      loadNotes();
    } catch (error) {
      setSaveStatus({ type: 'error', text: error.message || 'Unable to save debit note.' });
    }
  };

  const deleteNote = async (note) => {
    if (!window.confirm(`Delete debit note ${note.bill_details?.debitNoteNumber}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/debit-notes/${note._id}`, { method: 'DELETE' });
      if (editingId === note._id) resetForm();
      loadNotes();
    } catch (error) {
      setNotesStatus(error.message || 'Unable to delete debit note.');
    }
  };

  return (
    <main className="gst-bill-page">
    <div className="gst-bill-layout">
      <section className="gst-bill-card">
        <form className="gst-bill-form" onSubmit={handleSave} noValidate>
          <fieldset>
            <legend>Original bill</legend>
            <div className="gst-bill-header-row">
              <div className="gst-input-field">
                <label>Original Bill No: <b>*</b></label><br />
                <input
                  type="text"
                  className="gst-text-input"
                  ref={originalBillRef}
                  value={originalBillInput}
                  onChange={(e) => setOriginalBillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLoadOriginalBill(); } }}
                  disabled={Boolean(editingId)}
                  placeholder="e.g. PB-0001"
                />
                {originalBillWarning && <p className="gst-field-warning" role="alert">{originalBillWarning}</p>}
              </div>
              <div className="gst-input-field">
                <label>&nbsp;</label><br />
                <button type="button" className="gst-add-button" onClick={handleLoadOriginalBill} disabled={originalBillLoading || Boolean(editingId)}>
                  {originalBillLoading ? 'Loading…' : 'Load bill'}
                </button>
              </div>
              <div className="gst-input-field gst-narrow"><label>Debit Note No:</label><br /><input type="text" className="gst-text-input gst-compact-input" placeholder="Auto" value={billMeta.debitNoteNumber} onChange={(e) => setBillMeta((m) => ({ ...m, debitNoteNumber: e.target.value }))} disabled={Boolean(editingId)} /></div>
              <div className="gst-input-field gst-narrow"><label>Note Date:</label><br /><input type="date" className="gst-text-input gst-compact-input" value={billMeta.date} onChange={(e) => setBillMeta((m) => ({ ...m, date: e.target.value }))} /></div>
              <div className="gst-input-field">
                <label>Reason:</label><br />
                <select className="gst-text-input" value={billMeta.reason} onChange={(e) => setBillMeta((m) => ({ ...m, reason: e.target.value }))}>
                  {REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Supplier &amp; tax details</legend>
            <div className="gst-bill-header-row">
              <div className="gst-input-field"><label>Supplier Name:</label><br /><input type="text" className="gst-text-input" value={supplier.name} readOnly /></div>
              <div className="gst-input-field textbox-middle"><label>GSTIN:</label><br /><input type="text" className="gst-text-input gst-compact-input" value={supplier.gstin} readOnly /></div>
              <div className="gst-input-field">
                <label>Tax Type:</label><br />
                <select className="gst-text-input" value={billMeta.taxType} onChange={(e) => setBillMeta((m) => ({ ...m, taxType: e.target.value }))}>
                  <option value="CGST_SGST">CGST + SGST (intra-state)</option>
                  <option value="IGST">IGST (inter-state)</option>
                </select>
              </div>
              <div className="gst-input-field"><label>Place of Supply:</label><br /><input type="text" className="gst-text-input" value={billMeta.placeOfSupply} onChange={(e) => setBillMeta((m) => ({ ...m, placeOfSupply: e.target.value }))} /></div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Add product </legend>
            <div className="gst-line-entry">
              <div className="gst-input-field">
                <label>item Name</label><br />
                <input type="text" className="gst-text-input textbox-middle" list="debit-note-product-list" ref={productNameRef} value={currentLine.name}
                  onChange={(e) => handleProductNameChange(e.target.value)}
                  onKeyDown={(e) => focusNextOnEnter(e, hsnRef)} />
              </div>
              <datalist id="debit-note-product-list">{productList.map((p) => <option key={p._id} value={p.name} />)}</datalist>
              <div className="gst-input-field">
                <label>HSN</label><br />
                <input type="text" className="gst-small-input" ref={hsnRef} value={currentLine.hsnCode}
                  onChange={(e) => setCurrentLine((l) => ({ ...l, hsnCode: e.target.value }))}
                  onKeyDown={(e) => focusNextOnEnter(e, qtyRef)} />
              </div>
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
                <input type="number" min="0" step="0.01" className="gst-small-input" ref={priceRef} value={currentLine.price}
                  onChange={(e) => setCurrentLine((l) => ({ ...l, price: e.target.value }))}
                  onKeyDown={(e) => focusNextOnEnter(e, gstModeRef)} />
              </div>
              <div className="gst-input-field">
                <label>GST Mode</label><br />
                <select className="gst-small-input" ref={gstModeRef} value={currentLine.gstMode}
                  onChange={(e) => setCurrentLine((l) => ({ ...l, gstMode: e.target.value }))}
                  onKeyDown={(e) => focusNextOnEnter(e, gstRateRef)}>
                  <option value="exclusive">Exclusive</option>
                  <option value="inclusive">Inclusive</option>
                </select>
              </div>
              <div className="gst-input-field">
                <label>GST %</label><br />
                <input type="number" min="0" max="100" step="0.01" className="gst-small-input" ref={gstRateRef} value={currentLine.gstRate}
                  onChange={(e) => setCurrentLine((l) => ({ ...l, gstRate: e.target.value }))}
                  onKeyDown={addLineOnEnter} />
              </div>
              <div className="gst-input-field">
                <button type="button" className="gst-add-button" onClick={handleAddLine}>Add</button>
              </div>
            </div>
            {productWarning && <p className="gst-field-warning" role="alert">{productWarning}</p>}
          </fieldset>

          <fieldset>
            <legend>Debited lines</legend>
            <div className="gst-table-wrapper gst-lines-table-wrapper">
              <table className="gst-table gst-lines-table">
                <thead><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Price</th><th>GST%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th><th></th></tr></thead>
                <tbody>
                  {computedLines.length === 0 ? (
                    <tr><td colSpan="11" className="gst-no-entries">Load the original bill, or add lines manually.</td></tr>
                  ) : computedLines.map((l, index) => (
                    <tr key={index}>
                      <td>{l.name}</td><td>{l.hsnCode || '—'}</td><td>{l.quantity} {l.unit}</td><td>{money(l.price)}</td><td>{l.gstRate}%</td>
                      <td>{money(l.taxableValue)}</td><td>{money(l.cgstAmount)}</td><td>{money(l.sgstAmount)}</td><td>{money(l.igstAmount)}</td><td>{money(l.total)}</td>
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
                  <tr><th>Subtotal</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Round off</th><th>Debit note amount</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{money(totals.subtotal)}</td>
                    <td>{money(totals.totalCgst)}</td>
                    <td>{money(totals.totalSgst)}</td>
                    <td>{money(totals.totalIgst)}</td>
                    <td>{money(totals.roundOff)}</td>
                    <td className="gst-grand-total-cell">{money(totals.debitNoteAmount)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="gst-totals-side">
                <div className="gst-balance-due settled">
                  <span>Reduces payable to supplier by</span>
                  <strong>{money(totals.debitNoteAmount)}</strong>
                </div>
                <div className="gst-input-field gst-bill-remark-row"><label>Remark:</label><input type="text" className="gst-text-input" value={billMeta.remark} onChange={(e) => setBillMeta((m) => ({ ...m, remark: e.target.value }))} /></div>
              </div>
            </div>
          </fieldset>

          {saveStatus.text && <p className={`gst-form-status ${saveStatus.type}`} role="alert">{saveStatus.text}</p>}
          <div className="gst-form-actions">
            <button type="button" className="gst-secondary-button" onClick={resetForm}>{editingId ? 'Cancel edit' : 'Clear'}</button>
            <button type="submit" className="gst-primary-button">{editingId ? 'Update debit note' : 'Save debit note'}</button>
          </div>
        </form>
      </section>

      <section className="gst-bill-list-card">

          <button  type="button" onClick={loadNotes}>Refresh</button>

        <div className="gst-bill-filter" role="search">
          <label><span>From</span><input type="date" className='bill-filter-option' value={noteFilter.startDate} onChange={(e) => setNoteFilter((f) => ({ ...f, startDate: e.target.value }))} /></label>
          <label><span>To</span><input type="date" className='bill-filter-option' value={noteFilter.endDate} onChange={(e) => setNoteFilter((f) => ({ ...f, endDate: e.target.value }))} /></label>
          <label><span>Search</span><input type="search" className='bill-filter-option' value={noteFilter.q} onChange={(e) => setNoteFilter((f) => ({ ...f, q: e.target.value }))} placeholder="Note no., bill no. or supplier" /></label>
        </div>
        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead><tr><th>Note No.</th><th>Against</th><th>Supplier</th><th>Amount</th><th>Actions</th></tr></thead>
            <tbody>
              {notes.length === 0 ? <tr><td colSpan="5" className="gst-table-state">{notesStatus || 'No debit notes found.'}</td></tr> : notes.map((note) => (
                <tr key={note._id}>
                  <td className="gst-row-name">{note.bill_details?.debitNoteNumber}</td>
                  <td>{note.originalBill?.billNumber}</td>
                  <td>{note.supplier?.name}</td>
                  <td>{money(note.bill_details?.debitNoteAmount)}</td>
                  <td className="gst-row-actions">
                    <button type="button" className="gst-view-button" onClick={() => setViewNote(note)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>

      {viewNote && (
        <div className="gst-view-overlay" onClick={() => setViewNote(null)}>
          <div className="gst-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gst-view-header">
              <h3>Debit note {viewNote.bill_details?.debitNoteNumber}</h3>
              <button type="button" onClick={() => setViewNote(null)}>✕</button>
            </div>
            <div className="gst-view-meta">
              <div><span>Supplier</span><strong>{viewNote.supplier?.name}</strong></div>
              <div><span>Date</span><strong>{toDateInput(viewNote.bill_details?.date)}</strong></div>
              <div><span>Against bill</span><strong>{viewNote.originalBill?.billNumber}</strong></div>
              <div><span>Reason</span><strong>{viewNote.bill_details?.reason}</strong></div>
              <div><span>Tax type</span><strong>{viewNote.bill_details?.taxType === 'IGST' ? 'IGST' : 'CGST + SGST'}</strong></div>
              <div><span>Place of supply</span><strong>{viewNote.bill_details?.placeOfSupply || '—'}</strong></div>
            </div>
            <table className="gst-view-table">
              <thead><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Price</th><th>GST%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead>
              <tbody>
                {(viewNote.products || []).map((p, index) => (
                  <tr key={index}><td>{p.name}</td><td>{p.hsnCode || '—'}</td><td>{p.quantity} {p.unit}</td><td>{money(p.price)}</td><td>{p.gstRate}%</td><td>{money(p.taxableValue)}</td><td>{money(p.cgstAmount)}</td><td>{money(p.sgstAmount)}</td><td>{money(p.igstAmount)}</td><td>{money(p.total)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="gst-view-totals">
              <div><span>Subtotal</span><strong>{money(viewNote.bill_details?.subtotal)}</strong></div>
              <div><span>Total CGST</span><strong>{money(viewNote.bill_details?.totalCgst)}</strong></div>
              <div><span>Total SGST</span><strong>{money(viewNote.bill_details?.totalSgst)}</strong></div>
              <div><span>Total IGST</span><strong>{money(viewNote.bill_details?.totalIgst)}</strong></div>
              <div><span>Round off</span><strong>{money(viewNote.bill_details?.roundOff)}</strong></div>
              <div><span>Debit note amount</span><strong>{money(viewNote.bill_details?.debitNoteAmount)}</strong></div>
            </div>
            <div className="gst-view-actions">
              <button type="button" onClick={() => { loadNoteForEdit(viewNote); setViewNote(null); }}>Edit this note</button>
              <button type="button" className="gst-delete-button" onClick={() => { deleteNote(viewNote); setViewNote(null); }}>Delete</button>
              <button type="button" onClick={() => setViewNote(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default DebitNoteEntry;
