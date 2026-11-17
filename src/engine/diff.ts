import type { AssessmentOutput, FlagName } from './types';

export interface SupplierChange {
  supplierId: string;
  supplierName: string;
  changes: { field: string; before: string; after: string }[];
}

const flagState = (v: boolean | 'UNDETERMINED') => (v === 'UNDETERMINED' ? 'UNDETERMINED' : v ? 'Y' : 'N');

/** Field-level differences between two runs (what changed since the last scorecard). */
export function diffRuns(before: AssessmentOutput, after: AssessmentOutput): { suppliers: SupplierChange[]; added: string[]; removed: string[]; memosAdded: string[]; memosRemoved: string[] } {
  const b = new Map(before.scorecard.map((r) => [r.supplierId, r]));
  const a = new Map(after.scorecard.map((r) => [r.supplierId, r]));
  const suppliers: SupplierChange[] = [];
  for (const [id, ra] of a) {
    const rb = b.get(id);
    if (!rb) continue;
    const changes: SupplierChange['changes'] = [];
    if (rb.status !== ra.status) changes.push({ field: 'status', before: rb.status, after: ra.status });
    for (const f of Object.keys(ra.flags) as FlagName[]) {
      const x = flagState(rb.flags[f].raised), y = flagState(ra.flags[f].raised);
      if (x !== y) changes.push({ field: f, before: x, after: y });
    }
    if (rb.indemnity.position !== ra.indemnity.position) changes.push({ field: 'indemnity', before: rb.indemnity.position, after: ra.indemnity.position });
    const gb = rb.indemnity.governing?.memoId ?? '—', ga = ra.indemnity.governing?.memoId ?? '—';
    if (gb !== ga) changes.push({ field: 'indemnity source', before: gb, after: ga });
    const cb = before.coverage.find((c) => c.supplierId === id)?.memosLabel ?? '', ca = after.coverage.find((c) => c.supplierId === id)?.memosLabel ?? '';
    if (cb !== ca) changes.push({ field: 'memos', before: cb, after: ca });
    if (changes.length) suppliers.push({ supplierId: id, supplierName: ra.supplierName, changes });
  }
  const memB = new Set(before.coverageRecord.memosRead), memA = new Set(after.coverageRecord.memosRead);
  return {
    suppliers,
    added: [...a.keys()].filter((k) => !b.has(k)),
    removed: [...b.keys()].filter((k) => !a.has(k)),
    memosAdded: [...memA].filter((m) => !memB.has(m)),
    memosRemoved: [...memB].filter((m) => !memA.has(m)),
  };
}
