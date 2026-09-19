// The printable GST bill is now a plain, real HTML/CSS pair you can open and
// edit directly:
//   fornt/public/gst-bill/invoice.html  — the page layout/markup
//   fornt/public/gst-bill/invoice.css   — all styling (borders, colors, spacing)
// This module just fetches that HTML, fills in its {{TOKENS}} with bill data,
// and builds the few genuinely dynamic bits (item rows, HSN summary rows) —
// those are looped/conditional so they can't live as static markup.
//
// To restyle the bill: edit invoice.css. To change the layout/wording of a
// section: edit invoice.html. Only edit this file for data/logic changes.

const toDateInput = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
  return parsed.toISOString().split('T')[0];
};

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

// Indian numbering (lakh/crore) amount-in-words, for the invoice footer.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const twoDigitWords = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const threeDigitWords = (n) => {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return `${hundred ? `${ONES[hundred]} Hundred${rest ? ' ' : ''}` : ''}${rest ? twoDigitWords(rest) : ''}`;
};
const numberToWordsIndian = (value) => {
  let num = Math.round(Number(value) || 0);
  if (num === 0) return 'Zero';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  const hundred = num;
  const parts = [];
  if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitWords(hundred));
  return parts.join(' ');
};

// A4 = full-size office printer; A5 = half-page / small-counter printer.
// Only the @page margin has to stay in JS — CSS @page can't be scoped by a
// class selector, so it's injected per print instead of living in invoice.css.
const PAPER = { A4: { margin: '10mm' }, A5: { margin: '6mm' } };
export const PAPER_WINDOW = {
  A4: { width: 800, height: 900 },
  A5: { width: 560, height: 760 },
};

// Cached after the first fetch — a plain static file, safe to reuse for the
// rest of the page session. Reload the app tab to pick up edits to invoice.html.
let templateCache = null;
const loadTemplate = async () => {
  if (templateCache) return templateCache;
  const res = await fetch('/gst-bill/invoice.html');
  if (!res.ok) throw new Error('Could not load the bill template (invoice.html).');
  templateCache = await res.text();
  return templateCache;
};

// Replaces every {{KEY}} with its value. split/join instead of .replace() so
// values containing "$" (amounts, etc.) can't be misread as a replacement pattern.
const fillTemplate = (html, tokens) => Object.entries(tokens).reduce(
  (out, [key, value]) => out.split(`{{${key}}}`).join(value ?? ''),
  html
);

// Builds the full print document's HTML for one bill. `shop` is the active
// invoice setting (letterhead), or {}. `customer` is the matching customer
// master record (for the printed address/phone), or null if not found.
// `options.showHsnSummary` (default true) toggles the per-HSN/SAC tax table.
export const buildGstBillDocumentHtml = async (bill, shop = {}, customer = null, size = 'A4', options = {}) => {
  const showHsnSummary = options.showHsnSummary !== false;
  const isIgst = bill.bill_details?.taxType === 'IGST';
  const products = bill.products || [];
  const b = bill.bill_details || {};

  // Tally-style item table: Sl No / Description / HSN / Qty / Rate / per / Amount,
  // with tax shown as aggregate "OUTPUT CGST/SGST/IGST" lines below the items
  // (not per-item columns) — matches how Tally prints a single-page tax invoice.
  const itemHead = '<tr><th>Sl<br/>No.</th><th>Description of Goods</th><th>HSN/<br/>SAC</th><th>Quantity</th><th>Rate</th><th>per</th><th>Amount</th></tr>';
  const productRows = products.map((p, i) => `
    <tr>
      <td class="c">${i + 1}</td><td class="l">${p.name}</td><td class="c">${p.hsnCode || '—'}</td><td class="c">${p.quantity} ${p.unit || ''}</td>
      <td>${money(p.price)}</td><td class="c">${p.unit || ''}</td><td>${money(p.taxableValue)}</td>
    </tr>`).join('');
  const outputTaxRows = isIgst
    ? (Number(b.totalIgst) ? `<tr><td colspan="6" class="l tax-label">OUTPUT IGST</td><td>${money(b.totalIgst)}</td></tr>` : '')
    : `${Number(b.totalCgst) ? `<tr><td colspan="6" class="l tax-label">OUTPUT CGST</td><td>${money(b.totalCgst)}</td></tr>` : ''}${Number(b.totalSgst) ? `<tr><td colspan="6" class="l tax-label">OUTPUT SGST</td><td>${money(b.totalSgst)}</td></tr>` : ''}`;
  // A blank, growing row (see .spacer-row in invoice.css) so a short product
  // list still fills the page and the footer sections stay pinned to the bottom.
  const itemRows = `${productRows}${outputTaxRows}<tr class="spacer-row"><td colspan="7"></td></tr>`;
  const totalQty = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
  const qtyUnit = products[0]?.unit || '';
  const itemFoot = `${b.roundOff ? `<tr><td colspan="6" class="l">Round Off</td><td>${money(b.roundOff)}</td></tr>` : ''}<tr class="total-row"><td colspan="3" class="l">Total</td><td class="c">${totalQty} ${qtyUnit}</td><td></td><td></td><td>${money(b.billAmount)}</td></tr>`;

  // One row per HSN/SAC code — assumes a uniform GST rate per code, which GST requires anyway.
  let hsnSection = '';
  if (showHsnSummary) {
    const hsnGroups = {};
    products.forEach((p) => {
      const key = p.hsnCode || '—';
      if (!hsnGroups[key]) hsnGroups[key] = { hsn: key, taxable: 0, cgstRate: p.cgstRate, cgst: 0, sgstRate: p.sgstRate, sgst: 0, igstRate: p.igstRate, igst: 0 };
      hsnGroups[key].taxable += Number(p.taxableValue) || 0;
      hsnGroups[key].cgst += Number(p.cgstAmount) || 0;
      hsnGroups[key].sgst += Number(p.sgstAmount) || 0;
      hsnGroups[key].igst += Number(p.igstAmount) || 0;
    });
    const hsnRows = Object.values(hsnGroups).map((g) => isIgst ? `
      <tr>
        <td class="l">${g.hsn}</td><td>${money(g.taxable)}</td><td>${g.igstRate}%</td><td>${money(g.igst)}</td><td>${money(g.cgst + g.sgst + g.igst)}</td>
      </tr>` : `
      <tr>
        <td class="l">${g.hsn}</td><td>${money(g.taxable)}</td><td>${g.cgstRate}%</td><td>${money(g.cgst)}</td><td>${g.sgstRate}%</td><td>${money(g.sgst)}</td><td>${money(g.cgst + g.sgst)}</td>
      </tr>`).join('');
    const hsnHead = isIgst
      ? '<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable Value</th><th colspan="2">Integrated Tax</th><th rowspan="2">Total Tax Amount</th></tr><tr><th>Rate</th><th>Amount</th></tr>'
      : '<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable Value</th><th colspan="2">Central Tax</th><th colspan="2">State Tax</th><th rowspan="2">Total Tax Amount</th></tr><tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr>';
    const hsnTotalRow = isIgst
      ? `<tr class="total-row"><td class="l">Total</td><td>${money(b.subtotal)}</td><td></td><td>${money(b.totalIgst)}</td><td>${money(b.totalGst)}</td></tr>`
      : `<tr class="total-row"><td class="l">Total</td><td>${money(b.subtotal)}</td><td></td><td>${money(b.totalCgst)}</td><td></td><td>${money(b.totalSgst)}</td><td>${money(b.totalGst)}</td></tr>`;
    hsnSection = `
      <table class="hsn-table">
        <thead>${hsnHead}</thead>
        <tbody>${hsnRows}</tbody>
        <tfoot>${hsnTotalRow}</tfoot>
      </table>
      <p class="tax-words">Tax Amount (in words) : <strong>Indian Rupee ${numberToWordsIndian(b.totalGst)} Only</strong></p>`;
  }

  const customerAddress = customer ? [customer.door, customer.street, customer.area, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ') : '';
  const shopAddress = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode].filter(Boolean).join(', ');
  const shopPhones = [shop.phone, shop.phone_2].filter(Boolean).join(' / ');
  const paper = PAPER[size] || PAPER.A4;

  const template = await loadTemplate();
  return fillTemplate(template, {
    TITLE: `GST Bill ${b.billNumber || ''} (${size})`,
    PAPER_CLASS: size === 'A5' ? 'paper-a5' : 'paper-a4',
    PAGE_STYLE: `@page { size: ${size}; margin: ${paper.margin}; }`,
    SHOP_NAME: shop.name || 'Tax Invoice',
    COMPANY_BANNER: shop.header ? `<div class="company-banner">${shop.header}</div>` : '',
    SHOP_ADDRESS: shopAddress,
    SHOP_GSTIN: shop.gstin || '—',
    SHOP_STATE: shop.state || '—',
    SHOP_PHONES: shopPhones,
    BILL_NUMBER: b.billNumber || '',
    TAX_TYPE_LABEL: isIgst ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)',
    CUSTOMER_NAME: bill.customer?.name || '',
    CUSTOMER_ADDRESS: customerAddress || '—',
    CUSTOMER_PHONE: customer?.phone || '—',
    CUSTOMER_GSTIN: bill.customer?.gstin || '—',
    PLACE_OF_SUPPLY: b.placeOfSupply || '—',
    INVOICE_DATE: toDateInput(b.date),
    CASH: money(b.cash),
    CREDIT: money(b.credit),
    REMARK_ROW: b.remark ? `<tr><td class="k">Remark</td><td>${b.remark}</td></tr>` : '',
    ITEM_HEAD: itemHead,
    ITEM_ROWS: itemRows,
    ITEM_FOOT: itemFoot,
    AMOUNT_WORDS: `Indian Rupee ${numberToWordsIndian(b.billAmount)} Only`,
    HSN_SECTION: hsnSection,
    THANKYOU: shop.fooder || 'Thank you for shopping with us!',
  });
};
