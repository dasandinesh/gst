import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../sale/gstbillentry.css';
import { printPo } from './poTemplate';
import {
  ShipToPanel, ShippingAddressModal, emptyShipping, billingAsShipping, defaultShippingFor, shippingFromBill, pickAddress,
  formatAddress, hasAddress, taxTypeForStates,
} from '../common/shippingAddress';
import usePreferences from '../common/usePreferences';

// Buyer's purchase order: records what a customer has ordered, with their PO number.
// No sale is booked — the server never changes stock or customer balance for it.
// GST bills are raised against it from the view modal (see gstbillentry.js, which
// reads `fromPo`); the server then tracks the billed quantity on each line.

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
const toOptionalDateInput = (value) => (value ? toDateInput(value) : '');
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

// Mirrors the server's GST math (back/controllers/buyerpocontroller.js) for a live preview.
const computeLine = (item, taxType) => {
  const quantity = Number(item.quantity) || 0;
  const rate = Number(item.rate) || 0;
  const gstRate = Number(item.gstRate) || 0;
  const gross = quantity * rate;
  const isInclusive = item.gstMode === 'inclusive';
  const taxableValue = isInclusive ? gross / (1 + gstRate / 100) : gross;
  const gstAmount = isInclusive ? gross - taxableValue : (taxableValue * gstRate) / 100;
  const interState = taxType === 'IGST';
  return {
    ...item,
    quantity,
    rate,
    gstRate,
    taxableValue: round2(taxableValue),
    cgstRate: interState ? 0 : round2(gstRate / 2),
    sgstRate: interState ? 0 : round2(gstRate / 2),
    igstRate: interState ? gstRate : 0,
    cgstAmount: interState ? 0 : round2(gstAmount / 2),
    sgstAmount: interState ? 0 : round2(gstAmount / 2),
    igstAmount: interState ? round2(gstAmount) : 0,
    amount: round2(taxableValue + gstAmount),
  };
};

// Quantity still to be billed on a saved PO line.
export const pendingQty = (item) => round2(Math.max(0, (Number(item.quantity) || 0) - (Number(item.billedQuantity) || 0)));

const emptyLine = { name: '', hsnCode: '', quantity: '', unit: '', rate: '', gstMode: 'exclusive', gstRate: '' };
const emptyCustomer = { name: '', customerId: '', gstin: '', state: '' };
const emptyBillMeta = { poNumber: '', date: todayString(), deliveryDate: '', taxType: 'CGST_SGST', placeOfSupply: '', paymentTerms: '', notes: '' };
// Which optional sections to show (Preferences → Buyer's PO page).
const defaultPrefs = { showList: true, showPaymentTerms: true, showRemark: true };

const PoEntry = () => {
  const navigate = useNavigate();
  const customerNameRef = useRef(null);
  const poNumberRef = useRef(null);
  const productNameRef = useRef(null);
  const hsnRef = useRef(null);
  const qtyRef = useRef(null);
  const unitRef = useRef(null);
  const priceRef = useRef(null);
  const gstModeRef = useRef(null);
  const gstRateRef = useRef(null);

  const [customerList, setCustomerList] = useState([]);
  const [productList, setProductList] = useState([]);
  const [invoiceSetting, setInvoiceSetting] = useState(null);
  const prefs = usePreferences('buyerPoEntry', defaultPrefs);

  const [customer, setCustomer] = useState(emptyCustomer);
  const [billMeta, setBillMeta] = useState(emptyBillMeta);
  const [lines, setLines] = useState([]);
  const [currentLine, setCurrentLine] = useState(emptyLine);
  const [editingId, setEditingId] = useState(null);
  const [saveStatus, setSaveStatus] = useState({ type: '', text: '' });
  const [customerWarning, setCustomerWarning] = useState('');
  const [productWarning, setProductWarning] = useState('');

  const [pos, setPos] = useState([]);
  const [poFilter, setPoFilter] = useState({ startDate: todayString(), endDate: todayString(), q: '' });
  const [posStatus, setPosStatus] = useState('');
  const [viewPo, setViewPo] = useState(null);

  // Where the goods go (see ../common/shippingAddress.js). Its state drives place of supply.
  const [shipping, setShipping] = useState(emptyShipping);
  const [showShipModal, setShowShipModal] = useState(false);

  useEffect(() => {
    fetchJson('/api/customers').then(setCustomerList).catch(() => setCustomerList([]));
    fetchJson('/api/products').then(setProductList).catch(() => setProductList([]));
    fetchJson('/api/invoice-settings/active').then(setInvoiceSetting).catch(() => setInvoiceSetting(null));
    customerNameRef.current?.focus();
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

  const loadPos = useCallback(async () => {
    setPosStatus('Loading…');
    const params = new URLSearchParams();
    if (poFilter.startDate) params.set('startDate', poFilter.startDate);
    if (poFilter.endDate) params.set('endDate', poFilter.endDate);
    if (poFilter.q.trim()) params.set('q', poFilter.q.trim());
    try {
      const data = await fetchJson(`/api/buyer-pos${params.toString() ? `?${params}` : ''}`);
      setPos(data);
      setPosStatus(data.length ? '' : 'No purchase orders for this range.');
    } catch (error) {
      setPos([]);
      setPosStatus(error.message || 'Unable to load purchase orders.');
    }
  }, [poFilter.startDate, poFilter.endDate, poFilter.q]);
  useEffect(() => { loadPos(); }, [loadPos]);

  const customerExists = (name) => !name || customerList.some((c) => c.name?.toLowerCase() === name.trim().toLowerCase());
  const productExists = (name) => !name || productList.some((p) => p.name?.toLowerCase() === name.trim().toLowerCase());

  const computedLines = useMemo(() => lines.map((line) => computeLine(line, billMeta.taxType)), [lines, billMeta.taxType]);
  const totals = useMemo(() => {
    const totalTaxableValue = round2(computedLines.reduce((sum, l) => sum + l.taxableValue, 0));
    const totalCgst = round2(computedLines.reduce((sum, l) => sum + l.cgstAmount, 0));
    const totalSgst = round2(computedLines.reduce((sum, l) => sum + l.sgstAmount, 0));
    const totalIgst = round2(computedLines.reduce((sum, l) => sum + l.igstAmount, 0));
    const totalGst = round2(totalCgst + totalSgst + totalIgst);
    const rawTotal = totalTaxableValue + totalGst;
    const grandTotal = Math.round(rawTotal);
    const roundOff = round2(grandTotal - rawTotal);
    return { totalTaxableValue, totalCgst, totalSgst, totalIgst, totalGst, roundOff, grandTotal };
  }, [computedLines]);

  const handleCustomerBlur = (value) => {
    const known = customerExists(value);
    setCustomerWarning(known ? '' : 'This customer is not in the list. Please add the customer first.');
    if (!known) return;
    const match = customerList.find((c) => c.name?.toLowerCase() === value.trim().toLowerCase());
    if (!match) return;
    setCustomer((c) => ({ ...c, name: match.name, customerId: match._id || '', state: match.state || '', gstin: match.gst_no || '' }));
    applyShipping(defaultShippingFor(match));
  };

  const customerRecord = useMemo(() => (
    customerList.find((c) => customer.customerId && c._id === customer.customerId)
    || customerList.find((c) => c.name?.toLowerCase() === customer.name.trim().toLowerCase())
    || null
  ), [customerList, customer.customerId, customer.name]);

  // Same rule as the GST bill page: the ship-to state becomes the place of supply (still editable).
  const applyShipping = (next) => {
    setShipping(next);
    setBillMeta((m) => {
      const placeOfSupply = next.state || m.placeOfSupply;
      return { ...m, placeOfSupply, taxType: taxTypeForStates(invoiceSetting?.state, placeOfSupply) };
    });
  };

  const handleOtherAddress = async (address, saveToCustomer) => {
    let next = { ...pickAddress(address), source: 'custom' };
    if (saveToCustomer && customerRecord) {
      const updated = await fetchJson(`/api/customers/${customerRecord._id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shippingAddress: pickAddress(address) }),
      });
      setCustomerList((list) => list.map((c) => (c._id === updated._id ? updated : c)));
      next = { ...next, source: 'customer' };
    }
    applyShipping(next);
    setShowShipModal(false);
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
        rate: match.Price ?? '',
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
    setCustomer(emptyCustomer);
    setShipping(emptyShipping);
    setBillMeta(emptyBillMeta);
    setLines([]);
    setCurrentLine(emptyLine);
    setSaveStatus({ type: '', text: '' });
    setCustomerWarning('');
    setProductWarning('');
  };

  const loadPoForEdit = (po) => {
    setEditingId(po._id);
    setCustomer({
      name: po.customer?.name || '',
      customerId: po.customer?.customerId || '',
      gstin: po.customer?.gstin || '',
      state: po.customer?.state || '',
    });
    setBillMeta({
      poNumber: po.billDetails?.poNumber || '',
      date: toDateInput(po.billDetails?.date),
      deliveryDate: toOptionalDateInput(po.billDetails?.deliveryDate),
      taxType: po.billDetails?.taxType || 'CGST_SGST',
      placeOfSupply: po.billDetails?.placeOfSupply || '',
      paymentTerms: po.billDetails?.paymentTerms || '',
      notes: po.billDetails?.notes || '',
    });
    const record = customerList.find((c) => c._id === po.customer?.customerId)
      || customerList.find((c) => c.name?.toLowerCase() === (po.customer?.name || '').toLowerCase());
    setShipping(shippingFromBill(po.shippingAddress, record));
    setLines((po.items || []).map((p) => ({
      name: p.name || '', hsnCode: p.hsnCode || '', quantity: p.quantity ?? '', unit: p.unit || '', rate: p.rate ?? '', gstMode: p.gstMode || 'exclusive', gstRate: p.gstRate ?? '',
    })));
    setSaveStatus({ type: '', text: '' });
    setCustomerWarning('');
    setProductWarning('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaveStatus({ type: '', text: '' });
    if (!customer.name || !customerExists(customer.name)) {
      setCustomerWarning('Select a customer from the list.');
      return;
    }
    if (!billMeta.poNumber.trim()) {
      setSaveStatus({ type: 'error', text: "Enter the buyer's PO number." });
      poNumberRef.current?.focus();
      return;
    }
    if (!lines.length) {
      setSaveStatus({ type: 'error', text: 'Add at least one product before saving the purchase order.' });
      return;
    }
    const payload = {
      customer: { name: customer.name, customerId: customer.customerId || undefined, gstin: customer.gstin, state: customer.state },
      shippingAddress: shipping.source === 'billing' ? billingAsShipping(customerRecord) : shipping,
      items: lines,
      billDetails: { ...billMeta },
    };
    try {
      const saved = editingId
        ? await fetchJson(`/api/buyer-pos/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetchJson('/api/buyer-pos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setSaveStatus({ type: 'success', text: `Purchase order ${saved.billDetails?.poNumber || ''} ${editingId ? 'updated' : 'saved'} successfully.` });
      resetForm();
      loadPos();
      setViewPo(saved);
    } catch (error) {
      setSaveStatus({ type: 'error', text: error.message || 'Unable to save purchase order.' });
    }
  };

  const deletePo = async (po) => {
    if (!window.confirm(`Delete purchase order ${po.billDetails?.poNumber}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/buyer-pos/${po._id}`, { method: 'DELETE' });
      if (editingId === po._id) resetForm();
      loadPos();
    } catch (error) {
      setPosStatus(error.message || 'Unable to delete purchase order.');
    }
  };

  const changeStatus = async (po, status) => {
    try {
      const updated = await fetchJson(`/api/buyer-pos/${po._id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      setViewPo(updated);
      loadPos();
    } catch (error) {
      alert(error.message || 'Unable to change the PO status.');
    }
  };

  return (
    <main className="gst-bill-page">
    <div className={`gst-bill-layout${prefs.showList ? '' : ' no-bill-list'}`}>
      <section className="gst-bill-card">
        <form className="gst-bill-form" onSubmit={handleSave} noValidate>
          <fieldset>
            <legend>Buyer's purchase order</legend>
            <div className="dc-header-row">
              <div className="gst-input-field">
                <label>Customer Name: <b>*</b></label><br />
                <input
                  type="text"
                  className="gst-text-input"
                  list="po-customer-list"
                  value={customer.name}
                  ref={customerNameRef}
                  onChange={(e) => { setCustomer((c) => ({ ...c, name: e.target.value })); if (customerWarning) setCustomerWarning(''); }}
                  onBlur={(e) => handleCustomerBlur(e.target.value)}
                  onKeyDown={(e) => focusNextOnEnter(e, poNumberRef)}
                />
                {customerWarning && <p className="gst-field-warning" role="alert">{customerWarning}</p>}
              </div>
              <datalist id="po-customer-list">{customerList.map((c) => <option key={c._id} value={c.name} />)}</datalist>
              <div className="gst-input-field"><label>GSTIN:</label><br /><input type="text" className="gst-text-input" value={customer.gstin} onChange={(e) => setCustomer((c) => ({ ...c, gstin: e.target.value }))} /></div>
              <div className="gst-input-field">
                <label>Buyer's PO No: <b>*</b></label><br />
                <input type="text" className="gst-text-input" ref={poNumberRef} value={billMeta.poNumber}
                  onChange={(e) => setBillMeta((m) => ({ ...m, poNumber: e.target.value }))}
                  onKeyDown={(e) => focusNextOnEnter(e, productNameRef)} />
              </div>
              <div className="gst-input-field"><label>PO Date:</label><br /><input type="date" className="gst-text-input" value={billMeta.date} onChange={(e) => setBillMeta((m) => ({ ...m, date: e.target.value }))} /></div>
              <div className="gst-input-field"><label>Delivery by:</label><br /><input type="date" className="gst-text-input" value={billMeta.deliveryDate} onChange={(e) => setBillMeta((m) => ({ ...m, deliveryDate: e.target.value }))} /></div>
            </div>

            {/* Tax type, place of supply and ship-to in one row — the ship-to state sets the place of supply. */}
            <div className="dc-supply-row">
              <div className="gst-input-field">
                <label>Tax Type:</label><br />
                <select className="gst-text-input" value={billMeta.taxType} onChange={(e) => setBillMeta((m) => ({ ...m, taxType: e.target.value }))}>
                  <option value="CGST_SGST">CGST + SGST (intra-state)</option>
                  <option value="IGST">IGST (inter-state)</option>
                </select>
              </div>
              <div className="gst-input-field">
                <label>Place of Supply:</label><br />
                <div className="pos-with-button">
                  <input type="text" className="gst-text-input" value={billMeta.placeOfSupply} onChange={(e) => setBillMeta((m) => ({ ...m, placeOfSupply: e.target.value }))} />
                  <button type="button" className="ship-to-edit-button" title="Ship to another address for this order" onClick={() => setShowShipModal(true)}>✎ Ship to</button>
                </div>
              </div>
              <div className="gst-bill-refs-ship">
                <ShipToPanel customer={customerRecord} value={shipping} onChange={applyShipping} onOtherAddress={() => setShowShipModal(true)} />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Add product </legend>
            <div className="gst-line-entry">
              <div className="gst-input-field">
                <label>item Name</label><br />
                <input type="text" className="gst-text-input textbox-middle" list="po-product-list" ref={productNameRef} value={currentLine.name}
                  onChange={(e) => handleProductNameChange(e.target.value)}
                  onKeyDown={(e) => focusNextOnEnter(e, hsnRef)} />
              </div>
              {/* The option text shows the current stock beside each product name. */}
              <datalist id="po-product-list">{productList.map((p) => <option key={p._id} value={p.name}>{`Stock: ${Number(p.StockQunity || 0)} ${p.Scale || ''}`}</option>)}</datalist>
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
                <input type="number" min="0" step="0.01" className="gst-small-input" ref={priceRef} value={currentLine.rate}
                  onChange={(e) => setCurrentLine((l) => ({ ...l, rate: e.target.value }))}
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
            <legend>Ordered items</legend>
            <div className="gst-table-wrapper gst-lines-table-wrapper">
              <table className="gst-table gst-lines-table">
                <thead><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Price</th><th>GST%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th><th></th></tr></thead>
                <tbody>
                  {computedLines.length === 0 ? (
                    <tr><td colSpan="11" className="gst-no-entries">No products added yet.</td></tr>
                  ) : computedLines.map((l, index) => (
                    <tr key={index}>
                      <td>{l.name}</td><td>{l.hsnCode || '—'}</td><td>{l.quantity} {l.unit}</td><td>{money(l.rate)}</td><td>{l.gstRate}%</td>
                      <td>{money(l.taxableValue)}</td><td>{money(l.cgstAmount)}</td><td>{money(l.sgstAmount)}</td><td>{money(l.igstAmount)}</td><td>{money(l.amount)}</td>
                      <td><button type="button" className="gst-remove-line-button" title="Remove" aria-label="Remove" onClick={() => removeLine(index)}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>

          <hr></hr>

          {/* Left: totals table. Right: stock note / payment terms / remark. Same layout as the GST bill. */}
          <fieldset className="gst-bill-bottom">
            <div className="gst-bill-bottom-left">
              <div className="gst-totals-row">
                <table className="gst-table gst-totals-table">
                  <thead>
                    <tr><th>Subtotal</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Round off</th><th>Order value</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{money(totals.totalTaxableValue)}</td>
                      <td>{money(totals.totalCgst)}</td>
                      <td>{money(totals.totalSgst)}</td>
                      <td>{money(totals.totalIgst)}</td>
                      <td>{money(totals.roundOff)}</td>
                      <td className="gst-grand-total-cell">{money(totals.grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="gst-totals-side">
              <div className="gst-balance-due settled">
                <span>Stock &amp; customer balance</span>
                <strong>Not changed</strong>
              </div>
              {prefs.showPaymentTerms && (
                <div className="gst-input-field gst-bill-remark-row"><label>Payment terms:</label><input type="text" className="gst-text-input" placeholder="e.g. 30 days credit" value={billMeta.paymentTerms} onChange={(e) => setBillMeta((m) => ({ ...m, paymentTerms: e.target.value }))} /></div>
              )}
              {prefs.showRemark && (
                <div className="gst-input-field gst-bill-remark-row"><label>Remark:</label><input type="text" className="gst-text-input" value={billMeta.notes} onChange={(e) => setBillMeta((m) => ({ ...m, notes: e.target.value }))} /></div>
              )}
            </div>
          </fieldset>

          {saveStatus.text && <p className={`gst-form-status ${saveStatus.type}`} role="alert">{saveStatus.text}</p>}
          <div className="gst-form-actions">
            <button type="button" className="gst-secondary-button" onClick={resetForm}>{editingId ? 'Cancel edit' : 'Clear'}</button>
            <button type="submit" className="gst-primary-button">{editingId ? 'Update PO' : 'Save PO'}</button>
          </div>
        </form>
      </section>

      {prefs.showList && (
      <section className="gst-bill-list-card">
        <button type="button" onClick={loadPos}>Refresh</button>
        <div className="gst-bill-filter" role="search">
          <label><span>From</span><input type="date" className="bill-filter-option" value={poFilter.startDate} onChange={(e) => setPoFilter((f) => ({ ...f, startDate: e.target.value }))} /></label>
          <label><span>To</span><input type="date" className="bill-filter-option" value={poFilter.endDate} onChange={(e) => setPoFilter((f) => ({ ...f, endDate: e.target.value }))} /></label>
          <label><span>Search</span><input type="search" className="bill-filter-option" value={poFilter.q} onChange={(e) => setPoFilter((f) => ({ ...f, q: e.target.value }))} placeholder="PO no. or customer" /></label>
        </div>
        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead><tr><th>PO No.</th><th>Customer</th><th>Status</th><th>Value</th><th>Actions</th></tr></thead>
            <tbody>
              {pos.length === 0 ? <tr><td colSpan="5" className="gst-table-state">{posStatus || 'No purchase orders found.'}</td></tr> : pos.map((po) => (
                <tr key={po._id}>
                  <td className="gst-row-name">{po.billDetails?.poNumber}</td>
                  <td>{po.customer?.name}</td>
                  <td>{po.status}</td>
                  <td>{money(po.billDetails?.grandTotal)}</td>
                  <td className="gst-row-actions">
                    <button type="button" className="gst-view-button" onClick={() => setViewPo(po)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>

      {showShipModal && (
        <ShippingAddressModal
          initial={shipping.source === 'billing' ? {} : shipping}
          customerName={customerRecord?.name || customer.name}
          canSaveToCustomer={Boolean(customerRecord)}
          onApply={handleOtherAddress}
          onClose={() => setShowShipModal(false)}
        />
      )}

      {viewPo && (
        <PoViewModal
          po={viewPo}
          onClose={() => setViewPo(null)}
          onPrint={(size) => printPo(viewPo, invoiceSetting, customerList, size)}
          onEdit={() => { loadPoForEdit(viewPo); setViewPo(null); }}
          onDelete={() => { deletePo(viewPo); setViewPo(null); }}
          onStatus={(status) => changeStatus(viewPo, status)}
          onConvert={() => navigate('/gst-billing', { state: { fromPo: viewPo } })}
        />
      )}
    </main>
  );
};

// Read-only PO view shared by the entry and list pages, with ordered / billed /
// pending quantities per line. Buttons appear only when that action is allowed;
// omitted handlers hide their buttons too.
export const PoViewModal = ({ po, onClose, onPrint, onEdit, onDelete, onStatus, onConvert }) => {
  const b = po.billDetails || {};
  const hasBills = (po.invoices || []).length > 0;
  const active = po.status === 'Open' || po.status === 'Partly Billed';
  const anyPending = (po.items || []).some((p) => pendingQty(p) > 0);
  return (
    <div className="gst-view-overlay" onClick={onClose}>
      <div className="gst-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gst-view-header">
          <h3>Buyer's PO {b.poNumber}</h3>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="gst-view-meta">
          <div><span>Customer</span><strong>{po.customer?.name}</strong></div>
          <div><span>PO date</span><strong>{toDateInput(b.date)}</strong></div>
          <div><span>Delivery by</span><strong>{toOptionalDateInput(b.deliveryDate) || '—'}</strong></div>
          <div><span>Status</span><strong>{po.status}</strong></div>
          <div><span>Tax type</span><strong>{b.taxType === 'IGST' ? 'IGST' : 'CGST + SGST'}</strong></div>
          <div><span>Place of supply</span><strong>{b.placeOfSupply || '—'}</strong></div>
          <div><span>Payment terms</span><strong>{b.paymentTerms || '—'}</strong></div>
          <div><span>GST bills</span><strong>{hasBills ? po.invoices.map((inv) => inv.invoiceNumber).filter(Boolean).join(', ') : '—'}</strong></div>
          {hasAddress(po.shippingAddress) && po.shippingAddress.source !== 'billing' && <div><span>Ship to</span><strong>{po.shippingAddress.contactName ? `${po.shippingAddress.contactName}, ` : ''}{formatAddress(po.shippingAddress)}</strong></div>}
          {b.notes && <div><span>Remark</span><strong>{b.notes}</strong></div>}
        </div>
        <table className="gst-view-table">
          <thead><tr><th>Product</th><th>HSN</th><th>Ordered</th><th>Billed</th><th>Pending</th><th>Price</th><th>GST%</th><th>Taxable</th><th>GST</th><th>Total</th></tr></thead>
          <tbody>
            {(po.items || []).map((p, index) => (
              <tr key={index}>
                <td>{p.name}</td><td>{p.hsnCode || '—'}</td><td>{p.quantity} {p.unit}</td><td>{Number(p.billedQuantity) || 0}</td><td>{pendingQty(p)}</td>
                <td>{money(p.rate)}</td><td>{p.gstRate}%</td><td>{money(p.taxableValue)}</td>
                <td>{money((Number(p.cgstAmount) || 0) + (Number(p.sgstAmount) || 0) + (Number(p.igstAmount) || 0))}</td><td>{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="gst-view-totals">
          <div><span>Subtotal</span><strong>{money(b.totalTaxableValue)}</strong></div>
          <div><span>Total CGST</span><strong>{money(b.totalCgst)}</strong></div>
          <div><span>Total SGST</span><strong>{money(b.totalSgst)}</strong></div>
          <div><span>Total IGST</span><strong>{money(b.totalIgst)}</strong></div>
          <div><span>Round off</span><strong>{money(b.roundOff)}</strong></div>
          <div><span>Order value</span><strong>{money(b.grandTotal)}</strong></div>
        </div>
        <div className="gst-view-actions">
          <button type="button" onClick={() => onPrint('A4')}>Print A4</button>
          <button type="button" onClick={() => onPrint('A5')}>Print A5</button>
          {active && anyPending && onConvert && <button type="button" onClick={onConvert}>{hasBills ? 'Bill pending qty' : 'Create GST bill'}</button>}
          {active && !hasBills && onEdit && <button type="button" onClick={onEdit}>Edit</button>}
          {active && hasBills && onStatus && <button type="button" onClick={() => window.confirm('Close this PO? The pending quantity will not be supplied.') && onStatus('Closed')}>Close PO</button>}
          {active && !hasBills && onStatus && <button type="button" onClick={() => window.confirm('Cancel this purchase order?') && onStatus('Cancelled')}>Cancel PO</button>}
          {!active && po.status !== 'Billed' && onStatus && <button type="button" onClick={() => onStatus('Open')}>Reopen</button>}
          {!hasBills && onDelete && <button type="button" className="gst-delete-button" onClick={onDelete}>Delete</button>}
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default PoEntry;
