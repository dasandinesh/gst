// GST bill number format, set in Invoice Settings. A template with two tokens:
//   {FY} → financial year, e.g. 26-27      {NO} → running number, 4 digits (0010)
// e.g. "GB/{FY}/{NO}" → GB/26-27/0010, "INV-{NO}" → INV-0010, "SK{FY}/{NO}" → SK26-27/0010.
// GST allows at most 16 characters: letters, digits, '/' and '-'.
const DEFAULT_FORMAT = 'GB/{FY}/{NO}';
const DOC_NUMBER_RE = /^[A-Za-z0-9/-]{1,16}$/;

const formatBillNumber = (format, fy, seq) => String(format || DEFAULT_FORMAT)
  .replace(/\{FY\}/g, fy)
  .replace(/\{NO\}/g, String(seq).padStart(4, '0'));

// '' when fine, else what is wrong. Checked with a 5-digit number so the
// format still fits once the series passes 9999.
const formatError = (format) => {
  const f = String(format || '').trim();
  if (!f) return 'Enter a bill number format.';
  if ((f.match(/\{NO\}/g) || []).length !== 1) return 'The format must contain {NO} exactly once — that is where the running number goes.';
  if (/\{(?!FY\}|NO\})/.test(f)) return 'Only {FY} and {NO} can be used inside { }.';
  const sample = formatBillNumber(f, '26-27', 10000);
  if (!DOC_NUMBER_RE.test(sample)) {
    return `"${sample}" is not allowed: GST bill numbers can have at most 16 characters, using only letters, digits, / and -.`;
  }
  return '';
};

// Regex that reads a number made by this format back into { fy, seq }
// (fy is null when the format has no {FY}).
const parserFor = (format) => {
  const f = String(format || DEFAULT_FORMAT);
  const hasFy = f.includes('{FY}');
  const pattern = f.split(/(\{FY\}|\{NO\})/).map((part) => {
    if (part === '{FY}') return '(\\d{2}-\\d{2})';
    if (part === '{NO}') return '(\\d+)';
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  const re = new RegExp(`^${pattern}$`);
  const fyFirst = hasFy && f.indexOf('{FY}') < f.indexOf('{NO}');
  return (number) => {
    const m = re.exec(String(number || ''));
    if (!m) return null;
    if (!hasFy) return { fy: null, seq: Number(m[1]) };
    return fyFirst ? { fy: m[1], seq: Number(m[2]) } : { fy: m[2], seq: Number(m[1]) };
  };
};

// Counter the running number comes from. With {FY} it restarts every financial
// year; without it the numbers would repeat (INV-0001 again next April) and bill
// numbers must stay unique, so it runs on across years.
const counterKey = (businessId, format, fy) => (String(format || DEFAULT_FORMAT).includes('{FY}')
  ? `${businessId}:gstsale:${fy}`
  : `${businessId}:gstsale:all`);

module.exports = { DEFAULT_FORMAT, formatBillNumber, formatError, parserFor, counterKey };
