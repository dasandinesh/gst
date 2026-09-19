import React, { useCallback, useEffect, useRef, useState } from 'react';
import './dashboard.css';

const CHECK_INTERVAL_MS = 15000;

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

const Dashboard = () => {
  // Frontend: this component rendering at all means the React app is up — always green.
  const [backendState, setBackendState] = useState('pending');
  const [dbState, setDbState] = useState('pending');
  const [checking, setChecking] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const fileInputRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupStatus, setBackupStatus] = useState({ type: '', text: '' });

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

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [checkHealth]);

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
    } catch (error) {
      setBackupStatus({ type: 'error', text: error.message });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <main className="dashboard-page">
      <section className="dashboard-card">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">System status</p>
            <h1>Dashboard</h1>
            <p>Frontend, backend, and database — green when healthy, red when not.</p>
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

      <section className="dashboard-card dashboard-backup">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">Data backup</p>
            <h1>Backup &amp; restore</h1>
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
