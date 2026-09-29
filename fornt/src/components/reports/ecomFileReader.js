// Reads a marketplace (e-commerce operator) sales / returns report in any of
// the formats seller panels offer — JSON, Excel (.xlsx / .xls) or CSV — into the
// list of order rows the server's importer expects (back/utils/ecomReport.js).
import * as XLSX from 'xlsx';

export const ACCEPTED_FILES = '.json,.xlsx,.xls,.csv';

// Column name → the field the server expects. Headers are compared after
// lower-casing and turning spaces / symbols into "_", so "Total Taxable Sale Value"
// and "total_taxable_sale_value" both work; the aliases cover common variations.
const FIELD_ALIASES = {
  seller_gstin: 'gstin', supplier_gstin: 'gstin', gstin_of_supplier: 'gstin',
  eco_gstin: 'eco_tcs_gstin', ecommerce_gstin: 'eco_tcs_gstin', e_commerce_gstin: 'eco_tcs_gstin', tcs_gstin: 'eco_tcs_gstin', operator_gstin: 'eco_tcs_gstin',
  taxable_value: 'total_taxable_sale_value', total_taxable_value: 'total_taxable_sale_value', taxable_sale_value: 'total_taxable_sale_value',
  tax: 'tax_amount', gst_amount: 'tax_amount', total_tax: 'tax_amount',
  invoice_value: 'total_invoice_value', total_value: 'total_invoice_value',
  rate: 'gst_rate', gst: 'gst_rate', tax_rate: 'gst_rate',
  hsn: 'hsn_code', hsn_sac: 'hsn_code',
  qty: 'quantity',
  state: 'end_customer_state_new', customer_state: 'end_customer_state_new', end_customer_state: 'end_customer_state_new', place_of_supply: 'end_customer_state_new', buyer_state: 'end_customer_state_new',
  month: 'month_number', year: 'financial_year',
  return_date: 'cancel_return_date', cancel_date: 'cancel_return_date', cancellation_date: 'cancel_return_date',
  order_id: 'sub_order_num', suborder_no: 'sub_order_num', sub_order_no: 'sub_order_num', supplier_name: 'sup_name', seller_name: 'sup_name',
};
const NUMERIC_FIELDS = ['total_taxable_sale_value', 'tax_amount', 'total_invoice_value', 'taxable_shipping', 'gst_rate', 'quantity', 'month_number', 'financial_year'];
const fieldName = (header) => {
  const key = String(header).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return FIELD_ALIASES[key] || key;
};
const pad2 = (n) => String(n).padStart(2, '0');
// Excel date / serial number / "dd-mm-yyyy" / "dd/mm/yyyy" / ISO → "yyyy-mm-dd".
const toIsoDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? `${d.y}-${pad2(d.m)}-${pad2(d.d)}` : null;
  }
  const text = String(value).trim();
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(text);
  if (dmy) return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;
  return text.slice(0, 10);
};
// "1,234.50" / "3%" / "₹250" → number; blanks stay null.
const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const n = Number(String(value).replace(/[,₹%\s]/g, ''));
  return Number.isNaN(n) ? value : n;
};

// Any supported file (a browser File) → the list of order rows. `isReturn`
// marks the returns report, whose month comes from the return date.
export const readRows = async (file, isReturn) => {
  const name = file.name.toLowerCase();
  let raw;
  try {
    if (name.endsWith('.json')) {
      raw = JSON.parse(await file.text());
      if (!Array.isArray(raw)) throw new Error();
    } else {
      // CSV: keep every cell as text (raw) — otherwise "12-08-2026" is read as the
      // American 8 December and "3%" as 0.03. toIsoDate / toNumber clean them below.
      const workbook = name.endsWith('.csv')
        ? XLSX.read(await file.text(), { type: 'string', raw: true })
        : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      raw = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
    }
  } catch {
    throw new Error(`Could not read "${file.name}". Use the marketplace's report as .json, .xlsx, .xls or .csv.`);
  }
  return raw
    .map((source) => {
      const row = {};
      Object.entries(source || {}).forEach(([header, value]) => { row[fieldName(header)] = value; });
      NUMERIC_FIELDS.forEach((f) => { if (f in row) row[f] = toNumber(row[f]); });
      // An Excel cell formatted as percent stores 3% as 0.03. (0.1% and 0.25% are real GST rates.)
      if (typeof row.gst_rate === 'number' && row.gst_rate > 0 && row.gst_rate < 1 && ![0.1, 0.25].includes(row.gst_rate)) {
        row.gst_rate = Math.round(row.gst_rate * 10000) / 100;
      }
      Object.keys(row).filter((k) => k.includes('date')).forEach((k) => { row[k] = toIsoDate(row[k]); });
      // Month / year columns missing (some Excel versions): take them from the order (or return) date.
      if (row.month_number === undefined || row.month_number === null) {
        const date = (isReturn && row.cancel_return_date) || row.order_date;
        if (date) { row.month_number = Number(date.slice(5, 7)); row.financial_year = row.financial_year ?? Number(date.slice(0, 4)); }
      }
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v !== null && v !== ''));
};
