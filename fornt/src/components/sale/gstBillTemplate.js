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
export const numberToWordsIndian = (value) => {
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
// linesPerPage: item lines that fit on one page between the header and footer
// (both repeat on every page). charsPerLine: how long a product name gets
// before it wraps to a second line. Rough numbers — if a page spills over
// onto an extra sheet, lower linesPerPage.
export const PAPER = {
  A4: { margin: '10mm', linesPerPage: 20, charsPerLine: 45 },
  A5: { margin: '6mm', linesPerPage: 11, charsPerLine: 24 },
};
export const PAPER_WINDOW = {
  A4: { width: 800, height: 900 },
  A5: { width: 560, height: 760 },
};

// Splits item sizes into pages → how many items go on each page. Pages are
// filled with items as far as they go.
//   - `taxRowsSize`: Sub Total / CGST / SGST / Round Off rows, printed right
//     under the last item (if they don't fit there, the last item moves with them).
//   - `lastPageSize`: Total, amount in words, HSN summary, printed at the
//     bottom of the last page; if they don't fit under the last items and tax
//     rows, they get a page of their own (count 0), so earlier pages stay full.
const splitIntoPages = (itemSizes, capacity, taxRowsSize, lastPageSize) => {
  const counts = [0];
  const sizes = [[]];
  itemSizes.forEach((itemSize) => {
    const used = sizes[sizes.length - 1].reduce((sum, s) => sum + s, 0);
    if (used + itemSize > capacity && counts[counts.length - 1]) { counts.push(0); sizes.push([]); }
    counts[counts.length - 1] += 1;
    sizes[sizes.length - 1].push(itemSize);
  });
  let lastSizes = sizes[sizes.length - 1];
  let used = lastSizes.reduce((sum, s) => sum + s, 0);
  if (used + taxRowsSize > capacity && counts[counts.length - 1] > 1) {
    counts[counts.length - 1] -= 1;
    counts.push(1);
    lastSizes = [lastSizes[lastSizes.length - 1]];
    used = lastSizes[0];
  }
  return used + taxRowsSize + lastPageSize <= capacity ? counts : [...counts, 0];
};

// Fallback when the real layout can't be measured: estimate in text lines.
const estimatePageCounts = (items, { linesPerPage, charsPerLine }, taxRowLines, lastPageLines) => splitIntoPages(
  items.map((p) => Math.max(1, Math.ceil(String(p.name || '').length / charsPerLine))),
  linesPerPage,
  taxRowLines,
  lastPageLines,
);

// Printable width of each paper (page width minus the @page margins).
const PRINT_WIDTH = { A4: '190mm', A5: '136mm' };

// Lays the bill out off-screen as one long page at the real paper width and
// measures it (page height, header + footer, each item row, the last-page
// totals), so page breaks fall exactly where the paper fills up. Resolves
// null if it can't measure; the caller then falls back to the estimate.
const measurePageCounts = (probeHtml, size) => new Promise((resolve) => {
  if (typeof document === 'undefined') { resolve(null); return; }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${PRINT_WIDTH[size] || PRINT_WIDTH.A4};height:100px;border:0;visibility:hidden;`;
  let done = false;
  const finish = (result) => {
    if (done) return;
    done = true;
    frame.remove();
    resolve(result);
  };
  frame.onload = () => {
    try {
      const doc = frame.contentDocument;
      const heightOf = (el) => (el ? el.getBoundingClientRect().height : 0);
      const pageProbe = doc.createElement('div');
      pageProbe.style.height = 'var(--gst-page-height)';
      doc.body.appendChild(pageProbe);
      const pageHeight = heightOf(pageProbe);
      const rowHeights = [...doc.querySelectorAll('.item-row')].map(heightOf);
      const sumOf = (selector) => [...doc.querySelectorAll(selector)].reduce((sum, el) => sum + heightOf(el), 0);
      const taxRowsSize = sumOf('.tax-rows');
      const lastPageSize = sumOf('.last-only');
      const everythingElse = heightOf(doc.querySelector('.gst-invoice')) - rowHeights.reduce((sum, h) => sum + h, 0) - taxRowsSize - lastPageSize;
      const capacity = pageHeight - everythingElse - 8; // small margin for rounding
      finish(pageHeight && capacity > 0 ? splitIntoPages(rowHeights, capacity, taxRowsSize, lastPageSize) : null);
    } catch (error) {
      finish(null);
    }
  };
  setTimeout(() => finish(null), 4000);
  frame.srcdoc = probeHtml;
  document.body.appendChild(frame);
});

// Print stylesheet — edit this to restyle every printed GST bill (fonts,
// spacing, borders). Styled to match a classic "Tally" tax-invoice
// printout: plain black on white, no color fills, boxy borders.
// Paper-size sizing (padding/font) switches via the body class
// (.paper-a4 / .paper-a5) set on <body> below.
export const GST_STYLE = `
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
  /* A multi-page bill prints one .gst-invoice per sheet. */
  .gst-invoice + .gst-invoice { break-before: page; page-break-before: always; }
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
  .bill-deteils-head > .detail-table { flex: 1 1 50%; border-left: 1.5px solid #000; }

  .section-title { font-weight: 700; margin-bottom: 2px; }
  .k { font-weight: 700; width: 42%; }
  .kv { width: 50%; vertical-align: top; }

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
  .decl-box.right { text-align: center;width:200px  }
  .computer-note { margin-top: 14px; font-style: italic; font-size: .85em; }
  // .sign-line { margin-top: 6px; padding-top: 4px; border-top: 1px solid #000; display: inline-block; font-size: .85em; }

  .transport-colum {width:150px }
  .thankyou { text-align: center; padding: 6px; font-size: .9em; }
  .footnote { text-align: center; padding: 0 6px 8px; font-size: .85em; }
  .header-style{ height:40px}
  /* "Page 1 of 2 — Continued…" strip at the bottom of every page. */
  .page-number { display: flex; justify-content: space-between; padding: 3px 8px; border-top: 1.5px solid #000; font-size: .85em; }
  .page-number .continued { font-style: italic; }`;

// One bill's printable layout. `shop` is the active invoice setting
// (letterhead), or {}. `customer` is the matching customer master record
// (for the printed address/phone), or null if not found. `showHsnSummary`
// (default true) toggles the per-HSN/SAC tax table. `size` ('A4' / 'A5')
// decides how many items fit on a page. `pageCounts` (items per page, as
// measured by buildGstBillDocumentHtml) overrides the line-count estimate.
//
// Long bills print on several pages: the header (letterhead, buyer, bill
// details), the items column headings and the footer (declaration and
// signatures) repeat on every page, each page is numbered "Page 1 of 2", and
// the Total / amount in words / HSN summary print only at the bottom of the
// last page.
export function GstBillDocument({ bill, shop = {}, customer = null, showHsnSummary = true, size = 'A4', pageCounts = null }) {
  const isIgst = bill.billDetails?.taxType === 'IGST';
  const items = bill.items || [];
  const b = bill.billDetails || {};

  const shopAddress = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode].filter(Boolean).join(', ');
  const shopPhones = [shop.phone, shop.phone_2].filter(Boolean).join(' / ');
  const customerAddress = customer ? [customer.door, customer.street, customer.area, customer.district, customer.state, customer.pincode].filter(Boolean).join(', ') : '';
  // Ship-to is the address copy saved on the bill; bills saved before ship-to existed fall back to the buyer.
  const saved = bill.shippingAddress || {};
  const shipAddress = [saved.door, saved.street, saved.area, saved.district, saved.state, saved.pincode].filter(Boolean).join(', ');
  const shipTo = shipAddress
    ? { name: saved.contactName || bill.customer?.name || '', address: shipAddress, phone: saved.phone, gstin: saved.gstin }
    : { name: bill.customer?.name || '', address: customerAddress, phone: customer?.phone, gstin: bill.customer?.gstin };
  const totalQty = items.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

  // One row per HSN/SAC code — assumes a uniform GST rate per code, which GST requires anyway.
  const hsnGroups = {};
  items.forEach((p) => {
    const key = p.hsnCode || '—';
    if (!hsnGroups[key]) hsnGroups[key] = { hsn: key, taxable: 0, cgstRate: p.cgstRate, cgst: 0, sgstRate: p.sgstRate, sgst: 0, igstRate: p.igstRate, igst: 0 };
    hsnGroups[key].taxable += Number(p.taxableValue) || 0;
    hsnGroups[key].cgst += Number(p.cgstAmount) || 0;
    hsnGroups[key].sgst += Number(p.sgstAmount) || 0;
    hsnGroups[key].igst += Number(p.igstAmount) || 0;
  });

  // Estimate fallback: lines for the tax rows, and for Total + amount in words (+ HSN table).
  const taxRowCount = isIgst
    ? (Number(b.totalIgst) ? 1 : 0)
    : (Number(b.totalCgst) ? 2 : 0) + (Number(b.totalSgst) ? 1 : 0) + (b.roundOff ? 1 : 0);
  const lastPageLines = 1 + 2 + (showHsnSummary ? Object.keys(hsnGroups).length + 4 : 0);
  const counts = pageCounts || estimatePageCounts(items, PAPER[size] || PAPER.A4, taxRowCount, lastPageLines);
  let start = 0;
  const pages = counts.map((count, index) => {
    // The last page takes whatever is left, so no item is ever dropped.
    const end = index === counts.length - 1 ? items.length : start + count;
    const page = items.slice(start, end).map((p, i) => ({ ...p, slNo: start + i + 1 }));
    start = end;
    return page;
  });
  // Tax rows go under the last item — on the last page, or on the page before
  // when Total + summary got a page of their own.
  const lastPage = pages.length - 1;
  const taxRowsPage = lastPage > 0 && !pages[lastPage].length ? lastPage - 1 : lastPage;

  // Repeated at the top of every page.
  const header = (
    <>
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
                <div className="company-name">{shipTo.name}</div>
                <div>{shipTo.address || '—'}</div>
                <div>Phone : {shipTo.phone || '—'}</div>
                <div>GSTIN/UIN : {shipTo.gstin || '—'}</div>
              </td>
            </tr>
          </tbody>
        </table>
        <table className="detail-table">
          <tbody>
            <tr>
              <td className="kv"><b>Invoice No:</b> <br></br> {b.invoiceNumber || ''}</td>
              <td className="kv"><b>Dated:</b> <br></br> {toDateInput(b.date)}</td>
            </tr>
            {b.deliveryChallanNumber ? (
              <tr>
                <td className="kv"><b>DC No:</b> <br></br>{b.deliveryChallanNumber}</td>
                <td className="kv"><b>DC Date:</b><br></br> {toDateInput(b.deliveryChallanDate) || '—'}</td>
              </tr>
            ) : null}
            {b.purchaseOrderNumber ? (
              <tr>
                <td className="kv"><b>Buyer's PO No:</b> <br></br>{b.purchaseOrderNumber}</td>
                <td className="kv"><b>PO Date:</b><br></br> {toDateInput(b.purchaseOrderDate) || '—'}</td>
              </tr>
            ) : null}
            {/* Transport: printed only when a vehicle number or transporter ID is filled in. */}
            {b.transport?.vehicleNumber || b.transport?.transporterId ? (
              <tr>
                <td className="kv"><b>Vehicle No:</b> <br></br>{b.transport.vehicleNumber || '—'}</td>
                <td className="kv"><b>Transporter ID:</b><br></br> {b.transport.transporterId || '—'}</td>
              </tr>
            ) : null}
            <tr>
              <td className="kv"><b>PoS:</b> <br></br>{b.placeOfSupply || '—'}</td>
              <td className="kv"><b>Tax Type:</b> <br></br>{isIgst ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)'}</td>
            </tr>
            {b.notes ? (
              <tr>
                <td className="kv" colSpan="2"><b>Remark:</b> {b.notes}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );

  // Repeated at the bottom of every page.
  const footer = (
    <table className="layout-table header-style">
      <tbody>
        <tr>
          <td>
            <div className="decl-box">
              <strong>Declaration</strong><br />
              <div>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
               <br></br>
               <br></br>
              <br></br>
              <div className="sign-line">Customer Signature</div>
            </div>
          </td>

          <td>
            <div className="decl-box right">
              <strong>for {shop.name || 'Tax Invoice'}</strong>
              <br></br>
              <br></br>
               <br></br>
              <br></br>

              {/* <div className="computer-note">This is a computer generated invoice,<br />no signature required.</div> */}
              <div className="sign-line">Authorised Signatory</div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <>
      {pages.map((pageItems, pageIndex) => {
        const isLastPage = pageIndex === pages.length - 1;
        return (
          <div className="gst-invoice" key={pageIndex}>
            {header}

            {/* Items Table */}
            <table className="items-table">
              <thead>
                <tr><th>Sl<br />No.</th><th>Description of Goods</th><th>HSN/<br />SAC</th><th>Quantity</th><th>Rate</th><th>per</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {pageItems.map((p) => (
                  <tr key={p.slNo} className="item-row">
                    <td className="c">{p.slNo}</td><td className="l">{p.name}</td><td className="c">{p.hsnCode || '—'}</td><td className="c">{p.quantity} {p.unit || ''}</td>
                    <td>{money(p.rate)}</td><td className="c">{p.unit || ''}</td><td>{money(p.taxableValue)}</td>
                  </tr>
                ))}
                {/* Tax rows right under the last item. */}
                {pageIndex !== taxRowsPage ? null : isIgst
                  ? (Number(b.totalIgst) ? <tr className="tax-summary-row tax-rows"><td colSpan="6" className="c tax-label">OUTPUT IGST</td><td>{money(b.totalIgst)}</td></tr> : null)
                  : (
                    <>
                      {Number(b.totalCgst) ? <tr className="tax-rows"><td colSpan="6" className="l">Sub Total</td><td>{money(b.totalTaxableValue)}</td></tr> : null}
                      {Number(b.totalCgst) ? <tr className="tax-summary-row tax-rows"><td colSpan="6" className="c tax-label">OUTPUT CGST</td><td>{money(b.totalCgst)}</td></tr> : null}
                      {Number(b.totalSgst) ? <tr className="tax-summary-row tax-rows"><td colSpan="6" className="c tax-label">OUTPUT SGST</td><td>{money(b.totalSgst)}</td></tr> : null}
                      {b.roundOff ? <tr className="tax-rows"><td colSpan="6" className="l">Round Off</td><td>{money(b.roundOff)}</td></tr> : null}
                    </>
                  )}
                <tr className="spacer-row"><td colSpan="7"></td></tr>
              </tbody>
              {/* Total only on the last page, at its bottom. */}
              {isLastPage ? (
                <tfoot className="last-only">
                  <tr className="total-row"><td colSpan="3" className="l">Total</td><td className="c">{totalQty} {items[0]?.unit || ''}</td><td></td><td></td><td>{money(b.grandTotal)}</td></tr>
                </tfoot>
              ) : null}
            </table>

            {isLastPage ? (
              <>
                {/* Totals Summary */}
                <table className="layout-table words-table last-only">
                  <tbody>
                    <tr>
                      <td colSpan="2" className="words-label">Amount Chargeable (in words)</td>
                    </tr>
                    <tr><td colSpan="2" className="words-value">Indian Rupee {numberToWordsIndian(b.grandTotal)} Only</td></tr>
                  </tbody>
                </table>

                {showHsnSummary ? (
                  <>
                    <table className="hsn-table last-only">
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
                          <tr className="total-row"><td className="l">Total</td><td>{money(b.totalTaxableValue)}</td><td></td><td>{money(b.totalIgst)}</td><td>{money(b.totalGst)}</td></tr>
                        ) : (
                          <tr className="total-row"><td className="l">Total</td><td>{money(b.totalTaxableValue)}</td><td></td><td>{money(b.totalCgst)}</td><td></td><td>{money(b.totalSgst)}</td><td>{money(b.totalGst)}</td></tr>
                        )}
                      </tfoot>
                    </table>
                    <p className="tax-words last-only">Tax Amount (in words) : <strong>Indian Rupee {numberToWordsIndian(b.totalGst)} Only</strong></p>
                  </>
                ) : null}
              </>
            ) : null}

            {/* Footer */}
            {footer}
            {/* <div className="thankyou">{shop.fooder || 'Thank you for shopping with us!'}</div> */}
            {/* <div className="footnote">This is a Computer Generated Invoice</div> */}

            <div className="page-number">
              <span className="continued">{isLastPage ? '' : 'Continued on next page…'}</span>
              <span>Page {pageIndex + 1} of {pages.length}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

// Renders GstBillDocument to a full HTML print document for one bill —
// used by the "Print" buttons, which open a popup window and write this
// HTML into it directly (the template's own onload triggers window.print()).
//
// It first lays the bill out off-screen as one long page to measure where
// each page fills up (measurePageCounts), then renders the real pages with
// those item counts, so page 1 is filled right down to the footer.
export const buildGstBillDocumentHtml = async (bill, shop = {}, customer = null, size = 'A4', options = {}) => {
  const paper = PAPER[size] || PAPER.A4;
  const paperClass = size === 'A5' ? 'paper-a5' : 'paper-a4';
  const invoiceNumber = bill.billDetails?.invoiceNumber || '';
  const showHsnSummary = options.showHsnSummary !== false;
  const render = (pageCounts, extraStyle = '', script = '') => `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>GST Bill ${invoiceNumber} (${size})</title>
<style>@page { size: ${size}; margin: ${paper.margin}; } ${GST_STYLE} ${extraStyle}</style>
</head>
<body class="${paperClass}">
  ${ReactDOMServer.renderToStaticMarkup(
    <GstBillDocument bill={bill} shop={shop} customer={customer} showHsnSummary={showHsnSummary} size={size} pageCounts={pageCounts} />
  )}
  ${script}
</body>
</html>
`;

  // Probe: every item on one page, at natural height (no stretching to fill the page).
  const probeHtml = render([(bill.items || []).length], '.gst-invoice { min-height: 0 !important; }');
  const pageCounts = await measurePageCounts(probeHtml, size);
  return render(pageCounts, '', '<script>window.onload = function () { window.print(); };</script>');
};
