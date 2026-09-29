import React from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../cutomer/customeradd.css';

const defaults = {
  name: '', barcode: '', unit: '',
  price: '',
  mainGodownQuantity: 0,
  notes: '',
};
const numeric = ['price', 'mainGodownQuantity'];

const EstimateProductAdd = ({ embedded = false, onSaved, onCancel }) => {
  const [status, setStatus] = React.useState({ type: '', message: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });

  const onSubmit = async (values) => {
    const data = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numeric.includes(key) ? Number(value || 0) : value]));
    setStatus({ type: '', message: '' });
    try {
      const created = await fetchJson('/api/estimate-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      reset(defaults);
      setStatus({ type: 'success', message: 'Estimate product saved successfully.' });
      if (onSaved) onSaved(created);
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to save estimate product.' });
    }
  };

  const form = (
    <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <fieldset>
        <legend>Basic information</legend>
        <div className="customer-form-grid">
          <Field label="Product name" required error={errors.name}><input {...register('name', { required: 'Product name is required.' })} /></Field>
          <Field label="Barcode"><input {...register('barcode')} placeholder="Scan or type barcode" /></Field>
          <Field label="Unit"><input {...register('unit')} placeholder="e.g. kg, pcs, box" /></Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Pricing</legend>
        <div className="customer-form-grid">
          <Field label="Price" required error={errors.price}><input type="number" min="0" step="0.01" {...register('price', { required: 'Price is required.' })} /></Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Inventory</legend>
        <div className="customer-form-grid">
          <Field label="Main godown quantity" required error={errors.mainGodownQuantity}>
            <input type="number" min="0" step="1" {...register('mainGodownQuantity', { required: 'Main godown quantity is required.' })} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Notes</legend>
        <div className="customer-form-grid">
          <Field label="Notes" wide><textarea rows="3" {...register('notes')} /></Field>
        </div>
      </fieldset>

      {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}
      <div className="customer-form-actions">
        <button type="button" className="secondary-button" onClick={() => reset(defaults)}>Clear</button>
        {embedded && onCancel && <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save estimate product'}</button>
      </div>
    </form>
  );

  if (embedded) return form;

  return (
    <main className="customer-add-page">
      <section className="customer-add-card">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Estimate management</p>
          <h1>Add estimate product</h1>
          <p>Add product details, pricing, and main godown quantity used for estimates/quotations.</p>
        </div>
        {form}
      </section>
    </main>
  );
};

const Field = ({ label, required, wide, error, children }) => (
  <label className={`customer-field${wide ? ' customer-field-wide' : ''}`}>
    <span>{label}{required && <b> *</b>}</span>
    {children}
    {error && <small className="field-error">{error.message}</small>}
  </label>
);

export default EstimateProductAdd;
