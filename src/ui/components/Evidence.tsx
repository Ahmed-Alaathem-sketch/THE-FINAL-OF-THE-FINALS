import { Link } from 'react-router-dom';
import type { Evidence } from '../../engine/types';

export function EvidenceItem({ e }: { e: Evidence }) {
  if (e.kind === 'memo') {
    return (
      <div className="ev memo" data-ev="memo">
        <div className="ev-head">
          <span>Memo quotation</span>
          <Link to={`/memos/${e.memoId}?s=${e.sentenceIndex}`}>{e.memoId}</Link>
          <span>· {e.memoDate || 'date NOT STATED'}</span>
          <span>· sentence {e.sentenceIndex + 1}</span>
          {e.reviewId && <span className="tag brass">classified by review {e.reviewId}</span>}
        </div>
        <blockquote>{e.quote}</blockquote>
      </div>
    );
  }
  if (e.kind === 'record') {
    return (
      <div className="ev record" data-ev="record">
        <div className="ev-head">
          <span>Record</span>
          <span className="tag">{e.file}</span>
          <span>data row {e.rowNumber} · file line {e.lineNumber}</span>
        </div>
        <dl>
          {Object.entries(e.fields).map(([k, v]) => (
            <FragmentKV key={k} k={k} v={v} relied={e.relied.includes(k)} />
          ))}
        </dl>
      </div>
    );
  }
  if (e.kind === 'absence') {
    return (
      <div className="ev absence" data-ev="absence">
        <div className="ev-head">
          <span>Absence — scope searched</span>
          <span>· as of {e.asOf}</span>
        </div>
        <p style={{ margin: 0 }}>{e.scope}</p>
        <dl>
          <dt>Supplier</dt><dd>{e.supplierId}</dd>
          <dt>Missing</dt><dd>{e.missing}</dd>
          <dt>Searched</dt><dd>{e.files.join(', ')}{e.rowsSearched !== undefined ? ` · ${e.rowsSearched} rows` : ''}{e.memosSearched !== undefined ? ` · ${e.memosSearched} memos` : ''}</dd>
        </dl>
      </div>
    );
  }
  return (
    <div className="ev review" data-ev="review">
      <div className="ev-head"><span>Human review</span><span>{e.reviewId}</span><span>· {e.actor}</span></div>
      <p style={{ margin: 0 }}>{e.decision} — {e.reason}</p>
    </div>
  );
}

function FragmentKV({ k, v, relied }: { k: string; v: string; relied: boolean }) {
  return (
    <>
      <dt>{k}</dt>
      <dd className={relied ? 'relied' : undefined}>{v === '' ? <span className="muted">(empty)</span> : v}</dd>
    </>
  );
}

export function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return <p className="muted">No evidence attached.</p>;
  return <div className="evidence">{items.map((e, i) => <EvidenceItem key={i} e={e} />)}</div>;
}
