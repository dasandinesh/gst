// Ship-to address helpers shared by the GST bill and delivery challan screens.
//
// A customer has one saved shipping address (customer.shippingAddress) — their
// default delivery point. A bill stores its own copy of the ship-to address in
// bill.shippingAddress, with `source` recording where it came from:
//   'billing'  — same as the customer's billing address
//   'customer' — the customer's saved shipping address
//   'custom'   — typed into the "Other address" popup for this bill only
// Field names match back/model/addressSchema.js.
import React, { useState } from 'react';
import './shippingAddress.css';

// GST state/UT names (same list as back/utils/gstStateCodes.js), offered as
// suggestions so a typed state matches the place-of-supply spelling.
export const STATE_NAMES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Other Territory', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export const ADDRESS_FIELDS = [
  { key: 'contactName', label: 'Contact name', placeholder: 'Person / branch receiving goods' },
  { key: 'phone', label: 'Phone', type: 'tel', placeholder: 'Contact phone' },
  { key: 'gstin', label: 'GSTIN (if any)', placeholder: 'e.g. 33AAAAA0000A1Z5' },
  { key: 'door', label: 'Door / building', placeholder: 'Door number' },
  { key: 'street', label: 'Street', placeholder: 'Street name' },
  { key: 'area', label: 'Area', placeholder: 'Area / locality' },
  { key: 'district', label: 'District', placeholder: 'District' },
  { key: 'state', label: 'State', placeholder: 'State', list: 'ship-state-list' },
  { key: 'pincode', label: 'Pincode', placeholder: 'Pincode', inputMode: 'numeric' },
];
const ADDRESS_KEYS = ADDRESS_FIELDS.map((f) => f.key);
const LOCATION_KEYS = ['door', 'street', 'area', 'district', 'state', 'pincode'];

export const emptyAddress = Object.fromEntries(ADDRESS_KEYS.map((key) => [key, '']));
export const emptyShipping = { source: 'billing', ...emptyAddress };

export const pickAddress = (input = {}) => Object.fromEntries(ADDRESS_KEYS.map((key) => [key, String(input?.[key] ?? '')]));
export const hasAddress = (address) => Boolean(address) && LOCATION_KEYS.some((key) => String(address[key] || '').trim());
export const formatAddress = (address = {}) => LOCATION_KEYS.map((key) => address?.[key]).filter(Boolean).join(', ');

// The customer's billing address (customer master: name, gst_no, door … pincode), in ship-to shape.
export const billingAsShipping = (customer) => ({
  source: 'billing',
  ...pickAddress({ ...customer, contactName: customer?.name || '', gstin: customer?.gst_no || '' }),
});

// Default ship-to for a newly picked customer: their saved shipping address if they
// have one, else their billing address.
export const defaultShippingFor = (customer) => {
  const saved = customer?.shippingAddress;
  if (!hasAddress(saved)) return billingAsShipping(customer);
  return { source: 'customer', ...pickAddress(saved), contactName: saved.contactName || customer?.name || '' };
};

// A bill's stored ship-to, or the billing address for bills saved before ship-to existed.
export const shippingFromBill = (stored, customer) => (
  stored?.source ? { ...emptyShipping, ...pickAddress(stored), source: stored.source } : billingAsShipping(customer)
);

const squash = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
// Same rule the bill pages already used: IGST only when both states are known and differ.
export const taxTypeForStates = (sellerState, placeOfSupply) => (
  squash(sellerState) && squash(placeOfSupply) && squash(sellerState) !== squash(placeOfSupply) ? 'IGST' : 'CGST_SGST'
);

// The customer's shipping-address inputs for a react-hook-form form (customer add/edit).
// `labelClassName` lets each form keep its own field styling.
export const ShippingAddressFields = ({ register, labelClassName }) => (
  <>
    {ADDRESS_FIELDS.map((field) => (
      <label key={field.key} className={labelClassName}>
        <span>{field.label}</span>
        <input
          type={field.type || 'text'}
          inputMode={field.inputMode}
          list={field.key === 'state' ? 'customer-ship-state-list' : undefined}
          placeholder={field.placeholder}
          {...register(`shippingAddress.${field.key}`)}
        />
      </label>
    ))}
    <datalist id="customer-ship-state-list">{STATE_NAMES.map((name) => <option key={name} value={name} />)}</datalist>
  </>
);

// Form values for a customer record — fills in shippingAddress keys the record lacks.
export const withShippingDefaults = (customer = {}) => ({ ...customer, shippingAddress: { ...emptyAddress, ...pickAddress(customer.shippingAddress || {}) } });

// "Ship to" strip under the bill header: pick billing / saved / other address, and see
// where the goods are going. `customer` is the customer master record (or null).
export const ShipToPanel = ({ customer, value, onChange, onOtherAddress }) => {
  const savedExists = hasAddress(customer?.shippingAddress);
  const shown = value.source === 'billing' ? billingAsShipping(customer) : value;
  const handleSelect = (source) => {
    if (source === 'billing') onChange(billingAsShipping(customer));
    else if (source === 'customer') onChange(defaultShippingFor(customer));
    else onOtherAddress();
  };
  return (
    <div className="ship-to-panel">
      <label className="ship-to-select">
        <span>Ship to</span>
        <select value={value.source} onChange={(e) => handleSelect(e.target.value)}>
          <option value="billing">Same as billing address</option>
          <option value="customer" disabled={!savedExists}>Customer's shipping address{savedExists ? '' : ' (not set)'}</option>
          <option value="custom">{value.source === 'custom' ? 'Other address (this bill)' : 'Other address…'}</option>
        </select>
      </label>
      <div
        className="ship-to-summary"
        title={hasAddress(shown) ? [shown.contactName || customer?.name, formatAddress(shown), shown.phone && `Ph: ${shown.phone}`, shown.gstin && `GSTIN: ${shown.gstin}`].filter(Boolean).join('\n') : undefined}
      >
        {hasAddress(shown) ? (
          <>
            <strong>{shown.contactName || customer?.name || '—'}</strong>
            <span>{formatAddress(shown)}</span>
            {(shown.phone || shown.gstin) && <small>{[shown.phone && `Ph: ${shown.phone}`, shown.gstin && `GSTIN: ${shown.gstin}`].filter(Boolean).join(' · ')}</small>}
          </>
        ) : (
          <span className="ship-to-empty">{customer ? 'No address on file for this customer.' : 'Pick a customer to see the delivery address.'}</span>
        )}
      </div>
    </div>
  );
};

// Popup for a one-off ship-to address. Optionally also saves it as the customer's
// default shipping address (replacing the old one — a customer keeps only one).
export const ShippingAddressModal = ({ initial, customerName, canSaveToCustomer, onApply, onClose }) => {
  const [form, setForm] = useState(() => ({ ...emptyAddress, ...pickAddress(initial) }));
  const [saveToCustomer, setSaveToCustomer] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.state.trim()) { setError('State is required — it decides the place of supply.'); return; }
    if (!['door', 'street', 'area'].some((key) => form[key].trim())) { setError('Enter at least a door, street or area.'); return; }
    setBusy(true);
    try {
      await onApply(form, saveToCustomer);
    } catch (applyError) {
      setError(applyError.message || 'Unable to save the address.');
      setBusy(false);
    }
  };

  return (
    <div className="gst-view-overlay" onMouseDown={onClose}>
      <form className="gst-view-modal ship-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="gst-view-header">
          <h3>Ship to — other address</h3>
          <button type="button" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <p className="ship-modal-hint">Used for this bill only{canSaveToCustomer ? ', unless you tick the box below' : ''}. The state becomes the place of supply.</p>
        <div className="ship-modal-grid">
          {ADDRESS_FIELDS.map((field) => (
            <label key={field.key} className={`ship-modal-field ship-field-${field.key}`}>
              <span>{field.label}{field.key === 'state' && <b> *</b>}</span>
              <input
                type={field.type || 'text'}
                inputMode={field.inputMode}
                list={field.list}
                placeholder={field.placeholder}
                value={form[field.key]}
                onChange={(e) => { setForm((f) => ({ ...f, [field.key]: e.target.value })); if (error) setError(''); }}
              />
            </label>
          ))}
          <datalist id="ship-state-list">{STATE_NAMES.map((name) => <option key={name} value={name} />)}</datalist>
        </div>
        {canSaveToCustomer && (
          <label className="ship-modal-save">
            <input type="checkbox" checked={saveToCustomer} onChange={(e) => setSaveToCustomer(e.target.checked)} />
            <span>Also save as {customerName || 'this customer'}'s default shipping address</span>
          </label>
        )}
        {error && <p className="gst-field-warning" role="alert">{error}</p>}
        <div className="ship-modal-actions">
          <button type="button" className="gst-secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="gst-primary-button" disabled={busy}>{busy ? 'Saving…' : 'Use for this bill'}</button>
        </div>
      </form>
    </div>
  );
};
