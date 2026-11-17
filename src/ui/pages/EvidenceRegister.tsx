import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOutput } from '../../state/store';
import type { FlagName } from '../../engine/types';
import { AwaitingData, PageHead } from '../components/common';
import { EvidenceList } from '../components/Evidence';
import { StatusBadge } from '../components/Status';

/** Every raised flag (and every undeterminable indemnity) with the evidence it rests on — the "trace five flags" view. */
export default function EvidenceRegister() {
  const out = useOutput();
  const [kind, setKind] = useState<'all' | FlagName | 'CD'>('all');
  const items = useMemo(() => {
    if (!out) return [];
    const list: { key: string; supplierId: string; name: string; status: string; title: string; explanation: string; evidence: Parameters<typeof EvidenceList>[0]['items']; k: string }[] = [];
    for (const r of out.scorecard) {
      for (const f of Object.values(r.flags)) if (f.raised === true) list.push({ key: `${r.supplierId}-${f.flag}`, supplierId: r.supplierId, name: r.supplierName, status: r.status, title: f.flag, explanation: f.explanation, evidence: f.evidence, k: f.flag });
      if (r.indemnity.position === 'CANNOT DETERMINE') list.push({ key: `${r.supplierId}-icd`, supplierId: r.supplierId, name: r.supplierName, status: r.status, title: 'INDEMNITY: CANNOT DETERMINE', explanation: r.indemnity.explanation, evidence: r.indemnity.evidence, k: 'CD' });
    }
    return list.filter((i) => kind === 'all' || i.k === kind);
  }, [out, kind]);
  if (!out) return (<><PageHead eyebrow="Evidence" title="Evidence register" /><AwaitingData what="the evidence register" /></>);
  return (
    <div className="stack">
      <PageHead eyebrow="RR-C5 §1 · evidence" title="Evidence register" intro="Every flag with the quotation, record row or stated search scope it rests on, so a second person can check it against the source." />
      <div className="segmented" role="group" aria-label="Filter evidence">
        {(['all', 'NEVER ASSESSED', 'SINGLE SOURCE', 'INDEMNITY GAP', 'CD'] as const).map((k) => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k === 'CD' ? 'Indemnity undetermined' : k}</button>
        ))}
      </div>
      <p className="muted" aria-live="polite">{items.length} item(s)</p>
      {items.map((i) => (
        <article key={i.key} className="card" data-evidence-item={i.key}>
          <div className="card-head">
            <h3><Link to={`/suppliers/${i.supplierId}`}>{i.supplierId} · {i.name}</Link> — {i.title}</h3>
            <StatusBadge status={i.status} />
          </div>
          <p>{i.explanation}</p>
          <EvidenceList items={i.evidence} />
        </article>
      ))}
    </div>
  );
}
