// Transport details — the e-way bill Part-B fields (same options as
// ewaybillgst.gov.in / Zoho Books). Used by the GST bill (billDetails.transport,
// back/model/salesmodule.js) and the delivery challan (transport, which also
// holds the driver — back/model/deliverychallanmodule.js).
import React from 'react';

export const TRANSPORT_MODES = [
  { value: 'road', label: 'Road' },
  { value: 'rail', label: 'Rail' },
  { value: 'air', label: 'Air' },
  { value: 'ship', label: 'Ship' },
];
export const VEHICLE_TYPES = [
  { value: 'regular', label: 'Regular' },
  { value: 'odc', label: 'Over Dimensional Cargo (ODC)' },
];
// The transport document is an LR for road, RR for rail, airway bill for air, bill of lading for ship.
const DOC_LABEL = { road: 'LR No.', rail: 'RR No.', air: 'Airway Bill No.', ship: 'Bill of Lading No.' };

export const emptyTransport = {
  mode: 'road', vehicleType: 'regular', vehicleNumber: '', transporterId: '', transporterName: '',
  docNumber: '', docDate: '', distanceKm: '',
};

const toDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
  return parsed.toISOString().split('T')[0];
};

// A saved bill's / challan's transport → form values (dates as yyyy-mm-dd, numbers as text).
export const transportFromBill = (transport) => ({
  ...emptyTransport,
  ...(transport || {}),
  docDate: toDate(transport?.docDate),
  distanceKm: transport?.distanceKm ? String(transport.distanceKm) : '',
});

export const hasTransport = (t) => Boolean(t && (t.vehicleNumber || t.transporterId || t.transporterName || t.docNumber));

export const modeLabel = (mode) => TRANSPORT_MODES.find((m) => m.value === mode)?.label || 'Road';
export const docLabel = (mode) => DOC_LABEL[mode] || 'Transport Doc No.';

// Label/value pairs for display (view popup, printed bill); empty fields are skipped.
export const transportRows = (t) => {
  if (!hasTransport(t)) return [];
  const rows = [['Mode of transport', `${modeLabel(t.mode)}${t.mode === 'road' && t.vehicleType === 'odc' ? ' (ODC)' : ''}`]];
  if (t.vehicleNumber) rows.push(['Vehicle No.', t.vehicleNumber]);
  if (t.transporterName || t.transporterId) rows.push(['Transporter', [t.transporterName, t.transporterId].filter(Boolean).join(' – ')]);
  if (t.docNumber) rows.push([docLabel(t.mode), `${t.docNumber}${t.docDate ? ` dt. ${toDate(t.docDate)}` : ''}`]);
  if (Number(t.distanceKm)) rows.push(['Distance', `${t.distanceKm} km`]);
  return rows;
};

// The inline "🚚 Transport details" row (styled by .gst-transport-row in
// sale/gstbillentry.css). `onChange(key, value)` sets one field. `vehicleListId`
// links the Vehicle No box to a <datalist> of saved vehicles; `children` are
// extra fields placed after the vehicle (the challan's driver name/phone).
export const TransportFields = ({ value, onChange, vehicleListId, children }) => (
  <div className="gst-transport-row">
    <span className="gst-bill-refs-title">🚚 Transport details <small>(optional)</small></span>
    <div className="gst-input-field">
      <label>Mode:</label>
      <select className="gst-text-input" value={value.mode} onChange={(e) => onChange('mode', e.target.value)}>
        {TRANSPORT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </div>
    {value.mode === 'road' && (
      <>
        <div className="gst-input-field">
          <label>Vehicle type:</label>
          <select className="gst-text-input" value={value.vehicleType} onChange={(e) => onChange('vehicleType', e.target.value)}>
            {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <div className="gst-input-field">
          <label>Vehicle No:</label>
          <input type="text" className="gst-text-input" placeholder="TN01AB1234" list={vehicleListId} value={value.vehicleNumber} onChange={(e) => onChange('vehicleNumber', e.target.value.toUpperCase())} />
        </div>
      </>
    )}
    {children}
    <div className="gst-input-field">
      <label>Transporter ID:</label>
      <input type="text" className="gst-text-input" placeholder="GSTIN / TRANSIN" maxLength={15} value={value.transporterId} onChange={(e) => onChange('transporterId', e.target.value.toUpperCase())} />
    </div>
    <div className="gst-input-field">
      <label>Transporter name:</label>
      <input type="text" className="gst-text-input" placeholder="e.g. ABC Logistics" value={value.transporterName} onChange={(e) => onChange('transporterName', e.target.value)} />
    </div>
    <div className="gst-input-field">
      <label>{docLabel(value.mode)}:</label>
      <input type="text" className="gst-text-input" value={value.docNumber} onChange={(e) => onChange('docNumber', e.target.value)} />
    </div>
    <div className="gst-input-field">
      <label>Doc date:</label>
      <input type="date" className="gst-text-input" value={value.docDate} onChange={(e) => onChange('docDate', e.target.value)} />
    </div>
    <div className="gst-input-field">
      <label>Distance (km):</label>
      <input type="number" className="gst-text-input" min="0" max="4000" step="1" value={value.distanceKm} onChange={(e) => onChange('distanceKm', e.target.value)} />
    </div>
  </div>
);
