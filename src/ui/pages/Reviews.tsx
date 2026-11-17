import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOutput, useStore } from '../../state/store';
import type { ReviewItem } from '../../engine/types';
import { AwaitingData, Notice, PageHead } from '../components/common';
import { Dialog } from '../components/Dialog';
import { toast } from '../components/Toast';

type Choice = 'MATCH' | 'NO_MATCH' | 'INDEMNITY_CAP' | 'INDEMNITY_NONE' | 'INDEMNITY_NOT_STATED' | 'QUALIFICATION_REMOVED' | 'QUALIFICATION_AFFIRMED' | 'NOT_RELEVANT' | 'ACK';

export default function Reviews() {
  const out = useOutput();
  const decide = useStore((s) => s.decide);
  const actor = useStore((s) => s.actor);
  const decisions = useStore((s) => s.decisions);
  const [open, setOpen] = useState<ReviewItem | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  if (!out) return (<><PageHead eyebrow="Human review" title="Review queue" /><AwaitingData what="the review queue" /></>);
  const items = out.reviewQueue.filter((q) => showResolved || !q.resolved);
  return (
    <div className="stack">
      <PageHead eyebrow="Human control" title="Review queue" intro="Items the rules cannot settle by themselves. A person decides, gives a reason, and the decision becomes a recorded input to a new run. The tool never decides these for you." />
      <Notice>Decisions are recorded under the name <strong>{actor}</strong> (self-declared on the <Link to="/data">Data & privacy</Link> page; this public site has no login).</Notice>
      <label className="check"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved items</label>
      {items.length === 0 && <div className="notice ok">Nothing waiting for a person in this run.</div>}
      {items.map((q) => (
        <article key={q.key} className="card" data-review={q.key}>
          <div className="card-head">
            <h3>{q.title}</h3>
            <span className={`tag ${q.resolved ? '' : 'ink'}`}>{q.resolved ? `resolved · ${q.reviewId}` : 'pending'}</span>
          </div>
          <p>{q.detail}</p>
          {q.quote && <div className="ev"><blockquote>{q.quote}</blockquote></div>}
          <div className="btn-row" style={{ marginTop: 12 }}>
            {q.memoId && <Link className="btn ghost sm" to={`/memos/${q.memoId}${q.sentenceIndex !== undefined ? `?s=${q.sentenceIndex}` : ''}`}>Open {q.memoId}</Link>}
            <button className="btn sm" onClick={() => setOpen(q)}>{q.resolved ? 'Revise decision' : 'Decide'}</button>
          </div>
        </article>
      ))}
      {decisions.length > 0 && (
        <div className="card">
          <h3>Decisions on record ({decisions.length})</h3>
          <ul className="list-plain">{[...decisions].reverse().map((d) => <li key={d.id} style={{ fontSize: '.9rem' }}><strong>{d.id}</strong> · {d.type} · {d.actor} · {new Date(d.at).toLocaleString('en-GB')} — {d.reason}</li>)}</ul>
        </div>
      )}
      {open && <DecisionDialog item={open} onClose={() => setOpen(null)} onSubmit={async (p) => { await decide(p); toast('Decision recorded; a new run was created.'); setOpen(null); }} />}
    </div>
  );
}

function DecisionDialog({ item, onClose, onSubmit }: { item: ReviewItem; onClose: () => void; onSubmit: (p: Parameters<ReturnType<typeof useStore.getState>['decide']>[0]) => Promise<void> }) {
  const out = useOutput()!;
  const memo = item.memoId ? out.memos.find((m) => m.memoId === item.memoId) : undefined;
  const supplier = item.supplierId ? out.scorecard.find((r) => r.supplierId === item.supplierId) : undefined;
  const [choice, setChoice] = useState<Choice>(item.type === 'MEMO_MATCH' ? 'MATCH' : item.type === 'STATEMENT' ? 'NOT_RELEVANT' : 'ACK');
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [families, setFamilies] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!reason.trim()) { setErr('A reason is required.'); return; }
    try {
      if (item.type === 'MEMO_MATCH') {
        if (choice === 'MATCH' && !supplierId) { setErr('Choose the supplier.'); return; }
        await onSubmit({ type: 'MATCH_MEMO', memoId: item.memoId!, memoSha256: memo!.sha256, supplierId: choice === 'MATCH' ? supplierId : null, reason } as never);
      } else if (item.type === 'STATEMENT') {
        const amt = Number(amount.replace(/[, ]/g, ''));
        if (choice === 'INDEMNITY_CAP' && !(Number.isFinite(amt) && amt >= 0)) { setErr('Enter the cap in BHD exactly as the memo states it.'); return; }
        if (choice.startsWith('QUALIFICATION') && families.length === 0) { setErr('Choose the part family the sentence states qualification for.'); return; }
        await onSubmit({ type: 'CLASSIFY_STATEMENT', memoId: item.memoId!, memoSha256: memo!.sha256, sentenceIndex: item.sentenceIndex!, kind: choice as never, ...(choice === 'INDEMNITY_CAP' ? { amountBhd: amt } : {}), ...(choice.startsWith('QUALIFICATION') ? { families } : {}), reason } as never);
      } else {
        await onSubmit({ type: 'ACKNOWLEDGE', key: item.key, reason } as never);
      }
    } catch (x) { setErr((x as Error).message); }
  }

  return (
    <Dialog title={item.title} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {item.quote && <div className="ev"><blockquote>{item.quote}</blockquote></div>}
        {err && <Notice kind="err">{err}</Notice>}
        {item.type === 'MEMO_MATCH' && (
          <>
            <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">Your decision</legend>
              <label className="check"><input type="radio" name="c" checked={choice === 'MATCH'} onChange={() => setChoice('MATCH')} /> The memo is about this master supplier:</label>
              <select className="input" aria-label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={choice !== 'MATCH'}>
                <option value="">Choose…</option>
                {out.scorecard.map((r) => <option key={r.supplierId} value={r.supplierId}>{r.supplierId} · {r.supplierName}</option>)}
              </select>
              <label className="check"><input type="radio" name="c" checked={choice === 'NO_MATCH'} onChange={() => setChoice('NO_MATCH')} /> It matches no master supplier (keep it unattached)</label>
            </fieldset>
            <Notice kind="warn">Attaching a memo by review overrides the exact-match rule for this memo only. The match is labelled “review” wherever it is used.</Notice>
          </>
        )}
        {item.type === 'STATEMENT' && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">What does this sentence state about {supplier ? `${supplier.supplierId} ${supplier.supplierName}` : 'the supplier'}?</legend>
            {([['NOT_RELEVANT', 'Nothing relevant to RR-C5 (ignore)'], ['INDEMNITY_CAP', 'An indemnity cap of BHD …'], ['INDEMNITY_NONE', 'There is no indemnity clause'], ['INDEMNITY_NOT_STATED', 'The indemnity position is not stated'], ['QUALIFICATION_REMOVED', 'Failed qualification / must not be used for …'], ['QUALIFICATION_AFFIRMED', 'Qualified for …']] as [Choice, string][]).map(([k, l]) => (
              <label key={k} className="check"><input type="radio" name="k" checked={choice === k} onChange={() => setChoice(k)} /> {l}</label>
            ))}
            {choice === 'INDEMNITY_CAP' && <div className="field"><label htmlFor="d-amt">Cap (BHD) as stated</label><input id="d-amt" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>}
            {choice.startsWith('QUALIFICATION') && (
              <div className="row">{(supplier?.partFamilies ?? []).map((f) => (
                <label key={f} className="check"><input type="checkbox" checked={families.includes(f)} onChange={(e) => setFamilies(e.target.checked ? [...families, f] : families.filter((x) => x !== f))} /> {f}</label>
              ))}</div>
            )}
          </fieldset>
        )}
        {item.type !== 'MEMO_MATCH' && item.type !== 'STATEMENT' && <p>This item cannot be resolved by a decision here — the sources must be clarified (for example by a new, dated memo). You can acknowledge that you have seen it.</p>}
        <div className="field"><label htmlFor="d-reason">Reason (recorded in the audit trail)</label><textarea id="d-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required /></div>
        <div className="btn-row"><button type="submit" className="btn">Record decision</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Dialog>
  );
}
