import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../state/store';
import { listAudit } from '../../storage/db';
import { verifyChain, type AuditEntry } from '../../audit/audit';
import { fmtDate, Notice, PageHead, short } from '../components/common';

export default function Audit() {
  const count = useStore((s) => s.audit.count);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { listAudit().then(setEntries); }, [count]);
  const check = useMemo(() => verifyChain(entries), [entries]);
  const actions = [...new Set(entries.map((e) => e.action))].sort();
  const list = [...entries].reverse().filter((e) => (!action || e.action === action) && (!q || `${e.actor} ${e.ref} ${e.reason}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="stack">
      <PageHead eyebrow="Governance" title="Audit trail" intro="Append-only record of every import, run, review decision and rule change: who, when, what, the previous and new values, the reason and the reference." actions={<Link className="btn ghost" to="/reports?r=audit">Export audit report</Link>} />
      {check.ok ? <Notice kind="ok">Hash chain intact: {check.checked} entries verified (SHA-256, each entry linked to the previous one).</Notice> : <Notice kind="err">Hash chain BROKEN at entry {check.brokenAt}: {check.problem}</Notice>}
      <div className="filters" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="field"><label htmlFor="a-q">Search actor, reference or reason</label><input id="a-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="field"><label htmlFor="a-a">Action</label><select id="a-a" className="input" value={action} onChange={(e) => setAction(e.target.value)}><option value="">All</option>{actions.map((a) => <option key={a}>{a}</option>)}</select></div>
      </div>
      <div className="table-wrap"><table className="data cards" data-testid="audit-table">
        <thead><tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Reference</th><th>Reason</th><th>Hash</th><th /></tr></thead>
        <tbody>{list.map((e) => (
          <Fragment key={e.seq}>
            <tr>
              <td data-label="#">{e.seq}</td><td data-label="When">{fmtDate(e.at)}</td><td data-label="Actor">{e.actor}</td><td data-label="Action"><span className="tag">{e.action}</span></td>
              <td data-label="Reference" className="mono" style={{ fontSize: '.8rem', overflowWrap: 'anywhere' }}>{e.ref}</td><td data-label="Reason">{e.reason}</td><td data-label="Hash" className="mono" style={{ fontSize: '.78rem' }}>{short(e.hash, 12)}</td>
              <td data-label="Values"><button className="btn ghost sm" aria-expanded={open === e.seq} onClick={() => setOpen(open === e.seq ? null : e.seq)}>{open === e.seq ? 'Hide' : 'Values'}</button></td>
            </tr>
            {open === e.seq && (
              <tr><td colSpan={8}>
                <div className="grid g-2">
                  <div><span className="eyebrow">Previous value</span><pre className="memo-body" style={{ fontSize: '.78rem', maxHeight: 260, overflow: 'auto' }}>{JSON.stringify(e.before, null, 2)}</pre></div>
                  <div><span className="eyebrow">New value</span><pre className="memo-body" style={{ fontSize: '.78rem', maxHeight: 260, overflow: 'auto' }}>{JSON.stringify(e.after, null, 2)}</pre></div>
                </div>
                <p className="mono muted" style={{ fontSize: '.76rem' }}>prev {e.prevHash}<br />hash {e.hash}</p>
              </td></tr>
            )}
          </Fragment>
        ))}</tbody>
      </table></div>
      {entries.length === 0 && <p className="muted">No audit entries yet.</p>}
    </div>
  );
}
