import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOutput, useStore } from '../../state/store';
import { AwaitingData, PageHead } from '../components/common';
import { EvidenceItem } from '../components/Evidence';

export default function Memos() {
  const out = useOutput();
  const memos = useStore((s) => s.memos);
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<'list' | 'contradictions'>(sp.get('tab') === 'contradictions' ? 'contradictions' : 'list');
  const q = sp.get('q') ?? '';
  const match = sp.get('match') ?? '';
  const bodies = useMemo(() => new Map(memos.map((m) => [m.memoId, `${m.title} ${m.supplierAsWritten} ${m.author} ${m.body}`.toLowerCase()])), [memos]);
  if (!out) return (<><PageHead eyebrow="Sources" title="Memos & intake" /><AwaitingData what="memo management" /></>);
  const needle = q.trim().toLowerCase();
  const rows = out.memos.filter((m) => {
    const mm = out.matches.find((x) => x.memoId === m.memoId)!;
    if (match === 'unmatched' && mm.outcome.kind === 'MATCHED') return false;
    if (match === 'matched' && mm.outcome.kind !== 'MATCHED') return false;
    if (needle && !(bodies.get(m.memoId) ?? '').includes(needle) && !m.memoId.toLowerCase().includes(needle)) return false;
    return true;
  });
  // Read the live URL: router updates are transitions, so the hook value can lag behind rapid input.
  const set = (k: string, v: string) => { const n = new URLSearchParams(window.location.search); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  return (
    <div className="stack">
      <PageHead eyebrow="Sources · RR-C5 §2, §5" title="Memos & intake" intro="Every memo with its supplier match. Matching is exact after the five §2 steps; anything else waits for a person." actions={<Link className="btn" to="/memos/intake">New memo intake</Link>} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'list'} onClick={() => setTab('list')}>Memos ({out.memos.length})</button>
        <button role="tab" aria-selected={tab === 'contradictions'} onClick={() => setTab('contradictions')}>Contradictions ({out.contradictions.length})</button>
      </div>
      {tab === 'list' && (
        <div className="card">
          <div className="filters" style={{ gridTemplateColumns: '2fr 1fr' }} role="search">
            <div className="field"><label htmlFor="m-q">Search memo content</label><input id="m-q" className="input" value={q} placeholder="e.g. indemnity, requalification, Marrowgate" onChange={(e) => set('q', e.target.value)} /></div>
            <div className="field"><label htmlFor="m-m">Match</label>
              <select id="m-m" className="input" value={match} onChange={(e) => set('match', e.target.value)}>
                <option value="">All</option><option value="matched">Matched</option><option value="unmatched">CANNOT DETERMINE (MATCH)</option>
              </select>
            </div>
          </div>
          <p className="muted" aria-live="polite">{rows.length} memo(s)</p>
          <div className="table-wrap">
            <table className="data cards" data-testid="memo-table">
              <thead><tr><th>Memo</th><th>Date</th><th>Supplier (as written)</th><th>Match</th><th className="num">Statements</th></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const mm = out.matches.find((x) => x.memoId === m.memoId)!;
                  const n = out.statements.filter((s) => s.memoId === m.memoId && !['OTHER_SUPPLIER_MENTION', 'QUALITY_NOTE'].includes(s.kind)).length;
                  return (
                    <tr key={m.memoId}>
                      <td data-label="Memo"><Link to={`/memos/${m.memoId}`} className="cell-strong">{m.memoId}</Link><div className="muted" style={{ fontSize: '.8rem' }}>{m.title}</div></td>
                      <td data-label="Date">{m.date || 'NOT STATED'}</td>
                      <td data-label="Supplier">{m.supplierAsWritten || 'NOT STATED'}</td>
                      <td data-label="Match">{mm.outcome.kind === 'MATCHED' ? <Link to={`/suppliers/${mm.outcome.supplierId}`} className="tag" style={{ textDecoration: 'none' }}>{mm.outcome.supplierId}{mm.outcome.via === 'REVIEW' ? ' (review)' : ''}</Link> : <span className="tag ink">CANNOT DETERMINE (MATCH)</span>}</td>
                      <td data-label="Statements" className="num">{n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'contradictions' && (
        <div className="stack">
          {out.contradictions.length === 0 && <p className="muted">No contradictions between memos in this run.</p>}
          {out.contradictions.map((c, i) => (
            <div key={i} className="card">
              <div className="card-head"><h3><Link to={`/suppliers/${c.supplierId}`}>{c.supplierId}</Link> — {c.subject}</h3><span className="tag brass">{c.resolution}</span></div>
              <p>{c.explanation}</p>
              <div className="grid g-2">
                <div><span className="eyebrow">Governs (newer)</span><EvidenceItem e={c.governing} /></div>
                <div><span className="eyebrow">Superseded</span><div className="evidence">{c.superseded.map((s, j) => <EvidenceItem key={j} e={s} />)}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
