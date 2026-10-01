// GST bill number format, set in Invoice Settings: any text plus two tokens,
//   {FY} → financial year, e.g. 26-27      {NO} → the running number
// and a digits setting for the running number: 0 = as is (1, 2, 3), 4 = 0001.
//   "GB/{FY}/{NO}", 4 → GB/26-27/0010     "INV-{NO}", 0 → INV-10
//   "{NO}", 0         → 10                "{NO}", 4    → 0010
// Without {NO} the number goes at the end ("INV-" → INV-10); an empty format is just the number.
// GST allows at most 16 characters: letters, digits, '/' and '-'.
const DEFAULT_FORMAT = 'GB/{FY}/{NO}';
const DEFAULT_DIGITS = 4;
const MAX_DIGITS = 8;
const DOC_NUMBER_RE = /^[A-Za-z0-9/-]{1,16}$/;

const cleanFormat = (format) => {
  const f = String(format ?? '').trim();
  return f.includes('{NO}') ? f : `${f}{NO}`;
};
const cleanDigits = (digits) => {
  const d = Number(digits);
  return Number.isInteger(d) && d >= 0 && d <= MAX_DIGITS ? d : DEFAULT_DIGITS;
};

// format/digits undefined (settings saved before this option existed) → GB/{FY}/{NO}, 4 digits.
const formatBillNumber = (format, fy, seq, digits) => cleanFormat(format ?? DEFAULT_FORMAT)
  .replace(/\{FY\}/g, fy)
  .replace(/\{NO\}/g, String(seq).padStart(cleanDigits(digits ?? DEFAULT_DIGITS), '0'));

// '' when fine, else what is wrong. Checked with a 5-digit running number so
// the format still fits once the series passes 9999.
const formatError = (format, digits = DEFAULT_DIGITS) => {
  const d = Number(digits);
  if (!Number.isInteger(d) || d < 0 || d > MAX_DIGITS) return `Number digits must be 0 to ${MAX_DIGITS}.`;
  const f = cleanFormat(format);
  if ((f.match(/\{NO\}/g) || []).length !== 1) return 'Use {NO} only once — that is where the running number goes.';
  if (/\{(?!FY\}|NO\})/.test(f)) return 'Only {FY} and {NO} can be used inside { }.';
  const sample = formatBillNumber(f, '26-27', 10000, d);
  if (!DOC_NUMBER_RE.test(sample)) {
    return `"${sample}" is not allowed: GST bill numbers can have at most 16 characters, using only letters, digits, / and - (no spaces).`;
  }
  return '';
};

// Reads a number made by this format back into { fy, seq }
// (fy is null when the format has no {FY}); null when it doesn't match.
const parserFor = (format) => {
  const f = cleanFormat(format ?? DEFAULT_FORMAT);
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
// year; without it the numbers would repeat (INV-1 again next April) and bill
// numbers must stay unique, so it runs on across years.
// A business's first bill series uses the business-wide counter (as before
// series existed); every series added later (ownCounter) counts on its own.
const counterKey = (businessId, format, fy, series = null) => {
  const period = cleanFormat(format ?? DEFAULT_FORMAT).includes('{FY}') ? fy : 'all';
  return series?.ownCounter ? `${businessId}:gstsale:${series._id}:${period}` : `${businessId}:gstsale:${period}`;
};

// True when two series could produce the same bill number (e.g. both "{NO}"),
// which GST forbids for one GSTIN. Checks sample numbers of each against the other.
const SAMPLE_SEQS = [1, 7, 12, 99, 123, 1000, 12345];
const seriesOverlap = (a, b) => [[a, b], [b, a]].some(([x, y]) => {
  const parse = parserFor(y.format);
  return SAMPLE_SEQS.some((seq) => ['26-27', '27-28'].some((fy) => {
    const p = parse(formatBillNumber(x.format, fy, seq, x.digits));
    // y reads it back — would y ever print it? Only if its own padding gives the same text.
    return p && formatBillNumber(y.format, p.fy || fy, p.seq, y.digits) === formatBillNumber(x.format, fy, seq, x.digits);
  }));
});

module.exports = { DEFAULT_FORMAT, DEFAULT_DIGITS, formatBillNumber, formatError, parserFor, counterKey, cleanFormat, seriesOverlap };
