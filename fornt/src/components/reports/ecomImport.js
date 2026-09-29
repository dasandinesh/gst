import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../../api';
import { ACCEPTED_FILES, readRows } from './ecomFileReader';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (fp) => (fp ? `${fp.slice(0, 2)}/${fp.slice(2)}` : '');

// "Marketplace (e-commerce) sales" inside the GSTR-1 card: upload an e-commerce
// operator's monthly TCS sales report (+ returns report), preview the state-wise
// net totals, save the month. Saved months are added to the GSTR-1 export
// (B2CS + Table 14 + HSN) and to the GST summary. `range` is the report period.
const EcomImport = ({ range }) => {
  const [files, setFiles] = useState({ sales: null, returns: null });
  const [preview, setPreview] = useState(null);
  const [imports, setImports] = useState([]);
  const [status, setStatus] = useState(null); // { type, text }
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0); // resets the file inputs

  const loadImports = useCallback(async () => {
    try {
      const params = new URLSearchParams(Object.entries(range).filter(([, v]) => v));
      setImports(await fetchJson(`/api/reports/gst/ecom?${params}`));
    } catch {
      setImports([]);
    }
  }, [range]);
  useEffect(() => { loadImports(); }, [loadImports]);

  const send = async (previewOnly) => {
    const body = {
      sales: await readRows(files.sales, false),
      returns: files.returns ? await readRows(files.returns, true) : [],
      files: [files.sales.name, files.returns?.name].filter(Boolean),
    };
    return fetchJson(`/api/reports/gst/ecom/import${previewOnly ? '?preview=1' : ''}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  };

  const runPreview = async () => {
    if (!files.sales) { setStatus({ type: 'error', text: 'Choose the sales report file first.' }); return; }
    setBusy(true);
    setStatus(null);
    setPreview(null);
    try {
      setPreview(await send(true));
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const result = await send(false);
      setStatus({ type: 'success', text: `${result.replaced ? 'Replaced' : 'Saved'} marketplace sales for ${monthLabel(preview.fp)}. They will be included in the GSTR-1 export and GST summary for that month.` });
      setPreview(null);
      setFiles({ sales: null, returns: null });
      setInputKey((k) => k + 1);
      loadImports();
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove the imported marketplace sales for ${monthLabel(item.fp)} (${item.etin})?`)) return;
    try {
      await fetchJson(`/api/reports/gst/ecom/${item._id}`, { method: 'DELETE' });
      loadImports();
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    }
  };

  return (
    <div className="ecom-import">
      <h2>Marketplace (e-commerce) sales</h2>
      <p className="acc-sub">
        Selling through a marketplace that collects TCS? Download its monthly sales report (and returns report) from the seller panel —
        JSON, Excel (.xlsx / .xls) or CSV — and import it here. The net state-wise totals are added to your GSTR-1 (B2CS, Table 14 and HSN) — no need to type them on the portal.
      </p>
      <div className="acc-actions reports-file-actions" key={inputKey}>
        <label className="reports-file-upload">
          <span>Sales report — .json, .xlsx, .xls or .csv (e.g. tcs_sales)</span>
          <input type="file" accept={ACCEPTED_FILES} onChange={(e) => { setFiles((f) => ({ ...f, sales: e.target.files?.[0] || null })); setPreview(null); }} disabled={busy} />
        </label>
        <label className="reports-file-upload">
          <span>Returns report — optional, any of the same formats (e.g. tcs_sales_return)</span>
          <input type="file" accept={ACCEPTED_FILES} onChange={(e) => { setFiles((f) => ({ ...f, returns: e.target.files?.[0] || null })); setPreview(null); }} disabled={busy} />
        </label>
        <button type="button" onClick={runPreview} disabled={busy || !files.sales}>{busy && !preview ? 'Reading…' : 'Preview'}</button>
      </div>

      {status && <p className={`acc-status ${status.type}`}>{status.text}</p>}

      {preview && (
        <div className="ecom-preview">
          <p className="acc-status">
            <strong>{monthLabel(preview.fp)}</strong> · operator GSTIN <strong>{preview.etin}</strong>{preview.sellerName ? ` · seller ${preview.sellerName}` : ''} ·{' '}
            {preview.counts.sales} sale(s), {preview.counts.returns} return(s){preview.counts.adjustments ? `, ${preview.counts.adjustments} adjustment(s)` : ''}
            {preview.replaces ? <><br /><strong>This month was imported before — saving will replace it.</strong></> : null}
          </p>
          {preview.warnings?.length > 0 && (
            <ul className="ecom-warnings">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="acc-table-wrap">
            <table className="acc-table">
              <thead>
                <tr><th>Place of supply</th><th>Rate</th><th>Type</th><th className="num">Qty</th><th className="num">Taxable value</th><th className="num">IGST</th><th className="num">CGST</th><th className="num">SGST</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={`${r.pos}-${r.rate}`}>
                    <td>{r.pos} – {r.state}</td>
                    <td>{r.rate}%</td>
                    <td>{r.inter ? 'Inter-state' : 'Intra-state'}</td>
                    <td className="num">{r.quantity}</td>
                    <td className="num">{money(r.taxableValue)}</td>
                    <td className="num">{r.igst ? money(r.igst) : '—'}</td>
                    <td className="num">{r.cgst ? money(r.cgst) : '—'}</td>
                    <td className="num">{r.sgst ? money(r.sgst) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4">Net total (sales − returns)</td>
                  <td className="num">{money(preview.totals.taxableValue)}</td>
                  <td className="num">{money(preview.totals.igst)}</td>
                  <td className="num">{money(preview.totals.cgst)}</td>
                  <td className="num">{money(preview.totals.sgst)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="acc-actions">
            <button type="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : `Save for ${monthLabel(preview.fp)}`}</button>
            <button type="button" className="secondary" onClick={() => setPreview(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      <p className="ecom-list-title"><strong>Imported for this period:</strong>{imports.length ? '' : ' none'}</p>
      {imports.length > 0 && (
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead><tr><th>Month</th><th>Operator GSTIN</th><th className="num">Sales / returns</th><th className="num">Net taxable</th><th className="num">Tax</th><th>File(s)</th><th /></tr></thead>
            <tbody>
              {imports.map((item) => (
                <tr key={item._id}>
                  <td>{monthLabel(item.fp)}</td>
                  <td>{item.etin}</td>
                  <td className="num">{item.counts?.sales} / {item.counts?.returns}</td>
                  <td className="num">{money(item.totals?.taxableValue)}</td>
                  <td className="num">{money((item.totals?.igst || 0) + (item.totals?.cgst || 0) + (item.totals?.sgst || 0))}</td>
                  <td className="ecom-muted">{(item.files || []).join(', ')}</td>
                  <td className="acc-row-actions"><button type="button" className="danger" onClick={() => remove(item)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EcomImport;
