import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../sale/gstbillentry.css';
import '../sale/gstbilllist.css';
import { DcViewModal } from './dcEntry';
import { printDc } from './dcTemplate';
import { formatDate } from '../../dateFormat';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => formatDate(value, '—');

const PAGE_SIZE = 20;
const emptyFilters = { q: '', startDate: '', endDate: '', status: '' };

// Report page for delivery challans: search, date range and status filters,
// server-side pagination, plus the shared view/print/convert modal.
const DcList = () => {
  const navigate = useNavigate();
  const [customerList, setCustomerList] = useState([]);
  const [invoiceSetting, setInvoiceSetting] = useState(null);

  const [challans, setChallans] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [viewDc, setViewDc] = useState(null);

  useEffect(() => {
    fetchJson('/api/customers').then(setCustomerList).catch(() => setCustomerList([]));
    fetchJson('/api/invoice-settings/active').then(setInvoiceSetting).catch(() => setInvoiceSetting(null));
  }, []);

  const loadChallans = useCallback(async (activeFilters = filters, activePage = page) => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([key, value]) => value && params.set(key, value));
    params.set('page', activePage);
    params.set('limit', PAGE_SIZE);
    try {
      const result = await fetchJson(`/api/delivery-challans?${params.toString()}`);
      setChallans(result.data || []);
      setTotal(result.total || 0);
      setPages(result.pages || 1);
    } catch (error) {
      setChallans([]);
      setMessage(error.message || 'Unable to load delivery challans.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadChallans(emptyFilters, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const submitFilter = (event) => {
    event.preventDefault();
    setPage(1);
    loadChallans(filters, 1);
  };

  const clear = () => {
    setFilters(emptyFilters);
    setPage(1);
    loadChallans(emptyFilters, 1);
  };

  const goToPage = (target) => {
    const next = Math.min(Math.max(1, target), pages);
    if (next === page) return;
    setPage(next);
    loadChallans(filters, next);
  };

  const deleteDc = async (dc) => {
    if (!window.confirm(`Delete delivery challan ${dc.billDetails?.challanNumber}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/delivery-challans/${dc._id}`, { method: 'DELETE' });
      loadChallans();
    } catch (error) {
      setMessage(error.message || 'Unable to delete delivery challan.');
    }
  };

  const pageTotal = challans.reduce((sum, dc) => sum + Number(dc.billDetails?.grandTotal || 0), 0);

  return (
    <main className="gst-bill-page">
      <section className="gst-bill-card gst-bill-list-page-card">
        <header className="gst-bill-list-header">
          <div>
            <p className="gst-bill-list-eyebrow">Delivery challan report</p>
            <h1>Delivery Challans</h1>
            <p>Search every challan by DC number, customer, vehicle or invoiced bill number.</p>
          </div>
          <button type="button" className="gst-secondary-button" onClick={() => loadChallans()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message && <p className="gst-form-status error" role="alert">{message}</p>}

        <form className="gst-bill-filter" onSubmit={submitFilter}>
          <label><span>Search</span>
            <input type="search" className="bill-filter-option" value={filters.q} onChange={(e) => update('q', e.target.value)} placeholder="DC no., customer or vehicle" />
          </label>
          <label><span>Start date</span>
            <input type="date" className="bill-filter-option" value={filters.startDate} onChange={(e) => update('startDate', e.target.value)} />
          </label>
          <label><span>End date</span>
            <input type="date" className="bill-filter-option" value={filters.endDate} onChange={(e) => update('endDate', e.target.value)} />
          </label>
          <label><span>Status</span>
            <select className="bill-filter-option" value={filters.status} onChange={(e) => update('status', e.target.value)}>
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Invoiced">Invoiced</option>
              <option value="Returned">Returned</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>
          <button type="submit" className="gst-primary-button">Apply filters</button>
          <button type="button" className="gst-secondary-button" onClick={clear}>Clear</button>
        </form>

        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead>
              <tr><th>DC No.</th><th>Date</th><th>Customer</th><th>Purpose</th><th>Vehicle</th><th>Status</th><th>Value</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="gst-table-state">Loading delivery challans…</td></tr>
              ) : challans.length === 0 ? (
                <tr><td colSpan="8" className="gst-table-state">No delivery challans match this filter.</td></tr>
              ) : challans.map((dc) => (
                <tr key={dc._id}>
                  <td className="gst-row-name">{dc.billDetails?.challanNumber}</td>
                  <td>{displayDate(dc.billDetails?.date)}</td>
                  <td>{dc.customer?.name}</td>
                  <td>{dc.billDetails?.reason}</td>
                  <td>{dc.transport?.vehicleNumber || '—'}</td>
                  <td>{dc.status}{dc.invoice?.invoiceNumber ? ` (${dc.invoice.invoiceNumber})` : ''}</td>
                  <td>{money(dc.billDetails?.grandTotal)}</td>
                  <td className="gst-row-actions">
                    <button type="button" className="gst-view-button" onClick={() => setViewDc(dc)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && challans.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan="6" className="gst-bill-list-total-label">This page's total</td>
                  <td className="gst-bill-list-total-value">{money(pageTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="gst-bill-list-pagination">
          <span>{total} challan{total === 1 ? '' : 's'} — page {page} of {pages}</span>
          <div className="gst-bill-list-pagination-buttons">
            <button type="button" onClick={() => goToPage(1)} disabled={page <= 1}>« First</button>
            <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Prev</button>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= pages}>Next ›</button>
            <button type="button" onClick={() => goToPage(pages)} disabled={page >= pages}>Last »</button>
          </div>
        </div>
      </section>

      {viewDc && (
        <DcViewModal
          dc={viewDc}
          onClose={() => setViewDc(null)}
          onPrint={(size) => printDc(viewDc, invoiceSetting, customerList, size)}
          onDelete={() => { deleteDc(viewDc); setViewDc(null); }}
          onConvert={() => navigate('/gst-billing', { state: { fromDc: viewDc } })}
        />
      )}
    </main>
  );
};

export default DcList;
