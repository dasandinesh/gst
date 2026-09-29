// Checks the bills and credit notes of a period BEFORE the GSTR-1 JSON is
// exported, so problems are fixed in the app instead of showing up in the
// portal's error report. Uses the same rules the export does (utils/gstr1.js):
// same GSTIN format, state codes and unit (UQC) mapping.
//
// Each issue: { severity, kind, id, number, date, customer, problem, fix }
//   severity 'error'   — the portal will reject it, or the return comes out wrong
//   severity 'warning' — accepted, but worth a look
const { GSTIN_PATTERN, gstinChecksumOk } = require('./gstin');
const { stateCode, stateName } = require('./gstStateCodes');
const { cleanGstin, toUqc } = require('./gstr1');
const { num } = require('./gstAggregation');

// GST rates the portal accepts (incl. 40% from 22 Sep 2025; 12% / 28% still valid for older bills).
const VALID_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
// Invoice / note numbers: at most 16 characters, letters, digits, '/' and '-' only.
const DOC_NUMBER_RE = /^[A-Za-z0-9/-]{1,16}$/;

const businessIssue = (problem, fix) => ({ severity: 'error', kind: 'business', id: '', number: '', date: null, customer: '', problem, fix });

// business: { gstin }, sales / creditNotes: documents dated in the period.
const checkGstr1 = ({ business, sales, creditNotes }) => {
  const issues = [];
  const ownGstin = cleanGstin(business.gstin);
  if (!ownGstin) {
    issues.push(businessIssue('Your business has no GSTIN.', 'Add your GSTIN in Profile or Invoice Settings. The GSTR-1 file is made for that GSTIN.'));
  } else if (!gstinChecksumOk(ownGstin)) {
    issues.push(businessIssue(`Your GSTIN "${ownGstin}" is not valid (wrong format or check digit).`, 'Correct it in Profile or Invoice Settings.'));
  }
  const sellerState = GSTIN_PATTERN.test(ownGstin) ? ownGstin.slice(0, 2) : '';

  const checkDoc = (doc, kind, numberField, seen) => {
    const b = doc.billDetails || {};
    const number = b[numberField] || '';
    const add = (severity, problem, fix) => issues.push({
      severity, kind, id: String(doc._id), number, date: b.date || null, customer: doc.customer?.name || '', problem, fix,
    });

    // Document number
    if (!number) add('error', 'No bill number.', 'Edit the bill and give it a number.');
    else if (!DOC_NUMBER_RE.test(number)) add('error', `Number "${number}" is longer than 16 characters or has characters other than letters, digits, / and -.`, 'GST allows up to 16 characters: letters, digits, / and - only.');
    if (number) {
      if (seen.has(number)) add('error', `Number "${number}" is used more than once in this period.`, 'Each bill needs its own number.');
      seen.add(number);
    }

    // Customer GSTIN
    const ctin = cleanGstin(doc.customer?.gstin);
    if (ctin) {
      if (!gstinChecksumOk(ctin)) add('error', `Customer GSTIN "${ctin}" is not valid (wrong format or check digit).`, 'Correct the GSTIN on the bill and in the customer master. Leave it empty if the customer is unregistered.');
      else if (ctin === ownGstin) add('error', 'Customer GSTIN is your own GSTIN.', 'Use the buyer\'s GSTIN, or leave it empty.');
    }

    // Place of supply vs tax type
    const pos = stateCode(b.placeOfSupply) || stateCode(doc.customer?.state) || (GSTIN_PATTERN.test(ctin) ? ctin.slice(0, 2) : '');
    if (!pos) {
      add('warning', 'Place of supply is empty or not a known state.', `Set the place of supply. The export will use your own state${sellerState ? ` (${stateName(sellerState)})` : ''}.`);
    } else if (sellerState) {
      const inter = b.taxType === 'IGST';
      if (inter && pos === sellerState) add('error', `IGST bill, but place of supply is your own state (${stateName(pos)}).`, 'Same state → CGST + SGST. Change the tax type or the place of supply.');
      if (!inter && pos !== sellerState) add('error', `CGST + SGST bill, but place of supply is ${stateName(pos)} (another state).`, 'Another state → IGST. Change the tax type or the place of supply.');
    }

    // Lines: HSN, GST rate, unit
    const items = doc.items || [];
    if (!items.length || !num(b.grandTotal)) add('warning', 'Bill has no products or a zero total.', 'Check the bill, or delete it if it was entered by mistake.');
    const noHsn = [];
    const badHsn = [];
    const badRate = [];
    const oddUnit = [];
    items.forEach((p) => {
      const name = p.name || 'item';
      const hsn = String(p.hsnCode || '').trim();
      if (!hsn || hsn === '—') noHsn.push(name);
      else if (!/^\d+$/.test(hsn) || ![4, 6, 8].includes(hsn.length)) badHsn.push(`${name} (${hsn})`);
      if (!VALID_RATES.includes(num(p.gstRate))) badRate.push(`${name} (${p.gstRate}%)`);
      if (hsn && toUqc(p.unit, hsn) === 'OTH') oddUnit.push(`${name} (${p.unit || 'no unit'})`);
    });
    const listOf = (names) => names.slice(0, 5).join(', ') + (names.length > 5 ? ` and ${names.length - 5} more` : '');
    if (noHsn.length) add('error', `No HSN code: ${listOf(noHsn)}.`, 'Add the HSN code in the product master and on this bill. The HSN summary table needs it.');
    if (badHsn.length) add('error', `HSN code is not 4, 6 or 8 digits: ${listOf(badHsn)}.`, 'Use digits only: 4 digits (turnover up to ₹5 crore) or 6 digits (above ₹5 crore).');
    if (badRate.length) add('error', `GST rate the portal doesn't accept: ${listOf(badRate)}.`, `Use one of: ${VALID_RATES.join(', ')} %.`);
    if (oddUnit.length) add('warning', `Unit not recognised, will be sent as "OTH" (others): ${listOf(oddUnit)}.`, 'Use a standard unit like Nos, Pcs, Kg, Ltr, Mtr, Box, Bag.');
  };

  const seenBills = new Set();
  sales.forEach((doc) => checkDoc(doc, 'bill', 'invoiceNumber', seenBills));
  const seenNotes = new Set();
  creditNotes.forEach((doc) => checkDoc(doc, 'creditNote', 'creditNoteNumber', seenNotes));

  const errors = issues.filter((i) => i.severity === 'error').length;
  return {
    issues,
    counts: { errors, warnings: issues.length - errors, bills: sales.length, creditNotes: creditNotes.length },
  };
};

module.exports = { checkGstr1, VALID_RATES };
