import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../../components/cutomer/customeradd.css';

const defaults = { name: '', phone: '', area: '' };

const DriverAdd = () => {
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      await fetchJson('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      reset(defaults);
      setStatus({ type: 'success', message: 'Driver saved successfully.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to save driver.' });
    }
  };

  return (
    <main className="customer-add-page">
      <section className="customer-add-card" aria-labelledby="driver-add-title">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Driver management</p>
          <h1 id="driver-add-title">Add driver</h1>
          <p>Enter the driver's name, phone number, and area.</p>
        </div>

        <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <fieldset>
            <legend>Driver details</legend>
            <div className="customer-form-grid">
              <label className="customer-field">
                <span>Driver name <b>*</b></span>
                <input type="text" placeholder="Enter driver name" {...register('name', { required: 'Driver name is required.' })} />
                {errors.name && <small className="field-error">{errors.name.message}</small>}
              </label>
              <label className="customer-field">
                <span>Phone number</span>
                <input type="tel" placeholder="Enter phone number" {...register('phone')} />
              </label>
              <label className="customer-field">
                <span>Area</span>
                <input type="text" placeholder="Area / locality" {...register('area')} />
              </label>
            </div>
          </fieldset>

          {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}
          <div className="customer-form-actions">
            <button type="button" className="secondary-button" onClick={() => { reset(defaults); setStatus({ type: '', message: '' }); }}>Clear</button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save driver'}</button>
          </div>
        </form>
      </section>
    </main>
  );
};

export default DriverAdd;
