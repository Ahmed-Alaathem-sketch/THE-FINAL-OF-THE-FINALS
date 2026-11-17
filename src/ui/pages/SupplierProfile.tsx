import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useStore, useOutput } from '../../state/store';
import type { FlagName, Status } from '../../engine/types';
import { AwaitingData, fmtDate, PageHead, short } from '../components/common';
import { EvidenceList, EvidenceItem } from '../components/Evidence';
import { FlagChip, Indemnity, StatusBadge } from '../components/Status';

const TABS = ['Flags & evidence', 'Indemnity', 'Qualification', 'Coverage & memos', 'Notes', 'History'] as const;

export default function SupplierProfile() {
  const { id = '' } = useParams();
  const out = useOutput();
  const loc = useLocation();
  const runs = useStore((s) => s.runs);
  const loadRun = useStore((s) => s.loadRun);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Flags & evidence');
  const [history, setHistory] = useState<{ id: string; at: string; status: Status; fp: string; rule: string; reason: string }[] | null>(null);

  useEffect(() => {
    if (loc.hash.startsWith('#flag-')) {
      setTab('Flags & evidence');
      setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }, [loc.hash]);
  useEffect(() => {
    if (tab !== 'History') return;
    let live = true;
    (async () => {
      const recent = runs.slice(-25);
      const loaded = await Promise.all(recent.map((r) => loadRun(r.id)));
      const list = recent.flatMap((r, i) => {
        const row = loaded[i]?.output.scorecard.find((x) => x.supplierId === id);
        return row ? [{ id: r.id, at: r.createdAt, status: row.status, fp: r.outputFingerprint, rule: r.ruleSetKey, reason: r.reason }] : [];
      });
      if (live) setHistory(list.reverse());
    })();
    return () => { live = false; };
  }, [tab, runs, id, loadRun]);

  if (!out) return (<><PageHead title="Supplier profile" /><AwaitingData /></>);
  const r = out.scorecard.find((x) => x.supplierId === id);
  if (!r) return (<><PageHead title="Supplier not found" /><p>No supplier {id} in the current run. <Link to="/suppliers">Back to the directory</Link>.</p></>);
  const cov = out.coverage.find((c) => c.supplierId === id)!;
  const memos = out.memos.filter((m) => cov.memoIds.includes(m.memoId));

  return (
    <div className="stack">
      <PageHead eyebrow={`${r.supplierId} · spend band ${r.spendBand || '—'}`} title={r.supplierName}
        actions={<><Link className="btn ghost" to={`/reports?r=scorecard-supplier&id=${r.supplierId}`}>Supplier scorecard export</Link><Link className="btn ghost" to="/suppliers">All suppliers</Link></>} />
      <div className="card ink">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row"><StatusBadge status={r.status} large /><span className="muted">rule {r.statusRule}</span></div>
          <div className="row" style={{ gap: 6 }}>{Object.values(r.flags).map((f) => <FlagChip key={f.flag} flag={f} />)}</div>
        </div>
        <p style={{ margin: '12px 0 0' }}>{r.statusExplanation}</p>
        <dl className="kv" style={{ marginTop: 14, color: 'var(--sand)' }}>
          <dt className="muted">Approval</dt><dd>{r.approvalStatus || 'NOT STATED'}</dd>
          <dt className="muted">Part families</dt><dd>{r.partFamilies.map((f) => <Link key={f} to={`/families/${encodeURIComponent(f)}`} style={{ color: 'var(--brass)', marginRight: 10 }}>{f}</Link>)}</dd>
          <dt className="muted">Indemnity</dt><dd>{r.indemnity.position}{r.indemnity.amountBhd !== undefined ? ` · BHD ${r.indemnity.amountBhd.toLocaleString('en-US')}` : ''}</dd>
          <dt className="muted">Coverage</dt><dd>{cov.memosLabel} · assessment log row: {cov.hasLogRow ? 'yes' : 'no'}</dd>
        </dl>
      </div>

      <div>
        <div className="tabs" role="tablist" aria-label="Supplier sections">
          {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {tab === 'Flags & evidence' && (
          <div className="stack">
            {(Object.keys(r.flags) as FlagName[]).map((k) => {
              const f = r.flags[k];
              return (
                <section key={k} id={`flag-${k.replace(/ /g, '-')}`} className="card" aria-labelledby={`h-${k}`}>
                  <div className="card-head"><h3 id={`h-${k}`}>{k}</h3><FlagChip flag={f} /></div>
                  <p>{f.explanation}</p>
                  <EvidenceList items={f.evidence} />
                </section>
              );
            })}
          </div>
        )}

        {tab === 'Indemnity' && (
          <div className="stack">
            <div className="card">
              <div className="card-head"><h3>Indemnity position (§4.3)</h3><Indemnity position={r.indemnity.position} /></div>
              <p>{r.indemnity.explanation}</p>
              <EvidenceList items={r.indemnity.evidence} />
            </div>
            {r.contradictions.map((c, i) => (
              <div key={i} className="card">
                <div className="card-head"><h3>Contradiction — {c.subject}</h3><span className="tag brass">{c.resolution}</span></div>
                <p>{c.explanation}</p>
                <div className="grid g-2">
                  <div><span className="eyebrow">Governs</span><EvidenceItem e={c.governing} /></div>
                  <div><span className="eyebrow">Superseded (kept, not blended)</span><div className="evidence">{c.superseded.map((s, j) => <EvidenceItem key={j} e={s} />)}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'Qualification' && (
          <div className="stack">
            {r.qualifications.map((q) => (
              <div key={q.family} className="card">
                <div className="card-head">
                  <h3><Link to={`/families/${encodeURIComponent(q.family)}`}>{q.family}</Link></h3>
                  <span className={`tag ${q.qualified === true ? '' : 'ink'}`}>{q.qualified === true ? 'QUALIFIED' : q.qualified === false ? 'NOT QUALIFIED' : 'CANNOT DETERMINE'} · {q.basis}</span>
                </div>
                <EvidenceList items={q.evidence} />
              </div>
            ))}
            {r.qualifications.length === 0 && <p className="muted">No part family is listed for this supplier (NOT STATED).</p>}
          </div>
        )}

        {tab === 'Coverage & memos' && (
          <div className="card">
            <p><strong>Memos found:</strong> {cov.memosLabel}. <strong>Assessment log rows:</strong> {cov.logRows.length ? cov.logRows.map((l) => `line ${l}`).join(', ') : 'none'}.</p>
            <p className="muted">{cov.scope} {cov.notes.join(' ')}</p>
            <ul className="list-plain">
              {memos.map((m) => (
                <li key={m.memoId} className="row" style={{ justifyContent: 'space-between' }}>
                  <Link to={`/memos/${m.memoId}`}><strong>{m.memoId}</strong> — {m.title}</Link>
                  <span className="muted">{m.date || 'date NOT STATED'} · {m.author || 'author NOT STATED'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'Notes' && (
          <div className="stack">
            {r.notes.length === 0 && <p className="muted">No notes for this supplier.</p>}
            {r.notes.map((n, i) => (
              <div key={i} className="card"><p>{n.text}</p><EvidenceList items={n.evidence} /></div>
            ))}
          </div>
        )}

        {tab === 'History' && (
          <div className="card">
            <p className="muted">Status of {r.supplierId} in each stored run (newest first). Historical runs are never modified.</p>
            {!history ? <p>Loading…</p> : (
              <div className="table-wrap"><table className="data cards">
                <thead><tr><th>When</th><th>Run</th><th>Rule set</th><th>Reason</th><th>Status</th></tr></thead>
                <tbody>{history.map((h) => (
                  <tr key={h.id}><td data-label="When">{fmtDate(h.at)}</td><td data-label="Run" className="mono">{short(h.fp)}</td><td data-label="Rule set">{h.rule}</td><td data-label="Reason">{h.reason}</td><td data-label="Status"><StatusBadge status={h.status} /></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
