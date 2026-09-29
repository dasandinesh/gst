import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import EstimateProductAdd from './estimateProductAdd';
import '../cutomer/customerlist.css';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const emptyProduct = { name: '', barcode: '', unit: '', price: '', mainGodownQuantity: 0, notes: '' };
const numeric = ['price', 'mainGodownQuantity'];

const EstimateProductList = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: emptyProduct });

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/estimate-products');
      setProducts(data);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const openEdit = (product) => {
    setMessage({ type: '', text: '' });
    setEditingProduct(product);
    reset({ ...emptyProduct, ...product });
  };

  const closeEdit = () => {
    setEditingProduct(null);
    reset(emptyProduct);
  };

  const saveProduct = async (values) => {
    const data = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numeric.includes(key) ? Number(value || 0) : value]));
    try {
      const updated = await fetchJson(`/api/estimate-products/${editingProduct._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setProducts((items) => items.map((item) => item._id === updated._id ? updated : item));
      closeEdit();
      setMessage({ type: 'success', text: 'Estimate product updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/estimate-products/${product._id}`, { method: 'DELETE' });
      setProducts((items) => items.filter((item) => item._id !== product._id));
      setMessage({ type: 'success', text: 'Estimate product deleted successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const filtered = products.filter((p) => [p.name, p.barcode, p.unit].some((value) => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));

  return (
    <main className="customer-list-page">
      <section className="customer-list-card">
        <header className="customer-list-header">
          <div>
            <p className="customer-list-eyebrow">Estimate management</p>
            <h1>Estimate products</h1>
            <p>View, search, edit, or remove estimate products and their main godown quantity.</p>
          </div>
          <div className="list-header-actions">
            <button className="primary-button" type="button" onClick={() => setShowAddModal(true)}>+ Add estimate product</button>
            <button className="refresh-button" type="button" onClick={loadProducts} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          </div>
        </header>

        {message.text && <p className={`customer-message ${message.type}`} role="alert">{message.text}</p>}

        <div className="customer-filter" role="search">
          <label><span>Search</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, barcode, unit" /></label>
        </div>

        <div className="customer-table-wrapper">
          <table className="customer-table">
            <thead>
              <tr><th>Name</th><th>Barcode</th><th>Unit</th><th>Price</th><th>Main godown qty</th><th aria-label="Actions">Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="customer-table-state">Loading estimate products…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="6" className="customer-table-state">{products.length === 0 ? 'No estimate products found.' : 'No products match this search.'}</td></tr>
              ) : filtered.map((product) => (
                <tr key={product._id}>
                  <td className="customer-name">{product.name}</td>
                  <td>{product.barcode || '—'}</td>
                  <td>{product.unit || '—'}</td>
                  <td>{money(product.price)}</td>
                  <td>{Number(product.mainGodownQuantity || 0)}</td>
                  <td className="customer-actions">
                    <button type="button" className="edit-button" onClick={() => openEdit(product)}>Edit</button>
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
          <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="add-estimate-product-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="customer-modal-heading"><h2 id="add-estimate-product-title">Add estimate product</h2><button type="button" aria-label="Close" onClick={() => setShowAddModal(false)}>×</button></div>
            <EstimateProductAdd embedded onCancel={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); loadProducts(); setMessage({ type: 'success', text: 'Estimate product saved successfully.' }); }} />
          </section>
        </div>
      )}

      {editingProduct && (
        <div className="customer-modal-backdrop" role="presentation" onMouseDown={closeEdit}>
          <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-estimate-product-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="customer-modal-heading"><h2 id="edit-estimate-product-title">Edit estimate product</h2><button type="button" aria-label="Close" onClick={closeEdit}>×</button></div>
            <form onSubmit={handleSubmit(saveProduct)} className="customer-edit-form">
              <label><span>Product name <b>*</b></span><input type="text" {...register('name', { required: 'Product name is required.' })} />{errors.name && <small>{errors.name.message}</small>}</label>
              <label><span>Barcode</span><input type="text" {...register('barcode')} /></label>
              <label><span>Unit</span><input type="text" {...register('unit')} /></label>
              <label><span>Price <b>*</b></span><input type="number" min="0" step="0.01" {...register('price', { required: 'Price is required.' })} /></label>
              <label><span>Main godown quantity <b>*</b></span><input type="number" min="0" step="1" {...register('mainGodownQuantity', { required: 'Main godown quantity is required.' })} /></label>
              <label className="customer-field-wide"><span>Notes</span><textarea rows="3" {...register('notes')} /></label>
              {message.type === 'error' && <p className="customer-message error modal-error" role="alert">{message.text}</p>}
              <div className="modal-actions"><button type="button" className="modal-cancel" onClick={closeEdit}>Cancel</button><button type="submit" className="modal-save" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

export default EstimateProductList;
