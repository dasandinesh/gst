import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../../api';
import { Link } from 'react-router-dom';
import './dashboard.css';
import { formatDate } from '../../dateFormat';
import SalesChart from './salesChart';
import { upcomingDeadlines } from './gstDueDates';

const CHECK_INTERVAL_MS = 15000;

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
const displayDate = (value) => formatDate(value, '—');

// Same "start of this month → today" range used by the GST report page, so the
// numbers here line up with what that page shows for the same period.
const todayString = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().split('T')[0];
};
const firstOfMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

// Same threshold check as the Stock Maintenance page — a product only counts as
// low stock once a reorder level is actually set.
const isLowStock = (product) =>
  Number(product.reorderLevel || 0) > 0 && Number(product.StockQunity || 0) <= Number(product.reorderLevel || 0);

const sumGrandTotal = (bills) => bills.reduce((sum, bill) => sum + Number(bill.billDetails?.grandTotal || 0), 0);

// state: 'pending' (gray, still checking) | 'ok' (green) | 'bad' (red)
const StatusLight = ({ label, state, detail }) => (
  <div className="status-card">
    <span className={`status-dot status-${state}`} aria-hidden="true" />
    <div className="status-text">
      <div className="status-label">{label}</div>
      <div className="status-detail">{detail}</div>
    </div>
  </div>
);

// Last `count` calendar months, oldest first: [{ label, startDate, endDate }].
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lastMonths = (count) => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    return { label: `${MONTHS[m]} ${String(y).slice(-2)}`, startDate: `${y}-${pad(m + 1)}-01`, endDate: `${y}-${pad(m + 1)}-${pad(lastDay)}` };
  });
};

// Filing frequency for the reminders is a per-browser preference (the app doesn't store it).
const FREQ_KEY = 'dashboard.gstQuarterly';
const readQuarterly = () => { try { return localStorage.getItem(FREQ_KEY) === '1'; } catch { return false; } };
const saveQuarterly = (on) => { try { localStorage.setItem(FREQ_KEY, on ? '1' : '0'); } catch { /* storage blocked */ } };

const REMINDER_ICON = { passed: '!', today: '!', soon: '⏰', upcoming: '📅' };
const reminderText = (d) => {
  if (d.status === 'passed') return `Due date passed ${-d.daysLeft} day(s) ago — file now if not done yet (late fee & interest apply)`;
  if (d.status === 'today') return 'Due today';
  return `Due in ${d.daysLeft} day(s)`;
};

const GstReminders = ({ stateCode }) => {
  const [quarterly, setQuarterly] = useState(readQuarterly);
  const deadlines = upcomingDeadlines({ quarterly, stateCode });
  const changeFrequency = (e) => {
    const on = e.target.value === 'q';
    setQuarterly(on);
    saveQuarterly(on);
  };
  return (
    <section className="dashboard-card reminders-card">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">Reminders</p>
          <h2>GST return due dates</h2>
          <p>Last 15 days and next 45 days. Dates can be extended by government notification — check the GST portal.</p>
        </div>
        <label className="reminder-frequency">
          <span>I file</span>
          <select value={quarterly ? 'q' : 'm'} onChange={changeFrequency}>
            <option value="m">Monthly</option>
            <option value="q">Quarterly (QRMP)</option>
          </select>
        </label>
      </header>
      {deadlines.length === 0 ? (
        <p className="dashboard-empty">No returns due in this window.</p>
      ) : (
        <ul className="reminder-list">
          {deadlines.map((d) => (
            <li key={`${d.form}-${d.date.toISOString()}`} className={`reminder reminder-${d.status}`}>
              <span className="reminder-icon" aria-hidden="true">{REMINDER_ICON[d.status]}</span>
              <div className="reminder-date">
                <strong>{formatDate(d.date)}</strong>
                <span>{reminderText(d)}</span>
              </div>
              <div className="reminder-what">
                <strong>{d.form}</strong> {d.what}
              </div>
              {d.link && <Link className="reminder-link" to={d.link}>Open</Link>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const MetricCard = ({ label, value, hint, tone }) => (
  <div className={`metric-card${tone ? ` metric-card-${tone}` : ''}`}>
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    {hint && <div className="metric-hint">{hint}</div>}
  </div>
);

const Dashboard = () => {
  const [backendState, setBackendState] = useState('pending');
  const [dbState, setDbState] = useState('pending');
  const [checking, setChecking] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const fileInputRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupStatus, setBackupStatus] = useState({ type: '', text: '' });

  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState('');

  const [chartRows, setChartRows] = useState(null);
  const [chartError, setChartError] = useState('');
  const [stateCode, setStateCode] = useState(''); // seller's GST state code, for the quarterly 3B date

  // One GST-report call per month, so the chart matches the GST report page.
  const loadChart = useCallback(async () => {
    setChartError('');
    try {
      const months = lastMonths(6);
      const reports = await Promise.all(months.map((m) => fetchJson(`/api/reports/gst?startDate=${m.startDate}&endDate=${m.endDate}`)));
      setChartRows(months.map((m, i) => ({
        label: m.label,
        sales: Number(reports[i]?.outward?.totals?.taxableValue || 0),
        purchases: Number(reports[i]?.inward?.totals?.taxableValue || 0),
      })));
    } catch (error) {
      setChartError(error.message || 'Unable to load the chart.');
    }
  }, []);

  useEffect(() => {
    fetchJson('/api/invoice-settings/active')
      .then((s) => setStateCode(String(s?.gstin || '').trim().slice(0, 2)))
      .catch(() => {});
  }, []);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error(`Health check failed (${response.status})`);
      const data = await response.json();
      setBackendState('ok');
      setDbState(data.db ? 'ok' : 'bad');
    } catch {
      // Backend unreachable — database status can't be confirmed either.
      setBackendState('bad');
      setDbState('bad');
    } finally {
      setLastChecked(new Date());
      setChecking(false);
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError('');
    const startDate = firstOfMonth();
    const endDate = todayString();
    try {
      const [sales, purchases, customers, suppliers, products, gstReport, recentBills] = await Promise.all([
        fetchJson(`/api/gst-sales?startDate=${startDate}&endDate=${endDate}`),
        fetchJson(`/api/purchases?startDate=${startDate}&endDate=${endDate}`),
        fetchJson('/api/customers'),
        fetchJson('/api/suppliers'),
        fetchJson('/api/products'),
        fetchJson(`/api/reports/gst?startDate=${startDate}&endDate=${endDate}`),
        fetchJson('/api/gst-sales?page=1&limit=5'),
      ]);

      const salesList = Array.isArray(sales) ? sales : sales.data || [];
      const purchaseList = Array.isArray(purchases) ? purchases : purchases.data || [];

      setMetrics({
        salesTotal: sumGrandTotal(salesList),
        salesCount: salesList.length,
        purchaseTotal: sumGrandTotal(purchaseList),
        purchaseCount: purchaseList.length,
        receivables: customers.reduce((sum, c) => sum + Number(c.oldBalance || 0), 0),
        payables: suppliers.reduce((sum, s) => sum + Number(s.oldBalance || 0), 0),
        gstLiability: gstReport?.netPayable?.total || 0,
        lowStock: products.filter(isLowStock),
        recentBills: recentBills.data || [],
      });
    } catch (error) {
      setMetricsError(error.message || 'Unable to load dashboard metrics.');
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [checkHealth]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);
  useEffect(() => { loadChart(); }, [loadChart]);
  const refreshAll = () => { loadMetrics(); loadChart(); };

  const downloadBackup = async () => {
    setDownloading(true);
    setBackupStatus({ type: '', text: '' });
    try {
      const response = await fetch('/api/backup/download');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Backup download failed (${response.status}).`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `market-backup-${Date.now()}.json`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setBackupStatus({ type: 'success', text: `Backup downloaded as ${filename}.` });
    } catch (error) {
      setBackupStatus({ type: 'error', text: error.message });
    } finally {
      setDownloading(false);
    }
  };

  const handleRestoreFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file again later
    if (!file) return;

    const confirmed = window.confirm(
      `Restore from "${file.name}"?\n\nThis REPLACES all current data in every collection found in the file. This cannot be undone.`
    );
    if (!confirmed) return;

    setRestoring(true);
    setBackupStatus({ type: '', text: '' });
    try {
      const text = await file.text();
      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Restore failed (${response.status}).`);

      const totalDocs = (data.summary || []).reduce((sum, s) => sum + s.restored, 0);
      setBackupStatus({
        type: 'success',
        text: `Restore complete — ${data.summary.length} collection(s), ${totalDocs} document(s).`,
      });
      checkHealth();
      loadMetrics();
    } catch (error) {
      setBackupStatus({ type: 'error', text: error.message });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <main className="dashboard-page">
      <GstReminders stateCode={stateCode} />

      <section className="dashboard-card">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">Overview</p>
            <h1>Business at a glance</h1>
            <p>{firstOfMonth()} to {todayString()} · updates when you refresh</p>
          </div>
          <button type="button" className="dashboard-refresh" onClick={refreshAll} disabled={metricsLoading}>
            {metricsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {metricsError && <p className="backup-status backup-status-error">{metricsError}</p>}

        {metrics && (
          <>
            <div className="metrics-grid">
              <MetricCard label="Sales this month" value={money(metrics.salesTotal)} hint={`${metrics.salesCount} GST bill(s)`} />
              <MetricCard label="Purchases this month" value={money(metrics.purchaseTotal)} hint={`${metrics.purchaseCount} bill(s)`} />
              <MetricCard label="Customer dues" value={money(metrics.receivables)} hint="Total outstanding receivables" tone={metrics.receivables > 0 ? 'warn' : undefined} />
              <MetricCard label="Supplier dues" value={money(metrics.payables)} hint="Total outstanding payables" />
              <MetricCard label="GST liability" value={money(metrics.gstLiability)} hint="Net payable this month" />
              <MetricCard
                label="Low stock items"
                value={metrics.lowStock.length}
                hint={metrics.lowStock.length ? 'At or below reorder level' : 'All stocked above reorder level'}
                tone={metrics.lowStock.length ? 'warn' : undefined}
              />
            </div>

            <h2 className="dashboard-subheading">Sales vs purchases — last 6 months</h2>
            {chartError && <p className="backup-status backup-status-error">{chartError}</p>}
            {chartRows ? <SalesChart rows={chartRows} /> : !chartError && <p className="dashboard-empty">Loading chart…</p>}

            <div className="dashboard-columns">
              <div>
                <h2 className="dashboard-subheading">Recent GST bills</h2>
                {metrics.recentBills.length === 0 ? (
                  <p className="dashboard-empty">No GST bills yet.</p>
                ) : (
                  <table className="dashboard-mini-table">
                    <thead>
                      <tr><th>Bill No.</th><th>Date</th><th>Customer</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {metrics.recentBills.map((bill) => (
                        <tr key={bill._id}>
                          <td>{bill.billDetails?.invoiceNumber}</td>
                          <td>{displayDate(bill.billDetails?.date)}</td>
                          <td>{bill.customer?.name}</td>
                          <td>{money(bill.billDetails?.grandTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <h2 className="dashboard-subheading">Low stock</h2>
                {metrics.lowStock.length === 0 ? (
                  <p className="dashboard-empty">Nothing needs reordering right now.</p>
                ) : (
                  <table className="dashboard-mini-table">
                    <thead>
                      <tr><th>Product</th><th>Stock</th><th>Reorder at</th></tr>
                    </thead>
                    <tbody>
                      {metrics.lowStock.map((product) => (
                        <tr key={product._id}>
                          <td>{product.name}</td>
                          <td>{Number(product.StockQunity || 0)}</td>
                          <td>{Number(product.reorderLevel || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="dashboard-card dashboard-card-compact">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">System status</p>
            <h2>Frontend, backend &amp; database</h2>
          </div>
          <button type="button" className="dashboard-refresh" onClick={checkHealth} disabled={checking}>
            {checking ? 'Checking…' : 'Refresh'}
          </button>
        </header>

        <div className="status-grid">
          <StatusLight label="Frontend" state="ok" detail="React app is running" />
          <StatusLight
            label="Backend"
            state={backendState}
            detail={backendState === 'pending' ? 'Checking…' : backendState === 'ok' ? 'API reachable' : 'API unreachable'}
          />
          <StatusLight
            label="Database"
            state={dbState}
            detail={dbState === 'pending' ? 'Checking…' : dbState === 'ok' ? 'Connected' : 'Disconnected'}
          />
        </div>

        {lastChecked && (
          <p className="dashboard-updated">Last checked {lastChecked.toLocaleTimeString()} · rechecks every 15s</p>
        )}
      </section>

      <section className="dashboard-card dashboard-card-compact dashboard-backup">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">Data backup</p>
            <h2>Backup &amp; restore</h2>
            <p>Download every collection as one file, or restore the database from a backup file.</p>
          </div>
        </header>

        <div className="backup-actions">
          <button type="button" className="dashboard-refresh" onClick={downloadBackup} disabled={downloading}>
            {downloading ? 'Preparing…' : 'Download backup'}
          </button>
          <button
            type="button"
            className="dashboard-refresh dashboard-refresh-danger"
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
          >
            {restoring ? 'Restoring…' : 'Restore from backup'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleRestoreFile}
            hidden
          />
        </div>

        <p className="backup-warning">
          Restoring replaces the current data in every collection found in the chosen file. This cannot be undone —
          take a fresh backup first if you're not sure.
        </p>

        {backupStatus.text && (
          <p className={`backup-status backup-status-${backupStatus.type || 'info'}`}>{backupStatus.text}</p>
        )}
      </section>
    </main>
  );
};

export default Dashboard;
