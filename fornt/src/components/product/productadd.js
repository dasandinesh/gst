import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { fetchJson } from '../../api';
import '../../components/cutomer/customeradd.css';
import './productadd.css';

const defaults = {
  name: '', hsnCode: '', category: '', barcode: '',
  Malayalam: '', Tamil: '', Scale: '', ScaleNo: 0,
  Price: '', gstpre: '', gstMode: 'exclusive', wholesalePrice: 0,
  StockQunity: 0, reorderLevel: 0,
  notes: '', entries: [],
};
const numeric = ['ScaleNo', 'Price', 'gstpre', 'wholesalePrice', 'StockQunity', 'reorderLevel'];

const ProductAdd = ({ embedded = false, onSaved, onCancel }) => {
  const [status, setStatus] = React.useState({ type: '', message: '' });
  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: 'entries' });

  const onSubmit = async (values) => {
    const data = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numeric.includes(key) ? Number(value || 0) : value]));
    setStatus({ type: '', message: '' });
    try {
      const created = await fetchJson('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      reset(defaults);
      setStatus({ type: 'success', message: 'Product saved successfully.' });
      if (onSaved) onSaved(created);
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to save product.' });
    }
  };

  const form = (
        <form className="customer-form product-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <fieldset>
            <legend>Basic information</legend>
            <div className="customer-form-grid">
              <Field label="Product name" required error={errors.name}><input {...register('name', { required: 'Product name is required.' })} /></Field>
              <Field label="HSN code"><input {...register('hsnCode')} /></Field>
              <Field label="Category"><input {...register('category')} /></Field>
              <Field label="Barcode"><input {...register('barcode')} /></Field>
              <Field label="Malayalam name"><input {...register('Malayalam')} /></Field>
              <Field label="Tamil name"><input {...register('Tamil')} /></Field>
              <Field label="Scale (unit)"><input {...register('Scale')} placeholder="e.g. kg, pcs" /></Field>
              <Field label="Scale number"><input type="number" step="0.01" {...register('ScaleNo')} /></Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>Pricing &amp; GST</legend>
            <div className="customer-form-grid">
              <Field label="Selling price" required error={errors.Price}><input type="number" min="0" step="0.01" {...register('Price', { required: 'Selling price is required.' })} /></Field>
              <Field label="GST %" required error={errors.gstpre}><input type="number" min="0" max="100" step="0.01" {...register('gstpre', { required: 'GST percentage is required.' })} /></Field>
              <Field label="GST mode"><select {...register('gstMode')}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option></select></Field>
              <Field label="Wholesale price"><input type="number" min="0" step="0.01" {...register('wholesalePrice')} /></Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>Inventory</legend>
            <div className="customer-form-grid">
              <Field label="Stock quantity" required error={errors.StockQunity}><input type="number" min="0" step="1" {...register('StockQunity', { required: 'Stock quantity is required.' })} /></Field>
              <Field label="Reorder level"><input type="number" min="0" step="1" {...register('reorderLevel')} /></Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>Notes</legend>
            <div className="customer-form-grid">
              <Field label="Notes" wide><textarea rows="3" {...register('notes')} /></Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>Batch / serial entries</legend>
            {fields.length === 0 && <p className="no-entries">No entries added yet.</p>}
            <div className="entries-list">
              {fields.map((field, index) => (
                <div className="entry-row" key={field.id}>
                  <Field label="Serial number"><input {...register(`entries.${index}.serialNumber`)} /></Field>
                  <Field label="Date"><input type="date" {...register(`entries.${index}.date`)} /></Field>
                  <Field label="Batch / patch number"><input {...register(`entries.${index}.patchNumber`)} /></Field>
                  <button type="button" className="remove-entry-button" onClick={() => remove(index)}>Remove</button>
                </div>
              ))}
            </div>
            <button type="button" className="add-entry-button" onClick={() => append({ serialNumber: '', date: '', patchNumber: '' })}>+ Add entry</button>
          </fieldset>

          {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}
          <div className="customer-form-actions">
            <button type="button" className="secondary-button" onClick={() => reset(defaults)}>Clear</button>
            {embedded && onCancel && <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>}
            <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save product'}</button>
          </div>
        </form>
  );

  if (embedded) return form;

  return (
    <main className="customer-add-page">
      <section className="customer-add-card">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Product management</p>
          <h1>Add product</h1>
          <p>Add GST-ready product details, pricing, and stock information.</p>
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

export default ProductAdd;
