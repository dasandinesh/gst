import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { fetchJson } from '../../api';
import { useAuth } from '../../authContext';
import '../../components/cutomer/customeradd.css';

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const defaults = {
  userName: '',
  name: '', gstin: '', phone: '', door: '', street: '', area: '', district: '', state: '', pincode: '',
  syncInvoiceGstin: true,
};

// The logged-in user's name plus the business record itself (name, GSTIN,
// address). The business GSTIN is what GSTR-1 is filed under; Invoice Settings
// holds the copy printed on bills, kept in step by "Also update Invoice Settings".
const Profile = () => {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState(null);
  const [invoiceGstin, setInvoiceGstin] = useState(null); // null = no invoice setting yet
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });

  const load = useCallback(async () => {
    try {
      const [data, settings] = await Promise.all([
        fetchJson('/api/auth/profile'),
        fetchJson('/api/invoice-settings').catch(() => []),
      ]);
      setProfile(data);
      const active = settings.find((s) => s.isDefault) || settings[0];
      setInvoiceGstin(active ? (active.gstin || '') : null);
      reset({ ...defaults, ...data.business, userName: data.user.name });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  }, [reset]);

  useEffect(() => { load(); }, [load]);

  const isOwner = profile?.role === 'owner';
  const gstin = watch('gstin');
  const gstinMismatch = invoiceGstin !== null && profile && (gstin || '') !== invoiceGstin;

  const onSubmit = async (values) => {
    setStatus({ type: '', message: '' });
    const { userName, syncInvoiceGstin, ...business } = values;
    try {
      await fetchJson('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: { name: userName },
          ...(isOwner ? { business, syncInvoiceGstin } : {}),
        }),
      });
      setStatus({ type: 'success', message: 'Profile saved.' });
      await Promise.all([load(), refresh()]); // refresh() updates the name shown in the nav bar
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  if (!profile) {
    return (
      <main className="customer-add-page">
        <section className="customer-add-card">
          {status.message ? <p className={`form-status ${status.type}`} role="alert">{status.message}</p> : <p>Loading…</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="customer-add-page">
      <section className="customer-add-card">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Account</p>
          <h1>Profile</h1>
          <p>Your login details and your business details, including the GSTIN used for GSTR-1.</p>
        </div>

        <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <fieldset>
            <legend>Your details</legend>
            <div className="customer-form-grid">
              <label className="customer-field">
                <span>Your name <b>*</b></span>
                <input type="text" {...register('userName', { required: 'Your name is required.' })} />
                {errors.userName && <small className="field-error">{errors.userName.message}</small>}
              </label>
              <label className="customer-field">
                <span>Email (login)</span>
                <input type="email" value={profile.user.email} readOnly disabled />
              </label>
              <label className="customer-field">
                <span>Role</span>
                <input type="text" value={profile.role} readOnly disabled />
              </label>
            </div>
          </fieldset>

          <fieldset disabled={!isOwner}>
            <legend>Business details</legend>
            {!isOwner && <p>Only the business owner can change these.</p>}
            <div className="customer-form-grid">
              <label className="customer-field">
                <span>Business name <b>*</b></span>
                <input type="text" {...register('name', { required: 'Business name is required.' })} />
                {errors.name && <small className="field-error">{errors.name.message}</small>}
              </label>
              <label className="customer-field">
                <span>GSTIN</span>
                <input
                  type="text"
                  placeholder="e.g. 33ABCDE1234F1Z5"
                  maxLength={15}
                  style={{ textTransform: 'uppercase' }}
                  {...register('gstin', {
                    setValueAs: (v) => String(v || '').trim().toUpperCase(),
                    validate: (v) => !v || GSTIN_PATTERN.test(v) || 'Not a valid GSTIN — 15 characters, like 33ABCDE1234F1Z5.',
                  })}
                />
                {errors.gstin && <small className="field-error">{errors.gstin.message}</small>}
              </label>
              <label className="customer-field"><span>Phone</span><input type="tel" {...register('phone')} /></label>
            </div>
          </fieldset>

          <fieldset disabled={!isOwner}>
            <legend>Business address</legend>
            <div className="customer-form-grid">
              <label className="customer-field"><span>Door / house no.</span><input type="text" {...register('door')} /></label>
              <label className="customer-field"><span>Street</span><input type="text" {...register('street')} /></label>
              <label className="customer-field"><span>Area</span><input type="text" {...register('area')} /></label>
              <label className="customer-field"><span>District</span><input type="text" {...register('district')} /></label>
              <label className="customer-field"><span>State</span><input type="text" {...register('state')} /></label>
              <label className="customer-field"><span>Pincode</span><input type="text" inputMode="numeric" {...register('pincode')} /></label>
            </div>
          </fieldset>

          {isOwner && (
            <fieldset>
              <legend>GSTIN on bills</legend>
              {invoiceGstin === null ? (
                <p>No invoice setting yet — <Link to="/invoice-setting">create one</Link> so bills print your shop details and GSTIN.</p>
              ) : (
                <>
                  <p>
                    GSTIN in Invoice Settings (printed on bills): <strong>{invoiceGstin || 'not set'}</strong>
                    {gstinMismatch && <> — <strong>different from the GSTIN above.</strong></>}
                  </p>
                  <label className="customer-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" {...register('syncInvoiceGstin')} style={{ width: 'auto' }} />
                    <span>Also update the GSTIN in Invoice Settings when I save</span>
                  </label>
                </>
              )}
            </fieldset>
          )}

          {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}

          <div className="customer-form-actions">
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};

export default Profile;
