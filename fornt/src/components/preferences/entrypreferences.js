import React, { useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import './entrypreferences.css';

// Master → Entry Settings: tick which optional sections each entry page shows.
// Saved on the business (GET/PUT /api/preferences), so every user and device
// sees the same layout. Covers the GST Billing, Delivery Challan and Buyer's PO pages.
const PAGES = [
  {
    key: 'gstBillEntry',
    title: 'GST Billing page',
    options: [
      { key: 'showBillList', label: 'Show bill list', hint: 'The list of saved bills on the right. Off: the entry form uses the full width.' },
      { key: 'showReferences', label: 'Show Delivery & references', hint: 'DC No / Date, Buyer\'s PO No / Date and Ship to.' },
      { key: 'showTransport', label: 'Show Transport details', hint: 'Mode, vehicle no., transporter, LR no., distance.' },
      { key: 'showPayment', label: 'Show Cash / Credit / Balance', hint: 'Cash received, credit and balance due beside the totals.' },
      { key: 'showRemark', label: 'Show Remark', hint: 'The remark box printed on the bill.' },
    ],
  },
  {
    key: 'dcEntry',
    title: 'Delivery Challan page',
    options: [
      { key: 'showList', label: 'Show challan list', hint: 'The list of saved challans on the right. Off: the entry form uses the full width.' },
      { key: 'showTransport', label: 'Show Transport details', hint: 'Mode, vehicle no., driver, transporter, LR no., distance.' },
      { key: 'showRemark', label: 'Show Remark', hint: 'The remark box printed on the challan.' },
    ],
  },
  {
    key: 'buyerPoEntry',
    title: "Buyer's PO page",
    options: [
      { key: 'showList', label: 'Show PO list', hint: 'The list of saved purchase orders on the right. Off: the entry form uses the full width.' },
      { key: 'showPaymentTerms', label: 'Show Payment terms', hint: 'e.g. "30 days credit".' },
      { key: 'showRemark', label: 'Show Remark', hint: 'The remark box on the purchase order.' },
    ],
  },
];

const EntryPreferences = () => {
  const [prefs, setPrefs] = useState(null);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJson('/api/preferences')
      .then(setPrefs)
      .catch((error) => setStatus({ type: 'error', text: error.message || 'Unable to load entry settings.' }));
  }, []);

  const toggle = (page, key) => {
    setPrefs((p) => ({ ...p, [page]: { ...p[page], [key]: !p[page][key] } }));
    setStatus({ type: '', text: '' });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await fetchJson('/api/preferences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefs),
      });
      setPrefs(saved);
      setStatus({ type: 'success', text: 'Entry settings saved.' });
    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'Unable to save entry settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="prefs-page">
      <section className="prefs-card">
        <h2>Entry Settings</h2>
        <p className="prefs-intro">Choose which sections the entry pages show. Hidden sections only disappear from the screen; nothing already saved on a bill is removed.</p>

        {!prefs ? <p className="prefs-loading">{status.text || 'Loading…'}</p> : PAGES.map((page) => (
          <fieldset key={page.key} className="prefs-group">
            <legend>{page.title}</legend>
            {page.options.map((option) => (
              <label key={option.key} className="prefs-option">
                <input type="checkbox" checked={Boolean(prefs[page.key]?.[option.key])} onChange={() => toggle(page.key, option.key)} />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
        ))}

        {prefs && status.text && <p className={`prefs-status ${status.type}`} role="alert">{status.text}</p>}
        {prefs && (
          <div className="prefs-actions">
            <button type="button" className="prefs-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </section>
    </main>
  );
};

export default EntryPreferences;
