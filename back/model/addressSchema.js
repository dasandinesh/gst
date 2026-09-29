const mongoose = require('mongoose');

// Same address keys as the customer's billing address (door … pincode), so one
// formatter prints either. contactName/phone/gstin describe who receives the goods
// at that address — a branch or godown can have its own GSTIN.
const addressFields = {
  contactName: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  gstin: { type: String, trim: true, uppercase: true, default: '' },
  door: { type: String, trim: true, default: '' },
  street: { type: String, trim: true, default: '' },
  area: { type: String, trim: true, default: '' },
  district: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
  pincode: { type: String, trim: true, default: '' },
};

// A customer's one saved shipping address (their default delivery point).
// Left empty, goods ship to the billing address.
const shippingAddressSchema = new mongoose.Schema(addressFields, { _id: false });

// SHIPPING_SOURCES — where a bill's ship-to address came from:
//   billing  — same as the customer's billing address
//   customer — the customer's saved shipping address
//   custom   — typed in for this one bill only
const SHIPPING_SOURCES = ['billing', 'customer', 'custom'];

// The ship-to address as it was on the day of the bill — a full copy, not a link,
// so editing the customer later never changes an issued invoice/challan (GST Rule 46).
const billShippingAddressSchema = new mongoose.Schema({
  source: { type: String, enum: SHIPPING_SOURCES, default: 'billing' },
  ...addressFields,
}, { _id: false });

const ADDRESS_KEYS = Object.keys(addressFields);

// Keeps only known address keys from a request body, trimmed.
const cleanAddress = (input = {}) => {
  const out = {};
  ADDRESS_KEYS.forEach((key) => { out[key] = String(input?.[key] ?? '').trim(); });
  return out;
};

const cleanBillShippingAddress = (input) => {
  if (!input || typeof input !== 'object') return undefined;
  return { source: SHIPPING_SOURCES.includes(input.source) ? input.source : 'billing', ...cleanAddress(input) };
};

module.exports = { shippingAddressSchema, billShippingAddressSchema, SHIPPING_SOURCES, cleanAddress, cleanBillShippingAddress };
