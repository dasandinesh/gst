import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import '../sale/gstbillentry.css';
import './stockmaintenance.css';

const StockMaintenance = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [deltas, setDeltas] = useState({});
  const [savingId, setSavingId] = useState(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/products');
      setProducts(data);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const isLowStock = (product) => Number(product.reorderLevel || 0) > 0 && Number(product.StockQunity || 0) <= Number(product.reorderLevel || 0);

  const filteredProducts = products.filter((product) => {
    if (search.trim() && !product.name?.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (lowStockOnly && !isLowStock(product)) return false;
    return true;
  });

  const setDelta = (id, value) => setDeltas((current) => ({ ...current, [id]: value }));

  const adjustStock = async (product, sign) => {
    const raw = Number(deltas[product._id]);
    if (!raw) {
      setMessage({ type: 'error', text: 'Enter a quantity to adjust.' });
      return;
    }
    setMessage({ type: '', text: '' });
    setSavingId(product._id);
    try {
      const updated = await fetchJson(`/api/products/${product._id}/adjust-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: sign * Math.abs(raw) }),
      });
      setProducts((items) => items.map((item) => item._id === updated._id ? updated : item));
      setDelta(product._id, '');
      setMessage({ type: 'success', text: `Stock updated for ${product.name}.` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSavingId(null);
    }
  };

  const lowStockCount = products.filter(isLowStock).length;

  return (
    <main className="gst-bill-page">
      <section className="gst-bill-card stock-page-card">
        <header className="gst-bill-list-header">
          <div>
            <p className="gst-bill-list-eyebrow">Inventory</p>
            <h1>Stock Maintenance</h1>
            <p>View current stock on hand and correct it manually (stock take, damage, opening balance).</p>
          </div>
          <button type="button" className="gst-secondary-button" onClick={loadProducts} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message.text && <p className={`gst-form-status ${message.type}`} role="alert">{message.text}</p>}

        <div className="gst-bill-filter" role="search">
          <label><span>Search</span><input type="search" className="bill-filter-option" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Product name" /></label>
          <label className="stock-low-toggle">
            <span>Low stock only {lowStockCount > 0 && `(${lowStockCount})`}</span>
            <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          </label>
        </div>

        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead>
              <tr><th>Product</th><th>HSN</th><th>Unit</th><th>Stock on hand</th><th>Reorder level</th><th>Status</th><th>Adjust</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="gst-table-state">Loading stock…</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan="7" className="gst-table-state">No products match this filter.</td></tr>
              ) : filteredProducts.map((product) => (
                <tr key={product._id} className={isLowStock(product) ? 'stock-row-low' : ''}>
                  <td className="gst-row-name">{product.name}</td>
                  <td>{product.hsnCode || '—'}</td>
                  <td>{product.Scale || '—'}</td>
                  <td>{Number(product.StockQunity || 0)}</td>
                  <td>{Number(product.reorderLevel || 0)}</td>
                  <td>{isLowStock(product) ? <span className="stock-badge-low">Low</span> : <span className="stock-badge-ok">OK</span>}</td>
                  <td className="stock-adjust-cell">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="gst-small-input"
                      value={deltas[product._id] || ''}
                      onChange={(e) => setDelta(product._id, e.target.value)}
                      disabled={savingId === product._id}
                    />
                    <button type="button" className="gst-add-button stock-add-btn" onClick={() => adjustStock(product, 1)} disabled={savingId === product._id}>+ In</button>
                    <button type="button" className="gst-delete-button stock-out-btn" onClick={() => adjustStock(product, -1)} disabled={savingId === product._id}>− Out</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
};

export default StockMaintenance;
