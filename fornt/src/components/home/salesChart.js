import React, { useState } from 'react';

// Monthly sales vs purchases, taxable value (excl. GST), as a grouped bar chart
// in plain SVG. rows: [{ label: 'Sep 2026', sales, purchases }], oldest first.
// Sales are net of credit notes and include imported marketplace months,
// purchases net of debit notes — the same figures as the GST report.

const SERIES = [
  { key: 'sales', name: 'Sales', color: '#2a78d6' },
  { key: 'purchases', name: 'Purchases', color: '#eb6834' },
];

const W = 640;
const H = 240;
const M = { top: 12, right: 8, bottom: 26, left: 56 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

// ₹ in short Indian form for axis ticks: ₹950, ₹12k, ₹1.2L, ₹3.4Cr.
const shortRupees = (n) => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${+(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${sign}₹${+(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${+(a / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(a)}`;
};
const fullRupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A "nice" axis top and 4 ticks.
const niceTicks = (max) => {
  if (max <= 0) return [0, 250, 500, 750, 1000];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s >= rough);
  return [0, 1, 2, 3, 4].map((i) => i * step);
};

// Bar with a 4px rounded top, square at the baseline.
const barPath = (x, y, w, h) => {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

const SalesChart = ({ rows }) => {
  const [hover, setHover] = useState(null); // index of hovered month
  const [asTable, setAsTable] = useState(false);

  const max = Math.max(0, ...rows.flatMap((r) => SERIES.map((s) => r[s.key])));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (v) => M.top + PLOT_H - (Math.max(0, v) / top) * PLOT_H;

  const groupW = PLOT_W / rows.length;
  const barW = Math.min(28, (groupW * 0.6) / SERIES.length);
  const gap = 2;
  const groupInner = barW * SERIES.length + gap * (SERIES.length - 1);
  const last = rows.length - 1;
  const hasData = max > 0;

  return (
    <div className="viz">
      <div className="viz-head">
        <div className="viz-legend" aria-label="Legend">
          {SERIES.map((s) => (
            <span key={s.key} className="viz-legend-item">
              <span className="viz-swatch" style={{ background: s.color }} />{s.name}
            </span>
          ))}
          <span className="viz-note">Taxable value, excl. GST</span>
        </div>
        <button type="button" className="viz-toggle" onClick={() => setAsTable((t) => !t)}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {asTable ? (
        <table className="dashboard-mini-table">
          <thead><tr><th>Month</th>{SERIES.map((s) => <th key={s.key} className="viz-num">{s.name}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}><td>{r.label}</td>{SERIES.map((s) => <td key={s.key} className="viz-num">{fullRupees(r[s.key])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="viz-plot">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly sales and purchases, last 6 months" onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'viz-baseline' : 'viz-grid'} />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="viz-tick">{shortRupees(t)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const gx = M.left + i * groupW;
              const x0 = gx + (groupW - groupInner) / 2;
              return (
                <g key={r.label}>
                  {hover === i && <rect x={gx + 2} y={M.top} width={groupW - 4} height={PLOT_H} className="viz-hover-band" />}
                  {SERIES.map((s, si) => {
                    const v = Math.max(0, r[s.key]);
                    const bx = x0 + si * (barW + gap);
                    return <path key={s.key} d={barPath(bx, y(v), barW, y(0) - y(v))} fill={s.color} />;
                  })}
                  {/* Latest month labelled directly; the rest via hover or the table. */}
                  {i === last && hasData && SERIES.map((s, si) => (
                    <text key={s.key} x={x0 + si * (barW + gap) + barW / 2} y={y(Math.max(0, r[s.key])) - 5} textAnchor="middle" className="viz-value">
                      {shortRupees(r[s.key])}
                    </text>
                  ))}
                  <text x={gx + groupW / 2} y={H - 8} textAnchor="middle" className="viz-tick">{r.label}</text>
                  {/* Hit target: the whole month column. */}
                  <rect x={gx} y={M.top} width={groupW} height={PLOT_H} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {!hasData && <p className="viz-empty">No sales or purchases in these months yet.</p>}
          {hover !== null && (
            <div
              className="viz-tooltip"
              style={{ left: `${Math.min(82, Math.max(18, ((M.left + (hover + 0.5) * groupW) / W) * 100))}%` }}
            >
              <div className="viz-tooltip-title">{rows[hover].label}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="viz-tooltip-row">
                  <span className="viz-swatch" style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <strong>{fullRupees(rows[hover][s.key])}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SalesChart;
