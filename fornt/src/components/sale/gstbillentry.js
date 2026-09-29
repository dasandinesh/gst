import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchJson } from '../../api';
import './gstbillentry.css';
import { buildGstBillDocumentHtml, PAPER_WINDOW } from './gstBillTemplate';
import {
  ShipToPanel, ShippingAddressModal, emptyShipping, billingAsShipping, defaultShippingFor, shippingFromBill, pickAddress,
  formatAddress, hasAddress, taxTypeForStates,
} from '../common/shippingAddress';
import { TransportFields, emptyTransport, transportFromBill, hasTransport, transportRows } from '../common/transportDetails';
import usePreferences from '../common/usePreferences';

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
// Same, but an empty/missing date stays empty — for optional reference dates.
const toOptionalDateInput = (value) => (value ? toDateInput(value) : '');
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

// Mirrors the server's GST math (back/controllers/gstsalecontroller.js) for a live preview.
// The server recalculates authoritatively on save, so this only drives the on-screen totals.
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
const emptyBillMeta = {
  invoiceNumber: '', date: todayString(), taxType: 'CGST_SGST', placeOfSupply: '',
  deliveryChallanNumber: '', deliveryChallanDate: '', purchaseOrderNumber: '', purchaseOrderDate: '',
  transport: emptyTransport, notes: '', cash: 0, credit: 0,
};

// Everything shown until the saved Entry Settings load (and if they can't).
const defaultPrefs = { showBillList: true, showReferences: true, showTransport: true, showPayment: true, showRemark: true };

const GstBillEntry = () => {
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
  const [invoiceSetting, setInvoiceSetting] = useState(null);
  // Which optional sections to show (Master → Entry Settings).
  const prefs = usePreferences('gstBillEntry', defaultPrefs);

  const [customer, setCustomer] = useState(emptyCustomer);
  const [billMeta, setBillMeta] = useState(emptyBillMeta);
  const [lines, setLines] = useState([]);
  const [currentLine, setCurrentLine] = useState(emptyLine);
  const [editingId, setEditingId] = useState(null);
  const [saveStatus, setSaveStatus] = useState({ type: '', text: '' });
  const [lastSavedBill, setLastSavedBill] = useState(null); // for "Print last bill"
  const [customerWarning, setCustomerWarning] = useState('');
  const [productWarning, setProductWarning] = useState('');

  const [bills, setBills] = useState([]);
  const [billFilter, setBillFilter] = useState({ startDate: todayString(), endDate: todayString(), q: '' });
  const [billsStatus, setBillsStatus] = useState('');
  const [viewBill, setViewBill] = useState(null);
  const [includeHsnSummary, setIncludeHsnSummary] = useState(true);
  const [showViewOptions, setShowViewOptions] = useState(false);
  const viewOptionsRef = useRef(null);

  // Set when this bill is being created from a delivery challan ("Convert to GST
  // bill"); after the bill saves, that challan is marked Invoiced.
  const location = useLocation();
  const navigate = useNavigate();
  const [sourceDc, setSourceDc] = useState(null);
  // Same for a buyer's purchase order ("Create GST bill"); after the bill saves, the
  // server records the billed quantities against that PO.
  const [sourcePo, setSourcePo] = useState(null);

  // Where the goods go (see ../common/shippingAddress.js). Its state drives place of supply.
  const [shipping, setShipping] = useState(emptyShipping);
  const [showShipModal, setShowShipModal] = useState(false);
  // Changes one transport field (vehicle no., transporter…) on the bill.
  const setTransport = (key, value) => setBillMeta((m) => ({ ...m, transport: { ...m.transport, [key]: value } }));

  useEffect(() => {
    const dc = location.state?.fromDc;
    if (!dc) return;
    setSourceDc({ id: dc._id, challanNumber: dc.billDetails?.challanNumber || '' });
    setCustomer({
      name: dc.customer?.name || '',
      customerId: dc.customer?.customerId || '',
      gstin: dc.customer?.gstin || '',
      state: dc.customer?.state || '',
    });
    setBillMeta({
      ...emptyBillMeta,
      taxType: dc.billDetails?.taxType || 'CGST_SGST',
      placeOfSupply: dc.billDetails?.placeOfSupply || '',
      deliveryChallanNumber: dc.billDetails?.challanNumber || '',
      deliveryChallanDate: toOptionalDateInput(dc.billDetails?.date),
      // The goods already left on the challan's vehicle / transporter.
      transport: transportFromBill(dc.transport),
    });
    setShipping(dc.shippingAddress?.source ? shippingFromBill(dc.shippingAddress, null) : emptyShipping);
    setLines((dc.items || []).map((p) => ({
      name: p.name || '', hsnCode: p.hsnCode || '', quantity: p.quantity ?? '', unit: p.unit || '', rate: p.rate ?? '', gstMode: p.gstMode || 'exclusive', gstRate: p.gstRate ?? '',
    })));
    // Drop the router state so a page refresh doesn't pre-fill the same challan again.
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    const po = location.state?.fromPo;
    if (!po) return;
    setSourcePo({ id: po._id, poNumber: po.billDetails?.poNumber || '' });
    setCustomer({
      name: po.customer?.name || '',
      customerId: po.customer?.customerId || '',
      gstin: po.customer?.gstin || '',
      state: po.customer?.state || '',
    });
    setBillMeta({
      ...emptyBillMeta,
      taxType: po.billDetails?.taxType || 'CGST_SGST',
      placeOfSupply: po.billDetails?.placeOfSupply || '',
      purchaseOrderNumber: po.billDetails?.poNumber || '',
      purchaseOrderDate: toOptionalDateInput(po.billDetails?.date),
    });
    setShipping(po.shippingAddress?.source ? shippingFromBill(po.shippingAddress, null) : emptyShipping);
    // Only what is still pending on the PO; quantities stay editable for a part supply.
    setLines((po.items || [])
      .map((p) => ({ ...p, pending: round2((Number(p.quantity) || 0) - (Number(p.billedQuantity) || 0)) }))
      .filter((p) => p.pending > 0)
      .map((p) => ({
        name: p.name || '', hsnCode: p.hsnCode || '', quantity: p.pending, unit: p.unit || '', rate: p.rate ?? '', gstMode: p.gstMode || 'exclusive', gstRate: p.gstRate ?? '',
      })));
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    fetchJson('/api/customers').then(setCustomerList).catch(() => setCustomerList([]));
    fetchJson('/api/products').then(setProductList).catch(() => setProductList([]));
    fetchJson('/api/invoice-settings/active').then(setInvoiceSetting).catch(() => setInvoiceSetting(null));    customerNameRef.current?.focus();
  }, []);

  // Enter moves focus to the next field instead of submitting the form.
  const focusNextOnEnter = (e, nextRef) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef?.current?.focus();
      nextRef?.current?.select?.();
    }
  };
  // Enter on the last line field adds the line and jumps back to Product for the next one.
  const addLineOnEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddLine();
      setTimeout(() => productNameRef.current?.focus(), 0);
    }
  };

  const loadBills = useCallback(async () => {
    setBillsStatus('Loading…');
    const params = new URLSearchParams();
    if (billFilter.startDate) params.set('startDate', billFilter.startDate);
    if (billFilter.endDate) params.set('endDate', billFilter.endDate);
    if (billFilter.q.trim()) params.set('q', billFilter.q.trim());
    try {
      const data = await fetchJson(`/api/gst-sales${params.toString() ? `?${params}` : ''}`);
      setBills(data);
      setBillsStatus(data.length ? '' : 'No GST bills for this range.');
    } catch (error) {
      setBills([]);
      setBillsStatus(error.message || 'Unable to load GST bills.');
    }
  }, [billFilter.startDate, billFilter.endDate, billFilter.q]);
  useEffect(() => { loadBills(); }, [loadBills]);

  // Close the "View options" popover when clicking anywhere outside it.
  useEffect(() => {
    if (!showViewOptions) return;
    const handleOutsideClick = (e) => {
      if (viewOptionsRef.current && !viewOptionsRef.current.contains(e.target)) setShowViewOptions(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showViewOptions]);

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
    setCustomer((c) => ({ ...c, name: match.name, customerId: match._id || '', state: match.state || '', gstin: match.gst_no || '' }));
    applyShipping(defaultShippingFor(match));
  };

  // The customer master record for the customer on the form (for billing/saved addresses).
  const customerRecord = useMemo(() => (
    customerList.find((c) => customer.customerId && c._id === customer.customerId)
    || customerList.find((c) => c.name?.toLowerCase() === customer.name.trim().toLowerCase())
    || null
  ), [customerList, customer.customerId, customer.name]);

  // Goods for delivery are supplied where they're delivered, so the ship-to state
  // becomes the place of supply (and decides CGST+SGST vs IGST). Both stay editable:
  // for a bill-to/ship-to sale to a third party, place of supply is the buyer's state.
  const applyShipping = (next) => {
    setShipping(next);
    setBillMeta((m) => {
      const placeOfSupply = next.state || m.placeOfSupply;
      return { ...m, placeOfSupply, taxType: taxTypeForStates(invoiceSetting?.state, placeOfSupply) };
    });
  };

  // "Other address" popup — for this bill only, or also saved as the customer's default.
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
    setSourceDc(null);
    setSourcePo(null);
    setCustomer(emptyCustomer);
    setShipping(emptyShipping);
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
      gstin: bill.customer?.gstin || '',
      state: bill.customer?.state || '',
    });
    setBillMeta({
      invoiceNumber: bill.billDetails?.invoiceNumber || '',
      date: toDateInput(bill.billDetails?.date),
      taxType: bill.billDetails?.taxType || 'CGST_SGST',
      placeOfSupply: bill.billDetails?.placeOfSupply || '',
      deliveryChallanNumber: bill.billDetails?.deliveryChallanNumber || '',
      deliveryChallanDate: toOptionalDateInput(bill.billDetails?.deliveryChallanDate),
      purchaseOrderNumber: bill.billDetails?.purchaseOrderNumber || '',
      purchaseOrderDate: toOptionalDateInput(bill.billDetails?.purchaseOrderDate),
      transport: transportFromBill(bill.billDetails?.transport),
      notes: bill.billDetails?.notes || '',
      cash: bill.billDetails?.cash || 0,
      credit: bill.billDetails?.credit || 0,
    });
    const record = customerList.find((c) => c._id === bill.customer?.customerId)
      || customerList.find((c) => c.name?.toLowerCase() === (bill.customer?.name || '').toLowerCase());
    setShipping(shippingFromBill(bill.shippingAddress, record));
    setLines((bill.items || []).map((p) => ({
      name: p.name || '', hsnCode: p.hsnCode || '', quantity: p.quantity ?? '', unit: p.unit || '', rate: p.rate ?? '', gstMode: p.gstMode || 'exclusive', gstRate: p.gstRate ?? '',
    })));
    setSaveStatus({ type: '', text: '' });
    setCustomerWarning('');
    setProductWarning('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // "Edit bill" on the GST Bills page opens the bill here for editing.
  useEffect(() => {
    const bill = location.state?.editBill;
    if (!bill) return;
    loadBillForEdit(bill);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (event) => {
    event.preventDefault();
    setSaveStatus({ type: '', text: '' });
    if (!customerExists(customer.name)) {
      setCustomerWarning('This customer is not in the list. Please add the customer first.');
      return;
    }
    if (!lines.length) {
      setSaveStatus({ type: 'error', text: 'Add at least one product before saving the bill.' });
      return;
    }
    const payload = {
      customer: { name: customer.name, customerId: customer.customerId || undefined, gstin: customer.gstin, state: customer.state },
      // Snapshot even "same as billing", so later customer edits don't change this invoice.
      shippingAddress: shipping.source === 'billing' ? billingAsShipping(customerRecord) : shipping,
      items: lines,
      billDetails: { ...billMeta },
    };
    try {
      const saved = editingId
        ? await fetchJson(`/api/gst-sales/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetchJson('/api/gst-sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      let dcNote = '';
      if (!editingId && sourceDc) {
        try {
          await fetchJson(`/api/delivery-challans/${sourceDc.id}/mark-invoiced`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: saved._id, invoiceNumber: saved.billDetails?.invoiceNumber || '' }) });
          dcNote = ` Delivery challan ${sourceDc.challanNumber} marked as invoiced.`;
        } catch (dcError) {
          dcNote = ` (Could not update delivery challan ${sourceDc.challanNumber}: ${dcError.message})`;
        }
      }
      if (!editingId && sourcePo) {
        try {
          const po = await fetchJson(`/api/buyer-pos/${sourcePo.id}/mark-billed`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: saved._id }) });
          dcNote += ` Buyer's PO ${sourcePo.poNumber} is now ${po.status}.`;
        } catch (poError) {
          dcNote += ` (Could not update buyer's PO ${sourcePo.poNumber}: ${poError.message})`;
        }
      }
      setLastSavedBill(saved);
      setSaveStatus({ type: 'success', text: `GST bill ${saved.billDetails?.invoiceNumber || ''} ${editingId ? 'updated' : 'saved'} successfully.${dcNote}` });
      resetForm();
      loadBills();
    } catch (error) {
      setSaveStatus({ type: 'error', text: error.message || 'Unable to save GST bill.' });
    }
  };

  // "Print last bill": the bill saved last on this page, else the newest bill on the server.
  const loadLastBill = async () => {
    if (lastSavedBill) return lastSavedBill;
    const result = await fetchJson('/api/gst-sales?page=1&limit=1');
    const latest = result.data?.[0];
    if (!latest) throw new Error('No GST bills saved yet.');
    return latest;
  };

  const deleteBill = async (bill) => {
    if (!window.confirm(`Delete bill ${bill.billDetails?.invoiceNumber}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/gst-sales/${bill._id}`, { method: 'DELETE' });
      if (editingId === bill._id) resetForm();
      loadBills();
    } catch (error) {
      setBillsStatus(error.message || 'Unable to delete bill.');
    }
  };

  // Layout/styling lives in ./gstBillTemplate.js — edit that to change how a
  // printed bill looks. This just opens the window (synchronously, so popup
  // blockers don't catch it) and fills it in once the bill HTML is built;
  // the template's own onload triggers window.print().
  // `billOrLoader` is a bill, or an async function that fetches one (used by
  // "Print last bill", so the window still opens before the fetch).
  const printBill = async (billOrLoader, size = 'A4') => {
    const { width, height } = PAPER_WINDOW[size] || PAPER_WINDOW.A4;
    const win = window.open('', '_blank', `width=${width},height=${height}`);
    if (!win) { alert('Please allow popups to print the bill.'); return; }
    win.document.write('<p style="font-family:sans-serif;padding:20px;">Preparing bill…</p>');
    try {
      const bill = typeof billOrLoader === 'function' ? await billOrLoader() : billOrLoader;
      const customerRecord = customerList.find((c) => c.name?.toLowerCase() === (bill.customer?.name || '').trim().toLowerCase());
      const html = await buildGstBillDocumentHtml(bill, invoiceSetting || {}, customerRecord || null, size, { showHsnSummary: includeHsnSummary });
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
    } catch (error) {
      win.document.open();
      win.document.write(`<p style="font-family:sans-serif;padding:20px;color:#a12d27;">Unable to build the bill: ${error.message}</p>`);
      win.document.close();
    }
  };

  return (
    <main className="gst-bill-page">
    <div className={`gst-bill-layout${prefs.showBillList ? '' : ' no-bill-list'}`}>
      <section className="gst-bill-card">
        <form className="gst-bill-form" onSubmit={handleSave} noValidate>
          <fieldset>
            <legend>Bill details</legend>
            <div className="gst-bill-header-row">
              <div className="gst-input-field">
                <label>Customer Name:</label><br />
                <input
                  type="text"
                  className="gst-text-input"
                  list="gst-customer-list"
                  value={customer.name}
                  ref={customerNameRef}
                  onChange={(e) => handleCustomerNameChange(e.target.value)}
                  onBlur={(e) => handleCustomerBlur(e.target.value)}
                  onKeyDown={(e) => focusNextOnEnter(e, productNameRef)}
                />
                {customerWarning && <p className="gst-field-warning" role="alert">{customerWarning}</p>}
              </div>
              <datalist id="gst-customer-list">{customerList.map((c) => <option key={c._id} value={c.name} />)}</datalist>

              <div className="gst-input-field textbox-middle"><label>GSTIN:</label><br /><input type="text" className="gst-text-input gst-compact-input" value={customer.gstin} onChange={(e) => setCustomer((c) => ({ ...c, gstin: e.target.value }))} /></div>
              <div className="gst-input-field gst-narrow"><label>Bill No:</label><br /><input type="text" className="gst-text-input gst-compact-input" placeholder="Auto" value={billMeta.invoiceNumber} onChange={(e) => setBillMeta((m) => ({ ...m, invoiceNumber: e.target.value }))} disabled={Boolean(editingId)} /></div>
              <div className="gst-input-field gst-narrow"><label>Bill Date:</label><br /><input type="date" className="gst-text-input gst-compact-input" value={billMeta.date} onChange={(e) => setBillMeta((m) => ({ ...m, date: e.target.value }))} /></div>
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
                  <button type="button" className="ship-to-edit-button" title="Ship to another address for this bill" onClick={() => setShowShipModal(true)}>✎ Ship to</button>
                </div>
              </div>
            </div>
            {prefs.showReferences && (
            <div className="gst-bill-refs-row">
              <span className="gst-bill-refs-title">Delivery &amp; references <small>(printed on the invoice)</small></span>
              <div className="gst-input-field"><label>DC No:</label><input type="text" className="gst-text-input" placeholder="e.g. DC/26-27/0001" value={billMeta.deliveryChallanNumber} onChange={(e) => setBillMeta((m) => ({ ...m, deliveryChallanNumber: e.target.value }))} /></div>
              <div className="gst-input-field"><label>DC Date:</label><input type="date" className="gst-text-input" value={billMeta.deliveryChallanDate} onChange={(e) => setBillMeta((m) => ({ ...m, deliveryChallanDate: e.target.value }))} /></div>
              <div className="gst-input-field"><label>Buyer's PO No:</label><input type="text" className="gst-text-input" placeholder="Buyer's order no." value={billMeta.purchaseOrderNumber} onChange={(e) => setBillMeta((m) => ({ ...m, purchaseOrderNumber: e.target.value }))} /></div>
              <div className="gst-input-field"><label>PO Date:</label><input type="date" className="gst-text-input" value={billMeta.purchaseOrderDate} onChange={(e) => setBillMeta((m) => ({ ...m, purchaseOrderDate: e.target.value }))} /></div>
              <div className="gst-bill-refs-ship">
                <ShipToPanel customer={customerRecord} value={shipping} onChange={applyShipping} onOtherAddress={() => setShowShipModal(true)} />
              </div>
            </div>
            )}
          </fieldset>

          <fieldset>
            <legend>Add product </legend>
            <div className="gst-line-entry">
              <div className="gst-input-field">
                <label>item Name</label><br />
                <input type="text" className="gst-text-input textbox-middle" list="gst-product-list" ref={productNameRef} value={currentLine.name}
                  onChange={(e) => handleProductNameChange(e.target.value)}
                  onKeyDown={(e) => focusNextOnEnter(e, hsnRef)} />
              </div>
              {/* The option text shows the current stock beside each product name. */}
              <datalist id="gst-product-list">{productList.map((p) => <option key={p._id} value={p.name}>{`Stock: ${Number(p.StockQunity || 0)} ${p.Scale || ''}`}</option>)}</datalist>
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
            <legend>Bill lines</legend>
            <div className="gst-table-wrapper gst-lines-table-wrapper">
              <table className="gst-table gst-lines-table">
                <thead><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Price</th><th>GST%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th><th></th></tr></thead>
                <tbody>
                  {computedLines.length === 0 ? (
                    <tr><td colSpan="11" className="gst-no-entries">No lines added yet.</td></tr>
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

          {/* Left: transport details. Right: cash / credit / balance / remark. */}
          <fieldset className="gst-bill-bottom">
            {/* Transport details (e-way bill Part-B) */}
            <div className="gst-bill-bottom-left">
            {prefs.showTransport && <TransportFields value={billMeta.transport} onChange={setTransport} />}
            </div>
            {(prefs.showPayment || prefs.showRemark) && (
               <div className="gst-totals-side">
                {prefs.showPayment && (
                  <>
                    <div className="gst-input-field"><label>Cash received</label><input type="number" className="gst-small-input" min="0" step="0.01" value={billMeta.cash} onChange={(e) => setBillMeta((m) => ({ ...m, cash: e.target.value }))} /></div>
                    <div className="gst-input-field"><label>Credit</label><input type="number" className="gst-small-input" min="0" step="0.01" value={billMeta.credit} onChange={(e) => setBillMeta((m) => ({ ...m, credit: e.target.value }))} /></div>
                    <div className={`gst-balance-due ${balanceDue > 0 ? 'due' : balanceDue < 0 ? 'over' : 'settled'}`}>
                      <span>{balanceDue > 0 ? 'Balance due' : balanceDue < 0 ? 'Excess paid' : 'Balance due'}</span>
                      <strong>{money(Math.abs(balanceDue))}</strong>
                    </div>
                  </>
                )}
                {prefs.showRemark && (
                  <div className="gst-input-field gst-bill-remark-row"><label>Remark:</label><input type="text" className="gst-text-input" value={billMeta.notes} onChange={(e) => setBillMeta((m) => ({ ...m, notes: e.target.value }))} /></div>
                )}
              </div>
            )}
          </fieldset>

          {sourceDc && <p className="gst-form-status success">Creating this bill from delivery challan {sourceDc.challanNumber}. Clear the form to cancel.</p>}
          {sourcePo && <p className="gst-form-status success">Creating this bill from buyer's PO {sourcePo.poNumber}. Clear the form to cancel.</p>}
          {saveStatus.text && <p className={`gst-form-status ${saveStatus.type}`} role="alert">{saveStatus.text}</p>}
          {/* Totals table on the left, all buttons on the right. */}
          <div className="gst-bill-footer">
            <table className="gst-table gst-totals-table">
              <thead>
                <tr><th>Subtotal</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Round off</th><th>Grand total</th></tr>
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
            <div className="gst-form-actions">
              <div className="gst-print-last" title={lastSavedBill ? `Print ${lastSavedBill.billDetails?.invoiceNumber || 'the bill just saved'}` : 'Print the newest saved bill'}>
                <button type="button" className="gst-secondary-button" onClick={() => printBill(loadLastBill, 'A4')}>
                  🖨 Print last bill{lastSavedBill?.billDetails?.invoiceNumber ? ` (${lastSavedBill.billDetails.invoiceNumber})` : ''}
                </button>
                <button type="button" className="gst-secondary-button" onClick={() => printBill(loadLastBill, 'A5')}>A5</button>
              </div>
              <button type="button" className="gst-secondary-button" onClick={resetForm}>{editingId ? 'Cancel edit' : 'Clear'}</button>
              <button type="submit" className="gst-primary-button">{editingId ? 'Update bill' : 'Save bill'}</button>
            </div>
          </div>
        </form>
      </section>

      {prefs.showBillList && (
      <section className="gst-bill-list-card">

          <button  type="button" onClick={loadBills}>Refresh</button>

        <div className="gst-bill-filter" role="search">
          <label><span>From</span><input type="date" className='bill-filter-option' value={billFilter.startDate} onChange={(e) => setBillFilter((f) => ({ ...f, startDate: e.target.value }))} /></label>
          <label><span>To</span><input type="date" className='bill-filter-option' value={billFilter.endDate} onChange={(e) => setBillFilter((f) => ({ ...f, endDate: e.target.value }))} /></label>
          <label><span>Search</span><input type="search" className='bill-filter-option' value={billFilter.q} onChange={(e) => setBillFilter((f) => ({ ...f, q: e.target.value }))} placeholder="Bill no. or customer" /></label>
        </div>
        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead><tr><th>Bill No.</th>
            {/* <th>Date</th> */}
            <th>Customer</th>
            {/* <th>Tax type</th> */}
            <th>Grand total</th><th>Actions</th></tr></thead>
            <tbody>
              {bills.length === 0 ? <tr><td colSpan="6" className="gst-table-state">{billsStatus || 'No GST bills found.'}</td></tr> : bills.map((bill) => (
                <tr key={bill._id}>
                  <td className="gst-row-name">{bill.billDetails?.invoiceNumber}</td>
                  {/* <td>{toDateInput(bill.billDetails?.date)}</td> */}
                  <td>{bill.customer?.name}</td>
                  {/* <td>{bill.billDetails?.taxType === 'IGST' ? 'IGST' : 'CGST+SGST'}</td> */}
                  <td>{money(bill.billDetails?.grandTotal)}</td>
                  <td className="gst-row-actions">
                    <button type="button" className="gst-view-button" onClick={() => setViewBill(bill)}>View</button>
                    {/* <button type="button" className="gst-edit-button" onClick={() => loadBillForEdit(bill)}>Edit</button>
                    <button type="button" title="Print on A4" onClick={() => printBill(bill, 'A4')}>A4</button>
                    <button type="button" title="Print on A5" onClick={() => printBill(bill, 'A5')}>A5</button>
                    <button type="button" className="gst-delete-button" onClick={() => deleteBill(bill)}>Delete</button> */}
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

      {viewBill && (
        <div className="gst-view-overlay" onClick={() => setViewBill(null)}>
          <div className="gst-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gst-view-header">
              <h3>GST bill {viewBill.billDetails?.invoiceNumber}</h3>
              <div className="gst-view-options" ref={viewOptionsRef}>
                <button
                  type="button"
                  className="gst-view-options-trigger"
                  aria-haspopup="true"
                  aria-expanded={showViewOptions}
                  onClick={() => setShowViewOptions((v) => !v)}
                >
                  View options
                </button>
                {showViewOptions && (
                  <div className="gst-view-options-popup" role="menu">
                    <label className="gst-hsn-toggle">
                      <input
                        className="bill-filter-option"
                        type="checkbox"
                        checked={includeHsnSummary}
                        onChange={(e) => setIncludeHsnSummary(e.target.checked)}
                      />
                      <span>Include HSN</span>
                    </label>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setViewBill(null)}>✕</button>
            </div>
            <div className="gst-view-meta">
              <div><span>Customer</span><strong>{viewBill.customer?.name}</strong></div>
              <div><span>Date</span><strong>{toDateInput(viewBill.billDetails?.date)}</strong></div>
              <div><span>Tax type</span><strong>{viewBill.billDetails?.taxType === 'IGST' ? 'IGST' : 'CGST + SGST'}</strong></div>
              <div><span>Place of supply</span><strong>{viewBill.billDetails?.placeOfSupply || '—'}</strong></div>
              {hasAddress(viewBill.shippingAddress) && viewBill.shippingAddress.source !== 'billing' && <div><span>Ship to</span><strong>{viewBill.shippingAddress.contactName ? `${viewBill.shippingAddress.contactName}, ` : ''}{formatAddress(viewBill.shippingAddress)}</strong></div>}
              {viewBill.billDetails?.deliveryChallanNumber && <div><span>DC no. / date</span><strong>{viewBill.billDetails.deliveryChallanNumber}{viewBill.billDetails.deliveryChallanDate ? ` / ${toDateInput(viewBill.billDetails.deliveryChallanDate)}` : ''}</strong></div>}
              {viewBill.billDetails?.purchaseOrderNumber && <div><span>Buyer's PO no. / date</span><strong>{viewBill.billDetails.purchaseOrderNumber}{viewBill.billDetails.purchaseOrderDate ? ` / ${toDateInput(viewBill.billDetails.purchaseOrderDate)}` : ''}</strong></div>}
            </div>
            <table className="gst-view-table">
              <thead><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Price</th><th>GST%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead>
              <tbody>
                {(viewBill.items || []).map((p, index) => (
                  <tr key={index}><td>{p.name}</td><td>{p.hsnCode || '—'}</td><td>{p.quantity} {p.unit}</td><td>{money(p.rate)}</td><td>{p.gstRate}%</td><td>{money(p.taxableValue)}</td><td>{money(p.cgstAmount)}</td><td>{money(p.sgstAmount)}</td><td>{money(p.igstAmount)}</td><td>{money(p.amount)}</td></tr>
                ))}
              </tbody>
            </table>
            {hasTransport(viewBill.billDetails?.transport) && (
              <div className="gst-view-meta gst-view-transport">
                {transportRows(viewBill.billDetails.transport).map(([label, value]) => (
                  <div key={label}><span>{label}</span><strong>{value}</strong></div>
                ))}
              </div>
            )}
            <div className="gst-view-totals">
              <div><span>Subtotal</span><strong>{money(viewBill.billDetails?.totalTaxableValue)}</strong></div>
              <div><span>Total CGST</span><strong>{money(viewBill.billDetails?.totalCgst)}</strong></div>
              <div><span>Total SGST</span><strong>{money(viewBill.billDetails?.totalSgst)}</strong></div>
              <div><span>Total IGST</span><strong>{money(viewBill.billDetails?.totalIgst)}</strong></div>
              <div><span>Round off</span><strong>{money(viewBill.billDetails?.roundOff)}</strong></div>
              <div><span>Grand total</span><strong>{money(viewBill.billDetails?.grandTotal)}</strong></div>
              <div><span>Cash</span><strong>{money(viewBill.billDetails?.cash)}</strong></div>
              <div><span>Credit</span><strong>{money(viewBill.billDetails?.credit)}</strong></div>
            </div>
            <div className="gst-view-actions">
              <button type="button" onClick={() => printBill(viewBill, 'A4')}>Print A4</button>
              <button type="button" onClick={() => printBill(viewBill, 'A5')}>Print A5</button>
              <button type="button" onClick={() => { loadBillForEdit(viewBill); setViewBill(null); }}>Edit this bill</button>
              <button type="button" className="gst-delete-button" onClick={() => { deleteBill(viewBill); setViewBill(null); }}>Delete</button>
              <button type="button" onClick={() => setViewBill(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default GstBillEntry;
