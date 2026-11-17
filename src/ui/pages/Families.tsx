import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useOutput } from '../../state/store';
import { AwaitingData, PageHead } from '../components/common';
import { EvidenceList } from '../components/Evidence';
import { StatusBadge } from '../components/Status';

export function Families() {
  const out = useOutput();
  const [sp, setSp] = useSearchParams();
  if (!out) return (<><PageHead eyebrow="Risk · §4.2" title="Part families" /><AwaitingData what="the part-family analysis" /></>);
  const view = sp.get('zero') === '1' ? 'zero' : sp.get('ss') === '1' ? 'ss' : 'all';
  const list = out.families.filter((f) => (view === 'zero' ? f.noQualifiedSupplier : view === 'ss' ? f.singleSource === true : true));
  const setView = (v: string) => setSp(v === 'all' ? {} : v === 'zero' ? { zero: '1' } : { ss: '1' }, { replace: true });
  return (
    <div className="stack">
      <PageHead eyebrow="Risk · RR-C5 §4.2" title="Part families" intro="SINGLE SOURCE is decided per part family: exactly one qualified approved supplier. A family with no qualified supplier is a finding, not a flag on any supplier." />
      <div className="segmented" role="group" aria-label="Filter families">
        {[['all', `All (${out.families.length})`], ['ss', `Single source (${out.summary.singleSourceFamilies})`], ['zero', `No qualified supplier (${out.summary.familiesWithoutQualified})`]].map(([k, l]) => (
          <button key={k} aria-pressed={view === k} onClick={() => setView(k!)}>{l}</button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data cards" data-testid="family-table">
          <thead><tr><th>Part family</th><th>Suppliers listed</th><th className="num">Qualified</th><th>Finding</th></tr></thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.family}>
                <td data-label="Part family" className="cell-strong"><Link to={`/families/${encodeURIComponent(f.family)}`}>{f.family}</Link></td>
                <td data-label="Suppliers">{f.suppliers.map((s) => <Link key={s.supplierId} to={`/suppliers/${s.supplierId}`} className={`tag${s.qualified === false ? ' ink' : ''}`} style={{ marginRight: 4, textDecoration: 'none' }} title={s.basis}>{s.supplierId}{s.qualified === false ? ' ✕' : ''}</Link>)}</td>
                <td data-label="Qualified" className="num cell-strong">{String(f.qualifiedCount)}</td>
                <td data-label="Finding">{f.singleSource === true ? <span className="flag">SINGLE SOURCE</span> : f.noQualifiedSupplier ? <span className="tag ink">NO QUALIFIED SUPPLIER</span> : f.singleSource === 'UNDETERMINED' ? <span className="flag und">CANNOT DETERMINE</span> : <span className="muted">{f.qualifiedCount} qualified</span>}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={4} className="muted">No family in this view.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FamilyDetail() {
  const { name = '' } = useParams();
  const out = useOutput();
  if (!out) return (<><PageHead title="Part family" /><AwaitingData /></>);
  const f = out.families.find((x) => x.family.toLowerCase() === decodeURIComponent(name).toLowerCase());
  if (!f) return (<><PageHead title="Part family not found" /><Link to="/families">Back to part families</Link></>);
  return (
    <div className="stack">
      <PageHead eyebrow="Part family" title={f.family} actions={<Link className="btn ghost" to="/families">All families</Link>} />
      <div className={`card${f.singleSource === true || f.noQualifiedSupplier ? ' ink' : ''}`}>
        <h2 style={{ fontSize: '1.2rem' }}>{f.qualifiedCount} qualified of {f.suppliers.length} listed</h2>
        <p style={{ margin: 0 }}>{f.finding}</p>
      </div>
      {f.suppliers.map((s) => {
        const row = out.scorecard.find((r) => r.supplierId === s.supplierId)!;
        return (
          <div key={s.supplierId} className="card">
            <div className="card-head">
              <h3><Link to={`/suppliers/${s.supplierId}`}>{s.supplierId} · {s.supplierName}</Link></h3>
              <div className="row"><span className={`tag${s.qualified === true ? '' : ' ink'}`}>{s.qualified === true ? 'QUALIFIED' : s.qualified === false ? 'NOT QUALIFIED' : 'CANNOT DETERMINE'} · {s.basis}</span><StatusBadge status={row.status} /></div>
            </div>
            <EvidenceList items={s.evidence} />
          </div>
        );
      })}
    </div>
  );
}
