import { useMemo, useState } from 'react';
import { BASELINE_KEY, allRuleSets, findRuleSet, useOutput, useStore } from '../../state/store';
import { RR_C5_V1_2 } from '../../engine/rules/rr-c5-v1.2';
import { allFactCombinations, decide, describeCondition, describeFacts, type Condition, type DecisionRow, type RuleSet } from '../../engine/rules/ruleset';
import { approvalPhrase, conflictsWith, createDraft, validateRuleSet } from '../../engine/rules/manage';
import { diffRuns } from '../../engine/diff';
import { ruleKey } from '../../storage/db';
import type { AssessmentOutput, Status } from '../../engine/types';
import { Notice, PageHead } from '../components/common';
import { Dialog } from '../components/Dialog';
import { StatusBadge } from '../components/Status';
import { I } from '../components/icons';
import { toast } from '../components/Toast';

const OUTCOMES: Status[] = ['RED', 'AMBER', 'CANNOT DETERMINE', 'GREEN'];
const lifeTag = (r: RuleSet) => (r.lifecycle === 'OFFICIAL' ? 'official' : r.lifecycle === 'USER' ? 'user' : 'experimental');

export default function Rules() {
  const st = useStore();
  const out = useOutput();
  const sets = allRuleSets(st);
  const [selKey, setSelKey] = useState(st.activeRuleKey);
  const sel = findRuleSet(st, selKey) ?? (RR_C5_V1_2 as RuleSet);
  const [draft, setDraft] = useState<RuleSet | null>(null);
  const [newVersion, setNewVersion] = useState('1.3');
  const [sandbox, setSandbox] = useState<AssessmentOutput | null>(null);
  const [approve, setApprove] = useState(false);
  const [cmp, setCmp] = useState<string>(BASELINE_KEY);
  const editing = draft && ruleKey(draft) === selKey ? draft : null;
  const view = editing ?? sel;
  const errors = useMemo(() => validateRuleSet(view), [view]);
  const conflicts = useMemo(() => conflictsWith(view, RR_C5_V1_2 as RuleSet), [view]);
  const other = findRuleSet(st, cmp) ?? (RR_C5_V1_2 as RuleSet);

  function startDraft() {
    const v = newVersion.trim();
    if (sets.some((r) => r.id === view.id && r.version === v) || (draft && draft.version === v)) { toast(`Version ${v} already exists.`, 'err'); return; }
    const base = editing ?? sel; // an unsaved draft is a valid base too
    const d = createDraft(base, v, `${base.id} V${v} draft`, new Date().toISOString());
    setDraft(d);
    setSelKey(ruleKey(d));
    setSandbox(null);
  }
  async function save() {
    if (!editing) return;
    try { await st.saveDraft(editing, 'Draft saved from the rules editor'); toast('Draft saved (EXPERIMENTAL, not approved).'); setDraft(null); } catch (e) { toast((e as Error).message, 'err'); }
  }
  function edit(fn: (d: RuleSet) => void) {
    const base = editing ?? (sel.lifecycle === 'EXPERIMENTAL' ? (JSON.parse(JSON.stringify(sel)) as RuleSet) : null);
    if (!base) return;
    const copy = JSON.parse(JSON.stringify(base)) as RuleSet;
    fn(copy);
    setDraft(copy);
    setSandbox(null);
  }
  const canEdit = view.lifecycle === 'EXPERIMENTAL';

  return (
    <div className="stack">
      <PageHead eyebrow="Governance" title="Rules & versions" intro="RR-C5 V1.2 is the immutable official baseline. New versions start as EXPERIMENTAL drafts, run only in the sandbox, and need explicit administrator approval before they are used for official runs. Historical runs are never changed." />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 300px) minmax(0, 1fr)' }}>
        <aside className="card" style={{ alignSelf: 'start' }}>
          <h3>Versions</h3>
          <ul className="list-plain">
            {[...sets, ...(draft && !sets.some((s) => ruleKey(s) === ruleKey(draft)) ? [draft] : [])].map((r) => (
              <li key={ruleKey(r)}>
                <button className={`btn ${ruleKey(r) === selKey ? '' : 'ghost'} sm`} style={{ width: '100%', justifyContent: 'space-between' }} aria-pressed={ruleKey(r) === selKey} onClick={() => { setSelKey(ruleKey(r)); setSandbox(null); }}>
                  <span>{ruleKey(r)}{ruleKey(r) === st.activeRuleKey ? ' · active' : ''}</span>
                  <span className={`tag ${lifeTag(r)}`}>{r.lifecycle}</span>
                </button>
              </li>
            ))}
          </ul>
          <hr />
          <div className="field">
            <label htmlFor="nv">New draft version from {ruleKey(sel)}</label>
            <div className="row"><input id="nv" className="input" style={{ flex: 1 }} value={newVersion} onChange={(e) => setNewVersion(e.target.value)} /><button className="btn sm" onClick={startDraft}>Create</button></div>
          </div>
        </aside>

        <section className="stack" style={{ minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>{view.name}</h2>
                <div className="row" style={{ gap: 6 }}>
                  <span className={`tag ${lifeTag(view)}`}>{view.lifecycle}</span><span className="tag">{view.state}</span>
                  {ruleKey(view) === BASELINE_KEY && <span className="tag ink"><I.lock width={12} height={12} /> immutable baseline</span>}
                  {view.basedOn && <span className="muted">based on {view.basedOn}</span>}
                </div>
              </div>
              <div className="btn-row">
                {editing && <button className="btn" onClick={save}>Save draft</button>}
                {view.lifecycle === 'EXPERIMENTAL' && !editing && st.ruleSets.some((r) => ruleKey(r) === ruleKey(view)) && <button className="btn" onClick={() => setApprove(true)} disabled={errors.length > 0}>Approve & activate…</button>}
                {view.lifecycle === 'USER' && view.state === 'ACTIVE' && <button className="btn ghost" onClick={async () => { await st.deactivateRule(ruleKey(view), 'Deactivated from the rules page'); toast(`Deactivated; ${BASELINE_KEY} is active.`); }}>Deactivate</button>}
                <button className="btn ghost" disabled={!out || errors.length > 0} onClick={() => { const r = st.sandbox(view); setSandbox(r); if (r) toast('Sandbox run finished (not stored as an official run).'); }}><I.play /> Test in sandbox</button>
              </div>
            </div>
            {view.approvedBy && <p className="muted">Approved by {view.approvedBy} on {view.approvedAt?.slice(0, 10)} — {view.approvalReason}</p>}
            <p>{view.description}</p>
            {errors.length > 0 && <Notice kind="err"><strong>Invalid:</strong> <ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Notice>}
            {ruleKey(view) !== BASELINE_KEY && (conflicts.decisions.length > 0 || conflicts.parameters.length > 0) && (
              <Notice kind="warn"><strong>Conflicts with the official RR-C5 V1.2 baseline:</strong>
                <ul style={{ margin: 0, paddingLeft: 18 }}>{conflicts.parameters.map((p) => <li key={p}>{p}</li>)}{conflicts.decisions.map((c) => <li key={c.description}>{c.description}</li>)}</ul>
              </Notice>
            )}
          </div>

          <div className="card">
            <h3>Parameters</h3>
            <div className="grid g-2">
              <div className="field"><label htmlFor="p-asof">As-of date</label><input id="p-asof" className="input" value={view.parameters.asOf} disabled={!canEdit} onChange={(e) => edit((d) => { d.parameters.asOf = e.target.value; })} /></div>
              <div className="field"><label htmlFor="p-thr">Indemnity threshold (BHD)</label><input id="p-thr" className="input" inputMode="numeric" value={view.parameters.indemnityThresholdBhd} disabled={!canEdit} onChange={(e) => edit((d) => { d.parameters.indemnityThresholdBhd = Number(e.target.value.replace(/[, ]/g, '')); })} /></div>
              <div className="field"><label htmlFor="p-suf">Legal suffixes (§2 step 4)</label><input id="p-suf" className="input" value={view.parameters.legalSuffixes.join(', ')} disabled={!canEdit} onChange={(e) => edit((d) => { d.parameters.legalSuffixes = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); })} /></div>
              <div className="field"><label htmlFor="p-app">Approved status value</label><input id="p-app" className="input" value={view.parameters.approvedStatusValue} disabled={!canEdit} onChange={(e) => edit((d) => { d.parameters.approvedStatusValue = e.target.value; })} /></div>
            </div>
            <p className="muted" style={{ fontSize: '.84rem', marginTop: 10 }}>The fact vocabulary is closed: only NEVER ASSESSED, SINGLE SOURCE, INDEMNITY GAP and the indemnity position can be used, and only the four official statuses can be outcomes.</p>
          </div>

          <div className="card">
            <div className="card-head"><h3>Decision table (§6) — first matching row by priority</h3>{canEdit && <button className="btn ghost sm" onClick={() => edit((d) => { d.decisionTable.push({ id: `ROW-${d.decisionTable.length + 1}`, priority: d.decisionTable.length + 1, label: 'New row', when: { fact: 'neverAssessed', is: true }, outcome: 'AMBER', evidenceRequired: [] }); })}>Add row</button>}</div>
            <div className="stack">
              {[...view.decisionTable].sort((a, b) => a.priority - b.priority).map((row) => (
                <RowEditor key={row.id} row={row} disabled={!canEdit}
                  onChange={(next) => edit((d) => { d.decisionTable = d.decisionTable.map((r) => (r.id === row.id ? next : r)); })}
                  onDelete={() => edit((d) => { d.decisionTable = d.decisionTable.filter((r) => r.id !== row.id); })} />
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Compare versions — every fact combination</h3>
              <select className="input" style={{ maxWidth: 260 }} aria-label="Compare with" value={cmp} onChange={(e) => setCmp(e.target.value)}>{sets.map((r) => <option key={ruleKey(r)} value={ruleKey(r)}>{ruleKey(r)}</option>)}</select>
            </div>
            <div className="table-wrap"><table className="data cards" data-testid="rule-compare">
              <thead><tr><th>Facts</th><th>{ruleKey(view)}</th><th>{ruleKey(other)}</th></tr></thead>
              <tbody>{allFactCombinations().map((f) => {
                const x = decide(view, f)?.outcome ?? 'NO ROW', y = decide(other, f)?.outcome ?? 'NO ROW';
                return <tr key={describeFacts(f)} style={x !== y ? { background: 'var(--st-amber-bg)' } : undefined}><td data-label="Facts" style={{ fontSize: '.84rem' }}>{describeFacts(f)}</td><td data-label={ruleKey(view)}><StatusBadge status={x} /></td><td data-label={ruleKey(other)}><StatusBadge status={y} /></td></tr>;
              })}</tbody>
            </table></div>
          </div>

          {sandbox && out && (
            <div className="card" data-testid="sandbox-result">
              <div className="card-head"><h3>Sandbox: {ruleKey(view)} vs current run ({out.ruleSetId} V{out.ruleSetVersion})</h3><span className="tag experimental">not an official result</span></div>
              <SandboxDiff before={out} after={sandbox} />
            </div>
          )}
        </section>
      </div>
      {approve && <ApproveDialog rs={view} conflicts={conflicts.decisions.length + conflicts.parameters.length} onClose={() => setApprove(false)} />}
    </div>
  );
}

function SandboxDiff({ before, after }: { before: AssessmentOutput; after: AssessmentOutput }) {
  const d = diffRuns(before, after);
  if (!d.suppliers.length) return <p>No supplier would change.</p>;
  return (
    <div className="table-wrap"><table className="data cards">
      <thead><tr><th>Supplier</th><th>Field</th><th>Current</th><th>Under draft</th></tr></thead>
      <tbody>{d.suppliers.flatMap((s) => s.changes.map((c, i) => <tr key={s.supplierId + i}><td data-label="Supplier">{s.supplierId}</td><td data-label="Field">{c.field}</td><td data-label="Current" className="diff-before">{c.before}</td><td data-label="Under draft" className="diff-after">{c.after}</td></tr>))}</tbody>
    </table></div>
  );
}

function RowEditor({ row, disabled, onChange, onDelete }: { row: DecisionRow; disabled: boolean; onChange: (r: DecisionRow) => void; onDelete: () => void }) {
  const [json, setJson] = useState(JSON.stringify(row.when));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="ev record" style={{ borderLeftColor: 'var(--brass)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 8 }}><span className="tag">{row.id}</span><span className="muted">priority {row.priority}</span><StatusBadge status={row.outcome} /></div>
        {!disabled && <button className="btn ghost sm" onClick={onDelete}>Remove</button>}
      </div>
      <p style={{ margin: '8px 0 4px', fontWeight: 650 }}>{row.label}</p>
      <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>When: {describeCondition(row.when)}</p>
      {!disabled && (
        <div className="grid g-3" style={{ marginTop: 10 }}>
          <div className="field"><label>Priority</label><input className="input" type="number" value={row.priority} onChange={(e) => onChange({ ...row, priority: Number(e.target.value) })} /></div>
          <div className="field"><label>Outcome</label><select className="input" value={row.outcome} onChange={(e) => onChange({ ...row, outcome: e.target.value as Status })}>{OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label>Label</label><input className="input" value={row.label} onChange={(e) => onChange({ ...row, label: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Condition (JSON: all / any / not / fact)</label>
            <input className="input mono" value={json} onChange={(e) => { setJson(e.target.value); try { const c = JSON.parse(e.target.value) as Condition; setErr(null); onChange({ ...row, when: c }); } catch { setErr('Not valid JSON yet.'); } }} />
            {err && <span className="muted">{err}</span>}
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Evidence required</label>
            <div className="row">{(['NEVER ASSESSED', 'SINGLE SOURCE', 'INDEMNITY GAP', 'INDEMNITY POSITION'] as const).map((k) => (
              <label key={k} className="check"><input type="checkbox" checked={row.evidenceRequired.includes(k)} onChange={(e) => onChange({ ...row, evidenceRequired: e.target.checked ? [...row.evidenceRequired, k] : row.evidenceRequired.filter((x) => x !== k) })} /> {k}</label>
            ))}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApproveDialog({ rs, conflicts, onClose }: { rs: RuleSet; conflicts: number; onClose: () => void }) {
  const approveRule = useStore((s) => s.approveRule);
  const actor = useStore((s) => s.actor);
  const [approver, setApprover] = useState(actor === 'Anonymous reviewer' ? '' : actor);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog title={`Approve ${ruleKey(rs)}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        try { await approveRule(ruleKey(rs), approver, typed, reason, ack); toast(`${ruleKey(rs)} approved and active. A new run was recorded; earlier runs are unchanged.`); onClose(); } catch (x) { setErr((x as Error).message); }
      }}>
        <Notice kind="warn">Approving adopts a new policy version for all future official runs in this browser. RR-C5 V1.2 stays available and unchanged. This is a recorded workflow gate, not a security control: the site has no login.</Notice>
        {err && <Notice kind="err">{err}</Notice>}
        <div className="field"><label htmlFor="ap-n">Administrator name</label><input id="ap-n" className="input" value={approver} onChange={(e) => setApprover(e.target.value)} required /></div>
        <div className="field"><label htmlFor="ap-r">Reason for adopting this version</label><textarea id="ap-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required /></div>
        {conflicts > 0 && <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have reviewed the {conflicts} conflict(s) with the official baseline.</label>}
        <div className="field"><label htmlFor="ap-t">Type <strong className="mono">{approvalPhrase(rs)}</strong> to confirm</label><input id="ap-t" className="input mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></div>
        <div className="btn-row"><button className="btn" type="submit" disabled={typed.trim() !== approvalPhrase(rs)}>Approve & activate</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Dialog>
  );
}
