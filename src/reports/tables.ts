import type { AuditEntry } from '../audit/audit';
import type { AssessmentOutput, Evidence, FlagResult } from '../engine/types';

export interface ReportTable {
  id: string;
  title: string;
  subtitle: string;
  columns: { key: string; label: string; width?: number }[];
  rows: Record<string, string | number>[];
}

export function describeEvidence(e: Evidence): string {
  if (e.kind === 'memo') return `${e.memoId} (${e.memoDate || 'date NOT STATED'}), sentence ${e.sentenceIndex + 1}: "${e.quote}"${e.reviewId ? ` [classified by review ${e.reviewId}]` : ''}`;
  if (e.kind === 'record') return `${e.file} row ${e.rowNumber} (line ${e.lineNumber}): ${e.relied.map((k) => `${k}=${e.fields[k] ?? ''}`).join('; ')}`;
  if (e.kind === 'absence') return e.scope;
  return `Review ${e.reviewId} by ${e.actor}: ${e.decision} — ${e.reason}`;
}

const ev = (f: FlagResult) => f.evidence.map(describeEvidence).join(' | ');
const yn = (f: FlagResult) => (f.raised === true ? 'Y' : f.raised === 'UNDETERMINED' ? 'CANNOT DETERMINE' : 'N');

function header(out: AssessmentOutput) {
  return `${out.ruleSetId} V${out.ruleSetVersion} · as of ${out.asOf} · run ${out.outputFingerprint.slice(0, 12)} · inputs ${out.inputFingerprint.slice(0, 12)}`;
}

/** Scorecard in the pack template's column layout (C5_SCORECARD_TEMPLATE.csv). */
export function scorecardTable(out: AssessmentOutput, onlyId?: string): ReportTable {
  return {
    id: onlyId ? 'scorecard-supplier' : 'scorecard',
    title: onlyId ? `Supplier scorecard — ${onlyId}` : 'Supplier scorecard',
    subtitle: header(out),
    columns: [
      { key: 'supplier_id', label: 'supplier_id', width: 10 }, { key: 'supplier_name', label: 'supplier_name', width: 26 }, { key: 'part_families', label: 'part_families', width: 18 },
      { key: 'single_source', label: 'single_source (Y/N)', width: 10 }, { key: 'single_source_evidence', label: 'single_source_evidence', width: 50 },
      { key: 'indemnity', label: 'indemnity (GAP / NO GAP / CANNOT DETERMINE)', width: 14 }, { key: 'indemnity_evidence', label: 'indemnity_evidence (memo ID + quotation)', width: 50 },
      { key: 'never_assessed', label: 'never_assessed (Y/N)', width: 10 }, { key: 'never_assessed_evidence', label: 'never_assessed_evidence + scope', width: 50 },
      { key: 'status', label: 'status (RED / AMBER / CANNOT DETERMINE / GREEN)', width: 14 }, { key: 'notes', label: 'notes', width: 50 },
    ],
    rows: out.scorecard.filter((r) => !onlyId || r.supplierId === onlyId).map((r) => ({
      supplier_id: r.supplierId, supplier_name: r.supplierName, part_families: r.partFamilies.join('; '),
      single_source: yn(r.flags['SINGLE SOURCE']), single_source_evidence: `${r.flags['SINGLE SOURCE'].explanation} ${ev(r.flags['SINGLE SOURCE'])}`.trim(),
      indemnity: r.indemnity.position, indemnity_evidence: `${r.indemnity.explanation} ${r.indemnity.evidence.map(describeEvidence).join(' | ')}`.trim(),
      never_assessed: yn(r.flags['NEVER ASSESSED']), never_assessed_evidence: `${r.flags['NEVER ASSESSED'].explanation} ${ev(r.flags['NEVER ASSESSED'])}`.trim(),
      status: r.status, notes: [r.statusExplanation, ...r.notes.map((n) => `${n.text} ${n.evidence.map(describeEvidence).join(' | ')}`), ...r.contradictions.map((c) => `Contradiction (${c.subject}): ${c.explanation} Governs: ${describeEvidence(c.governing)} Superseded: ${c.superseded.map(describeEvidence).join(' | ')}`)].join(' || '),
    })),
  };
}

export function riskRegisterTable(out: AssessmentOutput): ReportTable {
  const rows = out.scorecard.filter((r) => r.status !== 'GREEN').sort((a, b) => ['RED', 'AMBER', 'CANNOT DETERMINE'].indexOf(a.status) - ['RED', 'AMBER', 'CANNOT DETERMINE'].indexOf(b.status) || a.supplierId.localeCompare(b.supplierId));
  return {
    id: 'risk-register', title: 'Risk register', subtitle: `${header(out)} · owner and action are DRAFT — for approval; the tool assigns nobody`,
    columns: [{ key: 'status', label: 'Status', width: 14 }, { key: 'supplier', label: 'Supplier', width: 30 }, { key: 'flags', label: 'Flags', width: 26 }, { key: 'indemnity', label: 'Indemnity', width: 14 }, { key: 'why', label: 'Why (rule)', width: 50 }, { key: 'evidence', label: 'Evidence', width: 60 }, { key: 'owner', label: 'Human owner (DRAFT — for approval)', width: 20 }, { key: 'action', label: 'Decision / action (by a person)', width: 24 }],
    rows: rows.map((r) => ({
      status: r.status, supplier: `${r.supplierId} ${r.supplierName}`,
      flags: Object.values(r.flags).filter((f) => f.raised !== false).map((f) => (f.raised === true ? f.flag : `${f.flag}: CANNOT DETERMINE`)).join(', ') || 'none',
      indemnity: r.indemnity.position, why: r.statusExplanation,
      evidence: Object.values(r.flags).filter((f) => f.raised !== false).flatMap((f) => f.evidence.map(describeEvidence)).concat(r.indemnity.position === 'CANNOT DETERMINE' ? r.indemnity.evidence.map(describeEvidence) : []).join(' | '),
      owner: 'NOT STATED', action: 'NOT STATED',
    })),
  };
}

export function familyTable(out: AssessmentOutput): ReportTable {
  return {
    id: 'families', title: 'Part-family report', subtitle: header(out),
    columns: [{ key: 'family', label: 'Part family', width: 20 }, { key: 'listed', label: 'Suppliers listed', width: 30 }, { key: 'qualified', label: 'Qualified', width: 30 }, { key: 'count', label: 'Qualified count', width: 10 }, { key: 'finding', label: 'Finding', width: 60 }, { key: 'evidence', label: 'Evidence', width: 60 }],
    rows: out.families.map((f) => ({
      family: f.family, listed: f.suppliers.map((s) => s.supplierId).join('; '),
      qualified: f.suppliers.filter((s) => s.qualified === true).map((s) => s.supplierId).join('; ') || 'none',
      count: String(f.qualifiedCount), finding: f.finding,
      evidence: f.suppliers.flatMap((s) => s.evidence.filter((e) => e.kind === 'memo').map(describeEvidence)).join(' | ') || 'Master rows only (approved = qualified by default).',
    })),
  };
}

export function coverageTable(out: AssessmentOutput): ReportTable {
  return {
    id: 'coverage', title: 'Source coverage (§3 — not a risk)', subtitle: header(out),
    columns: [{ key: 'supplier_id', label: 'supplier_id', width: 10 }, { key: 'supplier_name', label: 'supplier_name', width: 28 }, { key: 'memos', label: 'memos_found (IDs or NO MEMO)', width: 22 }, { key: 'log', label: 'assessment_log_row (yes / no)', width: 12 }, { key: 'scope', label: 'scope searched', width: 40 }, { key: 'notes', label: 'notes', width: 50 }],
    rows: out.coverage.map((c) => ({ supplier_id: c.supplierId, supplier_name: c.supplierName, memos: c.memosLabel, log: c.hasLogRow ? `yes (line ${c.logRows.join(', ')})` : 'no', scope: c.scope, notes: c.notes.join(' ') })),
  };
}

export function coverageRecordTable(out: AssessmentOutput): ReportTable {
  const r = out.coverageRecord;
  const rows: Record<string, string | number>[] = r.files.map((f) => ({ item: f.name, kind: f.kind, detail: f.rowsRead !== undefined ? `${f.rowsRead} data rows read` : `${f.bytes} bytes`, sha256: f.sha256 }));
  for (const id of r.memosRead) {
    const m = out.memos.find((x) => x.memoId === id)!;
    rows.push({ item: id, kind: 'memo read', detail: `${r.memoSentenceCounts[id] ?? 0} sentences · ${m.fileName}${m.duplicateFiles.length ? ` (+ identical copy in ${m.duplicateFiles.join(', ')})` : ''}`, sha256: m.sha256 });
  }
  rows.push({ item: 'TOTAL', kind: 'summary', detail: `${r.memosRead.length} memos read${r.memosExpected ? ` of ${r.memosExpected} expected` : ''}; missing: ${r.memosMissing.join(', ') || 'none'}; ${r.masterRowsRead} master rows; ${r.logRowsRead} log rows`, sha256: out.inputFingerprint });
  return { id: 'coverage-record', title: 'Coverage record — what this run read', subtitle: header(out), columns: [{ key: 'item', label: 'Item', width: 26 }, { key: 'kind', label: 'Kind', width: 12 }, { key: 'detail', label: 'Detail', width: 60 }, { key: 'sha256', label: 'SHA-256', width: 66 }], rows };
}

export function unmatchedTable(out: AssessmentOutput): ReportTable {
  return {
    id: 'unmatched', title: 'Unmatched memos — CANNOT DETERMINE (MATCH)', subtitle: header(out),
    columns: [{ key: 'memo', label: 'Memo', width: 10 }, { key: 'written', label: 'Supplier (as written)', width: 28 }, { key: 'normalized', label: 'Normalised', width: 28 }, { key: 'reason', label: 'Reason', width: 60 }],
    rows: out.matches.filter((m) => m.outcome.kind !== 'MATCHED').map((m) => ({ memo: m.memoId, written: m.supplierAsWritten || 'NOT STATED', normalized: m.memoTrace.normalized, reason: m.outcome.kind === 'MATCHED' ? '' : m.outcome.reason })),
  };
}

export function evidenceTable(out: AssessmentOutput): ReportTable {
  const rows: Record<string, string | number>[] = [];
  for (const r of out.scorecard) {
    for (const f of Object.values(r.flags)) if (f.raised !== false) for (const e of f.evidence) rows.push({ supplier: r.supplierId, item: f.raised === true ? f.flag : `${f.flag}: CANNOT DETERMINE`, type: e.kind, evidence: describeEvidence(e) });
    for (const e of r.indemnity.evidence) rows.push({ supplier: r.supplierId, item: `INDEMNITY ${r.indemnity.position}`, type: e.kind, evidence: describeEvidence(e) });
  }
  return { id: 'evidence', title: 'Evidence report', subtitle: header(out), columns: [{ key: 'supplier', label: 'Supplier', width: 10 }, { key: 'item', label: 'Flag / position', width: 24 }, { key: 'type', label: 'Evidence type', width: 12 }, { key: 'evidence', label: 'Evidence', width: 90 }], rows };
}

export function auditTable(entries: AuditEntry[], chainOk: boolean): ReportTable {
  return {
    id: 'audit', title: 'Audit report', subtitle: `${entries.length} entries · hash chain ${chainOk ? 'intact' : 'BROKEN'}`,
    columns: [{ key: 'seq', label: '#', width: 6 }, { key: 'at', label: 'When (UTC)', width: 22 }, { key: 'actor', label: 'Actor', width: 18 }, { key: 'action', label: 'Action', width: 22 }, { key: 'ref', label: 'Reference', width: 24 }, { key: 'reason', label: 'Reason', width: 40 }, { key: 'before', label: 'Previous value', width: 40 }, { key: 'after', label: 'New value', width: 40 }, { key: 'hash', label: 'Hash', width: 66 }],
    rows: [...entries].sort((a, b) => a.seq - b.seq).map((e) => ({ seq: e.seq, at: e.at, actor: e.actor, action: e.action, ref: e.ref, reason: e.reason, before: JSON.stringify(e.before ?? null).slice(0, 2000), after: JSON.stringify(e.after ?? null).slice(0, 2000), hash: e.hash })),
  };
}

export function executiveTable(out: AssessmentOutput): ReportTable {
  const S = out.summary;
  const kv: [string, string | number][] = [
    ['Rule set', `${out.ruleSetId} V${out.ruleSetVersion} (as of ${out.asOf})`], ['Run fingerprint', out.outputFingerprint], ['Input fingerprint', out.inputFingerprint],
    ['Suppliers (master rows)', S.totalSuppliers], ['Approved suppliers', S.approvedSuppliers], ['RED', S.byStatus.RED], ['AMBER', S.byStatus.AMBER], ['CANNOT DETERMINE', S.byStatus['CANNOT DETERMINE']], ['GREEN', S.byStatus.GREEN],
    ['NEVER ASSESSED', S.neverAssessed], ['SINGLE SOURCE', S.singleSource], ['INDEMNITY GAP', S.indemnityGap], ['Indemnity CANNOT DETERMINE', S.indemnityCannotDetermine],
    ['Part families', S.totalFamilies], ['Single-source families', S.singleSourceFamilies], ['Families with no qualified supplier', S.familiesWithoutQualified],
    ['Suppliers with NO MEMO (coverage)', S.suppliersWithoutMemo], ['Unmatched memos', S.unmatchedMemos], ['Contradictions', S.contradictions], ['Pending reviews', S.pendingReviews],
    ['Memos read', `${out.coverageRecord.memosRead.length}${out.coverageRecord.memosExpected ? ` of ${out.coverageRecord.memosExpected}` : ''}`],
    ['RED suppliers', out.scorecard.filter((r) => r.status === 'RED').map((r) => `${r.supplierId} ${r.supplierName}`).join('; ') || 'none'],
    ['AMBER suppliers', out.scorecard.filter((r) => r.status === 'AMBER').map((r) => `${r.supplierId} ${r.supplierName}`).join('; ') || 'none'],
    ['Human decision', 'The category director and buyers decide what to do about each risk. This report shows risk; it decides nothing.'],
  ];
  return { id: 'executive', title: 'Executive summary', subtitle: header(out), columns: [{ key: 'k', label: 'Measure', width: 34 }, { key: 'v', label: 'Value', width: 80 }], rows: kv.map(([k, v]) => ({ k, v })) };
}
