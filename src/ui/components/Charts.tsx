import { useNavigate } from 'react-router-dom';

export interface Slice { key: string; label: string; value: number; color: string; to: string }

const STATUS_COLORS: Record<string, string> = { RED: '#B42318', AMBER: '#D88A1D', 'CANNOT DETERMINE': '#7A838C', GREEN: '#2A6E45' };
export const statusColor = (s: string) => STATUS_COLORS[s] ?? '#7A838C';

/** Accessible donut: each segment and legend entry is a real link to the filtered list. */
export function Donut({ slices, total, label }: { slices: Slice[]; total: number; label: string }) {
  const nav = useNavigate();
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="row" style={{ alignItems: 'center', gap: 24 }}>
      <svg className="chart" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label={`${label}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="#EED7A6" strokeWidth="26" />
        <g transform="rotate(-90 100 100)">
        {slices.filter((s) => s.value > 0).map((s) => {
          const len = total ? (s.value / total) * C : 0;
          const el = (
            <circle
              key={s.key} className="seg" cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="26"
              strokeDasharray={`${Math.max(len - 2, 0.5)} ${C}`} strokeDashoffset={-acc}
              tabIndex={0} role="link" aria-label={`${s.label}: ${s.value} — open list`}
              onClick={() => nav(s.to)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(s.to); } }}
            >
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
          acc += len;
          return el;
        })}
        </g>
        <text x="100" y="96" textAnchor="middle" style={{ fontSize: 34, fontWeight: 700 }}>{total}</text>
        <text x="100" y="120" textAnchor="middle" style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</text>
      </svg>
      <div className="legend" style={{ minWidth: 200, flex: 1 }}>
        {slices.map((s) => (
          <button key={s.key} onClick={() => nav(s.to)} aria-label={`${s.label}: ${s.value} — open list`}>
            <span className="sw" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="n">{s.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export interface Bar { key: string; label: string; value: number; to: string; color?: string }

export function Bars({ bars, max, label }: { bars: Bar[]; max?: number; label: string }) {
  const nav = useNavigate();
  const top = Math.max(1, max ?? Math.max(...bars.map((b) => b.value), 1));
  const rowH = 38, W = 420, labelW = 150;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${bars.length * rowH + 8}`} width="100%" role="img" aria-label={`${label}: ${bars.map((b) => `${b.label} ${b.value}`).join(', ')}`}>
      {bars.map((b, i) => {
        const y = i * rowH + 6;
        const w = ((W - labelW - 40) * b.value) / top;
        const go = () => nav(b.to);
        return (
          <g key={b.key}>
            <text x={0} y={y + 19} style={{ fontSize: 12.5, fontWeight: 600 }}>{b.label}</text>
            <rect x={labelW} y={y + 4} width={W - labelW - 40} height={22} rx={6} fill="#FBF0D9" />
            <rect
              className="bar" x={labelW} y={y + 4} width={Math.max(w, b.value ? 4 : 0)} height={22} rx={6} fill={b.color ?? '#1C393F'}
              tabIndex={0} role="link" aria-label={`${b.label}: ${b.value} — open list`} onClick={go}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
            >
              <title>{`${b.label}: ${b.value}`}</title>
            </rect>
            <text x={labelW + Math.max(w, 4) + 8} y={y + 20} style={{ fontSize: 13, fontWeight: 700 }}>{b.value}</text>
          </g>
        );
      })}
    </svg>
  );
}
