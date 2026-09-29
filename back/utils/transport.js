// E-way bill Part-B transport details, shared by GST sales and delivery challans.
// Codes (vehicle no., transporter ID) are saved uppercase without spaces.
const TRANSPORT_MODES = ['road', 'rail', 'air', 'ship'];

const code = (value) => String(value || '').toUpperCase().replace(/[\s-]/g, '');

// Cleans the client's transport object. Returns undefined when nothing is filled in.
// `extraFields` (e.g. ['driverName', 'driverPhone'] for a challan) are kept as trimmed text.
function cleanTransport(t, extraFields = []) {
  if (!t || typeof t !== 'object') return undefined;
  const mode = TRANSPORT_MODES.includes(t.mode) ? t.mode : 'road';
  const transport = {
    mode,
    vehicleType: mode === 'road' && t.vehicleType === 'odc' ? 'odc' : 'regular',
    vehicleNumber: mode === 'road' ? code(t.vehicleNumber) : '',
    transporterId: code(t.transporterId),
    transporterName: String(t.transporterName || '').trim(),
    docNumber: String(t.docNumber || '').trim(),
    docDate: t.docDate || undefined,
    distanceKm: Math.min(4000, Math.max(0, Math.round(Number(t.distanceKm) || 0)))
  };
  extraFields.forEach((key) => { transport[key] = String(t[key] || '').trim(); });
  const filled = [transport.vehicleNumber, transport.transporterId, transport.transporterName, transport.docNumber, ...extraFields.map((key) => transport[key])].some(Boolean);
  return filled ? transport : undefined;
}

module.exports = { TRANSPORT_MODES, cleanTransport };
