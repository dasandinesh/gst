import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '../../api';
import './customerlist.css';

const emptyCustomer = {
  name: '', phone: '', door: '', street: '', area: '', district: '', state: '', pincode: '', oldBalance: 0,
  gst_no: '', pan_it_no: '',
  bankDetails: { bankName: '', accountHolderName: '', accountNumber: '', ifscCode: '', branchName: '', accountType: '' },
};

const CustomerList = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [filters, setFilters] = useState({ name: '', area: '', pincode: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: emptyCustomer });

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/customers');
      setCustomers(data);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const filteredCustomers = customers.filter((customer) => Object.entries(filters).every(([field, filterValue]) => (
    String(customer[field] || '').toLowerCase().includes(filterValue.trim().toLowerCase())
  )));

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const openEdit = (customer) => {
    setMessage({ type: '', text: '' });
    setEditingCustomer(customer);
    reset({ ...emptyCustomer, ...customer });
  };

  const closeEdit = () => {
    setEditingCustomer(null);
    reset(emptyCustomer);
  };

  const saveCustomer = async (data) => {
    try {
      const updatedCustomer = await fetchJson(`/api/customers/${editingCustomer._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, oldBalance: Number(data.oldBalance || 0) }),
      });

      setCustomers((items) => items.map((item) => item._id === updatedCustomer._id ? updatedCustomer : item));
      closeEdit();
      setMessage({ type: 'success', text: 'Customer updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const deleteCustomer = async (customer) => {
    if (!window.confirm(`Delete ${customer.name}? This cannot be undone.`)) return;
    setMessage({ type: '', text: '' });

    try {
      await fetchJson(`/api/customers/${customer._id}`, { method: 'DELETE' });

      setCustomers((items) => items.filter((item) => item._id !== customer._id));
      setMessage({ type: 'success', text: 'Customer deleted successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  return (
    <main className="customer-list-page">
      <section className="customer-list-card">
        <header className="customer-list-header">
          <div>
            <p className="customer-list-eyebrow">Customer management</p>
            <h1>Customers</h1>
            <p>View, update, or remove customer records.</p>
          </div>
          <button className="refresh-button" type="button" onClick={loadCustomers} disabled={loading}>
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
              <tr><th>Name</th><th>Phone</th><th>Address</th><th>Balance</th><th aria-label="Actions">Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="customer-table-state">Loading customers…</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan="5" className="customer-table-state">{customers.length === 0 ? 'No customers found.' : 'No customers match this filter.'}</td></tr>
              ) : filteredCustomers.map((customer) => {
                const address = [customer.door, customer.street, customer.area, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ');
                return (
                  <tr key={customer._id}>
                    <td className="customer-name">{customer.name}</td>
                    <td>{customer.phone || '—'}</td>
                    <td className="customer-address">{address || '—'}</td>
                    <td>₹{Number(customer.oldBalance || 0).toFixed(2)}</td>
                    <td className="customer-actions">
                      <button type="button" className="view-button" onClick={() => navigate(`/customer-list/${customer._id}`)}>View</button>
                      <button type="button" className="edit-button" onClick={() => openEdit(customer)}>Edit</button>
                      <button type="button" className="delete-button" onClick={() => deleteCustomer(customer)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editingCustomer && (
        <div className="customer-modal-backdrop" role="presentation" onMouseDown={closeEdit}>
          <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-customer-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="customer-modal-heading"><h2 id="edit-customer-title">Edit customer</h2><button type="button" aria-label="Close" onClick={closeEdit}>×</button></div>
            <form onSubmit={handleSubmit(saveCustomer)} className="customer-edit-form">
              <label><span>Customer name <b>*</b></span><input type="text" {...register('name', { required: 'Customer name is required.' })} />{errors.name && <small>{errors.name.message}</small>}</label>
              <label><span>Phone number</span><input type="tel" {...register('phone')} /></label>
              <label><span>Door / house no.</span><input type="text" {...register('door')} /></label>
              <label><span>Street</span><input type="text" {...register('street')} /></label>
              <label><span>Area</span><input type="text" {...register('area')} /></label>
              <label><span>District</span><input type="text" {...register('district')} /></label>
              <label><span>State</span><input type="text" {...register('state')} /></label>
              <label><span>Pincode</span><input type="text" inputMode="numeric" {...register('pincode')} /></label>
              <label><span>Balance</span><input type="number" step="0.01" {...register('oldBalance')} /></label>
              <label><span>GST number</span><input type="text" {...register('gst_no')} /></label>
              <label><span>PAN / IT number</span><input type="text" {...register('pan_it_no')} /></label>
              <label><span>Bank name</span><input type="text" {...register('bankDetails.bankName')} /></label>
              <label><span>Account holder name</span><input type="text" {...register('bankDetails.accountHolderName')} /></label>
              <label><span>Account number</span><input type="text" {...register('bankDetails.accountNumber')} /></label>
              <label><span>IFSC code</span><input type="text" {...register('bankDetails.ifscCode')} /></label>
              <label><span>Branch name</span><input type="text" {...register('bankDetails.branchName')} /></label>
              <label>
                <span>Account type</span>
                <select {...register('bankDetails.accountType')}>
                  <option value="">Select type</option>
                  <option value="Savings">Savings</option>
                  <option value="Current">Current</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              {message.type === 'error' && <p className="customer-message error modal-error" role="alert">{message.text}</p>}
              <div className="modal-actions"><button type="button" className="modal-cancel" onClick={closeEdit}>Cancel</button><button type="submit" className="modal-save" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

export default CustomerList;
