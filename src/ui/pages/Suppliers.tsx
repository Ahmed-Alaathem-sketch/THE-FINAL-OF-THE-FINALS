import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOutput } from '../../state/store';
import type { ScorecardRow } from '../../engine/types';
import { AwaitingData, PageHead, STATUS_ORDER, useSort } from '../components/common';
import { FlagChip, Indemnity, StatusBadge } from '../components/Status';

export default function Suppliers() {
  const out = useOutput();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const status = sp.get('status') ?? '';
  const flag = sp.get('flag') ?? '';
  const family = sp.get('family') ?? '';
  const coverage = sp.get('coverage') ?? '';
  const indemnity = sp.get('indemnity') ?? '';
  // Read the live URL: router updates are transitions, so the hook value can lag behind rapid input.
  const set = (k: string, v: string) => { const n = new URLSearchParams(window.location.search); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };

  const coverageById = useMemo(() => new Map(out?.coverage.map((c) => [c.supplierId, c]) ?? []), [out]);
  const rows = useMemo(() => {
    if (!out) return [];
    const needle = q.trim().toLowerCase();
    return out.scorecard.filter((r) => {
      if (needle && !`${r.supplierId} ${r.supplierName} ${r.partFamilies.join(' ')}`.toLowerCase().includes(needle)) return false;
      if (status && r.status !== status) return false;
      if (flag && r.flags[flag as keyof ScorecardRow['flags']]?.raised !== true) return false;
      if (family && !r.partFamilies.some((f) => f.toLowerCase() === family.toLowerCase())) return false;
      if (indemnity && r.indemnity.position !== indemnity) return false;
      const cov = coverageById.get(r.supplierId);
      if (coverage === 'nomemo' && cov?.memoIds.length) return false;
      if (coverage === 'memo' && !cov?.memoIds.length) return false;
      if (sp.get('approved') === '1' && r.approvalStatus !== 'APPROVED') return false;
      return true;
    });
  }, [out, q, status, flag, family, indemnity, coverage, coverageById, sp]);
  const get = useCallback((r: ScorecardRow, k: string): string | number => (k === 'status' ? STATUS_ORDER[r.status] ?? 9 : k === 'name' ? r.supplierName : k === 'indemnity' ? r.indemnity.position : k === 'band' ? r.spendBand : r.supplierId), []);
  const { sorted, header } = useSort(rows, { key: 'id', dir: 'asc' }, get);

  if (!out) return (<><PageHead eyebrow="Risk" title="Supplier directory" /><AwaitingData what="the supplier directory" /></>);
  const families = out.families.map((f) => f.family);
  const active = [q, status, flag, family, coverage, indemnity, sp.get('approved')].some(Boolean);

  return (
    <div className="stack">
      <PageHead eyebrow="Risk · RR-C5 §6 scorecard" title="Supplier directory" intro="One row per supplier in the master. Select a supplier for its full profile, or a flag to jump to its evidence." />
      <div className="card">
        <div className="filters" role="search">
          <div className="field">
            <label htmlFor="f-q">Search</label>
            <input id="f-q" className="input" value={q} placeholder="ID, name or part family" onChange={(e) => set('q', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-status">Status</label>
            <select id="f-status" className="input" value={status} onChange={(e) => set('status', e.target.value)}>
              <option value="">All statuses</option>
              {['RED', 'AMBER', 'CANNOT DETERMINE', 'GREEN'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-flag">Flag</label>
            <select id="f-flag" className="input" value={flag} onChange={(e) => set('flag', e.target.value)}>
              <option value="">Any</option>
              {['NEVER ASSESSED', 'SINGLE SOURCE', 'INDEMNITY GAP'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-fam">Part family</label>
            <select id="f-fam" className="input" value={family} onChange={(e) => set('family', e.target.value)}>
              <option value="">All families</option>
              {families.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-cov">Coverage</label>
            <select id="f-cov" className="input" value={coverage} onChange={(e) => set('coverage', e.target.value)}>
              <option value="">Any</option>
              <option value="memo">Has memo(s)</option>
              <option value="nomemo">NO MEMO</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="muted" aria-live="polite" data-testid="result-count">{sorted.length} of {out.scorecard.length} suppliers{indemnity ? ` · indemnity ${indemnity}` : ''}</span>
          {active && <button className="btn ghost sm" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Clear filters</button>}
        </div>
        <div className="table-wrap">
          <table className="data cards" data-testid="supplier-table">
            <thead>
              <tr>
                {header('id', 'ID')}
                {header('name', 'Supplier')}
                <th>Part families</th>
                <th>Flags</th>
                {header('indemnity', 'Indemnity')}
                <th>Coverage</th>
                {header('status', 'Status')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const cov = coverageById.get(r.supplierId)!;
                return (
                  <tr key={r.supplierId} data-supplier={r.supplierId}>
                    <td data-label="ID" className="cell-strong"><Link to={`/suppliers/${r.supplierId}`}>{r.supplierId}</Link></td>
                    <td data-label="Supplier"><Link to={`/suppliers/${r.supplierId}`}>{r.supplierName}</Link><div className="muted" style={{ fontSize: '.78rem' }}>Spend band {r.spendBand || '—'} · {r.approvalStatus || 'NOT STATED'}</div></td>
                    <td data-label="Part families">{r.partFamilies.map((f) => <Link key={f} className="tag" to={`/families/${encodeURIComponent(f)}`} style={{ marginRight: 4, textDecoration: 'none' }}>{f}</Link>)}</td>
                    <td data-label="Flags"><div className="row" style={{ gap: 4 }}>
                      {Object.values(r.flags).filter((f) => f.raised !== false).map((f) => <FlagChip key={f.flag} flag={f} to={`/suppliers/${r.supplierId}#flag-${f.flag.replace(/ /g, '-')}`} />)}
                      {Object.values(r.flags).every((f) => f.raised === false) && <span className="muted">none</span>}
                    </div></td>
                    <td data-label="Indemnity"><Indemnity position={r.indemnity.position} />{r.indemnity.governing && <div className="muted" style={{ fontSize: '.78rem' }}>{r.indemnity.governing.memoId}</div>}</td>
                    <td data-label="Coverage" style={{ fontSize: '.84rem' }}>{cov.memosLabel}<div className="muted">log: {cov.hasLogRow ? 'yes' : 'no'}</div></td>
                    <td data-label="Status"><StatusBadge status={r.status} /></td>
                  </tr>
                );
              })}
              {sorted.length === 0 && <tr><td colSpan={7} className="muted">No supplier matches these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
