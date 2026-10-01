import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import '../sale/gstbillentry.css';
import '../sale/gstbilllist.css';
import { buildEstimateDocumentHtml, PAPER_WINDOW } from './estimateBillTemplate';
import { formatDate } from '../../dateFormat';
import { getActiveSetting, withLogo } from '../../shopSettings';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => formatDate(value, '—');

const PAGE_SIZE = 20;
const emptyFilters = { q: '', startDate: '', endDate: '' };

// Dedicated report page for estimates: free-text search, date range filters,
// server-side pagination, plus the same view/print modal as the entry page.
const EstimateBillList = () => {
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

  useEffect(() => {
    fetchJson('/api/estimate-customers').then(setCustomerList).catch(() => setCustomerList([]));
    getActiveSetting().then(withLogo).then(setInvoiceSetting).catch(() => setInvoiceSetting(null));
  }, []);

  const loadBills = useCallback(async (activeFilters = filters, activePage = page) => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([key, value]) => value && params.set(key, value));
    params.set('page', activePage);
    params.set('limit', PAGE_SIZE);
    try {
      const result = await fetchJson(`/api/estimate-bills?${params.toString()}`);
      setBills(result.data || []);
      setTotal(result.total || 0);
      setPages(result.pages || 1);
    } catch (error) {
      setBills([]);
      setMessage(error.message || 'Unable to load estimates.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadBills(emptyFilters, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const deleteBill = async (bill) => {
    if (!window.confirm(`Delete estimate ${bill.billDetails?.estimateNumber}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/estimate-bills/${bill._id}`, { method: 'DELETE' });
      setViewBill(null);
      loadBills();
    } catch (error) {
      setMessage(error.message || 'Unable to delete estimate.');
    }
  };

  const pageTotal = bills.reduce((sum, bill) => sum + Number(bill.billDetails?.grandTotal || 0), 0);

  // Layout/styling lives in ./estimateBillTemplate.js — this just opens the window
  // synchronously (so popup blockers don't catch it) and fills it in once the
  // estimate HTML is built; the template's own onload triggers print.
  const printBill = async (bill, size = 'A4') => {
    const { width, height } = PAPER_WINDOW[size] || PAPER_WINDOW.A4;
    const win = window.open('', '_blank', `width=${width},height=${height}`);
    if (!win) { alert('Please allow popups to print the estimate.'); return; }
    win.document.write('<p style="font-family:sans-serif;padding:20px;">Preparing estimate…</p>');
    try {
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

  return (
    <main className="gst-bill-page">
      <section className="gst-bill-card gst-bill-list-page-card">
        <header className="gst-bill-list-header">
          <div>
            <p className="gst-bill-list-eyebrow">Estimate report</p>
            <h1>Estimate Bills</h1>
            <p>Search every estimate by customer or estimate number, filter by date.</p>
          </div>
          <button type="button" className="gst-secondary-button" onClick={() => loadBills()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message && <p className="gst-form-status error" role="alert">{message}</p>}

        <form className="gst-bill-filter" onSubmit={submitFilter}>
          <label><span>Search</span>
            <input type="search" className="bill-filter-option" value={filters.q} onChange={(e) => update('q', e.target.value)} placeholder="Customer or estimate no." />
          </label>
          <label><span>Start date</span>
            <input type="date" className="bill-filter-option" value={filters.startDate} onChange={(e) => update('startDate', e.target.value)} />
          </label>
          <label><span>End date</span>
            <input type="date" className="bill-filter-option" value={filters.endDate} onChange={(e) => update('endDate', e.target.value)} />
          </label>
          <button type="submit" className="gst-primary-button">Apply filters</button>
          <button type="button" className="gst-secondary-button" onClick={clear}>Clear</button>
        </form>

        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead>
              <tr><th>Estimate No.</th><th>Date</th><th>Customer</th><th>Grand total</th><th>Cash</th><th>Credit</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="gst-table-state">Loading estimates…</td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan="7" className="gst-table-state">No estimates match this filter.</td></tr>
              ) : bills.map((bill) => (
                <tr key={bill._id}>
                  <td className="gst-row-name">{bill.billDetails?.estimateNumber}</td>
                  <td>{displayDate(bill.billDetails?.date)}</td>
                  <td>{bill.customer?.name}</td>
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
                  <td colSpan="3" className="gst-bill-list-total-label">This page's total</td>
                  <td className="gst-bill-list-total-value">{money(pageTotal)}</td>
                  <td colSpan="3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="gst-bill-list-pagination">
          <span>{total} estimate{total === 1 ? '' : 's'} — page {page} of {pages}</span>
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
              <h3>Estimate {viewBill.billDetails?.estimateNumber}</h3>
              <button type="button" onClick={() => setViewBill(null)}>✕</button>
            </div>
            <div className="gst-view-meta">
              <div><span>Customer</span><strong>{viewBill.customer?.name}</strong></div>
              <div><span>Date</span><strong>{displayDate(viewBill.billDetails?.date)}</strong></div>
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
              <button type="button" className="gst-delete-button" onClick={() => deleteBill(viewBill)}>Delete</button>
              <button type="button" onClick={() => setViewBill(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default EstimateBillList;
