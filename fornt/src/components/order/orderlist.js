import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import '../../components/cutomer/customerlist.css';

const currency = (value) => `₹${Number(value || 0).toFixed(2)}`;
const displayDate = (value) => value ? new Date(value).toLocaleDateString() : '—';

const OrderList = () => {
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({ customer: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const loadOrders = useCallback(async (activeFilters = filters) => {
    setLoading(true); setMessage('');
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([key, value]) => value && params.set(key, value));
    try {
      const data = await fetchJson(`/api/orders${params.toString() ? `?${params}` : ''}`);
      setOrders(data);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }, [filters]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only, not on every filters change
  useEffect(() => { loadOrders({ customer: '', startDate: '', endDate: '' }); }, []);
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const submitFilter = (event) => { event.preventDefault(); loadOrders(); };
  const clear = () => { const empty = { customer: '', startDate: '', endDate: '' }; setFilters(empty); loadOrders(empty); };
  return <main className="customer-list-page"><section className="customer-list-card"><header className="customer-list-header"><div><p className="customer-list-eyebrow">Order management</p><h1>Orders</h1><p>Filter orders by customer or billing date.</p></div><button type="button" className="refresh-button" onClick={() => loadOrders()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button></header>{message && <p className="customer-message error" role="alert">{message}</p>}<form className="customer-filter" onSubmit={submitFilter}><label><span>Customer name</span><input type="search" value={filters.customer} onChange={(event) => update('customer', event.target.value)} placeholder="Search customer" /></label><label><span>Start date</span><input type="date" value={filters.startDate} onChange={(event) => update('startDate', event.target.value)} /></label><label><span>End date</span><input type="date" value={filters.endDate} onChange={(event) => update('endDate', event.target.value)} /></label><button type="submit">Apply filters</button><button type="button" onClick={clear}>Clear</button></form><div className="customer-table-wrapper"><table className="customer-table"><thead><tr><th>Bill no.</th><th>Date</th><th>Customer</th><th>Products</th><th>Quantity</th><th>Amount</th><th>Status</th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="customer-table-state">Loading orders…</td></tr> : orders.length === 0 ? <tr><td colSpan="7" className="customer-table-state">No orders match this filter.</td></tr> : orders.map((order) => <tr key={order._id}><td>{order.bill_details?.order_sno || '—'}</td><td>{displayDate(order.bill_details?.date)}</td><td className="customer-name">{order.customer?.name}</td><td>{order.products?.map((product) => product.name).join(', ') || '—'}</td><td>{order.bill_details?.total_quantity || 0}</td><td>{currency(order.bill_details?.bill_amount)}</td><td>{order.bill_details?.billed ? 'Billed' : 'Pending'}</td></tr>)}</tbody></table></div></section></main>;
};

export default OrderList;
