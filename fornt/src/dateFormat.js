// How dates are shown and printed across the app: dd-mm-yyyy (e.g. 30-09-2026).
// Date inputs keep their yyyy-mm-dd values; this is for display only.
const pad2 = (n) => String(n).padStart(2, '0');

export const formatDate = (value, fallback = '') => {
  if (!value) return fallback;
  // A bare yyyy-mm-dd is a calendar date — format it as is, without a timezone shift.
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (plain) return `${plain[3]}-${plain[2]}-${plain[1]}`;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
};
