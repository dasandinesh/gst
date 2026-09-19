import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import './gstbillentry.css';
import './gstbilllist.css';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const PAGE_SIZE = 20;
const emptyFilters = { q: '', startDate: '', endDate: '' };

// Dedicated report page for credit notes: free-text search (note no., original bill
// no. or customer), date range, server-side pagination, plus a read-only view modal.
const CreditNoteList = () => {
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [viewNote, setViewNote] = useState(null);

  const loadNotes = useCallback(async (activeFilters = filters, activePage = page) => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([key, value]) => value && params.set(key, value));
    params.set('page', activePage);
    params.set('limit', PAGE_SIZE);
    try {
      const result = await fetchJson(`/api/credit-notes?${params.toString()}`);
      setNotes(result.data || []);
      setTotal(result.total || 0);
      setPages(result.pages || 1);
    } catch (error) {
      setNotes([]);
      setMessage(error.message || 'Unable to load credit notes.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadNotes(emptyFilters, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const submitFilter = (event) => {
    event.preventDefault();
    setPage(1);
    loadNotes(filters, 1);
  };

  const clear = () => {
    setFilters(emptyFilters);
    setPage(1);
    loadNotes(emptyFilters, 1);
  };

  const goToPage = (target) => {
    const next = Math.min(Math.max(1, target), pages);
    if (next === page) return;
    setPage(next);
    loadNotes(filters, next);
  };

  const pageTotal = notes.reduce((sum, note) => sum + Number(note.bill_details?.creditNoteAmount || 0), 0);

  return (
    <main className="gst-bill-page">
      <section className="gst-bill-card gst-bill-list-page-card">
        <header className="gst-bill-list-header">
          <div>
            <p className="gst-bill-list-eyebrow">Credit note report</p>
            <h1>Credit Notes</h1>
            <p>Search every credit note by note number, original bill number, or customer.</p>
          </div>
          <button type="button" className="gst-secondary-button" onClick={() => loadNotes()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message && <p className="gst-form-status error" role="alert">{message}</p>}

        <form className="gst-bill-filter" onSubmit={submitFilter}>
          <label><span>Search</span>
            <input type="search" className="bill-filter-option" value={filters.q} onChange={(e) => update('q', e.target.value)} placeholder="Note no., bill no. or customer" />
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
              <tr><th>Note No.</th><th>Date</th><th>Against bill</th><th>Customer</th><th>Reason</th><th>Amount</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="gst-table-state">Loading credit notes…</td></tr>
              ) : notes.length === 0 ? (
                <tr><td colSpan="7" className="gst-table-state">No credit notes match this filter.</td></tr>
              ) : notes.map((note) => (
                <tr key={note._id}>
                  <td className="gst-row-name">{note.bill_details?.creditNoteNumber}</td>
                  <td>{displayDate(note.bill_details?.date)}</td>
                  <td>{note.originalBill?.billNumber}</td>
                  <td>{note.customer?.name}</td>
                  <td>{note.bill_details?.reason}</td>
                  <td>{money(note.bill_details?.creditNoteAmount)}</td>
                  <td className="gst-row-actions">
                    <button type="button" className="gst-view-button" onClick={() => setViewNote(note)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && notes.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan="5" className="gst-bill-list-total-label">This page's total</td>
                  <td className="gst-bill-list-total-value">{money(pageTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="gst-bill-list-pagination">
          <span>{total} note{total === 1 ? '' : 's'} — page {page} of {pages}</span>
          <div className="gst-bill-list-pagination-buttons">
            <button type="button" onClick={() => goToPage(1)} disabled={page <= 1}>« First</button>
            <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Prev</button>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= pages}>Next ›</button>
            <button type="button" onClick={() => goToPage(pages)} disabled={page >= pages}>Last »</button>
          </div>
        </div>
      </section>

      {viewNote && (
        <div className="gst-view-overlay" onClick={() => setViewNote(null)}>
          <div className="gst-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gst-view-header">
              <h3>Credit note {viewNote.bill_details?.creditNoteNumber}</h3>
              <button type="button" onClick={() => setViewNote(null)}>✕</button>
            </div>
            <div className="gst-view-meta">
              <div><span>Customer</span><strong>{viewNote.customer?.name}</strong></div>
              <div><span>Date</span><strong>{displayDate(viewNote.bill_details?.date)}</strong></div>
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
              <div><span>Credit note amount</span><strong>{money(viewNote.bill_details?.creditNoteAmount)}</strong></div>
            </div>
            <div className="gst-view-actions">
              <button type="button" onClick={() => setViewNote(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default CreditNoteList;
