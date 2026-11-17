import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { allRuleSets, useStore } from '../../state/store';
import { diffRuns } from '../../engine/diff';
import { ruleKey, type StoredRun } from '../../storage/db';
import { fmtDate, Notice, PageHead, short } from '../components/common';
import { toast } from '../components/Toast';

export default function Runs() {
  const runs = useStore((s) => s.runs);
  const st = useStore();
  const loadRun = useStore((s) => s.loadRun);
  const [sp, setSp] = useSearchParams();
  const a = sp.get('a') ?? (runs.length > 1 ? runs[runs.length - 2]!.id : '');
  const b = sp.get('b') ?? (runs.length ? runs[runs.length - 1]!.id : '');
  const [pair, setPair] = useState<[StoredRun, StoredRun] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (a && b) Promise.all([loadRun(a), loadRun(b)]).then(([x, y]) => { if (live && x && y) setPair([x, y]); });
    return () => { live = false; };
  }, [a, b, loadRun]);
  const diff = pair ? diffRuns(pair[0].output, pair[1].output) : null;
  const runnable = allRuleSets(st).filter((r) => r.lifecycle !== 'EXPERIMENTAL');
  // Default to the currently active version; a stale choice that no longer exists falls back to it.
  const reassessKey = picked && runnable.some((r) => ruleKey(r) === picked) ? picked : st.activeRuleKey;
  const setReassessKey = setPicked;

  return (
    <div className="stack">
      <PageHead eyebrow="Governance" title="Assessment history" intro="Every run is stored unchanged with its inputs, rule version and fingerprints. Compare any two runs, or reassess the current sources under an earlier approved rule version." />
      {st.dataset && (
        <div className="card">
          <h2>Reassess</h2>
          <div className="row">
            <select className="input" style={{ maxWidth: 360 }} aria-label="Rule version for reassessment" value={reassessKey} onChange={(e) => setReassessKey(e.target.value)}>
              {runnable.map((r) => <option key={ruleKey(r)} value={ruleKey(r)}>{ruleKey(r)} · {r.lifecycle}{ruleKey(r) === st.activeRuleKey ? ' (active)' : ''}</option>)}
            </select>
            <button className="btn" onClick={async () => { await st.runAssessment(`Reassessment under ${reassessKey}`, reassessKey); toast('Reassessment stored as a new run.'); }}>Run and store</button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>Reassessing never changes earlier runs. Experimental drafts run only in the rules sandbox.</p>
        </div>
      )}
      {runs.length === 0 && <Notice>No runs yet.</Notice>}
      {runs.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Runs ({runs.length})</h2><span className="muted">Choose A and B to compare</span></div>
          <div className="table-wrap"><table className="data cards" data-testid="run-table">
            <thead><tr><th>A</th><th>B</th><th>When</th><th>Run</th><th>Rule set</th><th>Reason</th><th>Actor</th><th className="num">R/A/CD/G</th></tr></thead>
            <tbody>{[...runs].reverse().map((r) => (
              <tr key={r.id}>
                <td data-label="A"><input type="radio" name="ra" aria-label={`Compare from ${short(r.outputFingerprint)}`} checked={a === r.id} onChange={() => setSp({ a: r.id, b }, { replace: true })} /></td>
                <td data-label="B"><input type="radio" name="rb" aria-label={`Compare to ${short(r.outputFingerprint)}`} checked={b === r.id} onChange={() => setSp({ a, b: r.id }, { replace: true })} /></td>
                <td data-label="When">{fmtDate(r.createdAt)}</td>
                <td data-label="Run" className="mono" title={r.outputFingerprint}>{short(r.outputFingerprint)}{st.current?.id === r.id ? ' · current' : ''}</td>
                <td data-label="Rule set">{r.ruleSetKey}</td>
                <td data-label="Reason">{r.reason}</td>
                <td data-label="Actor">{r.actor}</td>
                <td data-label="R/A/CD/G" className="num">{r.summary.byStatus.RED}/{r.summary.byStatus.AMBER}/{r.summary.byStatus['CANNOT DETERMINE']}/{r.summary.byStatus.GREEN}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
      {pair && diff && (
        <div className="card" data-testid="run-diff">
          <div className="card-head"><h2>What changed: {short(pair[0].output.outputFingerprint)} → {short(pair[1].output.outputFingerprint)}</h2><span className="muted">{pair[0].ruleSetKey} → {pair[1].ruleSetKey}</span></div>
          {pair[0].output.inputFingerprint === pair[1].output.inputFingerprint && <Notice kind="ok">Identical inputs and rule version — the outputs are {pair[0].output.outputFingerprint === pair[1].output.outputFingerprint ? 'byte-identical (deterministic)' : 'DIFFERENT, which should never happen'}.</Notice>}
          {diff.memosAdded.length > 0 && <p>Memos added: {diff.memosAdded.join(', ')}</p>}
          {diff.suppliers.length === 0 ? <p>No supplier changed.</p> : (
            <div className="table-wrap"><table className="data cards">
              <thead><tr><th>Supplier</th><th>Field</th><th>Before</th><th>After</th></tr></thead>
              <tbody>{diff.suppliers.flatMap((s) => s.changes.map((c, i) => (
                <tr key={s.supplierId + i}><td data-label="Supplier"><Link to={`/suppliers/${s.supplierId}`}>{s.supplierId}</Link></td><td data-label="Field">{c.field}</td><td data-label="Before" className="diff-before">{c.before}</td><td data-label="After" className="diff-after">{c.after}</td></tr>
              )))}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
