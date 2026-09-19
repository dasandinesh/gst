import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '../../api';
import ProductAdd from './productadd';
import '../../components/cutomer/customerlist.css';
import './productlist.css';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const ProductList = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showAddModal, setShowAddModal] = useState(false);

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

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/products/${product._id}`, { method: 'DELETE' });
      setProducts((items) => items.filter((item) => item._id !== product._id));
      setMessage({ type: 'success', text: 'Product deleted successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const filtered = products.filter((p) => [p.name, p.hsnCode, p.category, p.barcode, p.Malayalam, p.Tamil].some((value) => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));

  return (
    <main className="customer-list-page">
      <section className="customer-list-card">
        <header className="customer-list-header">
          <div>
            <p className="customer-list-eyebrow">Product management</p>
            <h1>Products</h1>
            <p>View, search, or remove products in your catalog.</p>
          </div>
          <div className="list-header-actions">
            <button className="primary-button" type="button" onClick={() => setShowAddModal(true)}>+ Add product</button>
            <button className="refresh-button" type="button" onClick={loadProducts} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          </div>
        </header>

        {message.text && <p className={`customer-message ${message.type}`} role="alert">{message.text}</p>}

        <div className="customer-filter" role="search">
          <label><span>Search</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, HSN, category, barcode" /></label>
        </div>

        <div className="customer-table-wrapper">
          <table className="customer-table">
            <thead>
              <tr><th>Name</th><th>HSN code</th><th>Category</th><th>Price</th><th>GST %</th><th>Stock</th><th aria-label="Actions">Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="customer-table-state">Loading products…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="7" className="customer-table-state">{products.length === 0 ? 'No products found.' : 'No products match this search.'}</td></tr>
              ) : filtered.map((product) => (
                <tr key={product._id}>
                  <td className="customer-name">{product.name}<br /><small>{[product.Malayalam, product.Tamil].filter(Boolean).join(' / ')}</small></td>
                  <td>{product.hsnCode || '—'}</td>
                  <td>{product.category || '—'}</td>
                  <td>{money(product.Price)}</td>
                  <td>{Number(product.gstpre || 0)}%</td>
                  <td>{Number(product.StockQunity || 0)}</td>
                  <td className="customer-actions">
                    <button type="button" className="view-button" onClick={() => navigate(`/product-list/${product._id}`)}>View</button>
                    <button type="button" className="delete-button" onClick={() => deleteProduct(product)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showAddModal && (
        <div className="customer-modal-backdrop" role="presentation" onMouseDown={() => setShowAddModal(false)}>
          <section className="customer-modal product-add-modal" role="dialog" aria-modal="true" aria-labelledby="add-product-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="customer-modal-heading"><h2 id="add-product-title">Add product</h2><button type="button" aria-label="Close" onClick={() => setShowAddModal(false)}>×</button></div>
            <ProductAdd embedded onCancel={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); loadProducts(); setMessage({ type: 'success', text: 'Product saved successfully.' }); }} />
          </section>
        </div>
      )}
    </main>
  );
};

export default ProductList;
