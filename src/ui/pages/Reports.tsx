import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOutput, useStore } from '../../state/store';
import { listAudit } from '../../storage/db';
import type { AuditEntry } from '../../audit/audit';
import { auditTable, coverageRecordTable, coverageTable, evidenceTable, executiveTable, familyTable, riskRegisterTable, scorecardTable, unmatchedTable, type ReportTable } from '../../reports/tables';
import { exportCsv, exportPdf, exportXlsx } from '../../reports/export';
import { AwaitingData, PageHead } from '../components/common';
import { I } from '../components/icons';
import { toast } from '../components/Toast';

const DEFS = [
  { id: 'executive', label: 'Executive summary' },
  { id: 'scorecard', label: 'Supplier scorecard (all)' },
  { id: 'scorecard-supplier', label: 'Individual supplier scorecard' },
  { id: 'risk-register', label: 'Risk register' },
  { id: 'families', label: 'Part-family report' },
  { id: 'coverage', label: 'Source coverage' },
  { id: 'coverage-record', label: 'Coverage record (what was read)' },
  { id: 'unmatched', label: 'Unmatched memos' },
  { id: 'evidence', label: 'Evidence report' },
  { id: 'audit', label: 'Audit report' },
] as const;

export default function Reports() {
  const out = useOutput();
  const auditCheck = useStore((s) => s.audit);
  const [sp, setSp] = useSearchParams();
  const sel = sp.get('r') ?? 'executive';
  const [supplier, setSupplier] = useState(sp.get('id') ?? 'SUP-01');
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (sel === 'audit') listAudit().then(setAudit); }, [sel, auditCheck.count]);
  const table: ReportTable | null = useMemo(() => {
    if (sel === 'audit') return auditTable(audit, auditCheck.check.ok);
    if (!out) return null;
    switch (sel) {
      case 'scorecard': return scorecardTable(out);
      case 'scorecard-supplier': return scorecardTable(out, supplier);
      case 'risk-register': return riskRegisterTable(out);
      case 'families': return familyTable(out);
      case 'coverage': return coverageTable(out);
      case 'coverage-record': return coverageRecordTable(out);
      case 'unmatched': return unmatchedTable(out);
      case 'evidence': return evidenceTable(out);
      default: return executiveTable(out);
    }
  }, [sel, out, supplier, audit, auditCheck.check.ok]);

  async function run(kind: 'csv' | 'xlsx' | 'pdf') {
    if (!table) return;
    setBusy(kind);
    try {
      if (kind === 'csv') exportCsv(table);
      else if (kind === 'xlsx') await exportXlsx(table);
      else await exportPdf(table);
      toast(`${table.title} exported as ${kind.toUpperCase()}.`);
    } catch (e) { toast(`Export failed: ${(e as Error).message}`, 'err'); }
    finally { setBusy(null); }
  }

  if (!out && sel !== 'audit') return (<><PageHead eyebrow="Governance" title="Reports & exports" /><AwaitingData what="reporting" /></>);
  return (
    <div className="stack">
      <PageHead eyebrow="Governance" title="Reports & exports" intro="Every report comes from the current stored run and carries its rule version and fingerprints. Exports are generated in this browser." />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)' }}>
        <nav className="card" aria-label="Reports" style={{ alignSelf: 'start' }}>
          <ul className="list-plain">
            {DEFS.map((d) => (
              <li key={d.id}><button className={`btn ${sel === d.id ? '' : 'ghost'} sm`} style={{ width: '100%', justifyContent: 'flex-start' }} aria-pressed={sel === d.id} onClick={() => setSp(d.id === 'scorecard-supplier' ? { r: d.id, id: supplier } : { r: d.id }, { replace: true })}>{d.label}</button></li>
            ))}
          </ul>
        </nav>
        {table && (
          <section className="card" aria-labelledby="rep-title" style={{ minWidth: 0 }}>
            <div className="card-head">
              <div><h2 id="rep-title">{table.title}</h2><p className="muted" style={{ margin: 0, fontSize: '.84rem' }}>{table.subtitle}</p></div>
              <div className="btn-row">
                <button className="btn sm" onClick={() => run('csv')} disabled={!!busy} data-export="csv"><I.download /> CSV</button>
                <button className="btn sm" onClick={() => run('xlsx')} disabled={!!busy} data-export="xlsx"><I.download /> Excel</button>
                <button className="btn sm" onClick={() => run('pdf')} disabled={!!busy} data-export="pdf"><I.download /> PDF</button>
              </div>
            </div>
            {sel === 'scorecard-supplier' && out && (
              <div className="field" style={{ maxWidth: 360, marginBottom: 12 }}>
                <label htmlFor="rep-sup">Supplier</label>
                <select id="rep-sup" className="input" value={supplier} onChange={(e) => { setSupplier(e.target.value); setSp({ r: sel, id: e.target.value }, { replace: true }); }}>
                  {out.scorecard.map((r) => <option key={r.supplierId} value={r.supplierId}>{r.supplierId} · {r.supplierName}</option>)}
                </select>
              </div>
            )}
            <p className="muted" style={{ fontSize: '.84rem' }}>{table.rows.length} row(s){table.rows.length > 60 ? ' — preview shows the first 60' : ''}</p>
            <div className="table-wrap" style={{ maxHeight: 560 }}>
              <table className="data" data-testid="report-preview">
                <thead><tr>{table.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>{table.rows.slice(0, 60).map((r, i) => <tr key={i}>{table.columns.map((c) => <td key={c.key} style={{ minWidth: (c.width ?? 12) > 40 ? 320 : undefined, fontSize: '.84rem' }}>{String(r[c.key] ?? '')}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
