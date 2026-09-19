import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import './customeradd.css';

const CustomerAdd = () => {
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      name: '', phone: '', door: '', street: '', area: '', district: '', state: '', pincode: '', oldBalance: 0,
      gst_no: '', pan_it_no: '',
      bankDetails: { bankName: '', accountHolderName: '', accountNumber: '', ifscCode: '', branchName: '', accountType: '' },
    },
  });

  const onSubmit = async (data) => {
    setStatus({ type: '', message: '' });
    try {
      await fetchJson('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, oldBalance: Number(data.oldBalance || 0) }),
      });
      reset();
      setStatus({ type: 'success', message: 'Customer saved successfully.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <main className="customer-add-page">
      <section className="customer-add-card" aria-labelledby="customer-add-title">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Customer management</p>
          <h1 id="customer-add-title">Add customer</h1>
          <p>Enter the customer’s contact details, address, and starting balance.</p>
        </div>

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
                <span>Balance</span>
                <input type="number" step="0.01" placeholder="0.00" {...register('oldBalance')} />
                <small style={{ color: '#64748b' }}>Starting balance. Sales add to it, receipts reduce it.</small>
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
            <legend>Tax details</legend>
            <div className="customer-form-grid">
              <label className="customer-field"><span>GST number</span><input type="text" placeholder="e.g. 22AAAAA0000A1Z5" {...register('gst_no')} /></label>
              <label className="customer-field"><span>PAN / IT number</span><input type="text" placeholder="e.g. ABCDE1234F" {...register('pan_it_no')} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Bank details</legend>
            <div className="customer-form-grid">
              <label className="customer-field"><span>Bank name</span><input type="text" {...register('bankDetails.bankName')} /></label>
              <label className="customer-field"><span>Account holder name</span><input type="text" {...register('bankDetails.accountHolderName')} /></label>
              <label className="customer-field"><span>Account number</span><input type="text" {...register('bankDetails.accountNumber')} /></label>
              <label className="customer-field"><span>IFSC code</span><input type="text" {...register('bankDetails.ifscCode')} /></label>
              <label className="customer-field"><span>Branch name</span><input type="text" {...register('bankDetails.branchName')} /></label>
              <label className="customer-field">
                <span>Account type</span>
                <select {...register('bankDetails.accountType')}>
                  <option value="">Select type</option>
                  <option value="Savings">Savings</option>
                  <option value="Current">Current</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </div>
          </fieldset>

          {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}
          <div className="customer-form-actions">
            <button type="button" className="secondary-button" onClick={() => { reset(); setStatus({ type: '', message: '' }); }}>Clear</button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save customer'}</button>
          </div>
        </form>
      </section>
    </main>
  );
};

export default CustomerAdd;
