import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../sale/gstbillentry.css';
import '../sale/gstbilllist.css';
import { PoViewModal } from './poEntry';
import { printPo } from './poTemplate';
import { formatDate } from '../../dateFormat';
import { getActiveSetting, withLogo } from '../../shopSettings';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => formatDate(value, '—');

const PAGE_SIZE = 20;
const emptyFilters = { q: '', startDate: '', endDate: '', status: '' };
const STATUSES = ['Open', 'Partly Billed', 'Billed', 'Closed', 'Cancelled'];

// Report page for buyers' purchase orders: search, date range and status filters,
// server-side pagination, plus the shared view/print/bill modal.
const PoList = () => {
  const navigate = useNavigate();
  const [customerList, setCustomerList] = useState([]);
  const [invoiceSetting, setInvoiceSetting] = useState(null);

  const [pos, setPos] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [viewPo, setViewPo] = useState(null);

  useEffect(() => {
    fetchJson('/api/customers').then(setCustomerList).catch(() => setCustomerList([]));
    getActiveSetting().then(withLogo).then(setInvoiceSetting).catch(() => setInvoiceSetting(null));
  }, []);

  const loadPos = useCallback(async (activeFilters = filters, activePage = page) => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([key, value]) => value && params.set(key, value));
    params.set('page', activePage);
    params.set('limit', PAGE_SIZE);
    try {
      const result = await fetchJson(`/api/buyer-pos?${params.toString()}`);
      setPos(result.data || []);
      setTotal(result.total || 0);
      setPages(result.pages || 1);
    } catch (error) {
      setPos([]);
      setMessage(error.message || 'Unable to load purchase orders.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadPos(emptyFilters, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const submitFilter = (event) => {
    event.preventDefault();
    setPage(1);
    loadPos(filters, 1);
  };

  const clear = () => {
    setFilters(emptyFilters);
    setPage(1);
    loadPos(emptyFilters, 1);
  };

  const goToPage = (target) => {
    const next = Math.min(Math.max(1, target), pages);
    if (next === page) return;
    setPage(next);
    loadPos(filters, next);
  };

  const deletePo = async (po) => {
    if (!window.confirm(`Delete purchase order ${po.billDetails?.poNumber}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/buyer-pos/${po._id}`, { method: 'DELETE' });
      loadPos();
    } catch (error) {
      setMessage(error.message || 'Unable to delete purchase order.');
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

  const pageTotal = pos.reduce((sum, po) => sum + Number(po.billDetails?.grandTotal || 0), 0);

  return (
    <main className="gst-bill-page">
      <section className="gst-bill-card gst-bill-list-page-card">
        <header className="gst-bill-list-header">
          <div>
            <p className="gst-bill-list-eyebrow">Buyer's purchase order report</p>
            <h1>Buyers' Purchase Orders</h1>
            <p>Search every PO by the buyer's PO number, customer or the GST bill raised against it.</p>
          </div>
          <button type="button" className="gst-secondary-button" onClick={() => loadPos()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message && <p className="gst-form-status error" role="alert">{message}</p>}

        <form className="gst-bill-filter" onSubmit={submitFilter}>
          <label><span>Search</span>
            <input type="search" className="bill-filter-option" value={filters.q} onChange={(e) => update('q', e.target.value)} placeholder="PO no., customer or bill no." />
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
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <button type="submit" className="gst-primary-button">Apply filters</button>
          <button type="button" className="gst-secondary-button" onClick={clear}>Clear</button>
        </form>

        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead>
              <tr><th>PO No.</th><th>PO Date</th><th>Customer</th><th>Delivery by</th><th>GST bills</th><th>Status</th><th>Value</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="gst-table-state">Loading purchase orders…</td></tr>
              ) : pos.length === 0 ? (
                <tr><td colSpan="8" className="gst-table-state">No purchase orders match this filter.</td></tr>
              ) : pos.map((po) => (
                <tr key={po._id}>
                  <td className="gst-row-name">{po.billDetails?.poNumber}</td>
                  <td>{displayDate(po.billDetails?.date)}</td>
                  <td>{po.customer?.name}</td>
                  <td>{displayDate(po.billDetails?.deliveryDate)}</td>
                  <td>{(po.invoices || []).map((inv) => inv.invoiceNumber).filter(Boolean).join(', ') || '—'}</td>
                  <td>{po.status}</td>
                  <td>{money(po.billDetails?.grandTotal)}</td>
                  <td className="gst-row-actions">
                    <button type="button" className="gst-view-button" onClick={() => setViewPo(po)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && pos.length > 0 && (
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
          <span>{total} purchase order{total === 1 ? '' : 's'} — page {page} of {pages}</span>
          <div className="gst-bill-list-pagination-buttons">
            <button type="button" onClick={() => goToPage(1)} disabled={page <= 1}>« First</button>
            <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Prev</button>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= pages}>Next ›</button>
            <button type="button" onClick={() => goToPage(pages)} disabled={page >= pages}>Last »</button>
          </div>
        </div>
      </section>

      {viewPo && (
        <PoViewModal
          po={viewPo}
          onClose={() => setViewPo(null)}
          onPrint={(size) => printPo(viewPo, invoiceSetting, customerList, size)}
          onDelete={() => { deletePo(viewPo); setViewPo(null); }}
          onStatus={(status) => changeStatus(viewPo, status)}
          onConvert={() => navigate('/gst-billing', { state: { fromPo: viewPo } })}
        />
      )}
    </main>
  );
};

export default PoList;
