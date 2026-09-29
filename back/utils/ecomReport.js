// Reads an e-commerce operator's monthly TCS sales report (and its returns
// report) and turns it into the net month summary stored in EcomSale.
//
// Expected row fields (the operator's "tcs_sales.json" / "tcs_sales_return.json"):
//   gstin                     seller GSTIN — must be this business's GSTIN
//   eco_tcs_gstin             operator's GSTIN (TCS registration, 14th char 'C')
//   total_taxable_sale_value  taxable value (negative for shipping adjustments)
//   tax_amount, gst_rate, hsn_code, quantity
//   end_customer_state_new    buyer's state → place of supply
//   month_number, financial_year, order_date, cancel_return_date (returns)
//
// Sales count +, returns −. Intra-state (buyer in the seller's state) splits the
// tax into CGST + SGST; anything else is IGST.
const { stateCode, stateName } = require('./gstStateCodes');
const { cleanGstin } = require('./gstr1');
const { tcsGstinOk } = require('./gstin');

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;
const pad2 = (n) => String(n).padStart(2, '0');
const REQUIRED = ['gstin', 'eco_tcs_gstin', 'total_taxable_sale_value', 'tax_amount', 'gst_rate', 'end_customer_state_new', 'month_number'];

// Calendar year of the row's return month: from its own date when that date is
// in the same month (financial_year alone is ambiguous for Jan–Mar).
const periodOfRow = (row, isReturn) => {
  const month = Number(row.month_number);
  const dateText = (isReturn && row.cancel_return_date) || row.order_date;
  const date = dateText ? new Date(`${String(dateText).slice(0, 10)}T00:00:00Z`) : null;
  const year = date && date.getUTCMonth() + 1 === month ? date.getUTCFullYear() : Number(row.financial_year);
  return { month, year };
};

const parseEcomReport = ({ sales, returns = [], sellerGstin }) => {
  if (!Array.isArray(sales) || !sales.length) throw new Error('The sales file has no rows. Choose the operator\'s sales report (a JSON list of orders).');
  if (!Array.isArray(returns)) throw new Error('The returns file is not a JSON list.');
  const all = [...sales.map((row) => ({ row, sign: 1 })), ...returns.map((row) => ({ row, sign: -1 }))];

  const missing = REQUIRED.filter((field) => !all.every(({ row }) => row && row[field] !== undefined && row[field] !== null && row[field] !== ''));
  if (missing.length) throw new Error(`This doesn't look like an e-commerce TCS sales report — missing: ${missing.join(', ')}.`);

  const seller = cleanGstin(sellerGstin);
  const sellers = [...new Set(all.map(({ row }) => cleanGstin(row.gstin)))];
  if (sellers.length > 1) throw new Error(`The files contain more than one seller GSTIN: ${sellers.join(', ')}.`);
  if (sellers[0] !== seller) {
    throw new Error(`This report is for seller GSTIN ${sellers[0]}, but your business GSTIN is ${seller || '(not set)'}. Set your GSTIN in Profile / Invoice Settings, or upload your own report.`);
  }
  const sellerState = seller.slice(0, 2);

  const operators = [...new Set(all.map(({ row }) => cleanGstin(row.eco_tcs_gstin)))];
  if (operators.length > 1) throw new Error(`The files contain more than one e-commerce operator (${operators.join(', ')}). Import each operator's report separately.`);
  const etin = operators[0];
  if (!tcsGstinOk(etin)) throw new Error(`E-commerce operator GSTIN "${etin}" is not a valid TCS GSTIN.`);

  const periods = [...new Set(all.map(({ row, sign }) => {
    const { month, year } = periodOfRow(row, sign < 0);
    return `${pad2(month)}${year}`;
  }))];
  if (periods.length > 1) throw new Error(`The files cover more than one month (${periods.map((p) => `${p.slice(0, 2)}/${p.slice(2)}`).join(', ')}). Import one month at a time.`);
  const fp = periods[0];
  const month = Number(fp.slice(0, 2));
  const year = Number(fp.slice(2));
  if (!(month >= 1 && month <= 12) || !(year > 2000)) throw new Error(`Could not work out the month of this report (${fp}).`);

  const warnings = [];
  const unknownStates = [...new Set(all.filter(({ row }) => !stateCode(row.end_customer_state_new)).map(({ row }) => row.end_customer_state_new))];
  if (unknownStates.length) throw new Error(`Unknown buyer state(s) in the report: ${unknownStates.join(', ')}.`);

  const badTax = all.filter(({ row }) => Math.abs(num(row.total_taxable_sale_value) * num(row.gst_rate) / 100 - num(row.tax_amount)) > 0.05);
  if (badTax.length) warnings.push(`${badTax.length} row(s) where tax ≠ taxable value × GST rate (e.g. order ${badTax[0].row.sub_order_num || '?'}). Their amounts are used as given.`);
  const saleOrders = new Set(sales.map((r) => r.sub_order_num));
  const earlierReturns = returns.filter((r) => !saleOrders.has(r.sub_order_num)).length;
  if (earlierReturns) warnings.push(`${earlierReturns} return(s) are for orders not in this sales file (sold in an earlier month) — they still reduce this month's figures, as GST requires.`);

  const rows = {};
  const hsn = {};
  all.forEach(({ row, sign }) => {
    const pos = stateCode(row.end_customer_state_new);
    const rate = num(row.gst_rate);
    const inter = pos !== sellerState;
    const taxable = sign * num(row.total_taxable_sale_value);
    const tax = sign * num(row.tax_amount);
    const qty = sign * num(row.quantity);
    const key = `${pos}|${rate}`;
    if (!rows[key]) rows[key] = { pos, rate, inter, taxableValue: 0, tax: 0, quantity: 0 };
    rows[key].taxableValue += taxable;
    rows[key].tax += tax;
    rows[key].quantity += qty;
    const code = String(row.hsn_code || '').trim() || '—';
    const hkey = `${code}|${rate}`;
    if (!hsn[hkey]) hsn[hkey] = { hsnCode: code, rate, quantity: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0 };
    hsn[hkey].quantity += qty;
    hsn[hkey].taxableValue += taxable;
    if (inter) hsn[hkey].igst += tax; else { hsn[hkey].cgst += tax / 2; hsn[hkey].sgst += tax / 2; }
  });

  // Split each state's tax: CGST = half (rounded), SGST = the rest, so they add up exactly.
  const rowList = Object.values(rows).map((r) => {
    const tax = round2(r.tax);
    const cgst = r.inter ? 0 : round2(tax / 2);
    return {
      pos: r.pos, state: stateName(r.pos), rate: r.rate, inter: r.inter, taxableValue: round2(r.taxableValue), quantity: round2(r.quantity),
      igst: r.inter ? tax : 0, cgst, sgst: r.inter ? 0 : round2(tax - cgst),
    };
  }).filter((r) => r.taxableValue || r.igst || r.cgst || r.sgst)
    .sort((a, b) => b.taxableValue - a.taxableValue);
  const hsnList = Object.values(hsn).map((h) => ({
    hsnCode: h.hsnCode, rate: h.rate, quantity: round2(h.quantity), taxableValue: round2(h.taxableValue),
    igst: round2(h.igst), cgst: round2(h.cgst), sgst: round2(h.sgst),
  })).filter((h) => h.taxableValue || h.quantity);
  // Month totals from the exact (unrounded) sums, rounded once — adding up the
  // rounded state rows would drift by a few paise.
  const raw = Object.values(rows).reduce((t, r) => ({
    taxableValue: t.taxableValue + r.taxableValue,
    igst: t.igst + (r.inter ? r.tax : 0),
    intraTax: t.intraTax + (r.inter ? 0 : r.tax),
  }), { taxableValue: 0, igst: 0, intraTax: 0 });
  const totalCgst = round2(raw.intraTax / 2);
  const totals = { taxableValue: round2(raw.taxableValue), igst: round2(raw.igst), cgst: totalCgst, sgst: round2(round2(raw.intraTax) - totalCgst) };

  rowList.filter((r) => r.taxableValue < 0).forEach((r) => {
    warnings.push(`${stateName(r.pos)} @ ${r.rate}%: returns are more than sales this month (taxable ${r.taxableValue}).`);
  });

  return {
    etin,
    fp,
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    periodEnd: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
    sellerName: String(sales[0].sup_name || ''),
    counts: {
      sales: sales.filter((r) => num(r.total_taxable_sale_value) >= 0).length,
      returns: returns.length,
      adjustments: sales.filter((r) => num(r.total_taxable_sale_value) < 0).length,
    },
    rows: rowList,
    hsn: hsnList,
    totals,
    warnings,
  };
};

module.exports = { parseEcomReport };
