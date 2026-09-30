// GSTR-1 JSON mapping — the ONE place that translates between this app's
// field names (GstSale / CreditNote documents) and the GSTN offline-tool JSON
// format the GST portal accepts under GSTR-1 → "Prepare Offline" → Upload.
//
//   app field                              GSTR-1 JSON field
//   billDetails.invoiceNumber             inum        (credit note: nt_num)
//   billDetails.date                      idt         (credit note: nt_dt), dd-mm-yyyy
//   billDetails.grandTotal                val
//   billDetails.placeOfSupply             pos         (state name → 2-digit code)
//   customer.gstin                         ctin
//   items[].gstRate                        itm_det.rt
//   items[].taxableValue                   itm_det.txval
//   items[].igstAmount / cgst / sgst       itm_det.iamt / camt / samt
//   items[].hsnCode / unit / quantity      hsn.hsn_sc / uqc / qty
//
// Sales returns are entered as credit notes, which GSTR-1 reports in CDNR
// (registered buyer) / CDNUR (large inter-state B2C) / netted into B2CS.
const { num, round2 } = require('./gstAggregation');
const { stateCode, stateName } = require('./gstStateCodes');

// The offline tool stamps these on every file it generates; the portal expects them.
const JSON_VERSION = 'GST3.2.2';
// Inter-state sale to an unregistered buyer above this value is reported
// invoice-wise in B2CL instead of summarised in B2CS (₹1 lakh from Aug 2024).
const B2CL_LIMIT = 100000;

const { GSTIN_PATTERN } = require('./gstin');
const cleanGstin = (value) => String(value || '').trim().toUpperCase();

const pad2 = (n) => String(n).padStart(2, '0');
// Bill dates are calendar dates; format them in IST so a server running in UTC
// never shifts a bill onto the previous day.
const IST_OFFSET_MS = 330 * 60 * 1000;
const toGstDate = (date) => {
  const t = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return `${pad2(t.getUTCDate())}-${pad2(t.getUTCMonth() + 1)}-${t.getUTCFullYear()}`;
};
const fromGstDate = (text) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(text || ''));
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null;
};
// Return period "MMYYYY" — for quarterly (QRMP) filers, the quarter's last month.
const toReturnPeriod = (date) => toGstDate(date).slice(3).replace('-', '');

// Unit on the bill → GST Unit Quantity Code for the HSN table.
const UQC = {
  nos: 'NOS', no: 'NOS', number: 'NOS', numbers: 'NOS',
  pcs: 'PCS', pc: 'PCS', piece: 'PCS', pieces: 'PCS',
  kg: 'KGS', kgs: 'KGS', kilogram: 'KGS', kilo: 'KGS',
  g: 'GMS', gm: 'GMS', gms: 'GMS', gram: 'GMS', grams: 'GMS',
  qtl: 'QTL', quintal: 'QTL',
  ton: 'TON', tons: 'TON', tonne: 'MTS', mt: 'MTS',
  l: 'LTR', lt: 'LTR', ltr: 'LTR', ltrs: 'LTR', litre: 'LTR', liter: 'LTR',
  ml: 'MLT',
  m: 'MTR', mtr: 'MTR', mtrs: 'MTR', meter: 'MTR', metre: 'MTR',
  cm: 'CMS', sqft: 'SQF', sqm: 'SQM', ft: 'FTS', feet: 'FTS',
  box: 'BOX', boxes: 'BOX', bag: 'BAG', bags: 'BAG', btl: 'BTL', bottle: 'BTL',
  can: 'CAN', ctn: 'CTN', carton: 'CTN', doz: 'DOZ', dozen: 'DOZ',
  pac: 'PAC', pack: 'PAC', packet: 'PAC', pkt: 'PAC', roll: 'ROL', rolls: 'ROL',
  set: 'SET', sets: 'SET', pair: 'PRS', pairs: 'PRS', bundle: 'BDL', bdl: 'BDL',
  unit: 'UNT', units: 'UNT', tube: 'TBS', drum: 'DRM', gross: 'GRS',
};
const toUqc = (unit, hsn) => {
  if (String(hsn).startsWith('99')) return 'NA'; // services
  return UQC[String(unit || '').trim().toLowerCase().replace(/\./g, '')] || 'OTH';
};

/* ------------------------------------------------------------------ */
/* Export: app documents → GSTR-1 JSON                                 */
/* ------------------------------------------------------------------ */

// One invoice/note's product lines → GSTR-1 rate-wise items (one per GST rate).
const rateItems = (items, inter) => {
  const byRate = {};
  items.forEach((p) => {
    const rt = num(p.gstRate);
    if (!byRate[rt]) byRate[rt] = { rt, txval: 0, iamt: 0, camt: 0, samt: 0 };
    byRate[rt].txval += num(p.taxableValue);
    byRate[rt].iamt += num(p.igstAmount);
    byRate[rt].camt += num(p.cgstAmount);
    byRate[rt].samt += num(p.sgstAmount);
  });
  return Object.values(byRate)
    .sort((a, b) => a.rt - b.rt)
    .map((r, i) => ({
      num: i + 1,
      itm_det: inter
        ? { rt: r.rt, txval: round2(r.txval), iamt: round2(r.iamt), csamt: 0 }
        : { rt: r.rt, txval: round2(r.txval), camt: round2(r.camt), samt: round2(r.samt), csamt: 0 },
    }));
};

// Invoice/note number series for Table 13. Numbers ending in digits are grouped
// by prefix (GB/26-27/0001 … 0042); gaps in a series are deleted bills, which
// GST treats as cancelled.
const docSeries = (numbers) => {
  const groups = {};
  numbers.filter(Boolean).forEach((n) => {
    const m = /^(.*?)(\d+)$/.exec(n);
    const prefix = m ? m[1] : n;
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push({ n, seq: m ? Number(m[2]) : null });
  });
  return Object.values(groups).map((list, i) => {
    list.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.n.localeCompare(b.n));
    const first = list[0];
    const last = list[list.length - 1];
    const totnum = first.seq != null && last.seq != null ? last.seq - first.seq + 1 : list.length;
    return { num: i + 1, from: first.n, to: last.n, totnum, cancel: totnum - list.length, net_issue: list.length };
  });
};

// business: { gstin, state }; sales / creditNotes: documents dated in the period;
// originalSales: the GstSale documents those credit notes point at (may be older);
// ecomSales: EcomSale month summaries (marketplace sales, see utils/ecomReport.js).
const buildGstr1 = ({ business, sales, creditNotes, originalSales = [], ecomSales = [], fp }) => {
  const warnings = [];
  const gstin = cleanGstin(business.gstin);
  if (!GSTIN_PATTERN.test(gstin)) {
    throw new Error(gstin ? `Your GSTIN "${gstin}" is not in valid GSTIN format. Fix it in Invoice Settings.` : 'No GSTIN found. Add your GSTIN in Invoice Settings, then try again.');
  }
  const sellerState = gstin.slice(0, 2);

  // Reads one sale / credit note through the field mapping above.
  const read = (doc, numberField, amountField, label) => {
    const b = doc.billDetails || {};
    const ctin = cleanGstin(doc.customer?.gstin);
    const inter = b.taxType === 'IGST';
    const number = b[numberField] || '';
    let pos = stateCode(b.placeOfSupply) || stateCode(doc.customer?.state) || (GSTIN_PATTERN.test(ctin) ? ctin.slice(0, 2) : '');
    if (!pos) {
      pos = sellerState;
      warnings.push(`${label} ${number}: place of supply is empty or not a known state — used your own state (${stateName(sellerState)}).`);
    }
    if (ctin && !GSTIN_PATTERN.test(ctin)) warnings.push(`${label} ${number}: customer GSTIN "${ctin}" is not in valid GSTIN format — the portal will reject it.`);
    if (inter && pos === sellerState) warnings.push(`${label} ${number}: IGST bill but place of supply is your own state (${stateName(pos)}).`);
    if (!inter && pos !== sellerState) warnings.push(`${label} ${number}: CGST+SGST bill but place of supply is ${stateName(pos) || pos}, another state — should be IGST.`);
    return { number, idt: toGstDate(b.date), val: round2(b[amountField]), ctin, registered: !!ctin, pos, inter, items: doc.items || [] };
  };

  const b2b = {};
  const b2cl = {};
  const b2cs = {};
  const cdnr = {};
  const cdnur = [];
  const hsn = { b2b: {}, b2c: {} };
  const missingHsn = new Set();

  const nil = {};
  const addB2cs = (d, sign) => {
    rateItems(d.items, d.inter).forEach(({ itm_det: t }) => {
      // B2CS has no 0% rate — nil-rated B2C supplies go in the Nil table (8A–8D).
      if (t.rt === 0) {
        const type = d.inter ? 'INTRB2C' : 'INTRAB2C';
        nil[type] = (nil[type] || 0) + sign * t.txval;
        return;
      }
      const key = `${d.inter ? 'INTER' : 'INTRA'}|${d.pos}|${t.rt}`;
      if (!b2cs[key]) b2cs[key] = { sply_ty: d.inter ? 'INTER' : 'INTRA', pos: d.pos, typ: 'OE', rt: t.rt, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
      const row = b2cs[key];
      row.txval += sign * t.txval;
      row.iamt += sign * num(t.iamt);
      row.camt += sign * num(t.camt);
      row.samt += sign * num(t.samt);
    });
  };

  const addHsn = (d, sign) => {
    const table = d.registered ? hsn.b2b : hsn.b2c;
    d.items.forEach((p) => {
      const code = String(p.hsnCode || '').trim();
      if (!code || code === '—') { missingHsn.add(d.number); return; }
      const uqc = toUqc(p.unit, code);
      const rt = num(p.gstRate);
      const key = `${code}|${rt}|${uqc}`;
      if (!table[key]) table[key] = { hsn_sc: code, desc: String(p.name || '').slice(0, 30), uqc, qty: 0, rt, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
      const row = table[key];
      row.qty += uqc === 'NA' ? 0 : sign * num(p.quantity);
      row.txval += sign * num(p.taxableValue);
      row.iamt += sign * num(p.igstAmount);
      row.camt += sign * num(p.cgstAmount);
      row.samt += sign * num(p.sgstAmount);
    });
  };

  sales.forEach((doc) => {
    const d = read(doc, 'invoiceNumber', 'grandTotal', 'Bill');
    addHsn(d, 1);
    if (d.registered) {
      if (!b2b[d.ctin]) b2b[d.ctin] = { ctin: d.ctin, inv: [] };
      b2b[d.ctin].inv.push({ inum: d.number, idt: d.idt, val: d.val, pos: d.pos, rchrg: 'N', inv_typ: 'R', itms: rateItems(d.items, d.inter) });
    } else if (d.inter && d.val > B2CL_LIMIT) {
      if (!b2cl[d.pos]) b2cl[d.pos] = { pos: d.pos, inv: [] };
      b2cl[d.pos].inv.push({ inum: d.number, idt: d.idt, val: d.val, itms: rateItems(d.items, true) });
    } else {
      addB2cs(d, 1);
    }
  });

  const originalByNumber = new Map(originalSales.map((s) => [s.billDetails?.invoiceNumber, s]));
  creditNotes.forEach((doc) => {
    const d = read(doc, 'creditNoteNumber', 'grandTotal', 'Credit note');
    addHsn(d, -1);
    if (d.registered) {
      if (!cdnr[d.ctin]) cdnr[d.ctin] = { ctin: d.ctin, nt: [] };
      cdnr[d.ctin].nt.push({ ntty: 'C', nt_num: d.number, nt_dt: d.idt, val: d.val, pos: d.pos, rchrg: 'N', inv_typ: 'R', itms: rateItems(d.items, d.inter) });
      return;
    }
    // Unregistered buyer: only a note against a B2CL invoice is reported
    // note-wise; everything else just reduces that period's B2CS figures.
    const original = originalByNumber.get(doc.originalBill?.billNumber);
    const originalIsB2cl = original && !cleanGstin(original.customer?.gstin)
      && original.billDetails?.taxType === 'IGST' && num(original.billDetails?.grandTotal) > B2CL_LIMIT;
    if (originalIsB2cl) {
      cdnur.push({ typ: 'B2CL', ntty: 'C', nt_num: d.number, nt_dt: d.idt, val: d.val, pos: d.pos, itms: rateItems(d.items, true) });
    } else {
      addB2cs(d, -1);
    }
  });

  // Marketplace (e-commerce operator) sales: already net of returns, B2C only.
  // B2CS rows are tagged with the operator (typ 'E' + etin); Table 14 gets one
  // row per operator; HSN goes into the B2C HSN table.
  ecomSales.forEach((e) => {
    (e.rows || []).forEach((r) => {
      if (!num(r.rate)) {
        const type = r.inter ? 'INTRB2C' : 'INTRAB2C';
        nil[type] = (nil[type] || 0) + num(r.taxableValue);
        return;
      }
      const key = `E|${e.etin}|${r.inter ? 'INTER' : 'INTRA'}|${r.pos}|${r.rate}`;
      if (!b2cs[key]) b2cs[key] = { sply_ty: r.inter ? 'INTER' : 'INTRA', pos: r.pos, typ: 'E', etin: e.etin, rt: num(r.rate), txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
      const row = b2cs[key];
      row.txval += num(r.taxableValue);
      row.iamt += num(r.igst);
      row.camt += num(r.cgst);
      row.samt += num(r.sgst);
    });
    (e.hsn || []).forEach((h) => {
      const code = String(h.hsnCode || '').trim();
      if (!code || code === '—') { missingHsn.add(`marketplace ${e.etin}`); return; }
      const uqc = String(code).startsWith('99') ? 'NA' : 'NOS';
      const key = `${code}|${num(h.rate)}|${uqc}`;
      if (!hsn.b2c[key]) hsn.b2c[key] = { hsn_sc: code, desc: '', uqc, qty: 0, rt: num(h.rate), txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
      const row = hsn.b2c[key];
      row.qty += uqc === 'NA' ? 0 : num(h.quantity);
      row.txval += num(h.taxableValue);
      row.iamt += num(h.igst);
      row.camt += num(h.cgst);
      row.samt += num(h.sgst);
    });
  });

  const roundRow = (row) => {
    const out = { ...row };
    ['txval', 'iamt', 'camt', 'samt', 'csamt', 'qty'].forEach((k) => { if (k in out) out[k] = round2(out[k]); });
    return out;
  };

  const b2csRows = Object.values(b2cs).map((row) => {
    const r = roundRow(row);
    if (r.sply_ty === 'INTER') { delete r.camt; delete r.samt; } else { delete r.iamt; }
    return r;
  });
  b2csRows.filter((r) => r.txval < 0).forEach((r) => {
    warnings.push(`B2CS ${stateName(r.pos)} @ ${r.rt}%: credit notes exceed sales this period (taxable ${r.txval}). The portal may not accept a negative B2CS value — adjust it there.`);
  });

  const hsnRows = (table) => Object.values(table)
    .sort((a, b) => a.hsn_sc.localeCompare(b.hsn_sc) || a.rt - b.rt)
    .map((row, i) => ({ num: i + 1, ...roundRow(row) }));

  if (missingHsn.size) {
    warnings.push(`${missingHsn.size} bill(s)/note(s) have product lines without an HSN code, left out of the HSN table: ${[...missingHsn].slice(0, 10).join(', ')}${missingHsn.size > 10 ? ' …' : ''}`);
  }

  const docDet = [];
  const invoiceSeries = docSeries(sales.map((s) => s.billDetails?.invoiceNumber));
  const noteSeries = docSeries(creditNotes.map((c) => c.billDetails?.creditNoteNumber));
  if (invoiceSeries.length) docDet.push({ doc_num: 1, doc_typ: 'Invoices for outward supply', docs: invoiceSeries });
  if (noteSeries.length) docDet.push({ doc_num: 5, doc_typ: 'Credit Note', docs: noteSeries });

  const json = { gstin, fp, version: JSON_VERSION, hash: 'hash' };
  if (Object.keys(b2b).length) json.b2b = Object.values(b2b);
  if (Object.keys(b2cl).length) json.b2cl = Object.values(b2cl);
  if (b2csRows.length) json.b2cs = b2csRows;
  if (Object.keys(cdnr).length) json.cdnr = Object.values(cdnr);
  if (cdnur.length) json.cdnur = cdnur;
  const hsnB2b = hsnRows(hsn.b2b);
  const hsnB2c = hsnRows(hsn.b2c);
  if (hsnB2b.length || hsnB2c.length) json.hsn = { hsn_b2b: hsnB2b, hsn_b2c: hsnB2c };
  if (docDet.length) json.doc_issue = { doc_det: docDet };
  // Table 14(a): supplies made through e-commerce operators who collect TCS (section 52).
  // Totalled from the rounded B2CS 'E' rows so the two tables agree to the paisa.
  const supeco = {};
  b2csRows.filter((r) => r.typ === 'E').forEach((r) => {
    if (!supeco[r.etin]) supeco[r.etin] = { etin: r.etin, suppval: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    const t = supeco[r.etin];
    t.suppval += num(r.txval);
    t.igst += num(r.iamt);
    t.cgst += num(r.camt);
    t.sgst += num(r.samt);
  });
  const supecoRows = Object.values(supeco).map((t) => ({
    etin: t.etin, suppval: round2(t.suppval), igst: round2(t.igst), cgst: round2(t.cgst), sgst: round2(t.sgst), cess: 0,
  }));
  if (supecoRows.length) json.supeco = { clttx: supecoRows };
  const nilRows = Object.entries(nil).map(([sply_ty, amt]) => ({ sply_ty, nil_amt: round2(amt), expt_amt: 0, ngsup_amt: 0 }));
  if (nilRows.length) {
    json.nil = { inv: nilRows };
    warnings.push('0% GST sales to unregistered buyers were put under "Nil rated". If any of them are exempt or non-GST supplies, move them to that column on the portal.');
  }

  const counts = {
    b2b: Object.values(b2b).reduce((n, g) => n + g.inv.length, 0),
    b2cl: Object.values(b2cl).reduce((n, g) => n + g.inv.length, 0),
    b2cs: b2csRows.length,
    cdnr: Object.values(cdnr).reduce((n, g) => n + g.nt.length, 0),
    cdnur: cdnur.length,
    hsn: hsnB2b.length + hsnB2c.length,
    ecom: supecoRows.length,
  };
  return { json, warnings, counts };
};

/* ------------------------------------------------------------------ */
/* Import: GSTR-1 JSON → app documents                                 */
/* ------------------------------------------------------------------ */

// GSTR-1 only carries rate-wise totals per invoice, not the actual items,
// so each imported bill gets one line per GST rate. Amounts are taken exactly
// as filed rather than recomputed, so imported bills match the return.
const linesFromItems = (itms = [], inter) => itms.map((it) => {
  const d = it.itm_det || it;
  const rt = num(d.rt);
  const txval = round2(d.txval);
  const iamt = round2(d.iamt);
  const camt = round2(d.camt);
  const samt = round2(d.samt);
  return {
    name: `Imported supply @ ${rt}%`,
    hsnCode: '',
    quantity: 1,
    unit: '',
    rate: txval,
    gstMode: 'exclusive',
    gstRate: rt,
    taxableValue: txval,
    cgstRate: inter ? 0 : round2(rt / 2),
    sgstRate: inter ? 0 : round2(rt / 2),
    igstRate: inter ? rt : 0,
    cgstAmount: camt,
    sgstAmount: samt,
    igstAmount: iamt,
    amount: round2(txval + iamt + camt + samt),
  };
});

const totalsOfLines = (items, value) => {
  const totalTaxableValue = round2(items.reduce((s, p) => s + p.taxableValue, 0));
  const totalCgst = round2(items.reduce((s, p) => s + p.cgstAmount, 0));
  const totalSgst = round2(items.reduce((s, p) => s + p.sgstAmount, 0));
  const totalIgst = round2(items.reduce((s, p) => s + p.igstAmount, 0));
  const totalGst = round2(totalCgst + totalSgst + totalIgst);
  const amount = round2(value) || round2(totalTaxableValue + totalGst);
  const gstTotals = {};
  items.forEach((p) => {
    const key = String(p.gstRate);
    if (!gstTotals[key]) gstTotals[key] = { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 };
    gstTotals[key].taxableValue = round2(gstTotals[key].taxableValue + p.taxableValue);
    gstTotals[key].cgstAmount = round2(gstTotals[key].cgstAmount + p.cgstAmount);
    gstTotals[key].sgstAmount = round2(gstTotals[key].sgstAmount + p.sgstAmount);
    gstTotals[key].igstAmount = round2(gstTotals[key].igstAmount + p.igstAmount);
  });
  return { totalTaxableValue, totalCgst, totalSgst, totalIgst, totalGst, amount, roundOff: round2(amount - totalTaxableValue - totalGst), gstTotals };
};

const isInterState = (itms = [], pos, sellerState) => {
  const igst = itms.reduce((s, it) => s + num((it.itm_det || it).iamt), 0);
  const cgst = itms.reduce((s, it) => s + num((it.itm_det || it).camt), 0);
  if (igst) return true;
  if (cgst) return false;
  return !!pos && !!sellerState && pos !== sellerState; // 0% items: decide by state
};

const IMPORT_NOTE = 'Imported from GSTR-1 JSON';

// Returns documents without customer names — the controller fills those in from
// the customer master (matched by GSTIN). `ctin` is '' for unregistered buyers.
const parseGstr1 = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('That file is not a GSTR-1 JSON file.');
  const known = ['b2b', 'b2cl', 'b2cs', 'cdnr', 'cdnur', 'hsn', 'doc_issue', 'exp', 'nil', 'at', 'txpd', 'b2ba', 'b2cla', 'b2csa', 'cdnra', 'cdnura'];
  if (!data.gstin || !known.some((k) => k in data)) throw new Error('That file is not a GSTR-1 JSON file (no gstin / GSTR-1 sections found).');
  const sellerState = cleanGstin(data.gstin).slice(0, 2);

  const sales = [];
  const creditNotes = [];
  const skipped = [];

  const saleDoc = ({ ctin, pos, inv }) => {
    const inter = isInterState(inv.itms, pos, sellerState);
    const items = linesFromItems(inv.itms, inter);
    const t = totalsOfLines(items, inv.val);
    return {
      ctin,
      doc: {
        customer: { name: '', gstin: ctin, state: stateName(pos) },
        items,
        gstTotals: t.gstTotals,
        billDetails: {
          invoiceNumber: String(inv.inum || '').trim(),
          date: fromGstDate(inv.idt),
          taxType: inter ? 'IGST' : 'CGST_SGST',
          placeOfSupply: stateName(pos),
          totalTaxableValue: t.totalTaxableValue, totalCgst: t.totalCgst, totalSgst: t.totalSgst, totalIgst: t.totalIgst, totalGst: t.totalGst,
          roundOff: t.roundOff, grandTotal: t.amount, cash: 0, credit: 0,
          notes: IMPORT_NOTE, imported: true,
        },
      },
    };
  };

  const noteDoc = ({ ctin, pos, nt }) => {
    const inter = isInterState(nt.itms, pos, sellerState);
    const items = linesFromItems(nt.itms, inter);
    const t = totalsOfLines(items, nt.val);
    return {
      ctin,
      doc: {
        // GSTR-1 stopped carrying the original invoice on notes in 2020; older files may still have it.
        originalBill: { billNumber: String(nt.inum || 'Not in GSTR-1 file'), date: fromGstDate(nt.idt) || undefined },
        customer: { name: '', gstin: ctin, state: stateName(pos) },
        items,
        gstTotals: t.gstTotals,
        billDetails: {
          creditNoteNumber: String(nt.nt_num || '').trim(),
          date: fromGstDate(nt.nt_dt),
          taxType: inter ? 'IGST' : 'CGST_SGST',
          placeOfSupply: stateName(pos),
          reason: 'Other',
          totalTaxableValue: t.totalTaxableValue, totalCgst: t.totalCgst, totalSgst: t.totalSgst, totalIgst: t.totalIgst, totalGst: t.totalGst,
          roundOff: t.roundOff, grandTotal: t.amount,
          notes: IMPORT_NOTE, imported: true,
        },
      },
    };
  };

  (data.b2b || []).forEach((g) => (g.inv || []).forEach((inv) => {
    sales.push(saleDoc({ ctin: cleanGstin(g.ctin), pos: String(inv.pos || '').padStart(2, '0'), inv }));
  }));
  (data.b2cl || []).forEach((g) => (g.inv || []).forEach((inv) => {
    sales.push(saleDoc({ ctin: '', pos: String(g.pos || '').padStart(2, '0'), inv }));
  }));

  const pushNote = (ctin, nt) => {
    if (nt.ntty === 'D') { skipped.push(`Debit note ${nt.nt_num} (this app has no customer debit notes)`); return; }
    creditNotes.push(noteDoc({ ctin, pos: String(nt.pos || (ctin ? ctin.slice(0, 2) : sellerState)).padStart(2, '0'), nt }));
  };
  (data.cdnr || []).forEach((g) => (g.nt || []).forEach((nt) => pushNote(cleanGstin(g.ctin), nt)));
  (data.cdnur || []).forEach((nt) => pushNote('', nt));

  // Summary-only sections have no per-bill detail to rebuild bills from.
  if ((data.b2cs || []).length) skipped.push(`B2CS: ${data.b2cs.length} state/rate summary row(s) — small B2C sales are filed only as totals, not bill-wise`);
  ['exp', 'at', 'txpd', 'nil', 'b2ba', 'b2cla', 'b2csa', 'cdnra', 'cdnura'].forEach((k) => {
    const v = data[k];
    if (v && (Array.isArray(v) ? v.length : Object.keys(v).length)) skipped.push(`${k.toUpperCase()} section (not supported by import)`);
  });

  const bad = [...sales, ...creditNotes].filter((x) => !x.doc.billDetails.date || !(x.doc.billDetails.invoiceNumber || x.doc.billDetails.creditNoteNumber));
  if (bad.length) throw new Error(`${bad.length} invoice(s)/note(s) in the file have a missing number or a date not in dd-mm-yyyy format.`);

  return { gstin: cleanGstin(data.gstin), fp: data.fp || '', sales, creditNotes, skipped };
};

module.exports = { buildGstr1, parseGstr1, toReturnPeriod, cleanGstin, toUqc, IMPORT_NOTE };
