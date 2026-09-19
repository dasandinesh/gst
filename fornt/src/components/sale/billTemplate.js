// The printable bill template — letterhead, item table, totals — lives here on its
// own so it can be redesigned for a customer without touching Sale/Order Entry's
// data logic. `renderBillHtml` builds one bill's HTML; `buildBillsDocumentHtml`
// wraps one or more bills into a full print document (one bill per A5 page).
//
// To change how a bill looks: edit the markup in `renderBillHtml` and/or the rules
// in `BILL_STYLE` below. Nothing else in the app needs to change.

const toDateInput = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
    return parsed.toISOString().split('T')[0];
};

const money = (n) => Number(n || 0).toFixed(2);
const has = (v) => v !== undefined && v !== null && v !== '';

// One bill's HTML — works for a sale record or an order (purchase) record, since
// both share the same bill_details / products shape.
//   record   — the sale/order document
//   shop     — the active invoice setting (letterhead), or {}
//   customer — the matching customer record, for the live balance fallback, or null
export const renderBillHtml = (record, shop = {}, customer = null) => {
    const bill = record.bill_details || {};
    const items = record.products || [];
    if (!items.length) return '';

    const productRows = items.map((item, i) => `
        <tr>
            <td class="c">${i + 1}</td>
            <td class="r">${money(item.single_price)}</td>
            <td>${item.name || ''}</td>
            <td class="r">${item.quantity ? money(item.quantity) : ''}</td>
            <td class="r">${item.bags || ''}</td>
            <td class="r">${money(item.base_price)}</td>
        </tr>`).join('');

    const totalKgs = items.reduce((t, p) => t + Number(p.quantity || 0), 0);
    const totalBags = items.reduce((t, p) => t + Number(p.bags || 0), 0);
    const bagAmount = Number(bill.bagAmountTotal || 0);
    const cooly = Number(bill.wageTotal || 0);
    const commission = Number(bill.commissionTotal || 0);
    const freight = Number(bill.freight || bill.transport || 0);
    const billTotal = Number(bill.bill_amount || 0);
    const paid = Number(bill.debit || 0) + Number(bill.credit || 0);
    // Prefer the balance snapshot saved with the bill; fall back to the customer's live balance.
    const openingBalance = has(bill.old_balance) ? Number(bill.old_balance) : Number(customer?.oldBalance ?? 0);
    const closingBalance = has(bill.net_balance) ? Number(bill.net_balance) : openingBalance + billTotal - paid;

    const chargeRow = (label, value) => (Number(value) ?
        `<tr><td colspan="4"></td><td class="r lbl">${label}</td><td class="r">${money(value)}</td></tr>` : '');

    const address = [shop.door, shop.street, shop.area, shop.district, shop.state, shop.pincode].filter(Boolean).join(', ');
    const cells = [shop.phone, shop.phone_2].filter(Boolean).map((p) => `Cell : ${p}`).join('<br/>');

    return `
        <section class="bill">
            ${shop.header ? `<div class="quote">${shop.header}</div>` : ''}
            <table>
                <thead>
                    <tr><td colspan="6" class="shop">
                        <div class="shop-top">
                            <div>
                                <div class="shop-name">${shop.name || ''}</div>
                                <div class="shop-area">${shop.area || ''}</div>
                            </div>
                            <div class="shop-cell">${cells}</div>
                        </div>
                        ${address ? `<div class="shop-addr">${address}</div>` : ''}
                    </td></tr>
                    <tr><td colspan="6" class="meta">
                        <div class="meta-row">
                            <div>To: <b>${record.customer?.name || ''}</b></div>
                            <div>Dt: <b>${toDateInput(bill.date)}</b>&nbsp;&nbsp;&nbsp;No: <b>${bill.order_sno || ''}</b></div>
                        </div>
                    </td></tr>
                    <tr class="cols">
                        <th>SNo</th><th>Rate</th><th>Item</th><th>Kgs</th><th>Bag</th><th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${productRows}
                    <tr>
                        <td colspan="2"></td>
                        <td class="lbl">Total</td>
                        <td class="r lbl">${money(totalKgs)}</td>
                        <td class="r lbl">${totalBags}</td>
                        <td class="r lbl">${money(bill.subtotal)}</td>
                    </tr>
                    ${chargeRow('Bag Amount', bagAmount)}
                    ${chargeRow('Cooly', cooly)}
                    ${chargeRow('Commission', commission)}
                    ${chargeRow('Freight', freight)}
                    <tr><td colspan="4"></td><td class="r lbl">BILL TOTAL</td><td class="r lbl">${money(billTotal)}</td></tr>
                    ${paid ? `<tr><td colspan="4"></td><td class="r">Paid</td><td class="r">${money(paid)}</td></tr>` : ''}
                    <tr><td colspan="4"></td><td class="r">Opening Balance</td><td class="r">${money(openingBalance)}</td></tr>
                    <tr><td colspan="4"></td><td class="r lbl">Closing Balance</td><td class="r lbl">${money(closingBalance)}</td></tr>
                </tbody>
            </table>
            ${shop.fooder ? `<div class="foot-note">${shop.fooder}</div>` : ''}
        </section>`;
};

// Print-window CSS for the bill template — edit this to restyle every printed bill
// (fonts, spacing, letterhead layout, page size).
export const BILL_STYLE = `
    @page { size: A5; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; }
    .bill { page-break-after: always; }
    .bill:last-child { page-break-after: auto; }
    .quote { text-align: center; font-style: italic; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    thead td, thead th, tbody td { border: 1px solid #000; }
    .shop { padding: 6px 8px; }
    .shop-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .shop-name { font-family: Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: bold; line-height: 1; }
    .shop-area { font-weight: bold; margin-top: 3px; }
    .shop-cell { text-align: right; font-weight: bold; font-size: 11px; }
    .shop-addr { margin-top: 3px; font-size: 11px; }
    .meta { padding: 4px 8px; }
    .meta-row { display: flex; justify-content: space-between; }
    thead .cols th { background: #f0f0f0; padding: 3px 6px; }
    tbody td { padding: 2px 6px; }
    .c { text-align: center; }
    .r { text-align: right; }
    .lbl { font-weight: bold; }
    .foot-note { text-align: center; font-style: italic; margin-top: 10px; font-size: 11px; }
`;

// Wraps one or more bills' HTML into a full print document, one bill per A5 page,
// auto-printing once the window has loaded.
export const buildBillsDocumentHtml = (billsHtml, title = 'Bills') => `
    <html>
    <head>
        <title>${title}</title>
        <style>${BILL_STYLE}</style>
    </head>
    <body>
        ${billsHtml.join('')}
        <script>window.onload = function () { window.print(); }</script>
    </body>
    </html>
`;
