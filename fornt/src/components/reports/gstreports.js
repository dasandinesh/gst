import React, { useCallback, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { fetchJson } from '../../api';
import '../accounts/accounts.css';
import './reports.css';
import EcomImport from './ecomImport';
import { formatDate } from '../../dateFormat';

const money = (n) => Number(n || 0).toFixed(2);
const num = (v) => Number(v) || 0;

// Turns the report into a flat key/value list for the Excel "Summary" sheet, and
// back again on upload — keeps the round-trip (download → edit/reopen → upload)
// exact instead of losing structure to a generic dump.
const SUMMARY_KEYS = [
  'period.startDate', 'period.endDate',
  'outward.billCount', 'outward.creditNoteCount',
  'outward.totals.taxableValue', 'outward.totals.cgst', 'outward.totals.sgst', 'outward.totals.igst', 'outward.totals.total',
  'inward.billCount', 'inward.debitNoteCount',
  'inward.totals.taxableValue', 'inward.totals.cgst', 'inward.totals.sgst', 'inward.totals.igst', 'inward.totals.total',
  'netPayable.cgst', 'netPayable.sgst', 'netPayable.igst', 'netPayable.total',
];
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const reportToWorkbook = (report) => {
  const wb = XLSX.utils.book_new();

  const summaryRows = SUMMARY_KEYS.map((key) => ({ Key: key, Value: getPath(report, key) ?? '' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

  const rateRows = (rows) => rows.map((r) => ({ Rate: r.rate, 'Taxable value': r.taxableValue, CGST: r.cgst, SGST: r.sgst, IGST: r.igst, Total: r.total }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rateRows(report.outward.rateWise)), 'Outward rate-wise');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rateRows(report.inward.rateWise)), 'Inward rate-wise');

  const hsnRows = report.hsnSummary.map((r) => ({
    HSN: r.hsnCode, 'GST%': r.gstRate, Qty: r.quantity, Unit: r.unit,
    'Taxable value': r.taxableValue, CGST: r.cgst, SGST: r.sgst, IGST: r.igst, Total: r.total,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hsnRows), 'HSN summary');

  return wb;
};

const workbookToReport = (wb) => {
  const summarySheet = wb.Sheets['Summary'];
  if (!summarySheet) throw new Error('This file has no "Summary" sheet — it doesn\'t look like a GST report export.');
  const summaryValues = {};
  XLSX.utils.sheet_to_json(summarySheet).forEach((row) => { summaryValues[row.Key] = row.Value; });
  const get = (key, fallback = 0) => (summaryValues[key] !== undefined ? summaryValues[key] : fallback);

  const rateRows = (sheetName) => {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet).map((r) => ({
      rate: num(r.Rate), taxableValue: num(r['Taxable value']), cgst: num(r.CGST), sgst: num(r.SGST), igst: num(r.IGST), total: num(r.Total),
    }));
  };

  const hsnSheet = wb.Sheets['HSN summary'];
  const hsnSummary = hsnSheet ? XLSX.utils.sheet_to_json(hsnSheet).map((r) => ({
    hsnCode: String(r.HSN ?? ''), gstRate: num(r['GST%']), quantity: num(r.Qty), unit: String(r.Unit ?? ''),
    taxableValue: num(r['Taxable value']), cgst: num(r.CGST), sgst: num(r.SGST), igst: num(r.IGST), total: num(r.Total),
  })) : [];

  return {
    period: { startDate: get('period.startDate', '') || null, endDate: get('period.endDate', '') || null },
    outward: {
      rateWise: rateRows('Outward rate-wise'),
      totals: {
        taxableValue: num(get('outward.totals.taxableValue')), cgst: num(get('outward.totals.cgst')),
        sgst: num(get('outward.totals.sgst')), igst: num(get('outward.totals.igst')), total: num(get('outward.totals.total')),
      },
      billCount: num(get('outward.billCount')),
      creditNoteCount: num(get('outward.creditNoteCount')),
    },
    inward: {
      rateWise: rateRows('Inward rate-wise'),
      totals: {
        taxableValue: num(get('inward.totals.taxableValue')), cgst: num(get('inward.totals.cgst')),
        sgst: num(get('inward.totals.sgst')), igst: num(get('inward.totals.igst')), total: num(get('inward.totals.total')),
      },
      billCount: num(get('inward.billCount')),
      debitNoteCount: num(get('inward.debitNoteCount')),
    },
    netPayable: {
      cgst: num(get('netPayable.cgst')), sgst: num(get('netPayable.sgst')), igst: num(get('netPayable.igst')), total: num(get('netPayable.total')),
    },
    hsnSummary,
  };
};

// Basic shape check so a random/unrelated JSON file fails with a clear message
// instead of the report rendering with blanks or throwing deep in the JSX.
const isValidReport = (obj) => obj && obj.outward?.totals && obj.inward?.totals && obj.netPayable && Array.isArray(obj.hsnSummary);

const downloadBlob = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const todayString = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().split('T')[0];
};
const firstOfMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

const KIND_LABEL = { bill: 'GST bill', creditNote: 'Credit note', business: 'Your business' };
const shortDate = (value) => formatDate(value);

// Result of "Check before export": a summary line, then one row per problem, errors first.
const Gstr1Checklist = ({ check }) => {
  if (check.loading) return <p className="acc-status">Checking bills…</p>;
  if (check.error) return <p className="acc-status error">{check.error}</p>;
  const { issues, counts } = check;
  const marketplace = counts.ecomMonths
    ? ` + ${counts.ecomMonths} imported marketplace month(s), net ₹${Number(counts.ecomTaxableValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    : '';
  if (!issues.length && !counts.bills && !counts.creditNotes && !counts.ecomMonths) {
    return (
      <p className="acc-status error">
        Nothing to export for this period — no GST bills, credit notes or marketplace sales between the From and To dates above. Check the dates.
      </p>
    );
  }
  if (!issues.length) {
    return (
      <p className="acc-status gstr1-check-ok">
        ✓ All clear — {counts.bills} bill(s) and {counts.creditNotes} credit note(s) checked{marketplace}. No problems found. Ready to export.
      </p>
    );
  }
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return (
    <div className="gstr1-check">
      <p className="acc-status">
        Checked {counts.bills} bill(s) and {counts.creditNotes} credit note(s){marketplace}:{' '}
        <strong className="gstr1-count-error">{counts.errors} to fix</strong>
        {counts.warnings ? <>, <strong className="gstr1-count-warning">{counts.warnings} to review</strong></> : null}.
        {' '}Fix the red ones in the bill (Transactions → GST Bills → View → Edit), then check again.
      </p>
      <div className="acc-table-wrap">
        <table className="acc-table gstr1-check-table">
          <thead>
            <tr><th></th><th>Document</th><th>Date</th><th>Customer</th><th>Problem</th><th>How to fix</th></tr>
          </thead>
          <tbody>
            {sorted.map((issue, index) => (
              <tr key={`${issue.id}-${index}`} className={`gstr1-${issue.severity}`}>
                <td><span className={`gstr1-badge ${issue.severity}`}>{issue.severity === 'error' ? 'Fix' : 'Review'}</span></td>
                <td>{KIND_LABEL[issue.kind]}{issue.number ? <><br /><strong>{issue.number}</strong></> : null}</td>
                <td>{shortDate(issue.date)}</td>
                <td>{issue.customer}</td>
                <td>{issue.problem}</td>
                <td>{issue.fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// GSTR-1/3B-style summary: net outward supplies (GST sales minus credit notes),
// net inward supplies / input tax credit (purchases minus debit notes), the
// resulting net tax payable, and the outward HSN-wise summary — all for a period.
const GstReports = () => {
  const [range, setRange] = useState({ startDate: firstOfMonth(), endDate: todayString() });
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState(null); // null = live from server, else the imported file's name
  const fileInputRef = useRef(null);
  const [gstr1, setGstr1] = useState(null); // last export / import result shown under the GSTR-1 card
  const [gstr1Busy, setGstr1Busy] = useState(false);
  const [gstr1Check, setGstr1Check] = useState(null); // checklist result: { issues, counts } / { loading } / { error }
  const gstr1InputRef = useRef(null);

  // Checklist before export: bills the portal would reject (bad GSTIN, missing HSN, wrong
  // tax type for the place of supply, …). Returns the result, or null if it couldn't run.
  const runGstr1Check = async () => {
    setGstr1Busy(true);
    setGstr1Check({ loading: true });
    try {
      const params = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate });
      const data = await fetchJson(`/api/reports/gst/gstr1/check?${params}`);
      setGstr1Check(data);
      return data;
    } catch (error) {
      setGstr1Check({ error: error.message });
      return null;
    } finally {
      setGstr1Busy(false);
    }
  };

  // Export always runs the checklist first; with errors it asks before downloading.
  const checkThenExport = async () => {
    const check = await runGstr1Check();
    if (check?.counts.errors && !window.confirm(
      `The checklist found ${check.counts.errors} problem(s) the GST portal will likely reject.\n\nFix them first (recommended), or export anyway?\n\nOK = export anyway · Cancel = fix first`,
    )) return;
    exportGstr1();
  };

  // GSTR-1 in the GST portal's offline-upload format (GSTR-1 → Prepare Offline → Upload).
  const exportGstr1 = async () => {
    setGstr1Busy(true);
    setGstr1({ type: 'info', text: 'Building GSTR-1…' });
    try {
      const params = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate });
      const data = await fetchJson(`/api/reports/gst/gstr1?${params}`);
      downloadBlob(JSON.stringify(data.json), `GSTR1_${data.json.gstin}_${data.fp}.json`, 'application/json');
      const c = data.counts;
      setGstr1({
        type: 'success',
        text: `Downloaded GSTR-1 for ${data.fp.slice(0, 2)}/${data.fp.slice(2)}: ${data.billCount} bill(s), ${data.creditNoteCount} credit note(s)${data.ecomMonths ? `, ${data.ecomMonths} marketplace month(s)` : ''} — B2B ${c.b2b}, B2CL ${c.b2cl}, B2CS ${c.b2cs} row(s), CDNR ${c.cdnr}, CDNUR ${c.cdnur}, HSN ${c.hsn} row(s)${c.ecom ? `, e-commerce (Table 14) ${c.ecom} operator(s)` : ''}.`,
        list: data.warnings,
        listTitle: 'Check these before uploading — the portal may reject them:',
      });
    } catch (error) {
      setGstr1({ type: 'error', text: error.message });
    } finally {
      setGstr1Busy(false);
    }
  };

  // Previews first (nothing saved), asks, then imports — bills already in the app are skipped.
  const importGstr1 = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setGstr1Busy(true);
    setGstr1({ type: 'info', text: 'Reading file…' });
    try {
      const body = await file.text();
      try { JSON.parse(body); } catch { throw new Error('That file is not valid JSON.'); }
      const post = (preview) => fetchJson(`/api/reports/gst/gstr1/import${preview ? '?preview=1' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });
      const preview = await post(true);
      if (!preview.sales && !preview.creditNotes) {
        setGstr1({ type: 'info', text: `Nothing new to import from "${file.name}".`, list: [...preview.duplicates.map((n) => `Already exists: ${n}`), ...preview.skipped], listTitle: 'Details:' });
        return;
      }
      const ok = window.confirm(
        `Import from "${file.name}"?\n\n${preview.sales} GST bill(s) and ${preview.creditNotes} credit note(s) will be created.`
        + `${preview.duplicates.length ? `\n${preview.duplicates.length} already exist and will be skipped.` : ''}`
        + '\n\nImported bills have one line per GST rate (GSTR-1 has no product details), and do not change customer balances or stock.'
      );
      if (!ok) { setGstr1(null); return; }
      const result = await post(false);
      setGstr1({
        type: 'success',
        text: `Imported ${result.sales} bill(s) and ${result.creditNotes} credit note(s).`,
        list: [
          ...result.duplicates.map((n) => `Skipped, already exists: ${n}`),
          ...result.skipped.map((s) => `Not imported: ${s}`),
          ...result.unmatchedGstins.map((g) => `No customer with GSTIN ${g} — saved as "GSTIN ${g}". Add the customer to link future bills.`),
        ],
        listTitle: 'Notes:',
      });
    } catch (error) {
      setGstr1({ type: 'error', text: error.message });
    } finally {
      setGstr1Busy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setStatus('Loading…');
    const params = new URLSearchParams();
    if (range.startDate) params.set('startDate', range.startDate);
    if (range.endDate) params.set('endDate', range.endDate);
    try {
      const data = await fetchJson(`/api/reports/gst?${params}`);
      setReport(data);
      setSource(null);
      setStatus('');
    } catch (error) {
      setReport(null);
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  const fileLabel = (startDate, endDate) => `gst-report_${startDate || 'all'}_to_${endDate || 'all'}`;

  const downloadJson = () => {
    if (!report) return;
    downloadBlob(JSON.stringify(report, null, 2), `${fileLabel(range.startDate, range.endDate)}.json`, 'application/json');
  };

  const downloadExcel = () => {
    if (!report) return;
    XLSX.writeFile(reportToWorkbook(report), `${fileLabel(range.startDate, range.endDate)}.xlsx`);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('Reading file…');
    try {
      let parsed;
      if (file.name.toLowerCase().endsWith('.json')) {
        parsed = JSON.parse(await file.text());
      } else {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        parsed = workbookToReport(wb);
      }
      if (!isValidReport(parsed)) throw new Error('This file doesn\'t look like a GST report export (missing outward/inward/HSN data).');
      setReport(parsed);
      setSource(file.name);
      if (parsed.period?.startDate) setRange((r) => ({ ...r, startDate: parsed.period.startDate }));
      if (parsed.period?.endDate) setRange((r) => ({ ...r, endDate: parsed.period.endDate }));
      setStatus('');
    } catch (error) {
      setStatus(`Could not load that file: ${error.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const RateTable = ({ rows, totals }) => (
    <table className="acc-table">
      <thead>
        <tr><th>Rate</th><th className="num">Taxable value</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total</th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan="6" style={{ textAlign: 'center' }}>No transactions.</td></tr>
        ) : rows.map((r) => (
          <tr key={r.rate}>
            <td>{r.rate}%</td>
            <td className="num">{money(r.taxableValue)}</td>
            <td className="num">{money(r.cgst)}</td>
            <td className="num">{money(r.sgst)}</td>
            <td className="num">{money(r.igst)}</td>
            <td className="num">{money(r.total)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="num">{money(totals.taxableValue)}</td>
          <td className="num">{money(totals.cgst)}</td>
          <td className="num">{money(totals.sgst)}</td>
          <td className="num">{money(totals.igst)}</td>
          <td className="num">{money(totals.total)}</td>
        </tr>
      </tfoot>
    </table>
  );

  return (
    <main className="acc-page reports-page">
      <section className="acc-card">
        <h1>GST reports</h1>
        <p className="acc-sub">GSTR-1/3B-style summary: net outward supplies, input tax credit, and net tax payable for a period.</p>
        <form className="acc-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label className="acc-field"><span>From</span>
            <input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} />
          </label>
          <label className="acc-field"><span>To</span>
            <input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} />
          </label>
          <div className="acc-actions">
            <button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Show'}</button>
          </div>
        </form>

        <div className="acc-actions reports-file-actions">
          <button type="button" onClick={downloadJson} disabled={!report}>Download JSON</button>
          <button type="button" onClick={downloadExcel} disabled={!report}>Download Excel</button>
          <label className="reports-file-upload">
            <span>Load report from file (.json / .xlsx)</span>
            <input ref={fileInputRef} type="file" accept=".json,.xlsx,.xls" onChange={handleFileUpload} />
          </label>
        </div>
        {source && <p className="acc-status">Showing a report loaded from <strong>{source}</strong>, not live data. Click "Show" to go back to live figures.</p>}
        {status && <p className="acc-status error">{status}</p>}
      </section>

      <section className="acc-card">
        <h1>GSTR-1 for the GST portal</h1>
        <p className="acc-sub">
          Export: builds the GSTR-1 JSON for the From–To period above (sales + credit notes / sales returns). Upload it on gst.gov.in → Returns → GSTR-1 → Prepare Offline → Upload.
          Quarterly filers: pick the whole quarter. Import: loads a GSTR-1 JSON back in as GST bills and credit notes.
        </p>
        <div className="acc-actions reports-file-actions">
          <button type="button" onClick={runGstr1Check} disabled={gstr1Busy || !range.startDate || !range.endDate}>Check before export</button>
          <button type="button" onClick={checkThenExport} disabled={gstr1Busy || !range.startDate || !range.endDate}>Export GSTR-1 JSON</button>
          <label className="reports-file-upload">
            <span>Import GSTR-1 JSON</span>
            <input ref={gstr1InputRef} type="file" accept=".json" onChange={importGstr1} disabled={gstr1Busy} />
          </label>
        </div>
        <EcomImport range={range} />
        {gstr1Check && <Gstr1Checklist check={gstr1Check} />}
        {gstr1 && (
          <div className={`acc-status${gstr1.type === 'error' ? ' error' : ''}`}>
            <p>{gstr1.text}</p>
            {gstr1.list?.length > 0 && (
              <>
                <p><strong>{gstr1.listTitle}</strong></p>
                <ul>{gstr1.list.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
          </div>
        )}
      </section>

      {report && (
        <>
          <section className="acc-card">
            <div className="reports-summary-grid">
              <div className="reports-stat">
                <span>Outward tax (output)</span>
                <strong>{money(report.outward.totals.cgst + report.outward.totals.sgst + report.outward.totals.igst)}</strong>
                <small>
                  {report.outward.billCount} bill{report.outward.billCount === 1 ? '' : 's'}, {report.outward.creditNoteCount} credit note{report.outward.creditNoteCount === 1 ? '' : 's'}
                  {report.outward.ecomMonthCount ? ` + marketplace sales ${money(report.outward.ecomTaxableValue)}` : ''}
                </small>
              </div>
              <div className="reports-stat">
                <span>Inward tax (ITC available)</span>
                <strong>{money(report.inward.totals.cgst + report.inward.totals.sgst + report.inward.totals.igst)}</strong>
                <small>{report.inward.billCount} bill{report.inward.billCount === 1 ? '' : 's'}, {report.inward.debitNoteCount} debit note{report.inward.debitNoteCount === 1 ? '' : 's'}</small>
              </div>
              <div className="reports-stat reports-stat-highlight">
                <span>Net GST payable</span>
                <strong>{money(report.netPayable.total)}</strong>
                <small>CGST {money(report.netPayable.cgst)} · SGST {money(report.netPayable.sgst)} · IGST {money(report.netPayable.igst)}</small>
              </div>
            </div>
          </section>

          <section className="acc-card">
            <h1>Outward supplies (sales − credit notes)</h1>
            <div className="acc-table-wrap"><RateTable rows={report.outward.rateWise} totals={report.outward.totals} /></div>
          </section>

          <section className="acc-card">
            <h1>Inward supplies / Input tax credit (purchases − debit notes)</h1>
            <div className="acc-table-wrap"><RateTable rows={report.inward.rateWise} totals={report.inward.totals} /></div>
          </section>

          <section className="acc-card">
            <h1>HSN-wise summary (outward)</h1>
            <div className="acc-table-wrap">
              <table className="acc-table">
                <thead>
                  <tr><th>HSN</th><th>GST%</th><th className="num">Qty</th><th>Unit</th><th className="num">Taxable value</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total</th></tr>
                </thead>
                <tbody>
                  {report.hsnSummary.length === 0 ? (
                    <tr><td colSpan="9" style={{ textAlign: 'center' }}>No transactions.</td></tr>
                  ) : report.hsnSummary.map((row) => (
                    <tr key={`${row.hsnCode}-${row.gstRate}`}>
                      <td>{row.hsnCode}</td>
                      <td>{row.gstRate}%</td>
                      <td className="num">{row.quantity}</td>
                      <td>{row.unit || '—'}</td>
                      <td className="num">{money(row.taxableValue)}</td>
                      <td className="num">{money(row.cgst)}</td>
                      <td className="num">{money(row.sgst)}</td>
                      <td className="num">{money(row.igst)}</td>
                      <td className="num">{money(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
};

export default GstReports;
