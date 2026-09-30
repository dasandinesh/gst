// The printable buyer's purchase order (our copy / order acknowledgement). Reuses the
// GST bill's print stylesheet and letterhead layout (../sale/gstBillTemplate.js) so
// all documents look alike; only the title, the PO details block and the footer differ.
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { GST_STYLE, PAPER, PAPER_WINDOW, numberToWordsIndian } from '../sale/gstBillTemplate';
import { formatDate } from '../../dateFormat';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

export function PoDocument({ po, shop = {}, customer = null }) {
  const isIgst = po.billDetails?.taxType === 'IGST';
  const items = po.items || [];
  const b = po.billDetails || {};

  const shopAddress = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode].filter(Boolean).join(', ');
  const shopPhones = [shop.phone, shop.phone_2].filter(Boolean).join(' / ');
  const customerAddress = customer ? [customer.door, customer.street, customer.area, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ') : '';
  // Ship-to address copy saved on the PO. When it isn't the billing address the
  // print shows both parties; otherwise just the buyer.
  const saved = po.shippingAddress || {};
  const shipAddress = [saved.door, saved.street, saved.area, saved.district, saved.state, saved.pincode].filter(Boolean).join(', ');
  const shipsElsewhere = Boolean(shipAddress) && saved.source !== 'billing';
  const totalQty = items.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

  const letterheadText = (
    <div className="letterhead-text">
      <div className="company-name">{shop.name || 'Purchase Order'}</div>
      {shop.header ? <div className="company-banner">{shop.header}</div> : null}
      <div>{shopAddress}</div>
      <div>GSTIN/UIN: {shop.gstin || '—'} &nbsp; State Name : {shop.state || '—'} &nbsp; Contact : {shopPhones}</div>
    </div>
  );

  return (
    <div className="gst-invoice">
      <div className="letterhead">
        {shop.logo ? (
          <div className="letterhead-row">
            <img src={shop.logo} alt="" className="letterhead-logo" />
            {letterheadText}
            <div className="letterhead-logo-spacer" aria-hidden="true" />
          </div>
        ) : letterheadText}
      </div>
      <div className="title-bar">Buyer's Purchase Order</div>

      <div className="bill-deteils-head">
        <table className="layout-table">
          <tbody>
            <tr>
              <td>
                <div className="section-title">Buyer</div>
                <div className="company-name">{po.customer?.name || ''}</div>
                <div>{customerAddress || shipAddress || '—'}</div>
                <div>Phone : {customer?.phone || '—'}</div>
                <div>GSTIN/UIN : {po.customer?.gstin || '—'}</div>
              </td>
            </tr>
            {shipsElsewhere ? (
              <tr>
                <td>
                  <div className="section-title">Deliver to</div>
                  <div className="company-name">{saved.contactName || po.customer?.name || ''}</div>
                  <div>{shipAddress}</div>
                  <div>Phone : {saved.phone || '—'}</div>
                  <div>GSTIN/UIN : {saved.gstin || '—'}</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <table className="detail-table">
          <tbody>
            <tr><td className="k">Buyer's PO No.</td><td>{b.poNumber || ''}</td></tr>
            <tr><td className="k">PO Date</td><td>{formatDate(b.date)}</td></tr>
            <tr><td className="k">Delivery by</td><td>{formatDate(b.deliveryDate) || '—'}</td></tr>
            <tr><td className="k">PoS</td><td>{b.placeOfSupply || '—'}</td></tr>
            <tr><td className="k">Payment Terms</td><td>{b.paymentTerms || '—'}</td></tr>
            {b.notes ? <tr><td className="k">Remark</td><td>{b.notes}</td></tr> : null}
          </tbody>
        </table>
      </div>

      <table className="items-table">
        <thead>
          <tr><th>Sl<br />No.</th><th>Description of Goods</th><th>HSN/<br />SAC</th><th>Quantity</th><th>Rate</th><th>per</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={i}>
              <td className="c">{i + 1}</td><td className="l">{p.name}</td><td className="c">{p.hsnCode || '—'}</td><td className="c">{p.quantity} {p.unit || ''}</td>
              <td>{money(p.rate)}</td><td className="c">{p.unit || ''}</td><td>{money(p.taxableValue)}</td>
            </tr>
          ))}
          {isIgst
            ? (Number(b.totalIgst) ? <tr className="tax-summary-row"><td colSpan="6" className="c tax-label">IGST</td><td>{money(b.totalIgst)}</td></tr> : null)
            : (
              <>
                {Number(b.totalCgst) ? <tr className="tax-summary-row"><td colSpan="6" className="c tax-label">CGST</td><td>{money(b.totalCgst)}</td></tr> : null}
                {Number(b.totalSgst) ? <tr className="tax-summary-row"><td colSpan="6" className="c tax-label">SGST</td><td>{money(b.totalSgst)}</td></tr> : null}
              </>
            )}
          <tr className="spacer-row"><td colSpan="7"></td></tr>
        </tbody>
        <tfoot>
          <tr><td colSpan="6" className="l">Sub Total</td><td>{money(b.totalTaxableValue)}</td></tr>
          {b.roundOff ? <tr><td colSpan="6" className="l">Round Off</td><td>{money(b.roundOff)}</td></tr> : null}
          <tr className="total-row"><td colSpan="3" className="l">Total</td><td className="c">{totalQty} {items[0]?.unit || ''}</td><td></td><td></td><td>{money(b.grandTotal)}</td></tr>
        </tfoot>
      </table>

      <table className="layout-table words-table">
        <tbody>
          <tr><td colSpan="2" className="words-label">Order Value (in words)</td></tr>
          <tr><td colSpan="2" className="words-value">Indian Rupee {numberToWordsIndian(b.grandTotal)} Only</td></tr>
        </tbody>
      </table>

      <table className="layout-table header-style">
        <tbody>
          <tr>
            <td>
              <div className="decl-box">
                <strong>Order received and accepted.</strong>
                <div className="computer-note">This is not a tax invoice.</div>
                <div className="sign-line">Buyer's Signature</div>
              </div>
            </td>
            <td>
              <div className="decl-box right">
                <strong>for {shop.name || ''}</strong>
                <div className="computer-note">&nbsp;</div>
                <div className="sign-line">Authorised Signatory</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="footnote">This is a Computer Generated Document</div>
    </div>
  );
}

export const buildPoDocumentHtml = (po, shop = {}, customer = null, size = 'A4') => {
  const paper = PAPER[size] || PAPER.A4;
  const paperClass = size === 'A5' ? 'paper-a5' : 'paper-a4';
  const poNumber = po.billDetails?.poNumber || '';
  const bodyHtml = ReactDOMServer.renderToStaticMarkup(<PoDocument po={po} shop={shop} customer={customer} />);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Purchase Order ${poNumber} (${size})</title>
<style>@page { size: ${size}; margin: ${paper.margin}; } ${GST_STYLE}</style>
</head>
<body class="${paperClass}">
  ${bodyHtml}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>
`;
};

// Opens the print popup synchronously (so popup blockers don't catch it), then
// fills it in; the document's own onload triggers window.print().
// `poOrLoader` is a PO, or an async function that fetches one (keyboard
// "print last PO"), so the window still opens first.
export const printPo = async (poOrLoader, shop = {}, customerList = [], size = 'A4') => {
  const { width, height } = PAPER_WINDOW[size] || PAPER_WINDOW.A4;
  const win = window.open('', '_blank', `width=${width},height=${height}`);
  if (!win) { alert('Please allow popups to print the purchase order.'); return; }
  try {
    const po = typeof poOrLoader === 'function' ? await poOrLoader() : poOrLoader;
    const customerRecord = customerList.find((c) => c.name?.toLowerCase() === (po.customer?.name || '').trim().toLowerCase());
    win.document.open();
    win.document.write(buildPoDocumentHtml(po, shop || {}, customerRecord || null, size));
    win.document.close();
    win.focus();
  } catch (error) {
    win.document.open();
    win.document.write(`<p style="font-family:sans-serif;padding:20px;color:#a12d27;">Unable to build the purchase order: ${error.message}</p>`);
    win.document.close();
  }
};
