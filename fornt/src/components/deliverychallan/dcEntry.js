import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../sale/gstbillentry.css';
import { printDc } from './dcTemplate';
import {
  ShipToPanel, ShippingAddressModal, emptyShipping, billingAsShipping, defaultShippingFor, shippingFromBill, pickAddress,
  formatAddress, hasAddress, taxTypeForStates,
} from '../common/shippingAddress';
import { TransportFields, emptyTransport as emptyEwayTransport, transportFromBill, transportRows } from '../common/transportDetails';
import usePreferences from '../common/usePreferences';
import { useEntryShortcuts, fetchLatest, ShortcutHint } from '../common/entryShortcuts';
import { formatDate } from '../../dateFormat';

// Delivery challan: goods leave with a document but no sale is booked — the server
// never changes stock or customer balance for it. It can later be converted into a
// GST bill from the view modal (see gstbillentry.js, which reads `fromDc`).

const REASONS = ['Delivery Before Invoice', 'Supply on Approval', 'Job Work', 'Branch Transfer', 'Sample', 'Other'];

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

// Mirrors the server's GST math (back/controllers/deliverychallancontroller.js) for a live preview.
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

const emptyLine = { name: '', hsnCode: '', quantity: '', unit: '', rate: '', gstMode: 'exclusive', gstRate: '' };
const emptyCustomer = { name: '', customerId: '', gstin: '', state: '' };
// E-way bill Part-B fields (shared with the GST bill) plus the challan's driver.
const emptyTransport = { ...emptyEwayTransport, driverName: '', driverPhone: '' };
const emptyBillMeta = { challanNumber: '', date: todayString(), taxType: 'CGST_SGST', placeOfSupply: '', reason: 'Delivery Before Invoice', notes: '' };
// Which optional sections to show (Preferences → Delivery Challan page).
const defaultPrefs = { showList: true, showTransport: true, showRemark: true };

const DcEntry = () => {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const customerNameRef = useRef(null);
  const productNameRef = useRef(null);
  const hsnRef = useRef(null);
  const qtyRef = useRef(null);
  const unitRef = useRef(null);
  const priceRef = useRef(null);
  const gstModeRef = useRef(null);
  const gstRateRef = useRef(null);

  const [customerList, setCustomerList] = useState([]);
  const [productList, setProductList] = useState([]);
  const [driverList, setDriverList] = useState([]);
  const [vehicleList, setVehicleList] = useState([]);
  const [invoiceSetting, setInvoiceSetting] = useState(null);
  const prefs = usePreferences('dcEntry', defaultPrefs);

  const [customer, setCustomer] = useState(emptyCustomer);
  const [transport, setTransport] = useState(emptyTransport);
  const setTransportField = (key, value) => setTransport((t) => ({ ...t, [key]: value }));
  const [billMeta, setBillMeta] = useState(emptyBillMeta);
  const [lines, setLines] = useState([]);
  const [currentLine, setCurrentLine] = useState(emptyLine);
  const [editingId, setEditingId] = useState(null);
  const [saveStatus, setSaveStatus] = useState({ type: '', text: '' });
  const [customerWarning, setCustomerWarning] = useState('');
  const [productWarning, setProductWarning] = useState('');

  const [challans, setChallans] = useState([]);
  const [dcFilter, setDcFilter] = useState({ startDate: todayString(), endDate: todayString(), q: '' });
  const [challansStatus, setChallansStatus] = useState('');
  const [viewDc, setViewDc] = useState(null);

  // Where the goods go (see ../common/shippingAddress.js). Its state drives place of supply.
  const [shipping, setShipping] = useState(emptyShipping);
  const [showShipModal, setShowShipModal] = useState(false);

  useEffect(() => {
    fetchJson('/api/customers').then(setCustomerList).catch(() => setCustomerList([]));
    fetchJson('/api/products').then(setProductList).catch(() => setProductList([]));
    fetchJson('/api/drivers').then(setDriverList).catch(() => setDriverList([]));
    fetchJson('/api/vehicles').then(setVehicleList).catch(() => setVehicleList([]));
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

  const loadChallans = useCallback(async () => {
    setChallansStatus('Loading…');
    const params = new URLSearchParams();
    if (dcFilter.startDate) params.set('startDate', dcFilter.startDate);
    if (dcFilter.endDate) params.set('endDate', dcFilter.endDate);
    if (dcFilter.q.trim()) params.set('q', dcFilter.q.trim());
    try {
      const data = await fetchJson(`/api/delivery-challans${params.toString() ? `?${params}` : ''}`);
      setChallans(data);
      setChallansStatus(data.length ? '' : 'No delivery challans for this range.');
    } catch (error) {
      setChallans([]);
      setChallansStatus(error.message || 'Unable to load delivery challans.');
    }
  }, [dcFilter.startDate, dcFilter.endDate, dcFilter.q]);
  useEffect(() => { loadChallans(); }, [loadChallans]);

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

  const handleDriverChange = (value) => {
    const match = driverList.find((d) => d.name === value);
    setTransport((t) => ({ ...t, driverName: value, driverPhone: match ? (match.phone || '') : t.driverPhone }));
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
    setTransport(emptyTransport);
    setBillMeta(emptyBillMeta);
    setLines([]);
    setCurrentLine(emptyLine);
    setSaveStatus({ type: '', text: '' });
    setCustomerWarning('');
    setProductWarning('');
  };

  const loadDcForEdit = (dc) => {
    setEditingId(dc._id);
    setCustomer({
      name: dc.customer?.name || '',
      customerId: dc.customer?.customerId || '',
      gstin: dc.customer?.gstin || '',
      state: dc.customer?.state || '',
    });
    setTransport({
      ...transportFromBill(dc.transport),
      driverName: dc.transport?.driverName || '',
      driverPhone: dc.transport?.driverPhone || '',
    });
    setBillMeta({
      challanNumber: dc.billDetails?.challanNumber || '',
      date: toDateInput(dc.billDetails?.date),
      taxType: dc.billDetails?.taxType || 'CGST_SGST',
      placeOfSupply: dc.billDetails?.placeOfSupply || '',
      reason: dc.billDetails?.reason || 'Delivery Before Invoice',
      notes: dc.billDetails?.notes || '',
    });
    const record = customerList.find((c) => c._id === dc.customer?.customerId)
      || customerList.find((c) => c.name?.toLowerCase() === (dc.customer?.name || '').toLowerCase());
    setShipping(shippingFromBill(dc.shippingAddress, record));
    setLines((dc.items || []).map((p) => ({
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
    if (!lines.length) {
      setSaveStatus({ type: 'error', text: 'Add at least one product before saving the delivery challan.' });
      return;
    }
    const payload = {
      customer: { name: customer.name, customerId: customer.customerId || undefined, gstin: customer.gstin, state: customer.state },
      shippingAddress: shipping.source === 'billing' ? billingAsShipping(customerRecord) : shipping,
      items: lines,
      transport,
      billDetails: { ...billMeta },
    };
    try {
      const saved = editingId
        ? await fetchJson(`/api/delivery-challans/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetchJson('/api/delivery-challans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setSaveStatus({ type: 'success', text: `Delivery challan ${saved.billDetails?.challanNumber || ''} ${editingId ? 'updated' : 'saved'} successfully.` });
      resetForm();
      loadChallans();
      setViewDc(saved);
    } catch (error) {
      setSaveStatus({ type: 'error', text: error.message || 'Unable to save delivery challan.' });
    }
  };

  const deleteDc = async (dc) => {
    if (!window.confirm(`Delete delivery challan ${dc.billDetails?.challanNumber}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/delivery-challans/${dc._id}`, { method: 'DELETE' });
      if (editingId === dc._id) resetForm();
      loadChallans();
    } catch (error) {
      setChallansStatus(error.message || 'Unable to delete delivery challan.');
    }
  };

  const convertToInvoice = (dc) => navigate('/gst-billing', { state: { fromDc: dc } });

  // Keyboard shortcuts (common/entryShortcuts.js): F2 new, Ctrl+S save,
  // Ctrl+P print (the challan open in the view popup, else the last one), F8 last challan.
  const loadLastDc = () => fetchLatest('/api/delivery-challans', 'No delivery challans saved yet.');
  useEntryShortcuts({
    isDirty: lines.length > 0,
    confirmNew: 'Discard this unsaved challan and start a new one?',
    onNew: () => { setViewDc(null); resetForm(); setTimeout(() => customerNameRef.current?.focus(), 0); },
    onSave: () => { if (!viewDc && !showShipModal) formRef.current?.requestSubmit(); },
    onPrint: () => printDc(viewDc || loadLastDc, invoiceSetting, customerList, 'A4'),
    onOpenLast: () => loadLastDc().then(setViewDc).catch((error) => setSaveStatus({ type: 'error', text: error.message })),
  });

  return (
    <main className="gst-bill-page">
    <div className={`gst-bill-layout${prefs.showList ? '' : ' no-bill-list'}`}>
      <section className="gst-bill-card">
        <form className="gst-bill-form" ref={formRef} onSubmit={handleSave} noValidate>
          <fieldset>
            <legend>Challan details</legend>
            <div className="dc-header-row">
              <div className="gst-input-field">
                <label>Customer Name: <b>*</b></label><br />
                <input
                  type="text"
                  className="gst-text-input"
                  list="dc-customer-list"
                  value={customer.name}
                  ref={customerNameRef}
                  onChange={(e) => { setCustomer((c) => ({ ...c, name: e.target.value })); if (customerWarning) setCustomerWarning(''); }}
                  onBlur={(e) => handleCustomerBlur(e.target.value)}
                  onKeyDown={(e) => focusNextOnEnter(e, productNameRef)}
                />
                {customerWarning && <p className="gst-field-warning" role="alert">{customerWarning}</p>}
              </div>
              <datalist id="dc-customer-list">{customerList.map((c) => <option key={c._id} value={c.name} />)}</datalist>
              <div className="gst-input-field"><label>GSTIN:</label><br /><input type="text" className="gst-text-input" value={customer.gstin} onChange={(e) => setCustomer((c) => ({ ...c, gstin: e.target.value }))} /></div>
              <div className="gst-input-field"><label>DC No:</label><br /><input type="text" className="gst-text-input" placeholder="Auto" value={billMeta.challanNumber} onChange={(e) => setBillMeta((m) => ({ ...m, challanNumber: e.target.value }))} disabled={Boolean(editingId)} /></div>
              <div className="gst-input-field"><label>DC Date:</label><br /><input type="date" className="gst-text-input" value={billMeta.date} onChange={(e) => setBillMeta((m) => ({ ...m, date: e.target.value }))} /></div>
              <div className="gst-input-field">
                <label>Purpose:</label><br />
                <select className="gst-text-input" value={billMeta.reason} onChange={(e) => setBillMeta((m) => ({ ...m, reason: e.target.value }))}>
                  {REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
              </div>
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
                  <button type="button" className="ship-to-edit-button" title="Ship to another address for this challan" onClick={() => setShowShipModal(true)}>✎ Ship to</button>
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
                <input type="text" className="gst-text-input textbox-middle" list="dc-product-list" ref={productNameRef} value={currentLine.name}
                  onChange={(e) => handleProductNameChange(e.target.value)}
                  onKeyDown={(e) => focusNextOnEnter(e, hsnRef)} />
              </div>
              {/* The option text shows the current stock beside each product name. */}
              <datalist id="dc-product-list">{productList.map((p) => <option key={p._id} value={p.name}>{`Stock: ${Number(p.StockQunity || 0)} ${p.Scale || ''}`}</option>)}</datalist>
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
            <legend>Challan lines</legend>
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

          {/* Left: transport details + totals table. Right: stock note / remark. Same layout as the GST bill. */}
          <fieldset className="gst-bill-bottom">
            <div className="gst-bill-bottom-left">
              {/* Preferences → "Show Transport details": ticked = all fields (+ driver), unticked = Vehicle No + Transporter ID only. */}
              <TransportFields value={transport} onChange={setTransportField} vehicleListId="dc-vehicle-list" compact={!prefs.showTransport}>
                <div className="gst-input-field">
                  <label>Driver:</label>
                  <input type="text" className="gst-text-input" list="dc-driver-list" value={transport.driverName} onChange={(e) => handleDriverChange(e.target.value)} />
                </div>
                <div className="gst-input-field">
                  <label>Driver Phone:</label>
                  <input type="text" className="gst-text-input" value={transport.driverPhone} onChange={(e) => setTransportField('driverPhone', e.target.value)} />
                </div>
              </TransportFields>
              <datalist id="dc-vehicle-list">{vehicleList.map((v) => <option key={v._id} value={v.name} />)}</datalist>
              <datalist id="dc-driver-list">{driverList.map((d) => <option key={d._id} value={d.name} />)}</datalist>
              <div className="gst-totals-row">
                <table className="gst-table gst-totals-table">
                  <thead>
                    <tr><th>Subtotal</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Round off</th><th>Challan value</th></tr>
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
              {prefs.showRemark && (
                <div className="gst-input-field gst-bill-remark-row"><label>Remark:</label><input type="text" className="gst-text-input" value={billMeta.notes} onChange={(e) => setBillMeta((m) => ({ ...m, notes: e.target.value }))} /></div>
              )}
            </div>
          </fieldset>

          {saveStatus.text && <p className={`gst-form-status ${saveStatus.type}`} role="alert">{saveStatus.text}</p>}
          <div className="gst-form-actions">
            <button type="button" className="gst-secondary-button" onClick={resetForm}>{editingId ? 'Cancel edit' : 'Clear'}</button>
            <button type="submit" className="gst-primary-button" title="Ctrl+S">{editingId ? 'Update challan' : 'Save challan'}</button>
          </div>
          <ShortcutHint entry="challan" />
        </form>
      </section>

      {prefs.showList && (
      <section className="gst-bill-list-card">
        <button type="button" onClick={loadChallans}>Refresh</button>
        <div className="gst-bill-filter" role="search">
          <label><span>From</span><input type="date" className="bill-filter-option" value={dcFilter.startDate} onChange={(e) => setDcFilter((f) => ({ ...f, startDate: e.target.value }))} /></label>
          <label><span>To</span><input type="date" className="bill-filter-option" value={dcFilter.endDate} onChange={(e) => setDcFilter((f) => ({ ...f, endDate: e.target.value }))} /></label>
          <label><span>Search</span><input type="search" className="bill-filter-option" value={dcFilter.q} onChange={(e) => setDcFilter((f) => ({ ...f, q: e.target.value }))} placeholder="DC no., customer or vehicle" /></label>
        </div>
        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead><tr><th>DC No.</th><th>Customer</th><th>Status</th><th>Value</th><th>Actions</th></tr></thead>
            <tbody>
              {challans.length === 0 ? <tr><td colSpan="5" className="gst-table-state">{challansStatus || 'No delivery challans found.'}</td></tr> : challans.map((dc) => (
                <tr key={dc._id}>
                  <td className="gst-row-name">{dc.billDetails?.challanNumber}</td>
                  <td>{dc.customer?.name}</td>
                  <td>{dc.status}</td>
                  <td>{money(dc.billDetails?.grandTotal)}</td>
                  <td className="gst-row-actions">
                    <button type="button" className="gst-view-button" onClick={() => setViewDc(dc)}>View</button>
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

      {viewDc && (
        <DcViewModal
          dc={viewDc}
          onClose={() => setViewDc(null)}
          onPrint={(size) => printDc(viewDc, invoiceSetting, customerList, size)}
          onEdit={() => { loadDcForEdit(viewDc); setViewDc(null); }}
          onDelete={() => { deleteDc(viewDc); setViewDc(null); }}
          onConvert={() => convertToInvoice(viewDc)}
        />
      )}
    </main>
  );
};

// Read-only challan view shared by the entry and list pages. Edit/Delete/Convert are
// hidden once the challan is invoiced; omitted handlers hide their buttons too.
export const DcViewModal = ({ dc, onClose, onPrint, onEdit, onDelete, onConvert }) => {
  const b = dc.billDetails || {};
  const t = dc.transport || {};
  const open = dc.status !== 'Invoiced';
  return (
    <div className="gst-view-overlay" onClick={onClose}>
      <div className="gst-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gst-view-header">
          <h3>Delivery challan {b.challanNumber}</h3>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="gst-view-meta">
          <div><span>Customer</span><strong>{dc.customer?.name}</strong></div>
          <div><span>Date</span><strong>{formatDate(b.date)}</strong></div>
          <div><span>Purpose</span><strong>{b.reason}</strong></div>
          <div><span>Status</span><strong>{dc.status}{dc.invoice?.invoiceNumber ? ` (${dc.invoice.invoiceNumber})` : ''}</strong></div>
          <div><span>Tax type</span><strong>{b.taxType === 'IGST' ? 'IGST' : 'CGST + SGST'}</strong></div>
          <div><span>Place of supply</span><strong>{b.placeOfSupply || '—'}</strong></div>
          {transportRows(t).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          <div><span>Driver</span><strong>{[t.driverName, t.driverPhone].filter(Boolean).join(' / ') || '—'}</strong></div>
          {hasAddress(dc.shippingAddress) && dc.shippingAddress.source !== 'billing' && <div><span>Ship to</span><strong>{dc.shippingAddress.contactName ? `${dc.shippingAddress.contactName}, ` : ''}{formatAddress(dc.shippingAddress)}</strong></div>}
        </div>
        <table className="gst-view-table">
          <thead><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Price</th><th>GST%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead>
          <tbody>
            {(dc.items || []).map((p, index) => (
              <tr key={index}><td>{p.name}</td><td>{p.hsnCode || '—'}</td><td>{p.quantity} {p.unit}</td><td>{money(p.rate)}</td><td>{p.gstRate}%</td><td>{money(p.taxableValue)}</td><td>{money(p.cgstAmount)}</td><td>{money(p.sgstAmount)}</td><td>{money(p.igstAmount)}</td><td>{money(p.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="gst-view-totals">
          <div><span>Subtotal</span><strong>{money(b.totalTaxableValue)}</strong></div>
          <div><span>Total CGST</span><strong>{money(b.totalCgst)}</strong></div>
          <div><span>Total SGST</span><strong>{money(b.totalSgst)}</strong></div>
          <div><span>Total IGST</span><strong>{money(b.totalIgst)}</strong></div>
          <div><span>Round off</span><strong>{money(b.roundOff)}</strong></div>
          <div><span>Challan value</span><strong>{money(b.grandTotal)}</strong></div>
        </div>
        <div className="gst-view-actions">
          <button type="button" onClick={() => onPrint('A4')}>Print A4</button>
          <button type="button" onClick={() => onPrint('A5')}>Print A5</button>
          {open && onConvert && <button type="button" onClick={onConvert}>Convert to GST bill</button>}
          {open && onEdit && <button type="button" onClick={onEdit}>Edit</button>}
          {open && onDelete && <button type="button" className="gst-delete-button" onClick={onDelete}>Delete</button>}
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default DcEntry;
