import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../cutomer/customeradd.css';

const SupplierAdd = () => {
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { name: '', phone: '', gstin: '', door: '', street: '', area: '', district: '', state: '', pincode: '', oldBalance: 0 },
  });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      await fetchJson('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, oldBalance: Number(data.oldBalance || 0) }),
      });
      reset();
      setStatus({ type: 'success', message: 'Supplier saved successfully.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <main className="customer-add-page">
      <section className="customer-add-card" aria-labelledby="supplier-add-title">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Supplier management</p>
          <h1 id="supplier-add-title">Add supplier</h1>
          <p>Enter the supplier’s contact details, address, and starting payable balance.</p>
        </div>

        <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <fieldset>
            <legend>Supplier details</legend>
            <div className="customer-form-grid">
              <label className="customer-field">
                <span>Supplier name <b>*</b></span>
                <input type="text" placeholder="Enter supplier name" {...register('name', { required: 'Supplier name is required.' })} />
                {errors.name && <small className="field-error">{errors.name.message}</small>}
              </label>
              <label className="customer-field">
                <span>Phone number</span>
                <input type="tel" placeholder="Enter phone number" {...register('phone')} />
              </label>
              <label className="customer-field">
                <span>GSTIN</span>
                <input type="text" placeholder="Enter GSTIN" {...register('gstin')} />
              </label>
              <label className="customer-field">
                <span>Balance payable</span>
                <input type="number" step="0.01" placeholder="0.00" {...register('oldBalance')} />
                <small style={{ color: '#64748b' }}>Starting balance owed to this supplier. Purchases add to it, payments reduce it.</small>
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

          {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}
          <div className="customer-form-actions">
            <button type="button" className="secondary-button" onClick={() => { reset(); setStatus({ type: '', message: '' }); }}>Clear</button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save supplier'}</button>
          </div>
        </form>
      </section>
    </main>
  );
};

export default SupplierAdd;
