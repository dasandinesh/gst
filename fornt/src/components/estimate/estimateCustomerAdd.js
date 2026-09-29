import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../cutomer/customeradd.css';

const defaults = {
  name: '', phone: '', door: '', street: '', area: '', district: '', state: '', pincode: '', openingBalance: 0,
  pan_it_no: '',
};

const EstimateCustomerAdd = ({ embedded = false, onSaved, onCancel }) => {
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      const created = await fetchJson('/api/estimate-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, openingBalance: Number(data.openingBalance || 0) }),
      });
      reset(defaults);
      setStatus({ type: 'success', message: 'Estimate customer saved successfully.' });
      if (onSaved) onSaved(created);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const form = (
    <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <fieldset>
        <legend>Customer details</legend>
        <div className="customer-form-grid">
          <label className="customer-field">
            <span>Customer name <b>*</b></span>
            <input type="text" placeholder="Enter customer name" {...register('name', { required: 'Customer name is required.' })} />
            {errors.name && <small className="field-error">{errors.name.message}</small>}
          </label>
          <label className="customer-field">
            <span>Phone number</span>
            <input type="tel" placeholder="Enter phone number" {...register('phone')} />
          </label>
          <label className="customer-field">
            <span>Opening balance</span>
            <input type="number" step="0.01" placeholder="0.00" {...register('openingBalance')} />
            <small style={{ color: '#64748b' }}>Starting balance. Estimate bills move it into the closing balance.</small>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Address</legend>
        <div className="customer-form-grid">
          <label className="customer-field"><span>Door / house no.</span><input type="text" placeholder="Door number" {...register('door')} /></label>
          <label className="customer-field"><span>Street</span><input type="text" placeholder="Street name" {...register('street')} /></label>
          <label className="customer-field"><span>Area</span><input type="text" placeholder="Area / locality" {...register('area')} /></label>
          <label className="customer-field"><span>District</span><input type="text" placeholder="District" {...register('district')} /></label>
          <label className="customer-field"><span>State</span><input type="text" placeholder="State" {...register('state')} /></label>
          <label className="customer-field"><span>Pincode</span><input type="text" inputMode="numeric" placeholder="Pincode" {...register('pincode')} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Other details</legend>
        <div className="customer-form-grid">
          <label className="customer-field"><span>PAN / IT number</span><input type="text" placeholder="e.g. ABCDE1234F" {...register('pan_it_no')} /></label>
        </div>
      </fieldset>

      {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}
      <div className="customer-form-actions">
        <button type="button" className="secondary-button" onClick={() => { reset(defaults); setStatus({ type: '', message: '' }); }}>Clear</button>
        {embedded && onCancel && <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save estimate customer'}</button>
      </div>
    </form>
  );

  if (embedded) return form;

  return (
    <main className="customer-add-page">
      <section className="customer-add-card" aria-labelledby="estimate-customer-add-title">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Estimate management</p>
          <h1 id="estimate-customer-add-title">Add estimate customer</h1>
          <p>Enter the customer's contact details, address, and opening balance for estimates/quotations.</p>
        </div>
        {form}
      </section>
    </main>
  );
};

export default EstimateCustomerAdd;
