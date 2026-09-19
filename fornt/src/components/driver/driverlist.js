import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../../components/cutomer/customerlist.css';

const emptyDriver = { name: '', phone: '', area: '' };

const DriverList = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingDriver, setEditingDriver] = useState(null);
  const [filters, setFilters] = useState({ name: '', area: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: emptyDriver });

  const loadDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/drivers');
      setDrivers(data);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDrivers(); }, [loadDrivers]);

  const filteredDrivers = drivers.filter((driver) => Object.entries(filters).every(([field, filterValue]) => (
    String(driver[field] || '').toLowerCase().includes(filterValue.trim().toLowerCase())
  )));

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const openEdit = (driver) => {
    setMessage({ type: '', text: '' });
    setEditingDriver(driver);
    reset({ ...emptyDriver, ...driver });
  };

  const closeEdit = () => {
    setEditingDriver(null);
    reset(emptyDriver);
  };

  const saveDriver = async (data) => {
    try {
      const updatedDriver = await fetchJson(`/api/drivers/${editingDriver._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      setDrivers((items) => items.map((item) => item._id === updatedDriver._id ? updatedDriver : item));
      closeEdit();
      setMessage({ type: 'success', text: 'Driver updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const deleteDriver = async (driver) => {
    if (!window.confirm(`Delete ${driver.name}? This cannot be undone.`)) return;
    setMessage({ type: '', text: '' });

    try {
      await fetchJson(`/api/drivers/${driver._id}`, { method: 'DELETE' });

      setDrivers((items) => items.filter((item) => item._id !== driver._id));
      setMessage({ type: 'success', text: 'Driver deleted successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  return (
    <main className="customer-list-page">
      <section className="customer-list-card">
        <header className="customer-list-header">
          <div>
            <p className="customer-list-eyebrow">Driver management</p>
            <h1>Drivers</h1>
            <p>View, update, or remove driver records.</p>
          </div>
          <button className="refresh-button" type="button" onClick={loadDrivers} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message.text && <p className={`customer-message ${message.type}`} role="alert">{message.text}</p>}

        <div className="customer-filter" role="search">
          <label><span>Name</span><input type="search" value={filters.name} onChange={(event) => updateFilter('name', event.target.value)} placeholder="Search name" /></label>
          <label><span>Area</span><input type="search" value={filters.area} onChange={(event) => updateFilter('area', event.target.value)} placeholder="Search area" /></label>
          {hasActiveFilters && <button type="button" onClick={() => setFilters({ name: '', area: '' })}>Clear filters</button>}
        </div>

        <div className="customer-table-wrapper">
          <table className="customer-table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Area</th><th aria-label="Actions">Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="customer-table-state">Loading drivers…</td></tr>
              ) : filteredDrivers.length === 0 ? (
                <tr><td colSpan="4" className="customer-table-state">{drivers.length === 0 ? 'No drivers found.' : 'No drivers match this filter.'}</td></tr>
              ) : filteredDrivers.map((driver) => (
                <tr key={driver._id}>
                  <td className="customer-name">{driver.name}</td>
                  <td>{driver.phone || '—'}</td>
                  <td>{driver.area || '—'}</td>
                  <td className="customer-actions">
                    <button type="button" className="edit-button" onClick={() => openEdit(driver)}>Edit</button>
                    <button type="button" className="delete-button" onClick={() => deleteDriver(driver)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingDriver && (
        <div className="customer-modal-backdrop" role="presentation" onMouseDown={closeEdit}>
          <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-driver-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="customer-modal-heading"><h2 id="edit-driver-title">Edit driver</h2><button type="button" aria-label="Close" onClick={closeEdit}>×</button></div>
            <form onSubmit={handleSubmit(saveDriver)} className="customer-edit-form">
              <label><span>Driver name <b>*</b></span><input type="text" {...register('name', { required: 'Driver name is required.' })} />{errors.name && <small>{errors.name.message}</small>}</label>
              <label><span>Phone number</span><input type="tel" {...register('phone')} /></label>
              <label><span>Area</span><input type="text" {...register('area')} /></label>
              {message.type === 'error' && <p className="customer-message error modal-error" role="alert">{message.text}</p>}
              <div className="modal-actions"><button type="button" className="modal-cancel" onClick={closeEdit}>Cancel</button><button type="submit" className="modal-save" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

export default DriverList;
