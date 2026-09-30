// The printable Estimate/Quotation — a simplified layout (letterhead, plain
// item list, grand total, and the estimate customer's opening/closing
// balance — no HSN tax-summary table, no GST legal declaration).
// `EstimateDocument` is a plain React component that renders one estimate;
// `buildEstimateDocumentHtml` renders it to a full HTML print document (used
// by the "Print" buttons, which open a popup window and write the HTML into it).
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { formatDate } from '../../dateFormat';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

// A4 = full-size office printer; A5 = half-page / small-counter printer.
const PAPER = { A4: { margin: '10mm' }, A5: { margin: '6mm' } };
export const PAPER_WINDOW = {
  A4: { width: 800, height: 900 },
  A5: { width: 560, height: 760 },
};

// Print stylesheet — edit this to restyle every printed estimate.
// Deliberately plainer than the GST bill's Tally-style printout: no HSN
// tax-summary table, no legal declaration wording.
const ESTIMATE_STYLE = `
  :root {
    --est-pad: 5px 8px;
    --est-font: 12.5px;
    --est-page-height: 277mm; /* A4 297mm minus 2 x 10mm @page margin */
  }
  body.paper-a5 {
    --est-pad: 4px 6px;
    --est-font: 10.5px;
    --est-page-height: 198mm; /* A5 210mm minus 2 x 6mm @page margin */
  }

  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: var(--est-font); color: #000; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: var(--est-pad); text-align: left; }
  th { font-weight: 700; text-align: center; }

  .estimate-doc { border: 1.5px solid #000; display: flex; flex-direction: column; min-height: var(--est-page-height); }
  .estimate-doc > .letterhead,
  .estimate-doc > .title-bar,
  .estimate-doc > .meta-table,
  .estimate-doc > .items-table { border-bottom: 1.5px solid #000; }

  .letterhead { text-align: center; padding: 10px 12px 8px; }
  .letterhead .company-name { font-size: 1.5em; font-weight: 700; }
  .letterhead-row { display: flex; align-items: center; gap: 10px; }
  .letterhead-logo, .letterhead-logo-spacer { flex: 0 0 100px; }
  .letterhead-logo { max-height: 56px; max-width: 100px; object-fit: contain; }
  .letterhead-text { flex: 1; text-align: center; }

  .title-bar { text-align: center; padding: 6px 12px; font-size: 1.2em; font-weight: 700; letter-spacing: .04em; }

  .meta-table td { border: none; padding: 5px 12px; vertical-align: top; }
  .meta-table td + td { border-left: 1.5px solid #000; }
  .meta-table .k { font-weight: 700; width: 40%; }

  .items-table { flex: 1 0 auto; height: 100%; }
  .items-table td { text-align: right; }
  .items-table td.l, .items-table th.l { text-align: left; }
  .items-table td.c, .items-table th.c { text-align: center; }
  .total-row td { font-weight: 700; }
  .spacer-row td { height: 100%; border-top: none; border-bottom: none; }

  .summary-table { margin: 0; }
  .summary-table td { padding: 6px 12px; }
  .summary-table .k { font-weight: 700; width: 55%; }
  .summary-table .grand td { font-weight: 700; font-size: 1.1em; }

  .footer-note { text-align: center; padding: 10px 12px; font-style: italic; }
  .footer-note strong { font-style: normal; }
`;

// One estimate's printable layout. `shop` is the active invoice setting
// (letterhead), or {}. `customer` is the matching estimate customer master
// record (for the printed address/phone), or null if not found.
export function EstimateDocument({ bill, shop = {}, customer = null }) {
  const items = bill.items || [];
  const b = bill.billDetails || {};

  const shopAddress = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode].filter(Boolean).join(', ');
  const shopPhones = [shop.phone, shop.phone_2].filter(Boolean).join(' / ');
  const customerAddress = customer ? [customer.door, customer.street, customer.area, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ') : '';
  const totalQty = items.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

  return (
    <div className="estimate-doc">

      {/* Header Block */}
      <div className="letterhead">
        {shop.logo ? (
          <div className="letterhead-row">
            <img src={shop.logo} alt="" className="letterhead-logo" />
            <div className="letterhead-text">
              <div className="company-name">{shop.name || 'Estimate'}</div>
              {shopAddress ? <div>{shopAddress}</div> : null}
              <div>Contact : {shopPhones || '—'}</div>
            </div>
            <div className="letterhead-logo-spacer" aria-hidden="true" />
          </div>
        ) : (
          <div className="letterhead-text">
            <div className="company-name">{shop.name || 'Estimate'}</div>
            {shopAddress ? <div>{shopAddress}</div> : null}
            <div>Contact : {shopPhones || '—'}</div>
          </div>
        )}
      </div>
      <div className="title-bar">Estimate / Quotation</div>

      {/* Customer / Estimate details */}
      <table className="meta-table">
        <tbody>
          <tr>
            <td>
              <div><strong>Customer:</strong> {bill.customer?.name || ''}</div>
              <div>{customerAddress || '—'}</div>
              <div>Phone : {customer?.phone || '—'}</div>
            </td>
            <td>
              <table className="meta-table" style={{ border: 'none' }}>
                <tbody>
                  <tr><td className="k">Estimate No.</td><td>{b.estimateNumber || ''}</td></tr>
                  <tr><td className="k">Dated</td><td>{formatDate(b.date)}</td></tr>
                  {b.notes ? <tr><td className="k">Remark</td><td>{b.notes}</td></tr> : null}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Items Table */}
      <table className="items-table">
        <thead>
          <tr><th>Sl No.</th><th>Item</th><th>Qty</th><th>Unit</th><th>Price</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={i}>
              <td className="c">{i + 1}</td><td className="l">{p.name}</td>
              <td className="c">{p.quantity}</td><td className="c">{p.unit || ''}</td>
              <td>{money(p.rate)}</td><td>{money(p.amount)}</td>
            </tr>
          ))}
          <tr className="spacer-row"><td colSpan="6"></td></tr>
        </tbody>
        <tfoot>
          <tr className="total-row"><td colSpan="2" className="l">Total</td><td className="c">{totalQty}</td><td></td><td></td><td>{money(b.grandTotal)}</td></tr>
        </tfoot>
      </table>

      {/* Totals summary */}
      <table className="summary-table">
        <tbody>
          <tr><td className="k">Subtotal</td><td>{money(b.subtotal)}</td></tr>
          {b.roundOff ? <tr><td className="k">Round off</td><td>{money(b.roundOff)}</td></tr> : null}
          <tr className="grand"><td className="k">Grand total</td><td>{money(b.grandTotal)}</td></tr>
          <tr><td className="k">Cash</td><td>{money(b.cash)}</td></tr>
          <tr><td className="k">Credit</td><td>{money(b.credit)}</td></tr>
          <tr><td className="k">Opening balance</td><td>{money(b.openingBalance)}</td></tr>
          <tr><td className="k">Closing balance</td><td>{money(b.closingBalance)}</td></tr>
        </tbody>
      </table>

      <div className="footer-note">This is an <strong>Estimate / Quotation</strong> — Not a Tax Invoice. Prices and availability subject to change.</div>

    </div>
  );
}

// Renders EstimateDocument to a full HTML print document for one estimate —
// used by the "Print" buttons, which open a popup window and write this
// HTML into it directly (the template's own onload triggers window.print()).
export const buildEstimateDocumentHtml = (bill, shop = {}, customer = null, size = 'A4') => {
  const paper = PAPER[size] || PAPER.A4;
  const paperClass = size === 'A5' ? 'paper-a5' : 'paper-a4';
  const estimateNumber = bill.billDetails?.estimateNumber || '';
  const bodyHtml = ReactDOMServer.renderToStaticMarkup(
    <EstimateDocument bill={bill} shop={shop} customer={customer} />
  );

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Estimate ${estimateNumber} (${size})</title>
<style>@page { size: ${size}; margin: ${paper.margin}; } ${ESTIMATE_STYLE}</style>
</head>
<body class="${paperClass}">
  ${bodyHtml}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>
`;
};
