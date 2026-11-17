import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { findRuleSet, useOutput, useStore } from '../../state/store';
import { normalizeSupplierName } from '../../engine/normalize';
import { AwaitingData, Notice, PageHead } from '../components/common';

const KIND_LABEL: Record<string, string> = {
  INDEMNITY_CAP: 'Indemnity cap', INDEMNITY_NONE: 'No indemnity clause', INDEMNITY_NOT_STATED: 'Indemnity not stated', QUALIFICATION_REMOVED: 'Qualification removed',
  QUALIFICATION_AFFIRMED: 'Qualification affirmed', ASSESSMENT_PLANNED: 'Assessment planned (not an assessment)', OTHER_SUPPLIER_MENTION: 'Mentions another supplier (note only)',
  QUALITY_NOTE: 'Quality event (note)', UNCLASSIFIED: 'Needs a person',
};

export default function MemoDetail() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const focus = sp.get('s') !== null ? Number(sp.get('s')) : null;
  const out = useOutput();
  const memo = useStore((s) => s.memos.find((m) => m.memoId === id));
  const suffixes = useStore((s) => (s.current ? findRuleSet(s, s.current.ruleSetKey)?.parameters.legalSuffixes : undefined)) ?? [];
  useEffect(() => {
    if (focus === null) return;
    const t = setTimeout(() => document.getElementById(`s-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return () => clearTimeout(t);
  }, [focus, id]);
  const stmts = useMemo(() => out?.statements.filter((s) => s.memoId === id) ?? [], [out, id]);
  if (!out) return (<><PageHead title="Memo" /><AwaitingData /></>);
  const meta = out.memos.find((m) => m.memoId === id);
  if (!meta || !memo) return (<><PageHead title="Memo not found" /><Link to="/memos">Back to memos</Link></>);
  const mm = out.matches.find((m) => m.memoId === id)!;
  const bySentence = new Map(stmts.map((s) => [s.sentenceIndex, s]));
  const matchedName = mm.outcome.kind === 'MATCHED' ? out.scorecard.find((r) => r.supplierId === (mm.outcome as { supplierId: string }).supplierId)?.supplierName : null;
  const masterTrace = matchedName ? normalizeSupplierName(matchedName, suffixes) : null;

  // Render the body as text with sentence marks (React text nodes only — never HTML).
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const s of memo.sentences) {
    if (s.start > pos) parts.push(memo.body.slice(pos, s.start));
    const st = bySentence.get(s.index);
    const isFocus = focus === s.index;
    if (st || isFocus) parts.push(<mark key={s.index} id={`s-${s.index}`} className={`hl${isFocus ? ' focus' : ''}`} title={st ? KIND_LABEL[st.kind] : undefined}>{s.text}</mark>);
    else parts.push(<span key={s.index} id={`s-${s.index}`}>{s.text}</span>);
    pos = s.end;
  }
  if (pos < memo.body.length) parts.push(memo.body.slice(pos));

  return (
    <div className="stack">
      <PageHead eyebrow={`${meta.memoId} · ${meta.date || 'date NOT STATED'}`} title={meta.title || meta.memoId} actions={<Link className="btn ghost" to="/memos">All memos</Link>} />
      {meta.warnings.length > 0 && <Notice kind="warn">{meta.warnings.join(' ')}</Notice>}
      <div className="grid g-2">
        <div className="card">
          <h3>Header</h3>
          <dl className="kv">
            <dt>Memo ID</dt><dd>{meta.memoId}</dd>
            <dt>Date</dt><dd>{meta.date || 'NOT STATED'}</dd>
            <dt>Author</dt><dd>{meta.author || 'NOT STATED'}</dd>
            <dt>Supplier (as written)</dt><dd>{meta.supplierAsWritten || 'NOT STATED'}</dd>
            <dt>File</dt><dd>{meta.fileName}{meta.duplicateFiles.length ? ` (identical copy in ${meta.duplicateFiles.join(', ')})` : ''}</dd>
            <dt>SHA-256</dt><dd className="mono" style={{ fontSize: '.78rem' }}>{meta.sha256}</dd>
          </dl>
        </div>
        <div className="card">
          <div className="card-head"><h3>Supplier match (§2)</h3>{mm.outcome.kind === 'MATCHED' ? <Link className="tag" to={`/suppliers/${mm.outcome.supplierId}`}>{mm.outcome.supplierId} · {mm.outcome.via === 'RULE' ? 'exact' : `review ${mm.outcome.reviewId}`}</Link> : <span className="tag ink">CANNOT DETERMINE (MATCH)</span>}</div>
          <dl className="trace">
            <dt>As written</dt><dd>{mm.memoTrace.input || '∅'}</dd>
            <dt>1 · full stops</dt><dd>{mm.memoTrace.step1RemoveFullStops}</dd>
            <dt>2 · punctuation</dt><dd>{mm.memoTrace.step2PunctuationToSpace}</dd>
            <dt>3 · case</dt><dd>{mm.memoTrace.step3IgnoreCase}</dd>
            <dt>4 · suffixes</dt><dd>{mm.memoTrace.step4RemoveSuffixes}</dd>
            <dt>5 · plural s</dt><dd>{mm.memoTrace.normalized || '∅'}</dd>
            {masterTrace && (<><dt>Master name</dt><dd>{matchedName} → {masterTrace.normalized}</dd></>)}
          </dl>
          {mm.outcome.kind !== 'MATCHED' && <p style={{ marginTop: 10 }}>{mm.outcome.reason} <Link to="/reviews">Decide in the review queue</Link>.</p>}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Memo text</h3><span className="muted">Highlighted sentences are statements the engine read.</span></div>
        <div className="memo-body" data-testid="memo-body">{parts}</div>
      </div>
      <div className="card">
        <h3>Extracted statements</h3>
        {stmts.length === 0 && <p className="muted">No statements about indemnity, qualification or assessment.</p>}
        <ul className="list-plain">
          {stmts.map((s) => (
            <li key={s.sentenceIndex} className="ev">
              <div className="ev-head"><Link to={`/memos/${id}?s=${s.sentenceIndex}`}>sentence {s.sentenceIndex + 1}</Link><span className="tag brass">{KIND_LABEL[s.kind]}</span>{s.amountBhd !== undefined && <span>BHD {s.amountBhd.toLocaleString('en-US')}</span>}{s.families?.length ? <span>families: {s.families.join(', ')}</span> : null}{s.mentions?.length ? <span>mentions: {s.mentions.join(', ')}</span> : null}{s.reviewId && <span>review {s.reviewId}</span>}</div>
              <blockquote>{s.quote}</blockquote>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
