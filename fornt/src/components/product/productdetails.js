import React, { useCallback, useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchJson } from '../../api';
import '../../components/cutomer/customerdetails.css';
import './productdetails.css';

const emptyProduct = {
  name: '', hsnCode: '', category: '', barcode: '',
  Malayalam: '', Tamil: '', Scale: '', ScaleNo: 0,
  Price: '', gstpre: '', gstMode: 'exclusive', wholesalePrice: 0,
  StockQunity: 0, reorderLevel: 0,
  notes: '', entries: [],
};
const numeric = ['ScaleNo', 'Price', 'gstpre', 'wholesalePrice', 'StockQunity', 'reorderLevel'];
const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const ProductDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm({ defaultValues: emptyProduct });
  const { fields, append, remove } = useFieldArray({ control, name: 'entries' });

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson(`/api/products/${id}`);
      setProduct(data);
      reset({ ...emptyProduct, ...data });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, [id, reset]);
  useEffect(() => { loadProduct(); }, [loadProduct]);

  const saveProduct = async (values) => {
    const data = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numeric.includes(key) ? Number(value || 0) : value]));
    try {
      const updated = await fetchJson(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      setProduct(updated);
      reset({ ...emptyProduct, ...updated });
      setEditing(false);
      setMessage({ type: 'success', text: 'Product updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const deleteProduct = async () => {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    try {
      await fetchJson(`/api/products/${id}`, { method: 'DELETE' });
      navigate('/product-list');
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  if (loading) return <main className="customer-details-page"><p>Loading product…</p></main>;
  if (!product) return (
    <main className="customer-details-page">
      <button type="button" className="back-button" onClick={() => navigate('/product-list')}>← Back to products</button>
      {message.text && <p className="details-message error">{message.text}</p>}
    </main>
  );

  return (
    <main className="customer-details-page">
      <section className="customer-details-card">
        <button type="button" className="back-button" onClick={() => navigate('/product-list')}>← Back to products</button>
        <header className="customer-details-header">
          <div><p>Product details</p><h1>{product.name}</h1></div>
          <div className="details-actions">
            <button type="button" className="edit-button" onClick={() => { setEditing(true); setMessage({ type: '', text: '' }); }}>Edit</button>
            <button type="button" className="delete-button" onClick={deleteProduct}>Delete</button>
          </div>
        </header>

        {message.text && <p className={`details-message ${message.type}`}>{message.text}</p>}

        {editing ? (
          <form className="customer-details-form" onSubmit={handleSubmit(saveProduct)}>
            <label>Product name <b>*</b><input {...register('name', { required: 'Product name is required.' })} />{errors.name && <small>{errors.name.message}</small>}</label>
            <label>HSN code<input {...register('hsnCode')} /></label>
            <label>Category<input {...register('category')} /></label>
            <label>Barcode<input {...register('barcode')} /></label>
            <label>Malayalam name<input {...register('Malayalam')} /></label>
            <label>Tamil name<input {...register('Tamil')} /></label>
            <label>Scale (unit)<input {...register('Scale')} /></label>
            <label>Scale number<input type="number" step="0.01" {...register('ScaleNo')} /></label>
            <label>Selling price <b>*</b><input type="number" min="0" step="0.01" {...register('Price', { required: 'Selling price is required.' })} />{errors.Price && <small>{errors.Price.message}</small>}</label>
            <label>GST % <b>*</b><input type="number" min="0" max="100" step="0.01" {...register('gstpre', { required: 'GST percentage is required.' })} />{errors.gstpre && <small>{errors.gstpre.message}</small>}</label>
            <label>GST mode<select {...register('gstMode')}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option></select></label>
            <label>Wholesale price<input type="number" min="0" step="0.01" {...register('wholesalePrice')} /></label>
            <label>Stock quantity <b>*</b><input type="number" min="0" step="1" {...register('StockQunity', { required: 'Stock quantity is required.' })} />{errors.StockQunity && <small>{errors.StockQunity.message}</small>}</label>
            <label>Reorder level<input type="number" min="0" step="1" {...register('reorderLevel')} /></label>
            <label className="details-field-wide">Notes<textarea rows="3" {...register('notes')} /></label>

            <div className="details-field-wide">
              <p className="entries-heading">Batch / serial entries</p>
              {fields.length === 0 && <p className="no-entries">No entries added yet.</p>}
              <div className="entries-list">
                {fields.map((field, index) => (
                  <div className="entry-row" key={field.id}>
                    <label>Serial number<input {...register(`entries.${index}.serialNumber`)} /></label>
                    <label>Date<input type="date" {...register(`entries.${index}.date`)} /></label>
                    <label>Batch / patch number<input {...register(`entries.${index}.patchNumber`)} /></label>
                    <button type="button" className="remove-entry-button" onClick={() => remove(index)}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" className="add-entry-button" onClick={() => append({ serialNumber: '', date: '', patchNumber: '' })}>+ Add entry</button>
            </div>

            <div className="form-actions">
              <button type="button" className="back-button" onClick={() => { reset({ ...emptyProduct, ...product }); setEditing(false); }}>Cancel</button>
              <button type="submit" className="save-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        ) : (
          <>
            <dl className="customer-details-grid">
              <div><dt>HSN code</dt><dd>{product.hsnCode || '—'}</dd></div>
              <div><dt>Category</dt><dd>{product.category || '—'}</dd></div>
              <div><dt>Barcode</dt><dd>{product.barcode || '—'}</dd></div>
              <div><dt>Malayalam name</dt><dd>{product.Malayalam || '—'}</dd></div>
              <div><dt>Tamil name</dt><dd>{product.Tamil || '—'}</dd></div>
              <div><dt>Scale</dt><dd>{product.Scale || '—'} {product.ScaleNo ? `(${product.ScaleNo})` : ''}</dd></div>
              <div><dt>Selling price</dt><dd>{money(product.Price)}</dd></div>
              <div><dt>Wholesale price</dt><dd>{money(product.wholesalePrice)}</dd></div>
              <div><dt>GST %</dt><dd>{Number(product.gstpre || 0)}% ({product.gstMode})</dd></div>
              <div><dt>CGST / SGST</dt><dd>{Number(product.cgst || 0)}% / {Number(product.sgst || 0)}%</dd></div>
              <div><dt>Stock quantity</dt><dd>{Number(product.StockQunity || 0)}</dd></div>
              <div><dt>Reorder level</dt><dd>{Number(product.reorderLevel || 0)}</dd></div>
              <div className="details-field-wide"><dt>Notes</dt><dd>{product.notes || '—'}</dd></div>
            </dl>

            <div className="product-entries-section">
              <p className="entries-heading">Batch / serial entries</p>
              {(!product.entries || product.entries.length === 0) ? (
                <p className="no-entries">No entries recorded.</p>
              ) : (
                <table className="product-entries-table">
                  <thead><tr><th>Serial number</th><th>Date</th><th>Batch / patch number</th></tr></thead>
                  <tbody>
                    {product.entries.map((entry, index) => (
                      <tr key={index}><td>{entry.serialNumber || '—'}</td><td>{entry.date || '—'}</td><td>{entry.patchNumber || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
};

export default ProductDetails;
