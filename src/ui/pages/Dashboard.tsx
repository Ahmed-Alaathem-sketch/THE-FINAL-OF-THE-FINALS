import { Link } from 'react-router-dom';
import { useStore, useOutput } from '../../state/store';
import { AwaitingData, fmtDate, PageHead, Reveal, short } from '../components/common';
import { Bars, Donut, statusColor } from '../components/Charts';
import { StatusBadge } from '../components/Status';
import type { Status } from '../../engine/types';

export default function Dashboard() {
  const out = useOutput();
  const runs = useStore((s) => s.runs);
  const current = useStore((s) => s.current);
  if (!out || !current) return (<><PageHead eyebrow="Executive view" title="Executive dashboard" /><AwaitingData what="the dashboard" /></>);
  const S = out.summary;
  const statuses: Status[] = ['RED', 'AMBER', 'CANNOT DETERMINE', 'GREEN'];
  const kpis: { label: string; value: number; to: string; hint?: string; accent?: string }[] = [
    { label: 'Suppliers', value: S.totalSuppliers, to: '/suppliers', hint: 'rows in the master' },
    { label: 'Approved', value: S.approvedSuppliers, to: '/suppliers?approved=1', hint: 'approval_status APPROVED' },
    { label: 'RED', value: S.byStatus.RED, to: '/suppliers?status=RED', accent: statusColor('RED') },
    { label: 'AMBER', value: S.byStatus.AMBER, to: '/suppliers?status=AMBER', accent: statusColor('AMBER') },
    { label: 'GREEN', value: S.byStatus.GREEN, to: '/suppliers?status=GREEN', accent: statusColor('GREEN') },
    { label: 'Cannot determine', value: S.byStatus['CANNOT DETERMINE'], to: '/suppliers?status=CANNOT%20DETERMINE', accent: statusColor('CANNOT DETERMINE') },
    { label: 'Never assessed', value: S.neverAssessed, to: '/suppliers?flag=NEVER%20ASSESSED' },
    { label: 'Single source', value: S.singleSource, to: '/suppliers?flag=SINGLE%20SOURCE' },
    { label: 'Indemnity gap', value: S.indemnityGap, to: '/suppliers?flag=INDEMNITY%20GAP' },
    { label: 'Part families', value: S.totalFamilies, to: '/families' },
    { label: 'Families, 0 qualified', value: S.familiesWithoutQualified, to: '/families?zero=1', hint: 'finding, not a flag' },
    { label: 'Unmatched memos', value: S.unmatchedMemos, to: '/memos?match=unmatched' },
    { label: 'Pending reviews', value: S.pendingReviews, to: '/reviews' },
  ];
  const attention = out.scorecard.filter((r) => r.status === 'RED' || r.status === 'AMBER').sort((a, b) => (a.status === b.status ? a.supplierId.localeCompare(b.supplierId) : a.status === 'RED' ? -1 : 1));
  const recentRuns = [...runs].reverse().slice(0, 6);
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;

  return (
    <div className="stack">
      <PageHead
        eyebrow="Executive view"
        title="Executive dashboard"
        intro={<>Run <strong className="mono">{short(out.outputFingerprint, 12)}</strong> under {out.ruleSetId} V{out.ruleSetVersion}, as of {out.asOf}. Every number links to the rows behind it.</>}
        actions={<><Link className="btn ghost" to="/reports">Export reports</Link><Link className="btn" to="/suppliers">Open scorecard</Link></>}
      />
      <Reveal>
        <div className="grid g-kpi" data-testid="kpis">
          {kpis.map((k) => (
            <Link key={k.label} to={k.to} className="kpi" style={k.accent ? ({ '--accent': k.accent } as React.CSSProperties) : undefined} data-kpi={k.label}>
              <span className="label">{k.label}</span>
              <span className="value">{k.value}</span>
              {k.hint && <span className="hint">{k.hint}</span>}
            </Link>
          ))}
        </div>
      </Reveal>

      <div className="grid g-2">
        <Reveal><div className="card">
          <div className="card-head"><h2>Status distribution</h2><span className="muted">§6 · one per supplier</span></div>
          <Donut label="suppliers" total={S.totalSuppliers} slices={statuses.map((s) => ({ key: s, label: s, value: S.byStatus[s], color: statusColor(s), to: `/suppliers?status=${encodeURIComponent(s)}` }))} />
        </div></Reveal>
        <Reveal delay={80}><div className="card">
          <div className="card-head"><h2>Risk flags</h2><span className="muted">§4 · the three official flags</span></div>
          <Bars label="Flags" bars={[
            { key: 'na', label: 'NEVER ASSESSED', value: S.neverAssessed, to: '/suppliers?flag=NEVER%20ASSESSED' },
            { key: 'ss', label: 'SINGLE SOURCE', value: S.singleSource, to: '/suppliers?flag=SINGLE%20SOURCE' },
            { key: 'ig', label: 'INDEMNITY GAP', value: S.indemnityGap, to: '/suppliers?flag=INDEMNITY%20GAP' },
            { key: 'cd', label: 'Indemnity undetermined', value: S.indemnityCannotDetermine, to: '/suppliers?indemnity=CANNOT%20DETERMINE', color: '#7A838C' },
            { key: 'nm', label: 'No memo (coverage)', value: S.suppliersWithoutMemo, to: '/suppliers?coverage=nomemo', color: '#B8A85D' },
          ]} />
          <p className="muted" style={{ fontSize: '.82rem', margin: 0 }}>“No memo” is source coverage, not a risk flag (§3).</p>
        </div></Reveal>
      </div>

      <Reveal><div className="card">
        <div className="card-head"><h2>Part-family qualification</h2><Link to="/families">All families →</Link></div>
        <div className="matrix">
          {out.families.map((f) => (
            <Link key={f.family} to={`/families/${encodeURIComponent(f.family)}`} className={`cell${f.singleSource === true ? ' ss' : ''}${f.noQualifiedSupplier ? ' zero' : ''}`}>
              <span className="fam">{f.family}</span>
              <span className="pips" aria-hidden>{f.suppliers.map((s) => <span key={s.supplierId} className={`pip${s.qualified === false ? ' off' : s.qualified === 'UNDETERMINED' ? ' und' : ''}`} />)}</span>
              <span className="muted" style={{ fontSize: '.8rem' }}>{f.qualifiedCount} qualified of {f.suppliers.length}{f.singleSource === true ? ' · SINGLE SOURCE' : ''}{f.noQualifiedSupplier ? ' · NONE QUALIFIED' : ''}</span>
            </Link>
          ))}
        </div>
      </div></Reveal>

      <div className="grid g-2">
        <Reveal><div className="card">
          <div className="card-head"><h2>Needs attention</h2><span className="muted">RED and AMBER</span></div>
          <ul className="list-plain">
            {attention.map((r) => (
              <li key={r.supplierId} className="row" style={{ justifyContent: 'space-between' }}>
                <Link to={`/suppliers/${r.supplierId}`}><strong>{r.supplierId}</strong> {r.supplierName}</Link>
                <span className="row" style={{ gap: 6 }}>
                  {Object.values(r.flags).filter((f) => f.raised === true).map((f) => <span key={f.flag} className="flag">{f.flag}</span>)}
                  <StatusBadge status={r.status} />
                </span>
              </li>
            ))}
            {attention.length === 0 && <li className="muted">No RED or AMBER suppliers in this run.</li>}
          </ul>
        </div></Reveal>
        <Reveal delay={80}><div className="card">
          <div className="card-head"><h2>Assessment activity</h2><Link to="/runs">History →</Link></div>
          <ul className="list-plain">
            {recentRuns.map((r) => (
              <li key={r.id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="mono" style={{ fontSize: '.84rem' }}>{short(r.outputFingerprint, 10)}</span>
                  <span className="muted" style={{ fontSize: '.82rem' }}>{fmtDate(r.createdAt)}</span>
                </div>
                <div style={{ fontSize: '.88rem' }}>{r.reason} <span className="muted">· {r.ruleSetKey} · {r.actor}</span></div>
              </li>
            ))}
          </ul>
          {prev && <Link className="btn ghost sm" style={{ marginTop: 12 }} to={`/runs?a=${prev.id}&b=${current.id}`}>What changed since the previous run?</Link>}
        </div></Reveal>
      </div>
    </div>
  );
}
