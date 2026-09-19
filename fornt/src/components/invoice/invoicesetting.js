import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../../components/cutomer/customeradd.css';
import '../../components/cutomer/customerlist.css';

// Bills print from exactly one invoice setting. This screen therefore behaves as a
// singleton editor:
//   - no setting yet  -> show the create form
//   - one setting      -> show it for editing, with a delete option
//   - more than one    -> warn and let the user delete extras until only one remains
const defaults = {
  name: '', phone: '', phone_2: '', door: '', street: '', area: '',
  district: '', state: '', pincode: '', header: '', fooder: '',
};

const InvoiceSetting = () => {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });

  const current = settings.length === 1 ? settings[0] : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/invoice-settings');
      setSettings(data);
      reset(data.length === 1 ? { ...defaults, ...data[0] } : defaults);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [reset]);

  useEffect(() => { load(); }, [load]);

  const onSubmit = async (values) => {
    setStatus({ type: '', message: '' });
    try {
      if (current) {
        await fetchJson(`/api/invoice-settings/${current._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
        setStatus({ type: 'success', message: 'Invoice setting updated.' });
      } else {
        await fetchJson('/api/invoice-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
        setStatus({ type: 'success', message: 'Invoice setting created.' });
      }
      load();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const remove = async (setting) => {
    if (!window.confirm('Delete this invoice setting? This cannot be undone.')) return;
    setStatus({ type: '', message: '' });
    try {
      await fetchJson(`/api/invoice-settings/${setting._id}`, { method: 'DELETE' });
      setStatus({ type: 'success', message: 'Invoice setting deleted.' });
      load();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <main className="customer-add-page">
      <section className="customer-add-card">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Bill setup</p>
          <h1>Invoice setting</h1>
          <p>The shop details printed on every bill. Only one setting is allowed.</p>
        </div>

        {loading ? (
          <p>Loading…</p>
        ) : settings.length > 1 ? (
          <>
            <p className="form-status error" role="alert">
              {settings.length} invoice settings found. Bills need exactly one — delete the extras.
            </p>
            <div className="customer-table-wrapper">
              <table className="customer-table">
                <thead>
                  <tr><th>Name</th><th>Phone</th><th>Area</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {settings.map((s) => (
                    <tr key={s._id}>
                      <td className="customer-name">{s.name}</td>
                      <td>{s.phone || '—'}</td>
                      <td>{s.area || '—'}</td>
                      <td className="customer-actions">
                        <button type="button" className="delete-button" onClick={() => remove(s)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <fieldset>
              <legend>Shop details</legend>
              <div className="customer-form-grid">
                <label className="customer-field">
                  <span>Shop / business name <b>*</b></span>
                  <input type="text" {...register('name', { required: 'Shop name is required.' })} />
                  {errors.name && <small className="field-error">{errors.name.message}</small>}
                </label>
                <label className="customer-field"><span>Phone</span><input type="tel" {...register('phone')} /></label>
                <label className="customer-field"><span>Phone 2</span><input type="tel" {...register('phone_2')} /></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Address</legend>
              <div className="customer-form-grid">
                <label className="customer-field"><span>Door / house no.</span><input type="text" {...register('door')} /></label>
                <label className="customer-field"><span>Street</span><input type="text" {...register('street')} /></label>
                <label className="customer-field"><span>Area</span><input type="text" {...register('area')} /></label>
                <label className="customer-field"><span>District</span><input type="text" {...register('district')} /></label>
                <label className="customer-field"><span>State</span><input type="text" {...register('state')} /></label>
                <label className="customer-field"><span>Pincode</span><input type="text" inputMode="numeric" {...register('pincode')} /></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Bill header &amp; footer</legend>
              <div className="customer-form-grid">
                <label className="customer-field"><span>Header note</span><input type="text" placeholder="Printed above the bill" {...register('header')} /></label>
                <label className="customer-field"><span>Footer note</span><input type="text" placeholder="Printed below the bill" {...register('fooder')} /></label>
              </div>
            </fieldset>

            {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}

            <div className="customer-form-actions">
              {current && (
                <button type="button" className="secondary-button" onClick={() => remove(current)}>Delete</button>
              )}
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : current ? 'Update setting' : 'Create setting'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
};

export default InvoiceSetting;
