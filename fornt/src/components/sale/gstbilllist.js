import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '../../api';
import './gstbillentry.css';
import './gstbilllist.css';
import { buildGstBillDocumentHtml, PAPER_WINDOW } from './gstBillTemplate';
import { formatAddress, hasAddress } from '../common/shippingAddress';
import { transportRows } from '../common/transportDetails';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const PAGE_SIZE = 20;
const emptyFilters = { q: '', startDate: '', endDate: '', taxType: '' };

// Dedicated report page for GST bills: free-text search, date range and tax-type
// filters, server-side pagination, plus the same view/print modal as the entry page.
const GstBillList = () => {
  const navigate = useNavigate();
  const [customerList, setCustomerList] = useState([]);
  const [invoiceSetting, setInvoiceSetting] = useState(null);

  const [bills, setBills] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [viewBill, setViewBill] = useState(null);
  const [includeHsnSummary, setIncludeHsnSummary] = useState(true);
  const [showViewOptions, setShowViewOptions] = useState(false);
  const viewOptionsRef = useRef(null);

  useEffect(() => {
    fetchJson('/api/customers').then(setCustomerList).catch(() => setCustomerList([]));
    fetchJson('/api/invoice-settings/active').then(setInvoiceSetting).catch(() => setInvoiceSetting(null));
  }, []);

  const loadBills = useCallback(async (activeFilters = filters, activePage = page) => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([key, value]) => value && params.set(key, value));
    params.set('page', activePage);
    params.set('limit', PAGE_SIZE);
    try {
      const result = await fetchJson(`/api/gst-sales?${params.toString()}`);
      const list = result.data || [];
      setBills(list);
      // Keep the open bill if it's still in the list; otherwise open the latest one (list is newest first).
      setViewBill((current) => list.find((b) => b._id === current?._id) || list[0] || null);
      setTotal(result.total || 0);
      setPages(result.pages || 1);
    } catch (error) {
      setBills([]);
      setMessage(error.message || 'Unable to load GST bills.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadBills(emptyFilters, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the "View options" popover when clicking anywhere outside it.
  useEffect(() => {
    if (!showViewOptions) return;
    const handleOutsideClick = (e) => {
      if (viewOptionsRef.current && !viewOptionsRef.current.contains(e.target)) setShowViewOptions(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showViewOptions]);

  // Escape closes the right-hand bill panel.
  useEffect(() => {
    if (!viewBill) return undefined;
    const handleKey = (e) => { if (e.key === 'Escape') setViewBill(null); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [viewBill]);

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const submitFilter = (event) => {
    event.preventDefault();
    setPage(1);
    loadBills(filters, 1);
  };

  const clear = () => {
    setFilters(emptyFilters);
    setPage(1);
    loadBills(emptyFilters, 1);
  };

  const goToPage = (target) => {
    const next = Math.min(Math.max(1, target), pages);
    if (next === page) return;
    setPage(next);
    loadBills(filters, next);
  };

  const pageTotal = bills.reduce((sum, bill) => sum + Number(bill.billDetails?.grandTotal || 0), 0);

  // Layout/styling lives in ./gstBillTemplate.js — this just opens the window
  // synchronously (so popup blockers don't catch it) and fills it in once the
  // bill HTML is built; the template's own onload triggers print.
  const printBill = async (bill, size = 'A4') => {
    const { width, height } = PAPER_WINDOW[size] || PAPER_WINDOW.A4;
    const win = window.open('', '_blank', `width=${width},height=${height}`);
    if (!win) { alert('Please allow popups to print the bill.'); return; }
    win.document.write('<p style="font-family:sans-serif;padding:20px;">Preparing bill…</p>');
    try {
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
    <div className={`gst-bill-list-split${viewBill ? ' has-detail' : ''}`}>
      <section className="gst-bill-card gst-bill-list-page-card">
        <header className="gst-bill-list-header">
          <div>
            <h1 style={{ textAlign: 'center' }}>GST Bills List</h1>
          </div>
          <button type="button" className="gst-secondary-button" onClick={() => loadBills()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message && <p className="gst-form-status error" role="alert">{message}</p>}

        <form className="gst-bill-filter" onSubmit={submitFilter}>
          <label><span>Search</span>
            <input type="search" className="bill-filter-option" value={filters.q} onChange={(e) => update('q', e.target.value)} placeholder="Customer or bill no." />
          </label>
          <label><span>Start date</span>
            <input type="date" className="bill-filter-option" value={filters.startDate} onChange={(e) => update('startDate', e.target.value)} />
          </label>
          <label><span>End date</span>
            <input type="date" className="bill-filter-option" value={filters.endDate} onChange={(e) => update('endDate', e.target.value)} />
          </label>
          <label><span>Tax type</span>
            <select className="bill-filter-option" value={filters.taxType} onChange={(e) => update('taxType', e.target.value)}>
              <option value="">All</option>
              <option value="CGST_SGST">CGST + SGST</option>
              <option value="IGST">IGST</option>
            </select>
          </label>
          <button type="submit" className="gst-primary-button">Apply filters</button>
          <button type="button" className="gst-secondary-button" onClick={clear}>Clear</button>
        </form>

        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead>
              <tr><th>Bill No.</th><th>Date</th><th>Customer</th><th>Tax type</th><th>Grand total</th><th>Cash</th><th>Credit</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="gst-table-state">Loading GST bills…</td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan="8" className="gst-table-state">No GST bills match this filter.</td></tr>
              ) : bills.map((bill) => (
                // Clicking anywhere on the row opens the bill in the right-hand panel.
                <tr key={bill._id} className={`gst-bill-list-row${viewBill?._id === bill._id ? ' is-selected' : ''}`} onClick={() => setViewBill(bill)}>
                  <td className="gst-row-name">{bill.billDetails?.invoiceNumber}</td>
                  <td>{displayDate(bill.billDetails?.date)}</td>
                  <td>{bill.customer?.name}</td>
                  <td>{bill.billDetails?.taxType === 'IGST' ? 'IGST' : 'CGST+SGST'}</td>
                  <td>{money(bill.billDetails?.grandTotal)}</td>
                  <td>{money(bill.billDetails?.cash)}</td>
                  <td>{money(bill.billDetails?.credit)}</td>
                  <td className="gst-row-actions">
                    <button type="button" className="gst-view-button" onClick={() => setViewBill(bill)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && bills.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan="4" className="gst-bill-list-total-label">This page's total</td>
                  <td className="gst-bill-list-total-value">{money(pageTotal)}</td>
                  <td colSpan="3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="gst-bill-list-pagination">
          <span>{total} bill{total === 1 ? '' : 's'} — page {page} of {pages}</span>
          <div className="gst-bill-list-pagination-buttons">
            <button type="button" onClick={() => goToPage(1)} disabled={page <= 1}>« First</button>
            <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Prev</button>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= pages}>Next ›</button>
            <button type="button" onClick={() => goToPage(pages)} disabled={page >= pages}>Last »</button>
          </div>
        </div>
      </section>

      {/* Right-hand detail panel for the bill clicked in the list. */}
      {viewBill && (
          <aside className="gst-bill-detail-panel" aria-label={`GST bill ${viewBill.billDetails?.invoiceNumber || ''}`}>
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
            {/* Narrow preview: everything stacked in one column. */}
            <div className="gst-preview-total">
              <span>Grand total</span>
              <strong>{money(viewBill.billDetails?.grandTotal)}</strong>
            </div>
            <dl className="gst-preview-rows">
              <dt>Customer</dt><dd>{viewBill.customer?.name}</dd>
              <dt>Date</dt><dd>{displayDate(viewBill.billDetails?.date)}</dd>
              <dt>Tax type</dt><dd>{viewBill.billDetails?.taxType === 'IGST' ? 'IGST' : 'CGST + SGST'}</dd>
              <dt>Place of supply</dt><dd>{viewBill.billDetails?.placeOfSupply || '—'}</dd>
              {hasAddress(viewBill.shippingAddress) && viewBill.shippingAddress.source !== 'billing' && <><dt>Ship to</dt><dd>{viewBill.shippingAddress.contactName ? `${viewBill.shippingAddress.contactName}, ` : ''}{formatAddress(viewBill.shippingAddress)}</dd></>}
              {viewBill.billDetails?.deliveryChallanNumber && <><dt>DC no. / date</dt><dd>{viewBill.billDetails.deliveryChallanNumber}{viewBill.billDetails.deliveryChallanDate ? ` / ${displayDate(viewBill.billDetails.deliveryChallanDate)}` : ''}</dd></>}
              {viewBill.billDetails?.purchaseOrderNumber && <><dt>Buyer's PO / date</dt><dd>{viewBill.billDetails.purchaseOrderNumber}{viewBill.billDetails.purchaseOrderDate ? ` / ${displayDate(viewBill.billDetails.purchaseOrderDate)}` : ''}</dd></>}
              {transportRows(viewBill.billDetails?.transport).map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}
            </dl>

            <p className="gst-preview-heading">Items ({(viewBill.items || []).length})</p>
            <ul className="gst-preview-items">
              {(viewBill.items || []).map((p, index) => (
                <li key={index}>
                  <div className="gst-preview-item-top"><span>{p.name}</span><strong>{money(p.amount)}</strong></div>
                  <small>{p.quantity} {p.unit} × {money(p.rate)} · GST {p.gstRate}%{p.hsnCode ? ` · HSN ${p.hsnCode}` : ''}</small>
                </li>
              ))}
            </ul>

            <dl className="gst-preview-rows gst-preview-sums">
              <dt>Subtotal</dt><dd>{money(viewBill.billDetails?.totalTaxableValue)}</dd>
              {viewBill.billDetails?.taxType === 'IGST'
                ? <><dt>IGST</dt><dd>{money(viewBill.billDetails?.totalIgst)}</dd></>
                : <><dt>CGST</dt><dd>{money(viewBill.billDetails?.totalCgst)}</dd><dt>SGST</dt><dd>{money(viewBill.billDetails?.totalSgst)}</dd></>}
              <dt>Round off</dt><dd>{money(viewBill.billDetails?.roundOff)}</dd>
              <dt className="gst-preview-grand">Grand total</dt><dd className="gst-preview-grand">{money(viewBill.billDetails?.grandTotal)}</dd>
              <dt>Cash</dt><dd>{money(viewBill.billDetails?.cash)}</dd>
              <dt>Credit</dt><dd>{money(viewBill.billDetails?.credit)}</dd>
            </dl>
            <div className="gst-view-actions">
              <button type="button" onClick={() => printBill(viewBill, 'A4')}>Print A4</button>
              <button type="button" onClick={() => printBill(viewBill, 'A5')}>Print A5</button>
              <button type="button" onClick={() => navigate('/gst-billing', { state: { editBill: viewBill } })}>✎ Edit bill</button>
              <button type="button" onClick={() => setViewBill(null)}>Close</button>
            </div>
          </aside>
      )}
    </div>
    </main>
  );
};

export default GstBillList;
