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
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// GST bill number format — same rules as back/utils/billNumberFormat.js.
const DEFAULT_BILL_FORMAT = 'GB/{FY}/{NO}';
const currentFy = () => {
  const d = new Date();
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
};
const formatBillNumber = (format, seq) => String(format || '')
  .replace(/\{FY\}/g, currentFy())
  .replace(/\{NO\}/g, String(seq).padStart(4, '0'));
const billFormatError = (format) => {
  const f = String(format || '').trim();
  if (!f) return 'Enter a bill number format.';
  if ((f.match(/\{NO\}/g) || []).length !== 1) return 'Put {NO} in the format exactly once — that is where the running number goes.';
  if (/\{(?!FY\}|NO\})/.test(f)) return 'Only {FY} and {NO} can be used inside { }.';
  if (!/^[A-Za-z0-9/-]{1,16}$/.test(formatBillNumber(f, 10000))) return 'Too long or has characters GST does not allow — at most 16 characters, letters, digits, / and - only.';
  return '';
};

const defaults = {
  name: '', gstin: '', phone: '', phone_2: '', door: '', street: '', area: '',
  district: '', state: '', pincode: '', header: '', fooder: '',
};

const InvoiceSetting = () => {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });

  const [startNumber, setStartNumber] = useState(1);
  const [billFormat, setBillFormat] = useState(DEFAULT_BILL_FORMAT);
  const [numberingStatus, setNumberingStatus] = useState({ type: '', message: '' });
  const [savingNumbering, setSavingNumbering] = useState(false);

  const [logo, setLogo] = useState('');
  const [logoError, setLogoError] = useState('');

  const current = settings.length === 1 ? settings[0] : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/invoice-settings');
      setSettings(data);
      reset(data.length === 1 ? { ...defaults, ...data[0] } : defaults);
      setStartNumber(data.length === 1 ? (data[0].gstBillStartNumber || 1) : 1);
      setBillFormat(data.length === 1 ? (data[0].gstBillFormat || DEFAULT_BILL_FORMAT) : DEFAULT_BILL_FORMAT);
      setLogo(data.length === 1 ? (data[0].logo || '') : '');
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
      const body = { ...values, logo };
      if (current) {
        await fetchJson(`/api/invoice-settings/${current._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setStatus({ type: 'success', message: 'Invoice setting updated.' });
      } else {
        await fetchJson('/api/invoice-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setStatus({ type: 'success', message: 'Invoice setting created.' });
      }
      load();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const MAX_LOGO_BYTES = 1024 * 1024; // 1MB — plenty for a shop logo, keeps the saved document small.

  const handleLogoFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file again later
    if (!file) return;
    setLogoError('');
    if (!file.type.startsWith('image/')) {
      setLogoError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('Image is too large — please choose one under 1MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result);
    reader.onerror = () => setLogoError('Could not read that image — please try again.');
    reader.readAsDataURL(file);
  };

  const saveNumbering = async (event) => {
    event.preventDefault();
    if (!current) return;
    const formatProblem = billFormatError(billFormat);
    if (formatProblem) { setNumberingStatus({ type: 'error', message: formatProblem }); return; }
    setNumberingStatus({ type: '', message: '' });
    setSavingNumbering(true);
    try {
      await fetchJson(`/api/invoice-settings/${current._id}/gst-bill-numbering`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startNumber: Number(startNumber), format: billFormat.trim() }),
      });
      setNumberingStatus({ type: 'success', message: `Saved. The next GST bill will be ${formatBillNumber(billFormat.trim(), startNumber)}.` });
      load();
    } catch (error) {
      setNumberingStatus({ type: 'error', message: error.message });
    } finally {
      setSavingNumbering(false);
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
          <>
          <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <fieldset>
              <legend>Shop details</legend>
              <div className="customer-form-grid">
                <label className="customer-field">
                  <span>Shop / business name <b>*</b></span>
                  <input type="text" {...register('name', { required: 'Shop name is required.' })} />
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
                  <small>Printed on bills and used for GSTR-1. You can also manage it from Business Profile.</small>
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

            <fieldset>
              <legend>Logo</legend>
              <p>Shown at the top of every printed GST bill's letterhead. Image, under 1MB.</p>
              <div className="customer-form-grid">
                <label className="customer-field">
                  <span>Upload logo</span>
                  <input type="file" accept="image/*" onChange={handleLogoFile} />
                  {logoError && <small className="field-error">{logoError}</small>}
                </label>
                {logo && (
                  <div className="customer-field">
                    <span>Preview</span>
                    <div>
                      <img src={logo} alt="Logo preview" style={{ maxHeight: 70, maxWidth: 200, objectFit: 'contain', display: 'block', marginBottom: 6 }} />
                      <button type="button" className="secondary-button" onClick={() => setLogo('')}>Remove logo</button>
                    </div>
                  </div>
                )}
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

          {current && (
            <form className="customer-form" onSubmit={saveNumbering} noValidate>
              <fieldset>
                <legend>GST bill numbering</legend>
                <p>
                  How auto-generated GST bill numbers look, and the serial number the next one should use — useful
                  when switching over from paper bills or another system mid-way through. Bills you enter a number
                  for manually are unaffected.
                </p>
                <div className="customer-form-grid">
                  <label className="customer-field">
                    <span>Bill number format</span>
                    <input
                      type="text"
                      placeholder={DEFAULT_BILL_FORMAT}
                      value={billFormat}
                      onChange={(e) => setBillFormat(e.target.value)}
                    />
                    {billFormatError(billFormat)
                      ? <small className="field-error">{billFormatError(billFormat)}</small>
                      : <small>Next bill: <strong>{formatBillNumber(billFormat.trim(), startNumber || 1)}</strong></small>}
                    <small>
                      {'{FY}'} = financial year ({currentFy()}), {'{NO}'} = running number (0001, 0002 …).
                      Examples: GB/{'{FY}'}/{'{NO}'}, INV-{'{NO}'}, SK{'{FY}'}-{'{NO}'}. With {'{FY}'} the number restarts every April.
                    </small>
                  </label>
                  <label className="customer-field">
                    <span>Start next GST bill at</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={startNumber}
                      onChange={(e) => setStartNumber(e.target.value)}
                    />
                  </label>
                </div>
              </fieldset>

              {numberingStatus.message && (
                <p className={`form-status ${numberingStatus.type}`} role="alert">{numberingStatus.message}</p>
              )}

              <div className="customer-form-actions">
                <button type="submit" className="primary-button" disabled={savingNumbering}>
                  {savingNumbering ? 'Saving…' : 'Save numbering'}
                </button>
              </div>
            </form>
          )}
          </>
        )}
      </section>
    </main>
  );
};

export default InvoiceSetting;
