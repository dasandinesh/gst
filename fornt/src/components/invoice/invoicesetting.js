import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { fetchJson } from '../../api';
import { clearShopSettingsCache } from '../../shopSettings';
import '../../components/cutomer/customeradd.css';
import '../../components/cutomer/customerlist.css';

// Shop details printed on bills + GST bill numbering. Most businesses have one
// setting; a business with two trade names under one GSTIN can add more "bill
// series" (Advanced, at the bottom) — each with its own letterhead and numbers
// (e.g. 1, 2, 3 and A1, A2, A3). Series tabs only appear once there are two.
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// GST bill number format — same rules as back/utils/billNumberFormat.js:
// any text plus {FY} (financial year) and {NO} (running number, padded to `digits`).
// Without {NO} the number goes at the end; an empty format is just the number.
const DEFAULT_BILL_FORMAT = 'GB/{FY}/{NO}';
const DEFAULT_BILL_DIGITS = 4;
const DIGIT_OPTIONS = [
  { value: 0, label: 'As is — 1, 2, 3' },
  { value: 2, label: '2 digits — 01, 02' },
  { value: 3, label: '3 digits — 001, 002' },
  { value: 4, label: '4 digits — 0001, 0002' },
  { value: 5, label: '5 digits — 00001' },
  { value: 6, label: '6 digits — 000001' },
];
// One-click examples: [format, digits].
const BILL_PRESETS = [
  ['{NO}', 0], ['{NO}', 4], ['INV-{NO}', 0], ['INV-{NO}', 4], ['GB/{FY}/{NO}', 4], ['INV/{FY}/{NO}', 0],
];
const currentFy = () => {
  const d = new Date();
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
};
const cleanBillFormat = (format) => {
  const f = String(format ?? '').trim();
  return f.includes('{NO}') ? f : `${f}{NO}`;
};
const formatBillNumber = (format, seq, digits) => cleanBillFormat(format)
  .replace(/\{FY\}/g, currentFy())
  .replace(/\{NO\}/g, String(seq).padStart(Number(digits) || 0, '0'));
const billFormatError = (format, digits) => {
  const f = cleanBillFormat(format);
  if ((f.match(/\{NO\}/g) || []).length !== 1) return 'Use {NO} only once — that is where the running number goes.';
  if (/\{(?!FY\}|NO\})/.test(f)) return 'Only {FY} and {NO} can be used inside { }.';
  if (!/^[A-Za-z0-9/-]{1,16}$/.test(formatBillNumber(f, 10000, digits))) return 'Too long or has characters GST does not allow — at most 16 characters, letters, digits, / and - only (no spaces).';
  return '';
};

const defaults = {
  name: '', gstin: '', phone: '', phone_2: '', door: '', street: '', area: '',
  district: '', state: '', pincode: '', header: '', fooder: '',
};
const pickDetails = (s) => Object.fromEntries(Object.keys(defaults).map((k) => [k, s?.[k] ?? '']));

// Format, digits and start number, with the quick picks and a live preview.
const NumberingFields = ({ format, setFormat, digits, setDigits, startNumber, setStartNumber }) => (
  <>
    <div className="customer-form-grid">
      <label className="customer-field">
        <span>Bill number format</span>
        <input
          type="text"
          placeholder="e.g. INV-{NO}  or leave empty for 1, 2, 3"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        />
        <small>
          Type any letters you like. {'{NO}'} = the running number, {'{FY}'} = financial year ({currentFy()}).
          No {'{NO}'}? The number goes at the end. Empty = just the number. With {'{FY}'} the number restarts every April.
        </small>
      </label>
      <label className="customer-field">
        <span>Number digits</span>
        <select value={digits} onChange={(e) => setDigits(Number(e.target.value))}>
          {DIGIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {setStartNumber && (
        <label className="customer-field">
          <span>Start next GST bill at</span>
          <input type="number" min="1" step="1" value={startNumber} onChange={(e) => setStartNumber(e.target.value)} />
        </label>
      )}
    </div>

    <div className="bill-format-presets">
      <span>Quick pick:</span>
      {BILL_PRESETS.map(([f, d]) => (
        <button
          key={`${f}|${d}`}
          type="button"
          className={`secondary-button${cleanBillFormat(format) === f && digits === d ? ' is-active' : ''}`}
          onClick={() => { setFormat(f); setDigits(d); }}
        >
          {formatBillNumber(f, 1, d)}
        </button>
      ))}
    </div>

    {billFormatError(format, digits) ? (
      <p className="form-status error">{billFormatError(format, digits)}</p>
    ) : (
      <p className="bill-format-preview">
        Next bills will be: {[0, 1, 2].map((i) => (
          <strong key={i}>{formatBillNumber(format, Number(startNumber || 1) + i, digits)}</strong>
        ))} …
      </p>
    )}
  </>
);

const InvoiceSetting = () => {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });

  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false); // creating an additional bill series

  const [startNumber, setStartNumber] = useState(1);
  const [billFormat, setBillFormat] = useState(DEFAULT_BILL_FORMAT);
  const [billDigits, setBillDigits] = useState(DEFAULT_BILL_DIGITS);
  const [numberingStatus, setNumberingStatus] = useState({ type: '', message: '' });
  const [savingNumbering, setSavingNumbering] = useState(false);

  const [logo, setLogo] = useState('');
  const [logoError, setLogoError] = useState('');

  const current = adding ? null : (settings.find((s) => s._id === selectedId) || settings[0] || null);
  const multiple = settings.length > 1;

  // Fills the forms from one series (or blank / prefilled for a new one).
  const showSetting = useCallback((s, list) => {
    if (s) {
      reset({ ...defaults, ...pickDetails(s) });
      setStartNumber(s.gstBillStartNumber || 1);
      setBillFormat(s.gstBillFormat ?? DEFAULT_BILL_FORMAT);
      setBillDigits(s.gstBillDigits ?? DEFAULT_BILL_DIGITS);
      setLogo(s.logo || '');
    } else {
      // A new series shares the GSTIN and address of the default one; name, logo and numbering are its own.
      const base = list?.find((x) => x.isDefault) || list?.[0];
      reset({ ...defaults, ...(base ? pickDetails(base) : {}), name: '' });
      setStartNumber(1);
      setBillFormat(base ? 'A{NO}' : DEFAULT_BILL_FORMAT);
      setBillDigits(base ? 0 : DEFAULT_BILL_DIGITS);
      setLogo('');
    }
    setLogoError('');
    setNumberingStatus({ type: '', message: '' });
  }, [reset]);

  const load = useCallback(async (keepId) => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/invoice-settings?withLogo=1');
      setSettings(data);
      const pick = data.find((s) => s._id === keepId) || data.find((s) => s.isDefault) || data[0] || null;
      setSelectedId(pick?._id || null);
      setAdding(false);
      showSetting(pick, data);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [showSetting]);

  useEffect(() => { load(); }, [load]);

  const selectSeries = (s) => {
    setStatus({ type: '', message: '' });
    setAdding(false);
    setSelectedId(s._id);
    showSetting(s, settings);
  };

  const startAdding = () => {
    setStatus({ type: '', message: '' });
    setAdding(true);
    showSetting(null, settings);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = async (values) => {
    setStatus({ type: '', message: '' });
    try {
      const body = { ...pickDetails(values), logo };
      let saved;
      if (current) {
        saved = await fetchJson(`/api/invoice-settings/${current._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setStatus({ type: 'success', message: multiple ? `Series "${saved.name}" updated.` : 'Invoice setting updated.' });
      } else {
        if (adding) {
          const problem = billFormatError(billFormat, billDigits);
          if (problem) { setStatus({ type: 'error', message: problem }); return; }
          body.gstBillFormat = cleanBillFormat(billFormat);
          body.gstBillDigits = billDigits;
        }
        saved = await fetchJson('/api/invoice-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setStatus({ type: 'success', message: adding ? `Bill series "${saved.name}" added. Pick it on the GST bill page.` : 'Invoice setting created.' });
      }
      clearShopSettingsCache();
      load(saved?._id);
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
    const formatProblem = billFormatError(billFormat, billDigits);
    if (formatProblem) { setNumberingStatus({ type: 'error', message: formatProblem }); return; }
    setNumberingStatus({ type: '', message: '' });
    setSavingNumbering(true);
    try {
      await fetchJson(`/api/invoice-settings/${current._id}/gst-bill-numbering`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startNumber: Number(startNumber), format: cleanBillFormat(billFormat), digits: billDigits }),
      });
      clearShopSettingsCache();
      setNumberingStatus({ type: 'success', message: `Saved. The next GST bill will be ${formatBillNumber(billFormat, startNumber, billDigits)}.` });
      load(current._id);
    } catch (error) {
      setNumberingStatus({ type: 'error', message: error.message });
    } finally {
      setSavingNumbering(false);
    }
  };

  const makeDefault = async (s) => {
    setStatus({ type: '', message: '' });
    try {
      await fetchJson(`/api/invoice-settings/${s._id}/set-default`, { method: 'PUT' });
      clearShopSettingsCache();
      setStatus({ type: 'success', message: `"${s.name}" is now the default series (used by other documents and preselected on new bills).` });
      load(s._id);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const remove = async (setting) => {
    const label = multiple ? `the "${setting.name}" bill series` : 'this invoice setting';
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setStatus({ type: '', message: '' });
    try {
      await fetchJson(`/api/invoice-settings/${setting._id}`, { method: 'DELETE' });
      clearShopSettingsCache();
      setStatus({ type: 'success', message: multiple ? 'Bill series deleted.' : 'Invoice setting deleted.' });
      load();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const heading = adding ? 'New bill series' : multiple ? `Bill series: ${current?.name || ''}` : 'Invoice setting';

  return (
    <main className="customer-add-page">
      <section className="customer-add-card">
        <div className="customer-add-heading">
          <p className="customer-add-eyebrow">Bill setup</p>
          <h1>{heading}</h1>
          <p>
            {adding
              ? 'A second trade name under the same GSTIN: its own name, letterhead and bill numbers.'
              : multiple
                ? 'Each bill series has its own letterhead and bill numbers. Pick the series on the GST bill page.'
                : 'The shop details printed on every bill.'}
          </p>
        </div>

        {(multiple || adding) && !loading && (
          <div className="series-tabs" role="tablist" aria-label="Bill series">
            {settings.map((s) => (
              <button
                key={s._id}
                type="button"
                role="tab"
                aria-selected={!adding && current?._id === s._id}
                className={`series-tab${!adding && current?._id === s._id ? ' is-active' : ''}`}
                onClick={() => selectSeries(s)}
              >
                {s.name}{s.isDefault ? <small> · default</small> : null}
              </button>
            ))}
            {adding && <span className="series-tab is-active">New series</span>}
          </div>
        )}

        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
          <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <fieldset>
              <legend>Shop details</legend>
              <div className="customer-form-grid">
                <label className="customer-field">
                  <span>{multiple || adding ? 'Trade / business name' : 'Shop / business name'} <b>*</b></span>
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
                  <small>
                    {multiple || adding
                      ? 'Every bill series uses the same GSTIN.'
                      : 'Printed on bills and used for GSTR-1. You can also manage it from Business Profile.'}
                  </small>
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

            {adding && (
              <fieldset>
                <legend>Bill numbers for this series</legend>
                <p>Must differ from your other series, e.g. 1, 2, 3 there and A1, A2, A3 here.</p>
                <NumberingFields
                  format={billFormat} setFormat={setBillFormat}
                  digits={billDigits} setDigits={setBillDigits}
                  startNumber={1}
                />
              </fieldset>
            )}

            {status.message && <p className={`form-status ${status.type}`} role="alert">{status.message}</p>}

            <div className="customer-form-actions">
              {adding && (
                <button type="button" className="secondary-button" onClick={() => load(selectedId)}>Cancel</button>
              )}
              {current && multiple && !current.isDefault && (
                <button type="button" className="secondary-button" onClick={() => makeDefault(current)}>Make default</button>
              )}
              {current && (
                <button type="button" className="secondary-button" onClick={() => remove(current)}>Delete</button>
              )}
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : adding ? 'Add bill series' : current ? (multiple ? 'Update series' : 'Update setting') : 'Create setting'}
              </button>
            </div>
          </form>

          {current && (
            <form className="customer-form" onSubmit={saveNumbering} noValidate>
              <fieldset>
                <legend>GST bill numbering{multiple ? ` — ${current.name}` : ''}</legend>
                <p>
                  How auto-generated GST bill numbers look, and the serial number the next one should use — useful
                  when switching over from paper bills or another system mid-way through. Bills you enter a number
                  for manually are unaffected.
                </p>
                <NumberingFields
                  format={billFormat} setFormat={setBillFormat}
                  digits={billDigits} setDigits={setBillDigits}
                  startNumber={startNumber} setStartNumber={setStartNumber}
                />
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

          {settings.length > 0 && !adding && (
            <details className="series-advanced">
              <summary>Advanced: more than one business under this GSTIN?</summary>
              <p>
                If you bill under two trade names with the same GSTIN, add a second bill series. It gets its own
                letterhead and its own bill numbers (for example 1, 2, 3 for one and A1, A2, A3 for the other), and
                you pick the series when making a GST bill. Both series go into the same GSTR-1.
              </p>
              <button type="button" className="secondary-button" onClick={startAdding}>Add another bill series</button>
            </details>
          )}
          </>
        )}
      </section>
    </main>
  );
};

export default InvoiceSetting;
