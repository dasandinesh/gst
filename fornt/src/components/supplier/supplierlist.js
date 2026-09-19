import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../cutomer/customerlist.css';

const emptySupplier = {
  name: '', phone: '', gstin: '', door: '', street: '', area: '', district: '', state: '', pincode: '', oldBalance: 0,
};

const SupplierList = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [filters, setFilters] = useState({ name: '', area: '', pincode: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: emptySupplier });

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/suppliers');
      setSuppliers(data);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const filteredSuppliers = suppliers.filter((supplier) => Object.entries(filters).every(([field, filterValue]) => (
    String(supplier[field] || '').toLowerCase().includes(filterValue.trim().toLowerCase())
  )));

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const openEdit = (supplier) => {
    setMessage({ type: '', text: '' });
    setEditingSupplier(supplier);
    reset({ ...emptySupplier, ...supplier });
  };

  const closeEdit = () => {
    setEditingSupplier(null);
    reset(emptySupplier);
  };

  const saveSupplier = async (data) => {
    try {
      const updatedSupplier = await fetchJson(`/api/suppliers/${editingSupplier._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, oldBalance: Number(data.oldBalance || 0) }),
      });

      setSuppliers((items) => items.map((item) => item._id === updatedSupplier._id ? updatedSupplier : item));
      closeEdit();
      setMessage({ type: 'success', text: 'Supplier updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const deleteSupplier = async (supplier) => {
    if (!window.confirm(`Delete ${supplier.name}? This cannot be undone.`)) return;
    setMessage({ type: '', text: '' });

    try {
      await fetchJson(`/api/suppliers/${supplier._id}`, { method: 'DELETE' });

      setSuppliers((items) => items.filter((item) => item._id !== supplier._id));
      setMessage({ type: 'success', text: 'Supplier deleted successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  return (
    <main className="customer-list-page">
      <section className="customer-list-card">
        <header className="customer-list-header">
          <div>
            <p className="customer-list-eyebrow">Supplier management</p>
            <h1>Suppliers</h1>
            <p>View, update, or remove supplier records.</p>
          </div>
          <button className="refresh-button" type="button" onClick={loadSuppliers} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message.text && <p className={`customer-message ${message.type}`} role="alert">{message.text}</p>}

        <div className="customer-filter" role="search">
          <label><span>Name</span><input type="search" value={filters.name} onChange={(event) => updateFilter('name', event.target.value)} placeholder="Search name" /></label>
          <label><span>Area</span><input type="search" value={filters.area} onChange={(event) => updateFilter('area', event.target.value)} placeholder="Search area" /></label>
          <label><span>Pincode</span><input type="text" inputMode="numeric" value={filters.pincode} onChange={(event) => updateFilter('pincode', event.target.value)} placeholder="Search pincode" /></label>
          {hasActiveFilters && <button type="button" onClick={() => setFilters({ name: '', area: '', pincode: '' })}>Clear filters</button>}
        </div>

        <div className="customer-table-wrapper">
          <table className="customer-table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>GSTIN</th><th>Address</th><th>Payable</th><th aria-label="Actions">Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="customer-table-state">Loading suppliers…</td></tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr><td colSpan="6" className="customer-table-state">{suppliers.length === 0 ? 'No suppliers found.' : 'No suppliers match this filter.'}</td></tr>
              ) : filteredSuppliers.map((supplier) => {
                const address = [supplier.door, supplier.street, supplier.area, supplier.district, supplier.state, supplier.pincode].filter(Boolean).join(', ');
                return (
                  <tr key={supplier._id}>
                    <td className="customer-name">{supplier.name}</td>
                    <td>{supplier.phone || '—'}</td>
                    <td>{supplier.gstin || '—'}</td>
                    <td className="customer-address">{address || '—'}</td>
                    <td>₹{Number(supplier.oldBalance || 0).toFixed(2)}</td>
                    <td className="customer-actions">
                      <button type="button" className="edit-button" onClick={() => openEdit(supplier)}>Edit</button>
                      <button type="button" className="delete-button" onClick={() => deleteSupplier(supplier)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editingSupplier && (
        <div className="customer-modal-backdrop" role="presentation" onMouseDown={closeEdit}>
          <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-supplier-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="customer-modal-heading"><h2 id="edit-supplier-title">Edit supplier</h2><button type="button" aria-label="Close" onClick={closeEdit}>×</button></div>
            <form onSubmit={handleSubmit(saveSupplier)} className="customer-edit-form">
              <label><span>Supplier name <b>*</b></span><input type="text" {...register('name', { required: 'Supplier name is required.' })} />{errors.name && <small>{errors.name.message}</small>}</label>
              <label><span>Phone number</span><input type="tel" {...register('phone')} /></label>
              <label><span>GSTIN</span><input type="text" {...register('gstin')} /></label>
              <label><span>Door / house no.</span><input type="text" {...register('door')} /></label>
              <label><span>Street</span><input type="text" {...register('street')} /></label>
              <label><span>Area</span><input type="text" {...register('area')} /></label>
              <label><span>District</span><input type="text" {...register('district')} /></label>
              <label><span>State</span><input type="text" {...register('state')} /></label>
              <label><span>Pincode</span><input type="text" inputMode="numeric" {...register('pincode')} /></label>
              <label><span>Balance payable</span><input type="number" step="0.01" {...register('oldBalance')} /></label>
              {message.type === 'error' && <p className="customer-message error modal-error" role="alert">{message.text}</p>}
              <div className="modal-actions"><button type="button" className="modal-cancel" onClick={closeEdit}>Cancel</button><button type="submit" className="modal-save" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

export default SupplierList;
