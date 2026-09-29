// The printable delivery challan. Reuses the GST bill's print stylesheet and
// letterhead layout (../sale/gstBillTemplate.js) so both documents look alike;
// only the title, the challan details block and the footer differ.
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { GST_STYLE, PAPER, PAPER_WINDOW, numberToWordsIndian } from '../sale/gstBillTemplate';
import { modeLabel, docLabel } from '../common/transportDetails';

const toDateInput = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
  return parsed.toISOString().split('T')[0];
};

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

export function DcDocument({ challan, shop = {}, customer = null }) {
  const isIgst = challan.billDetails?.taxType === 'IGST';
  const items = challan.items || [];
  const b = challan.billDetails || {};
  const t = challan.transport || {};

  const shopAddress = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode].filter(Boolean).join(', ');
  const shopPhones = [shop.phone, shop.phone_2].filter(Boolean).join(' / ');
  const customerAddress = customer ? [customer.door, customer.street, customer.area, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ') : '';
  // Ship-to address copy saved on the challan. When it isn't the billing address the
  // print shows both parties; otherwise one consignee block, as before.
  const saved = challan.shippingAddress || {};
  const shipAddress = [saved.door, saved.street, saved.area, saved.district, saved.state, saved.pincode].filter(Boolean).join(', ');
  const shipsElsewhere = Boolean(shipAddress) && saved.source !== 'billing';
  const totalQty = items.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

  const hsnGroups = {};
  items.forEach((p) => {
    const key = p.hsnCode || '—';
    if (!hsnGroups[key]) hsnGroups[key] = { hsn: key, taxable: 0, cgstRate: p.cgstRate, cgst: 0, sgstRate: p.sgstRate, sgst: 0, igstRate: p.igstRate, igst: 0 };
    hsnGroups[key].taxable += Number(p.taxableValue) || 0;
    hsnGroups[key].cgst += Number(p.cgstAmount) || 0;
    hsnGroups[key].sgst += Number(p.sgstAmount) || 0;
    hsnGroups[key].igst += Number(p.igstAmount) || 0;
  });

  const letterheadText = (
    <div className="letterhead-text">
      <div className="company-name">{shop.name || 'Delivery Challan'}</div>
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
      <div className="title-bar">Delivery Challan</div>

      <div className="bill-deteils-head">
        <table className="layout-table">
          <tbody>
            <tr>
              <td>
                <div className="section-title">{shipsElsewhere ? 'Customer (Bill to)' : 'Consignee (Ship to)'}</div>
                <div className="company-name">{challan.customer?.name || ''}</div>
                <div>{customerAddress || shipAddress || '—'}</div>
                <div>Phone : {customer?.phone || '—'}</div>
                <div>GSTIN/UIN : {challan.customer?.gstin || '—'}</div>
              </td>
            </tr>
            {shipsElsewhere ? (
              <tr>
                <td>
                  <div className="section-title">Consignee (Ship to)</div>
                  <div className="company-name">{saved.contactName || challan.customer?.name || ''}</div>
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
            <tr><td className="k">Challan No.</td><td>{b.challanNumber || ''}</td></tr>
            <tr><td className="k">Dated</td><td>{toDateInput(b.date)}</td></tr>
            <tr><td className="k">Purpose</td><td>{b.reason || '—'}</td></tr>
            <tr><td className="k">PoS</td><td>{b.placeOfSupply || '—'}</td></tr>
            <tr><td className="k">Vehicle No.</td><td>{t.vehicleNumber || '—'}</td></tr>
            <tr><td className="k">Driver</td><td>{[t.driverName, t.driverPhone].filter(Boolean).join(' / ') || '—'}</td></tr>
            {t.mode && t.mode !== 'road' ? <tr><td className="k">Mode</td><td>{modeLabel(t.mode)}</td></tr> : null}
            {t.transporterName || t.transporterId ? <tr><td className="k">Transporter</td><td>{[t.transporterName, t.transporterId].filter(Boolean).join(' – ')}</td></tr> : null}
            {t.docNumber ? <tr><td className="k">{docLabel(t.mode)}</td><td>{t.docNumber}{t.docDate ? ` dt. ${toDateInput(t.docDate)}` : ''}</td></tr> : null}
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
          <tr><td colSpan="2" className="words-label">Value of Goods (in words)</td></tr>
          <tr><td colSpan="2" className="words-value">Indian Rupee {numberToWordsIndian(b.grandTotal)} Only</td></tr>
        </tbody>
      </table>

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
            <tr key={g.hsn}><td className="l">{g.hsn}</td><td>{money(g.taxable)}</td><td>{g.igstRate}%</td><td>{money(g.igst)}</td><td>{money(g.igst)}</td></tr>
          ) : (
            <tr key={g.hsn}><td className="l">{g.hsn}</td><td>{money(g.taxable)}</td><td>{g.cgstRate}%</td><td>{money(g.cgst)}</td><td>{g.sgstRate}%</td><td>{money(g.sgst)}</td><td>{money(g.cgst + g.sgst)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          {isIgst ? (
            <tr className="total-row"><td className="l">Total</td><td>{money(b.totalTaxableValue)}</td><td></td><td>{money(b.totalIgst)}</td><td>{money(b.totalGst)}</td></tr>
          ) : (
            <tr className="total-row"><td className="l">Total</td><td>{money(b.totalTaxableValue)}</td><td></td><td>{money(b.totalCgst)}</td><td></td><td>{money(b.totalSgst)}</td><td>{money(b.totalGst)}</td></tr>
          )}
        </tfoot>
      </table>

      <table className="layout-table header-style">
        <tbody>
          <tr>
            <td>
              <div className="decl-box">
                <strong>Received the above goods in good condition.</strong>
                <div className="computer-note">This is not a tax invoice.</div>
                <div className="sign-line">Receiver's Signature</div>
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
      <div className="footnote">This is a Computer Generated Delivery Challan</div>
    </div>
  );
}

export const buildDcDocumentHtml = (challan, shop = {}, customer = null, size = 'A4') => {
  const paper = PAPER[size] || PAPER.A4;
  const paperClass = size === 'A5' ? 'paper-a5' : 'paper-a4';
  const challanNumber = challan.billDetails?.challanNumber || '';
  const bodyHtml = ReactDOMServer.renderToStaticMarkup(<DcDocument challan={challan} shop={shop} customer={customer} />);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Delivery Challan ${challanNumber} (${size})</title>
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
// `challanOrLoader` is a challan, or an async function that fetches one
// (keyboard "print last challan"), so the window still opens first.
export const printDc = async (challanOrLoader, shop = {}, customerList = [], size = 'A4') => {
  const { width, height } = PAPER_WINDOW[size] || PAPER_WINDOW.A4;
  const win = window.open('', '_blank', `width=${width},height=${height}`);
  if (!win) { alert('Please allow popups to print the challan.'); return; }
  try {
    const challan = typeof challanOrLoader === 'function' ? await challanOrLoader() : challanOrLoader;
    const customerRecord = customerList.find((c) => c.name?.toLowerCase() === (challan.customer?.name || '').trim().toLowerCase());
    win.document.open();
    win.document.write(buildDcDocumentHtml(challan, shop || {}, customerRecord || null, size));
    win.document.close();
    win.focus();
  } catch (error) {
    win.document.open();
    win.document.write(`<p style="font-family:sans-serif;padding:20px;color:#a12d27;">Unable to build the challan: ${error.message}</p>`);
    win.document.close();
  }
};
