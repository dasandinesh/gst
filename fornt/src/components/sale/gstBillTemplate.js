// The printable GST bill — layout, styling, and the data that fills it — all
// lives in this one file. `GstBillDocument` is a plain React component that
// renders one bill; `buildGstBillDocumentHtml` renders it to a full HTML
// print document (used by the "Print" buttons, which open a popup window
// and write the HTML into it).
//
// To restyle the bill: edit GST_STYLE below. To change the layout/wording of
// a section: edit the JSX inside GstBillDocument.
import React from 'react';
import ReactDOMServer from 'react-dom/server';

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
const PAPER = { A4: { margin: '10mm' }, A5: { margin: '6mm' } };
export const PAPER_WINDOW = {
  A4: { width: 800, height: 900 },
  A5: { width: 560, height: 760 },
};

// Print stylesheet — edit this to restyle every printed GST bill (fonts,
// spacing, borders). Styled to match a classic "Tally" tax-invoice
// printout: plain black on white, no color fills, boxy borders.
// Paper-size sizing (padding/font) switches via the body class
// (.paper-a4 / .paper-a5) set on <body> below.
const GST_STYLE = `
  :root {
    --gst-pad: 4px 8px;
    --gst-font: 12.5px;
    --gst-page-height: 277mm; /* A4 297mm minus 2 x 10mm @page margin */
  }
  body.paper-a5 {
    --gst-pad: 3px 6px;
    --gst-font: 10.5px;
    --gst-page-height: 198mm; /* A5 210mm minus 2 x 6mm @page margin */
  }

  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: var(--gst-font); color: #000; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: var(--gst-pad); text-align: left; }
  th { font-weight: 700; text-align: center; }

  /* Flex column: the items table (flex:1 below) soaks up whatever page space
     the item rows don't use, so everything after it (words-in-words, tax
     summary, declaration, footer) always lands at the bottom of the page
     instead of floating right under a short product list. */
  .gst-invoice { border: 1.5px solid #000; display: flex; flex-direction: column; min-height: var(--gst-page-height); }
  .gst-invoice > table,
  .gst-invoice > div.title-bar,
  .gst-invoice > div.letterhead { border-bottom: 1.5px solid #000; }
  .gst-invoice > table:last-of-type { border-bottom: 0; }
  .gst-invoice > div.thankyou { border-top: 1.5px solid #000; }

  .letterhead { text-align: center; padding: 10px 12px 8px; }
  .letterhead .company-name { font-size: 1.6em; }
  /* Logo pinned left, matching spacer pinned right, so the text block in
     between stays truly centered on the page instead of centered next to
     the logo. */
  .letterhead-row { display: flex; align-items: center; gap: 10px; }
  .letterhead-logo, .letterhead-logo-spacer { flex: 0 0 110px; }
  .letterhead-logo { max-height: 60px; max-width: 110px; object-fit: contain; }
  .letterhead-text { flex: 1; text-align: center; }

  .title-bar { text-align: center; padding: 6px 12px; font-size: 1.2em; font-weight: 700; }

  .company-name { font-size: 1.15em; font-weight: 700; }
  .company-banner { font-weight: 700; padding: 3px 0; margin: 4px 0; }

  .layout-table td { border: none; padding: 6px 12px; vertical-align: top; }
  .layout-table td + td { border-left: 1.5px solid #000; }
  .layout-table table { margin: 0; }
  .layout-table table td { padding: var(--gst-pad); }

  .detail-table td { border: 1px solid #000; }

  /* Buyer/Ship-to table (left) and invoice-details table (right) sit
     side by side instead of stacking. */
  .bill-deteils-head { display: flex; }
  .bill-deteils-head > table { margin: 0; }
  .bill-deteils-head > .layout-table { flex: 1 1 60%; }
  .bill-deteils-head > .layout-table tr + tr td { border-top: 1.5px solid #000; }
  .bill-deteils-head > .detail-table { flex: 1 1 40%; border-left: 1.5px solid #000; }

  .section-title { font-weight: 700; margin-bottom: 2px; }
  .k { font-weight: 700; width: 42%; }

  .items-table { flex: 1 0 auto; height: 100%; }
  .items-table td { text-align: right; }
  .items-table td.l, .items-table th.l { text-align: left; }
  .items-table td.c, .items-table th.c { text-align: center; }
  .items-table td.tax-label { font-style: italic; }
  .items-table tr.tax-summary-row td { font-size: 0.85em; }
  .total-row td { font-weight: bold; }
  .spacer-row td { height: 100%; border-top: none; border-bottom: none; }

  .hsn-table td, .hsn-table th { text-align: center; }
  .hsn-table td.l, .hsn-table th.l { text-align: left; }
  .tax-words { margin: 0; padding: 5px 12px; border-bottom: 1.5px solid #000; font-size: .9em; }

  .words-table td { padding: 5px 12px; }
  .words-label { font-weight: 400; }
  .words-value { font-weight: 700; padding-top: 2px !important; }

  .decl-box { padding: 8px 12px; font-size: .9em; }
  .decl-box.right { text-align: center; }
  .computer-note { margin-top: 14px; font-style: italic; font-size: .85em; }
  // .sign-line { margin-top: 6px; padding-top: 4px; border-top: 1px solid #000; display: inline-block; font-size: .85em; }

  .thankyou { text-align: center; padding: 6px; font-size: .9em; }
  .footnote { text-align: center; padding: 0 6px 8px; font-size: .85em; }
  .header-style{ height:40px}
`;

// One bill's printable layout. `shop` is the active invoice setting
// (letterhead), or {}. `customer` is the matching customer master record
// (for the printed address/phone), or null if not found. `showHsnSummary`
// (default true) toggles the per-HSN/SAC tax table.
export function GstBillDocument({ bill, shop = {}, customer = null, showHsnSummary = true }) {
  const isIgst = bill.bill_details?.taxType === 'IGST';
  const products = bill.products || [];
  const b = bill.bill_details || {};

  const shopAddress = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode].filter(Boolean).join(', ');
  const shopPhones = [shop.phone, shop.phone_2].filter(Boolean).join(' / ');
  const customerAddress = customer ? [customer.door, customer.street, customer.area, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ') : '';
  const totalQty = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

  // One row per HSN/SAC code — assumes a uniform GST rate per code, which GST requires anyway.
  const hsnGroups = {};
  products.forEach((p) => {
    const key = p.hsnCode || '—';
    if (!hsnGroups[key]) hsnGroups[key] = { hsn: key, taxable: 0, cgstRate: p.cgstRate, cgst: 0, sgstRate: p.sgstRate, sgst: 0, igstRate: p.igstRate, igst: 0 };
    hsnGroups[key].taxable += Number(p.taxableValue) || 0;
    hsnGroups[key].cgst += Number(p.cgstAmount) || 0;
    hsnGroups[key].sgst += Number(p.sgstAmount) || 0;
    hsnGroups[key].igst += Number(p.igstAmount) || 0;
  });

  return (
    <div className="gst-invoice">

      {/* Header Block */}
      <div className="letterhead">
        {shop.logo ? (
          <div className="letterhead-row">
            <img src={shop.logo} alt="" className="letterhead-logo" />
            <div className="letterhead-text">
              <div className="company-name">{shop.name || 'Tax Invoice'}</div>
              {shop.header ? <div className="company-banner">{shop.header}</div> : null}
              <div>{shopAddress}</div>
              <div>GSTIN/UIN: {shop.gstin || '—'} &nbsp; State Name : {shop.state || '—'} &nbsp; Contact : {shopPhones}</div>
            </div>
            <div className="letterhead-logo-spacer" aria-hidden="true" />
          </div>
        ) : (
          <div className="letterhead-text">
            <div className="company-name">{shop.name || 'Tax Invoice'}</div>
            {shop.header ? <div className="company-banner">{shop.header}</div> : null}
            <div>{shopAddress}</div>
            <div>GSTIN/UIN: {shop.gstin || '—'} &nbsp; State Name : {shop.state || '—'} &nbsp; Contact : {shopPhones}</div>
          </div>
        )}
      </div>
      <div className="title-bar">Tax Invoice</div>

      {/* Bill To / Ship To Block */}
      <div className="bill-deteils-head">
        <table className="layout-table">
          <tbody>
            <tr>
              <td>
                <div className="section-title">Buyer (Bill to)</div>
                <div className="company-name">{bill.customer?.name || ''}</div>
                <div>{customerAddress || '—'}</div>
                <div>Phone : {customer?.phone || '—'}</div>
                <div>GSTIN/UIN : {bill.customer?.gstin || '—'}</div>
              </td>
            </tr>
            <tr>
              <td>
                <div className="section-title">Ship to:</div>
                <div className="company-name">{bill.customer?.name || ''}</div>
                <div>{customerAddress || '—'}</div>
                <div>Phone : {customer?.phone || '—'}</div>
                <div>GSTIN/UIN : {bill.customer?.gstin || '—'}</div>
              </td>
            </tr>
          </tbody>
        </table>
        <table className="detail-table">
          <tbody>
            <tr><td className="k">Invoice No.</td><td>{b.billNumber || ''}</td></tr>
            <tr><td className="k">Dated</td><td>{toDateInput(b.date)}</td></tr>
            <tr><td className="k">PoS</td><td>{b.placeOfSupply || '—'}</td></tr>
            <tr><td className="k">Tax Type</td><td>{isIgst ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)'}</td></tr>
            {b.remark ? <tr><td className="k">Remark</td><td>{b.remark}</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Items Table */}
      <table className="items-table">
        <thead>
          <tr><th>Sl<br />No.</th><th>Description of Goods</th><th>HSN/<br />SAC</th><th>Quantity</th><th>Rate</th><th>per</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {products.map((p, i) => (
            <tr key={i}>
              <td className="c">{i + 1}</td><td className="l">{p.name}</td><td className="c">{p.hsnCode || '—'}</td><td className="c">{p.quantity} {p.unit || ''}</td>
              <td>{money(p.price)}</td><td className="c">{p.unit || ''}</td><td>{money(p.taxableValue)}</td>
            </tr>
          ))}
          {isIgst
            ? (Number(b.totalIgst) ? <tr className="tax-summary-row"><td colSpan="6" className="c tax-label">OUTPUT IGST</td><td>{money(b.totalIgst)}</td></tr> : null)
            : (
              <>
                {Number(b.totalCgst) ? <tr className="tax-summary-row"><td colSpan="6" className="c tax-label">OUTPUT CGST</td><td>{money(b.totalCgst)}</td></tr> : null}
                {Number(b.totalSgst) ? <tr className="tax-summary-row"><td colSpan="6" className="c tax-label">OUTPUT SGST</td><td>{money(b.totalSgst)}</td></tr> : null}
              </>
            )}
          <tr className="spacer-row"><td colSpan="7"></td></tr>
        </tbody>
        <tfoot>
          <tr><td colSpan="6" className="l">Sub Total</td><td>{money(b.subtotal)}</td></tr>
          {b.roundOff ? <tr><td colSpan="6" className="l">Round Off</td><td>{money(b.roundOff)}</td></tr> : null}
          <tr className="total-row"><td colSpan="3" className="l">Total</td><td className="c">{totalQty} {products[0]?.unit || ''}</td><td></td><td></td><td>{money(b.billAmount)}</td></tr>
        </tfoot>
      </table>

      {/* Totals Summary */}
      <table className="layout-table words-table">
        <tbody>
          <tr>
            <td colSpan="2" className="words-label">Amount Chargeable (in words)</td>
          </tr>
          <tr><td colSpan="2" className="words-value">Indian Rupee {numberToWordsIndian(b.billAmount)} Only</td></tr>
        </tbody>
      </table>

      {showHsnSummary ? (
        <>
          <table className="hsn-table">
            <thead>
              {isIgst ? (
                <>
                  <tr><th rowSpan="2">HSN/SAC</th><th rowSpan="2">Taxable Value</th><th colSpan="2">Integrated Tax</th><th rowSpan="2">Total Tax Amount</th></tr>
                  <tr><th>Rate</th><th>Amount</th></tr>
                </>
              ) : (
                <>
                  <tr><th rowSpan="2">HSN/SAC</th><th rowSpan="2">Taxable Value</th><th colSpan="2">Central Tax</th><th colSpan="2">State Tax</th><th rowSpan="2">Total Tax Amount</th></tr>
                  <tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr>
                </>
              )}
            </thead>
            <tbody>
              {Object.values(hsnGroups).map((g) => isIgst ? (
                <tr key={g.hsn}>
                  <td className="l">{g.hsn}</td><td>{money(g.taxable)}</td><td>{g.igstRate}%</td><td>{money(g.igst)}</td><td>{money(g.cgst + g.sgst + g.igst)}</td>
                </tr>
              ) : (
                <tr key={g.hsn}>
                  <td className="l">{g.hsn}</td><td>{money(g.taxable)}</td><td>{g.cgstRate}%</td><td>{money(g.cgst)}</td><td>{g.sgstRate}%</td><td>{money(g.sgst)}</td><td>{money(g.cgst + g.sgst)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {isIgst ? (
                <tr className="total-row"><td className="l">Total</td><td>{money(b.subtotal)}</td><td></td><td>{money(b.totalIgst)}</td><td>{money(b.totalGst)}</td></tr>
              ) : (
                <tr className="total-row"><td className="l">Total</td><td>{money(b.subtotal)}</td><td></td><td>{money(b.totalCgst)}</td><td></td><td>{money(b.totalSgst)}</td><td>{money(b.totalGst)}</td></tr>
              )}
            </tfoot>
          </table>
          <p className="tax-words">Tax Amount (in words) : <strong>Indian Rupee {numberToWordsIndian(b.totalGst)} Only</strong></p>
        </>
      ) : null}

      {/* Footer */}
      <table className="layout-table header-style">
        <tbody>
          <tr>
            <td>
              <div className="decl-box">
                <strong>Declaration</strong><br />
                We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                <div className="sign-line">Customer Signature</div>
              </div>
            </td>
            <td>
              <div className="decl-box right">
                <strong>for {shop.name || 'Tax Invoice'}</strong>
                <div className="computer-note">This is a computer generated invoice,<br />no signature required.</div>
                <div className="sign-line">Authorised Signatory</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="thankyou">{shop.fooder || 'Thank you for shopping with us!'}</div>
      <div className="footnote">This is a Computer Generated Invoice</div>

    </div>
  );
}

// Renders GstBillDocument to a full HTML print document for one bill —
// used by the "Print" buttons, which open a popup window and write this
// HTML into it directly (the template's own onload triggers window.print()).
export const buildGstBillDocumentHtml = (bill, shop = {}, customer = null, size = 'A4', options = {}) => {
  const paper = PAPER[size] || PAPER.A4;
  const paperClass = size === 'A5' ? 'paper-a5' : 'paper-a4';
  const billNumber = bill.bill_details?.billNumber || '';
  const bodyHtml = ReactDOMServer.renderToStaticMarkup(
    <GstBillDocument bill={bill} shop={shop} customer={customer} showHsnSummary={options.showHsnSummary !== false} />
  );

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>GST Bill ${billNumber} (${size})</title>
<style>@page { size: ${size}; margin: ${paper.margin}; } ${GST_STYLE}</style>
</head>
<body class="${paperClass}">
  ${bodyHtml}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>
`;
};
