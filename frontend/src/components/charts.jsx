import React from 'react';

// Lightweight hand-rolled SVG line chart (no chart library dependency).
// series: [{ name, color, points: [{x label, y}] }]
export function LineChart({ series, height = 210, yFmt = (v) => v }) {
  const W = 620, H = height, PL = 44, PR = 12, PT = 14, PB = 26;
  const labels = series[0]?.points.map((p) => p.x) || [];
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const maxY = Math.max(4, ...allY);
  const n = labels.length;
  const xw = (n - 1) || 1;
  const X = (i) => PL + (i / xw) * (W - PL - PR);
  const Y = (v) => PT + (1 - v / maxY) * (H - PT - PB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        {series.map((s, si) => (
          <linearGradient key={si} id={`grad-${si}-${s.color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} stroke="#1d2a42" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3 4'} />
          <text x={PL - 7} y={Y(t) + 3.5} fill="#5c6f8a" fontSize="10" textAnchor="end">{yFmt(t)}</text>
        </g>
      ))}
      {series.map((s, si) => {
        const pts = s.points.map((p, i) => `${X(i)},${Y(p.y)}`).join(' ');
        const area = `M ${X(0)},${Y(0)} ${s.points.map((p, i) => `L ${X(i)},${Y(p.y)}`).join(' ')} L ${X(n - 1)},${Y(0)} Z`;
        return (
          <g key={si}>
            <path d={area} fill={`url(#grad-${si}-${s.color.replace(/[^a-z0-9]/gi, '')})`} />
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p, i) => (
              <circle key={i} cx={X(i)} cy={Y(p.y)} r="2.6" fill={s.color} />
            ))}
          </g>
        );
      })}
      {labels.map((l, i) =>
        n <= 8 || i % Math.ceil(n / 7) === 0 ? (
          <text key={i} x={X(i)} y={H - 8} fill="#5c6f8a" fontSize="10" textAnchor="middle">{l}</text>
        ) : null
      )}
    </svg>
  );
}

// Horizontal bar chart rendered with plain divs.
export function BarChart({ data, color = 'var(--accent)', fmt = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="empty">No data yet</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div className="spread small" style={{ marginBottom: 3 }}>
            <span className="muted" style={{ textTransform: 'capitalize' }}>{d.label}</span>
            <span className="num" style={{ fontWeight: 700 }}>{fmt(d.value)}</span>
          </div>
          <div style={{ background: 'var(--panel-3)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${(d.value / max) * 100}%`, background: color, height: '100%', borderRadius: 6, minWidth: d.value > 0 ? 4 : 0, transition: 'width .4s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
