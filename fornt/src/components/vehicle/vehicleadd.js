import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../../components/cutomer/customeradd.css';

const defaults = { name: '', ownerName: '', vehicleType: '' };

const VehicleAdd = () => {
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      await fetchJson('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      reset(defaults);
      setStatus({ type: 'success', message: 'Vehicle saved successfully.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to save vehicle.' });
    }
  };

  return (
    <main className="customer-add-page">
      <section className="customer-add-card" aria-labelledby="vehicle-add-title">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Vehicle management</p>
          <h1 id="vehicle-add-title">Add vehicle</h1>
          <p>Enter the vehicle's name/number, owner, and type.</p>
        </div>

        <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <fieldset>
            <legend>Vehicle details</legend>
            <div className="customer-form-grid">
              <label className="customer-field">
                <span>Vehicle name <b>*</b></span>
                <input type="text" placeholder="Enter vehicle name / number" {...register('name', { required: 'Vehicle name is required.' })} />
                {errors.name && <small className="field-error">{errors.name.message}</small>}
              </label>
              <label className="customer-field">
                <span>Owner name</span>
                <input type="text" placeholder="Enter owner name" {...register('ownerName')} />
              </label>
              <label className="customer-field">
                <span>Vehicle type</span>
                <input type="text" placeholder="e.g. Lorry, Van, Tempo" {...register('vehicleType')} />
              </label>
            </div>
          </fieldset>

          {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}
          <div className="customer-form-actions">
            <button type="button" className="secondary-button" onClick={() => { reset(defaults); setStatus({ type: '', message: '' }); }}>Clear</button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save vehicle'}</button>
          </div>
        </form>
      </section>
    </main>
  );
};

export default VehicleAdd;
