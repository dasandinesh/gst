import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import '../../components/cutomer/customerlist.css';
import './salebilllist.css';

const currency = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const PAGE_SIZE = 20;
const emptyFilters = { q: '', startDate: '', endDate: '', billed: '' };

// Report-style browse of every sale bill: free-text search (customer or bill no.),
// date range, billed/pending status, and server-side pagination.
const SaleBillList = () => {
  const [sales, setSales] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadSales = useCallback(async (activeFilters = filters, activePage = page) => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([key, value]) => value && params.set(key, value));
    params.set('page', activePage);
    params.set('limit', PAGE_SIZE);
    try {
      const result = await fetchJson(`/api/sales?${params.toString()}`);
      setSales(result.data || []);
      setTotal(result.total || 0);
      setPages(result.pages || 1);
    } catch (error) {
      setSales([]);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadSales(emptyFilters, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const submitFilter = (event) => {
    event.preventDefault();
    setPage(1);
    loadSales(filters, 1);
  };

  const clear = () => {
    setFilters(emptyFilters);
    setPage(1);
    loadSales(emptyFilters, 1);
  };

  const goToPage = (target) => {
    const next = Math.min(Math.max(1, target), pages);
    if (next === page) return;
    setPage(next);
    loadSales(filters, next);
  };

  const pageTotal = sales.reduce((sum, sale) => sum + Number(sale.bill_details?.bill_amount || 0), 0);

  return (
    <main className="customer-list-page">
      <section className="customer-list-card">
        <header className="customer-list-header">
          <div>
            <p className="customer-list-eyebrow">Sales report</p>
            <h1>Sale Bills</h1>
            <p>Search every sale bill by customer or bill number, filter by date and status.</p>
          </div>
          <button type="button" className="refresh-button" onClick={() => loadSales()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message && <p className="customer-message error" role="alert">{message}</p>}

        <form className="customer-filter" onSubmit={submitFilter}>
          <label><span>Search</span>
            <input type="search" value={filters.q} onChange={(e) => update('q', e.target.value)} placeholder="Customer or bill no." />
          </label>
          <label><span>Start date</span>
            <input type="date" value={filters.startDate} onChange={(e) => update('startDate', e.target.value)} />
          </label>
          <label><span>End date</span>
            <input type="date" value={filters.endDate} onChange={(e) => update('endDate', e.target.value)} />
          </label>
          <label><span>Status</span>
            <select value={filters.billed} onChange={(e) => update('billed', e.target.value)}>
              <option value="">All</option>
              <option value="true">Billed</option>
              <option value="false">Pending</option>
            </select>
          </label>
          <button type="submit">Apply filters</button>
          <button type="button" onClick={clear}>Clear</button>
        </form>

        <div className="customer-table-wrapper">
          <table className="customer-table">
            <thead>
              <tr><th>Bill no.</th><th>Date</th><th>Customer</th><th>Products</th><th>Quantity</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="customer-table-state">Loading sales…</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan="7" className="customer-table-state">No sale bills match this filter.</td></tr>
              ) : sales.map((sale) => (
                <tr key={sale._id}>
                  <td>{sale.bill_details?.order_sno || '—'}</td>
                  <td>{displayDate(sale.bill_details?.date)}</td>
                  <td className="customer-name">{sale.customer?.name || '—'}</td>
                  <td>{sale.products?.map((p) => p.name).join(', ') || '—'}</td>
                  <td>{sale.bill_details?.total_quantity || 0}</td>
                  <td>{currency(sale.bill_details?.bill_amount)}</td>
                  <td>{sale.bill_details?.billed ? 'Billed' : 'Pending'}</td>
                </tr>
              ))}
            </tbody>
            {!loading && sales.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan="5" className="sale-bill-list-total-label">This page's total</td>
                  <td className="sale-bill-list-total-value">{currency(pageTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="sale-bill-list-pagination">
          <span>{total} bill{total === 1 ? '' : 's'} — page {page} of {pages}</span>
          <div className="sale-bill-list-pagination-buttons">
            <button type="button" onClick={() => goToPage(1)} disabled={page <= 1}>« First</button>
            <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹ Prev</button>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= pages}>Next ›</button>
            <button type="button" onClick={() => goToPage(pages)} disabled={page >= pages}>Last »</button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default SaleBillList;
