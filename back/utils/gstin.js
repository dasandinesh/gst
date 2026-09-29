// 2-digit state code + 10-char PAN + entity number + 'Z' + check character.
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Upper-cases and trims a GSTIN typed into a form; '' stays '' (GSTIN is
// optional). Throws a readable error for anything that isn't GSTIN-shaped, so
// a typo is caught when it's saved rather than when GSTR-1 is uploaded.
const normalizeGstin = (value) => {
  const gstin = String(value || '').trim().toUpperCase();
  if (gstin && !GSTIN_PATTERN.test(gstin)) {
    throw new Error(`"${gstin}" is not a valid GSTIN. It should be 15 characters, like 33ABCDE1234F1Z5.`);
  }
  return gstin;
};

// The 15th character is a check digit over the first 14 (mod-36, like Luhn).
// A GSTIN can match GSTIN_PATTERN and still be a typo; the portal rejects those.
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstinChecksumOk = (value) => {
  const gstin = String(value || '').trim().toUpperCase();
  if (!GSTIN_PATTERN.test(gstin)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = GSTIN_CHARS.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === gstin[14];
};

module.exports = { GSTIN_PATTERN, normalizeGstin, gstinChecksumOk };
