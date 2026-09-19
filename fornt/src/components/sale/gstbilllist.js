import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../../api';
import './gstbillentry.css';
import './gstbilllist.css';
import { buildGstBillDocumentHtml, PAPER_WINDOW } from './gstBillTemplate';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const PAGE_SIZE = 20;
const emptyFilters = { q: '', startDate: '', endDate: '', taxType: '' };

// Dedicated report page for GST bills: free-text search, date range and tax-type
// filters, server-side pagination, plus the same view/print modal as the entry page.
const GstBillList = () => {
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
      setBills(result.data || []);
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

  const pageTotal = bills.reduce((sum, bill) => sum + Number(bill.bill_details?.billAmount || 0), 0);

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
      <section className="gst-bill-card gst-bill-list-page-card">
        <header className="gst-bill-list-header">
          <div>
            <p className="gst-bill-list-eyebrow">GST report</p>
            <h1>GST Bills</h1>
            <p>Search every GST bill by customer or bill number, filter by date and tax type.</p>
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
                <tr key={bill._id}>
                  <td className="gst-row-name">{bill.bill_details?.billNumber}</td>
                  <td>{displayDate(bill.bill_details?.date)}</td>
                  <td>{bill.customer?.name}</td>
                  <td>{bill.bill_details?.taxType === 'IGST' ? 'IGST' : 'CGST+SGST'}</td>
                  <td>{money(bill.bill_details?.billAmount)}</td>
                  <td>{money(bill.bill_details?.cash)}</td>
                  <td>{money(bill.bill_details?.credit)}</td>
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

      {viewBill && (
        <div className="gst-view-overlay" onClick={() => setViewBill(null)}>
          <div className="gst-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gst-view-header">
              <h3>GST bill {viewBill.bill_details?.billNumber}</h3>
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
              <div><span>Date</span><strong>{displayDate(viewBill.bill_details?.date)}</strong></div>
              <div><span>Tax type</span><strong>{viewBill.bill_details?.taxType === 'IGST' ? 'IGST' : 'CGST + SGST'}</strong></div>
              <div><span>Place of supply</span><strong>{viewBill.bill_details?.placeOfSupply || '—'}</strong></div>
            </div>
            <table className="gst-view-table">
              <thead><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Price</th><th>GST%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead>
              <tbody>
                {(viewBill.products || []).map((p, index) => (
                  <tr key={index}><td>{p.name}</td><td>{p.hsnCode || '—'}</td><td>{p.quantity} {p.unit}</td><td>{money(p.price)}</td><td>{p.gstRate}%</td><td>{money(p.taxableValue)}</td><td>{money(p.cgstAmount)}</td><td>{money(p.sgstAmount)}</td><td>{money(p.igstAmount)}</td><td>{money(p.total)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="gst-view-totals">
              <div><span>Subtotal</span><strong>{money(viewBill.bill_details?.subtotal)}</strong></div>
              <div><span>Total CGST</span><strong>{money(viewBill.bill_details?.totalCgst)}</strong></div>
              <div><span>Total SGST</span><strong>{money(viewBill.bill_details?.totalSgst)}</strong></div>
              <div><span>Total IGST</span><strong>{money(viewBill.bill_details?.totalIgst)}</strong></div>
              <div><span>Round off</span><strong>{money(viewBill.bill_details?.roundOff)}</strong></div>
              <div><span>Grand total</span><strong>{money(viewBill.bill_details?.billAmount)}</strong></div>
              <div><span>Cash</span><strong>{money(viewBill.bill_details?.cash)}</strong></div>
              <div><span>Credit</span><strong>{money(viewBill.bill_details?.credit)}</strong></div>
            </div>
            <div className="gst-view-actions">
              <button type="button" onClick={() => printBill(viewBill, 'A4')}>Print A4</button>
              <button type="button" onClick={() => printBill(viewBill, 'A5')}>Print A5</button>
              <button type="button" onClick={() => setViewBill(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default GstBillList;
