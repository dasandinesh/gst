import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../../components/cutomer/customerlist.css';

const emptyVehicle = { name: '', ownerName: '', vehicleType: '' };

const VehicleList = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [filters, setFilters] = useState({ name: '', ownerName: '', vehicleType: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: emptyVehicle });

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/vehicles');
      setVehicles(data);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  const filteredVehicles = vehicles.filter((vehicle) => Object.entries(filters).every(([field, filterValue]) => (
    String(vehicle[field] || '').toLowerCase().includes(filterValue.trim().toLowerCase())
  )));

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const openEdit = (vehicle) => {
    setMessage({ type: '', text: '' });
    setEditingVehicle(vehicle);
    reset({ ...emptyVehicle, ...vehicle });
  };

  const closeEdit = () => {
    setEditingVehicle(null);
    reset(emptyVehicle);
  };

  const saveVehicle = async (data) => {
    try {
      const updatedVehicle = await fetchJson(`/api/vehicles/${editingVehicle._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      setVehicles((items) => items.map((item) => item._id === updatedVehicle._id ? updatedVehicle : item));
      closeEdit();
      setMessage({ type: 'success', text: 'Vehicle updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const deleteVehicle = async (vehicle) => {
    if (!window.confirm(`Delete ${vehicle.name}? This cannot be undone.`)) return;
    setMessage({ type: '', text: '' });

    try {
      await fetchJson(`/api/vehicles/${vehicle._id}`, { method: 'DELETE' });

      setVehicles((items) => items.filter((item) => item._id !== vehicle._id));
      setMessage({ type: 'success', text: 'Vehicle deleted successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  return (
    <main className="customer-list-page">
      <section className="customer-list-card">
        <header className="customer-list-header">
          <div>
            <p className="customer-list-eyebrow">Vehicle management</p>
            <h1>Vehicles</h1>
            <p>View, update, or remove vehicle records.</p>
          </div>
          <button className="refresh-button" type="button" onClick={loadVehicles} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {message.text && <p className={`customer-message ${message.type}`} role="alert">{message.text}</p>}

        <div className="customer-filter" role="search">
          <label><span>Name</span><input type="search" value={filters.name} onChange={(event) => updateFilter('name', event.target.value)} placeholder="Search vehicle name" /></label>
          <label><span>Owner</span><input type="search" value={filters.ownerName} onChange={(event) => updateFilter('ownerName', event.target.value)} placeholder="Search owner" /></label>
          <label><span>Type</span><input type="search" value={filters.vehicleType} onChange={(event) => updateFilter('vehicleType', event.target.value)} placeholder="Search type" /></label>
          {hasActiveFilters && <button type="button" onClick={() => setFilters({ name: '', ownerName: '', vehicleType: '' })}>Clear filters</button>}
        </div>

        <div className="customer-table-wrapper">
          <table className="customer-table">
            <thead>
              <tr><th>Name</th><th>Owner</th><th>Type</th><th aria-label="Actions">Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="customer-table-state">Loading vehicles…</td></tr>
              ) : filteredVehicles.length === 0 ? (
                <tr><td colSpan="4" className="customer-table-state">{vehicles.length === 0 ? 'No vehicles found.' : 'No vehicles match this filter.'}</td></tr>
              ) : filteredVehicles.map((vehicle) => (
                <tr key={vehicle._id}>
                  <td className="customer-name">{vehicle.name}</td>
                  <td>{vehicle.ownerName || '—'}</td>
                  <td>{vehicle.vehicleType || '—'}</td>
                  <td className="customer-actions">
                    <button type="button" className="edit-button" onClick={() => openEdit(vehicle)}>Edit</button>
                    <button type="button" className="delete-button" onClick={() => deleteVehicle(vehicle)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingVehicle && (
        <div className="customer-modal-backdrop" role="presentation" onMouseDown={closeEdit}>
          <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-vehicle-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="customer-modal-heading"><h2 id="edit-vehicle-title">Edit vehicle</h2><button type="button" aria-label="Close" onClick={closeEdit}>×</button></div>
            <form onSubmit={handleSubmit(saveVehicle)} className="customer-edit-form">
              <label><span>Vehicle name <b>*</b></span><input type="text" {...register('name', { required: 'Vehicle name is required.' })} />{errors.name && <small>{errors.name.message}</small>}</label>
              <label><span>Owner name</span><input type="text" {...register('ownerName')} /></label>
              <label><span>Vehicle type</span><input type="text" {...register('vehicleType')} /></label>
              {message.type === 'error' && <p className="customer-message error modal-error" role="alert">{message.text}</p>}
              <div className="modal-actions"><button type="button" className="modal-cancel" onClick={closeEdit}>Cancel</button><button type="submit" className="modal-save" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

export default VehicleList;
