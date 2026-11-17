import { latestDecisions, type ReviewDecision } from './decisions';
import { buildMentionIndex, extractStatements } from './extract';
import { canonicalJson, hashObject, sha256 } from './hash';
import { normalizeSupplierName } from './normalize';
import { memoContentKey, parseMemo, splitBatch } from './parse/memo';
import { parseLog, parseMaster } from './parse/records';
import { decide, describeFacts, type Facts, type RuleSet } from './rules/ruleset';
import { ENGINE_VERSION } from './rules/rr-c5-v1.2';
import type {
  AbsenceEvidence, AssessmentOutput, Contradiction, CoverageRecord, CoverageRow, Evidence, FamilyResult, FlagName, FlagResult,
  IndemnityResult, LogRow, MasterRow, Memo, MemoEvidence, MemoMatch, Note, QualificationResult, RecordEvidence, ReviewItem,
  ScorecardRow, SourceFile, Statement, Status,
} from './types';

export interface AssessmentInput {
  master: SourceFile;
  log: SourceFile;
  /** Single memo files and/or batch files. */
  memos: SourceFile[];
  ruleSet: RuleSet;
  decisions?: ReviewDecision[];
}

export class AssessmentError extends Error {
  constructor(message: string) { super(message); this.name = 'AssessmentError'; }
}

const byDateDesc = (a: { memoDate: string; memoId: string; sentenceIndex: number }, b: typeof a) =>
  b.memoDate.localeCompare(a.memoDate) || b.memoId.localeCompare(a.memoId) || a.sentenceIndex - b.sentenceIndex;

function memoEvidence(st: Statement, memo: Memo): MemoEvidence {
  const s = memo.sentences[st.sentenceIndex]!;
  return {
    kind: 'memo', memoId: memo.memoId, memoDate: memo.date, fileName: memo.fileName, quote: s.text,
    sentenceIndex: s.index, start: s.start, end: s.end, ...(st.reviewId ? { reviewId: st.reviewId } : {}),
  };
}

function recordEvidence(file: string, row: MasterRow | LogRow, relied: string[]): RecordEvidence {
  return { kind: 'record', file, rowNumber: row.rowNumber, lineNumber: row.lineNumber, fields: { ...row.fields }, relied };
}

function isBatchFile(f: SourceFile): boolean {
  return /BATCH/i.test(f.name) || (f.text.match(/^#{1,3}\s*MEMO-\d+/gm)?.length ?? 0) > 1;
}

interface MemoLoad { memos: Memo[]; duplicates: { memoId: string; files: string[] }[]; conflicts: { memoId: string; files: string[] }[] }

export function loadMemos(files: SourceFile[]): MemoLoad {
  const copies = new Map<string, { memo: Memo; batch: boolean }[]>();
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));
  for (const f of ordered) {
    const batch = isBatchFile(f);
    const texts = batch ? splitBatch(f.text) : [f.text];
    for (const t of texts) {
      const m = parseMemo({ text: t, fileName: f.name });
      const arr = copies.get(m.memoId) ?? [];
      arr.push({ memo: m, batch });
      copies.set(m.memoId, arr);
    }
  }
  const memos: Memo[] = [];
  const duplicates: MemoLoad['duplicates'] = [];
  const conflicts: MemoLoad['conflicts'] = [];
  for (const [memoId, list] of [...copies.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))) {
    list.sort((a, b) => Number(a.batch) - Number(b.batch) || a.memo.fileName.localeCompare(b.memo.fileName));
    const canonical = list[0]!.memo;
    const keys = new Set(list.map((c) => memoContentKey(c.memo)));
    if (list.length > 1) {
      if (keys.size > 1) {
        conflicts.push({ memoId, files: list.map((c) => c.memo.fileName) });
        canonical.warnings.push(`Copies of ${memoId} differ between ${list.map((c) => c.memo.fileName).join(' and ')} — CANNOT DETERMINE which is authoritative; memo not applied.`);
      } else {
        duplicates.push({ memoId, files: list.map((c) => c.memo.fileName) });
      }
      canonical.duplicateFiles = list.slice(1).map((c) => c.memo.fileName);
    }
    memos.push(canonical);
  }
  return { memos, duplicates, conflicts };
}

export function assess(input: AssessmentInput): AssessmentOutput {
  const rs = input.ruleSet;
  const P = rs.parameters;
  const warnings: string[] = [];
  const { rows: master, warnings: mw } = parseMaster(input.master.text, input.master.name);
  const { rows: log, warnings: lw } = parseLog(input.log.text, input.log.name);
  warnings.push(...mw, ...lw);
  const masterIds = new Set(master.map((r) => r.supplierId));
  for (const r of log) if (!masterIds.has(r.supplierId)) warnings.push(`${input.log.name} line ${r.lineNumber}: ${r.supplierId} is not in ${input.master.name} (row ignored for §4.1).`);

  const { memos, duplicates, conflicts } = loadMemos(input.memos);
  const conflictIds = new Set(conflicts.map((c) => c.memoId));
  const memoById = new Map(memos.map((m) => [m.memoId, m]));
  const decisions = latestDecisions(input.decisions ?? []);
  const isApproved = (r: MasterRow) => r.approvalStatus.toUpperCase() === P.approvedStatusValue.toUpperCase();
  const masterById = new Map(master.map((r) => [r.supplierId, r]));
  const reviewQueue: ReviewItem[] = [];
  const ignoredDecisions: string[] = [];

  // ---------------------------------------------------------------- §2 matching
  const normIndex = new Map<string, string[]>();
  for (const r of master) {
    const n = normalizeSupplierName(r.supplierName, P.legalSuffixes).normalized;
    if (!n) continue;
    normIndex.set(n, [...(normIndex.get(n) ?? []), r.supplierId]);
  }
  const matches: MemoMatch[] = memos.map((m) => {
    const trace = normalizeSupplierName(m.supplierAsWritten, P.legalSuffixes);
    const key = `MEMO_MATCH:${m.memoId}`;
    const d = decisions.get(key);
    const cands = trace.normalized ? normIndex.get(trace.normalized) ?? [] : [];
    let outcome: MemoMatch['outcome'];
    if (cands.length === 1) outcome = { kind: 'MATCHED', supplierId: cands[0]!, via: 'RULE' };
    else {
      const reason = !m.supplierAsWritten
        ? 'Supplier (as written) is NOT STATED in the memo.'
        : cands.length > 1
          ? `Normalised name "${trace.normalized}" is identical for ${cands.join(', ')} — ambiguous.`
          : `Normalised name "${trace.normalized}" is not identical to any normalised master supplier name.`;
      outcome = { kind: 'CANNOT DETERMINE (MATCH)', reason, candidates: cands };
      if (d && d.type === 'MATCH_MEMO' && d.memoSha256 === m.sha256 && d.supplierId && masterById.has(d.supplierId)) {
        outcome = { kind: 'MATCHED', supplierId: d.supplierId, via: 'REVIEW', reviewId: d.id };
      } else if (d && d.type === 'MATCH_MEMO' && d.memoSha256 !== m.sha256) {
        ignoredDecisions.push(`${d.id}: memo ${m.memoId} content changed since the decision — decision not applied.`);
      }
      const resolved = !!(d && d.type === 'MATCH_MEMO' && d.memoSha256 === m.sha256);
      reviewQueue.push({
        key, type: 'MEMO_MATCH', memoId: m.memoId, title: `${m.memoId}: CANNOT DETERMINE (MATCH)`,
        detail: reason + ' A person must decide; the tool never attaches a memo by guesswork.',
        quote: m.supplierAsWritten || 'NOT STATED', resolved, ...(resolved ? { reviewId: d!.id } : {}),
      });
    }
    return { memoId: m.memoId, supplierAsWritten: m.supplierAsWritten, memoTrace: trace, outcome };
  });
  const memoSupplier = new Map<string, string>();
  for (const mm of matches) if (mm.outcome.kind === 'MATCHED' && !conflictIds.has(mm.memoId)) memoSupplier.set(mm.memoId, mm.outcome.supplierId);

  // ---------------------------------------------------------------- statements
  const mentionIndex = buildMentionIndex(master, P.legalSuffixes);
  const statements: Statement[] = [];
  for (const m of memos) {
    const sid = memoSupplier.get(m.memoId) ?? null;
    const fams = sid ? masterById.get(sid)!.partFamilies : [];
    for (const st of extractStatements(m, sid, fams, mentionIndex)) {
      const key = `STATEMENT:${m.memoId}:${st.sentenceIndex}`;
      const d = decisions.get(key);
      let final: Statement | null = st;
      let resolvedBy: string | undefined;
      if (d && d.type === 'CLASSIFY_STATEMENT') {
        if (d.memoSha256 !== m.sha256) ignoredDecisions.push(`${d.id}: memo ${m.memoId} content changed since the decision — decision not applied.`);
        else {
          resolvedBy = d.id;
          if (d.kind === 'NOT_RELEVANT') final = null;
          else {
            final = { memoId: st.memoId, memoDate: st.memoDate, sentenceIndex: st.sentenceIndex, quote: st.quote, kind: d.kind, reviewId: d.id };
            if (d.kind === 'INDEMNITY_CAP') final.amountBhd = d.amountBhd;
            if (d.kind.startsWith('QUALIFICATION')) final.families = (d.families ?? []).filter((f) => fams.some((x) => x.toLowerCase() === f.toLowerCase()));
          }
        }
      }
      if (st.kind === 'UNCLASSIFIED' && sid) {
        reviewQueue.push({
          key, type: 'STATEMENT', memoId: m.memoId, sentenceIndex: st.sentenceIndex, supplierId: sid,
          title: `${m.memoId} sentence ${st.sentenceIndex + 1}: needs a person`, detail: st.reviewReason ?? 'Not classified.',
          quote: st.quote, resolved: !!resolvedBy, ...(resolvedBy ? { reviewId: resolvedBy } : {}),
        });
      }
      if (final) statements.push(final);
    }
  }
  // Statements that apply to a supplier: only from memos matched to it, never UNCLASSIFIED.
  const stmtsFor = (sid: string) => statements.filter((s) => memoSupplier.get(s.memoId) === sid);

  // ---------------------------------------------------------------- data quality reviews
  for (const c of conflicts) {
    const key = `DATA:CONFLICT:${c.memoId}`;
    reviewQueue.push({ key, type: 'DATA_QUALITY', memoId: c.memoId, title: `${c.memoId}: conflicting copies`, detail: `Copies differ in ${c.files.join(', ')}. The memo is not applied until the sources are corrected.`, resolved: decisions.has(key), ...(decisions.get(key) ? { reviewId: decisions.get(key)!.id } : {}) });
  }
  for (const m of memos) {
    if (!m.date) {
      const key = `DATA:UNDATED:${m.memoId}`;
      reviewQueue.push({ key, type: 'DATA_QUALITY', memoId: m.memoId, title: `${m.memoId}: date NOT STATED`, detail: 'An undated memo cannot be ordered under §4.3/§5. Where it conflicts with another memo the position is CANNOT DETERMINE.', resolved: decisions.has(key), ...(decisions.get(key) ? { reviewId: decisions.get(key)!.id } : {}) });
    }
  }

  const contradictions: Contradiction[] = [];
  const asOf = P.asOf;
  const memoCount = memos.length;

  // ---------------------------------------------------------------- §4.3 indemnity
  function indemnityFor(r: MasterRow): IndemnityResult {
    const own = stmtsFor(r.supplierId);
    const ownMemoIds = [...new Set(own.map((s) => s.memoId))];
    const allOwnMemos = memos.filter((m) => memoSupplier.get(m.memoId) === r.supplierId).map((m) => m.memoId);
    const stating = own.filter((s) => s.kind === 'INDEMNITY_CAP' || s.kind === 'INDEMNITY_NONE').sort(byDateDesc);
    const notStated = own.filter((s) => s.kind === 'INDEMNITY_NOT_STATED').sort(byDateDesc);
    const ev = (s: Statement) => memoEvidence(s, memoById.get(s.memoId)!);
    const valueOf = (s: Statement) => (s.kind === 'INDEMNITY_NONE' ? 'NO CLAUSE' : `CAP ${s.amountBhd}`);
    if (stating.length === 0) {
      const absence: AbsenceEvidence = {
        kind: 'absence', files: allOwnMemos.length ? allOwnMemos : [`${memoCount} memos`], supplierId: r.supplierId, missing: 'a memo stating an indemnity position',
        memosSearched: memoCount, asOf,
        scope: allOwnMemos.length
          ? `No statement of an indemnity position in the ${allOwnMemos.length} memo(s) matched to ${r.supplierId} (${allOwnMemos.join(', ')}); ${memoCount} memos searched, as of ${asOf}.`
          : `NO MEMO: none of the ${memoCount} memos matches ${r.supplierId}, as of ${asOf}.`,
      };
      const why = notStated.length
        ? `The memo says "${notStated[0]!.quote}" — that is not a stated indemnity position.`
        : allOwnMemos.length ? 'The memo(s) are silent on indemnity.' : 'There is no memo for this supplier.';
      void ownMemoIds;
      return { position: 'CANNOT DETERMINE', explanation: `CANNOT DETERMINE — no memo states the position. ${why}`, evidence: [...notStated.map(ev), absence] };
    }
    const distinct = new Set(stating.map(valueOf));
    const undated = stating.filter((s) => !s.memoDate);
    const top = stating[0]!;
    if (distinct.size > 1 && undated.length > 0) {
      const c: Contradiction = { supplierId: r.supplierId, subject: 'indemnity', governing: ev(top), superseded: stating.slice(1).map(ev), resolution: 'CANNOT DETERMINE (UNDATED)', explanation: 'Memos state different indemnity positions and at least one is undated, so the newest cannot be identified.' };
      contradictions.push(c);
      return { position: 'CANNOT DETERMINE', explanation: c.explanation, evidence: stating.map(ev) };
    }
    const sameDay = stating.filter((s) => s.memoDate === top.memoDate);
    if (new Set(sameDay.map(valueOf)).size > 1) {
      const c: Contradiction = { supplierId: r.supplierId, subject: 'indemnity', governing: ev(top), superseded: stating.slice(1).map(ev), resolution: 'CANNOT DETERMINE (SAME DATE)', explanation: `Different indemnity positions dated ${top.memoDate}; neither is newer.` };
      contradictions.push(c);
      const key = `CONTRA:INDEMNITY:${r.supplierId}`;
      reviewQueue.push({ key, type: 'CONTRADICTION_SAME_DATE', supplierId: r.supplierId, title: `${r.supplierId}: same-date indemnity contradiction`, detail: c.explanation + ' Obtain a clarifying memo.', resolved: decisions.has(key), ...(decisions.get(key) ? { reviewId: decisions.get(key)!.id } : {}) });
      return { position: 'CANNOT DETERMINE', explanation: c.explanation, evidence: sameDay.map(ev) };
    }
    const differing = stating.filter((s) => valueOf(s) !== valueOf(top));
    if (differing.length) {
      contradictions.push({ supplierId: r.supplierId, subject: 'indemnity', governing: ev(top), superseded: differing.map(ev), resolution: 'NEWER GOVERNS', explanation: `${top.memoId} (${top.memoDate}) is newer than ${differing.map((d) => `${d.memoId} (${d.memoDate})`).join(', ')} and governs (§5).` });
    }
    const T = P.indemnityThresholdBhd;
    const gov = ev(top);
    const silentNewer = memos.filter((m) => memoSupplier.get(m.memoId) === r.supplierId && m.date > top.memoDate).map((m) => m.memoId);
    const tail = silentNewer.length ? ` Newer memo(s) ${silentNewer.join(', ')} say nothing about indemnity and do not change it.` : '';
    if (top.kind === 'INDEMNITY_NONE') {
      return { position: 'GAP', governing: gov, explanation: `GAP — newest memo stating a position (${top.memoId}, ${top.memoDate}) says there is no indemnity clause.${tail}`, evidence: [gov, ...differing.map(ev)] };
    }
    const amt = top.amountBhd!;
    const pos = amt < T ? 'GAP' : 'NO GAP';
    const cmp = amt < T ? `below BHD ${T.toLocaleString('en-US')}` : `BHD ${T.toLocaleString('en-US')} or more`;
    return { position: pos, governing: gov, amountBhd: amt, explanation: `${pos} — cap of BHD ${amt.toLocaleString('en-US')} (${cmp}) in ${top.memoId} (${top.memoDate}).${tail}`, evidence: [gov, ...differing.map(ev)] };
  }

  // ---------------------------------------------------------------- §4.2 qualification
  function qualification(r: MasterRow, family: string): QualificationResult {
    const masterEv = recordEvidence(input.master.name, r, ['approval_status', 'part_families']);
    if (!isApproved(r)) return { family, qualified: false, basis: 'NOT APPROVED', evidence: [masterEv] };
    const fl = family.toLowerCase();
    const st = stmtsFor(r.supplierId)
      .filter((s) => (s.kind === 'QUALIFICATION_REMOVED' || s.kind === 'QUALIFICATION_AFFIRMED') && (s.families ?? []).some((f) => f.toLowerCase() === fl))
      .sort(byDateDesc);
    if (st.length === 0) return { family, qualified: true, basis: 'APPROVED (DEFAULT)', evidence: [masterEv] };
    const ev = (s: Statement) => memoEvidence(s, memoById.get(s.memoId)!);
    const top = st[0]!;
    const conflicting = st.filter((s) => s.kind !== top.kind);
    if (conflicting.length && (st.some((s) => !s.memoDate) || conflicting.some((s) => s.memoDate === top.memoDate))) {
      const undated = st.some((s) => !s.memoDate);
      contradictions.push({ supplierId: r.supplierId, subject: `qualification — ${family}`, governing: ev(top), superseded: conflicting.map(ev), resolution: undated ? 'CANNOT DETERMINE (UNDATED)' : 'CANNOT DETERMINE (SAME DATE)', explanation: `Contradictory qualification statements for ${family} cannot be ordered.` });
      const key = `CONTRA:QUAL:${r.supplierId}:${fl}`;
      reviewQueue.push({ key, type: 'CONTRADICTION_SAME_DATE', supplierId: r.supplierId, title: `${r.supplierId}: qualification for ${family} contradictory`, detail: 'Statements cannot be ordered by date. Obtain a clarifying memo.', resolved: decisions.has(key) });
      return { family, qualified: 'UNDETERMINED', basis: 'CONTRADICTORY', evidence: [masterEv, ...st.map(ev)] };
    }
    if (conflicting.length) {
      contradictions.push({ supplierId: r.supplierId, subject: `qualification — ${family}`, governing: ev(top), superseded: conflicting.map(ev), resolution: 'NEWER GOVERNS', explanation: `${top.memoId} (${top.memoDate}) is the newest memo stating qualification for ${family} and governs (§5).` });
    }
    if (top.kind === 'QUALIFICATION_REMOVED') return { family, qualified: false, basis: 'MEMO REMOVED', evidence: [masterEv, ev(top)] };
    return { family, qualified: true, basis: 'MEMO AFFIRMED', evidence: [masterEv, ev(top)] };
  }

  // ---------------------------------------------------------------- families
  const familyNames: string[] = [];
  const famSeen = new Map<string, string>();
  for (const r of master) for (const f of r.partFamilies) if (!famSeen.has(f.toLowerCase())) { famSeen.set(f.toLowerCase(), f); familyNames.push(f); }
  const qualCache = new Map<string, QualificationResult>();
  const qual = (r: MasterRow, fam: string) => {
    const k = r.supplierId + '|' + fam.toLowerCase();
    if (!qualCache.has(k)) qualCache.set(k, qualification(r, fam));
    return qualCache.get(k)!;
  };
  const families: FamilyResult[] = familyNames.map((family) => {
    const members = master.filter((r) => r.partFamilies.some((f) => f.toLowerCase() === family.toLowerCase()));
    const suppliers = members.map((r) => {
      const q = qual(r, family);
      return { supplierId: r.supplierId, supplierName: r.supplierName, approved: isApproved(r), qualified: q.qualified, basis: q.basis, evidence: q.evidence };
    });
    const min = suppliers.filter((s) => s.qualified === true).length;
    const max = min + suppliers.filter((s) => s.qualified === 'UNDETERMINED').length;
    const qualifiedCount: number | 'UNDETERMINED' = min === max ? min : 'UNDETERMINED';
    const singleSource: boolean | 'UNDETERMINED' = min === 1 && max === 1 ? true : max < 1 || min > 1 ? false : 'UNDETERMINED';
    const ss = singleSource === true ? suppliers.find((s) => s.qualified === true)!.supplierId : undefined;
    const removed = suppliers.filter((s) => s.basis === 'MEMO REMOVED').map((s) => s.supplierId);
    const finding =
      max === 0
        ? `No qualified supplier for ${family} (${suppliers.length} listed${removed.length ? `; qualification removed for ${removed.join(', ')}` : ''}). Reported as a finding — not a flag on any supplier.`
        : singleSource === true
          ? `SINGLE SOURCE — exactly one qualified approved supplier (${ss}) of ${suppliers.length} listed${removed.length ? `; qualification removed for ${removed.join(', ')} by memo` : ''}.`
          : singleSource === 'UNDETERMINED'
            ? `CANNOT DETERMINE — qualified count is between ${min} and ${max} because qualification statements contradict.`
            : `${min} qualified suppliers — not single source.`;
    return { family, suppliers, qualifiedCount, singleSource, ...(ss ? { singleSourceSupplierId: ss } : {}), noQualifiedSupplier: max === 0, finding };
  });

  // ---------------------------------------------------------------- per supplier
  const logBySupplier = new Map<string, LogRow[]>();
  for (const l of log) logBySupplier.set(l.supplierId, [...(logBySupplier.get(l.supplierId) ?? []), l]);

  const notesBySupplier = new Map<string, Note[]>();
  const addNote = (sid: string, n: Note) => notesBySupplier.set(sid, [...(notesBySupplier.get(sid) ?? []), n]);
  for (const st of statements) {
    const owner = memoSupplier.get(st.memoId);
    const memo = memoById.get(st.memoId)!;
    if (st.kind === 'OTHER_SUPPLIER_MENTION' && st.mentions) {
      for (const sid of st.mentions) {
        addNote(sid, { text: `Mentioned in ${st.memoId}, a memo about ${owner ?? 'an unmatched supplier'}. Under §2 a memo is attached only to the supplier it names, so this sentence does not set ${sid}'s flags.`, evidence: [memoEvidence(st, memo)] });
      }
    }
    if (!owner) continue;
    if (st.kind === 'QUALIFICATION_REMOVED') addNote(owner, { text: `Failed qualification / must not be used for ${(st.families ?? []).join(', ')} (${st.memoId}, ${st.memoDate}). Approval status in the master is unchanged; the supplier does not count for that family.`, evidence: [memoEvidence(st, memo)] });
    if (st.kind === 'ASSESSMENT_PLANNED') addNote(owner, { text: `${st.memoId} says an assessment is planned or scheduled. A planned assessment is not an assessment (§4.1).`, evidence: [memoEvidence(st, memo)] });
    if (st.kind === 'QUALITY_NOTE') addNote(owner, { text: `Quality event recorded in ${st.memoId} (${st.memoDate}). Not a qualification statement and not a flag.`, evidence: [memoEvidence(st, memo)] });
  }

  const scorecard: ScorecardRow[] = master.map((r) => {
    const approved = isApproved(r);
    const logRows = logBySupplier.get(r.supplierId) ?? [];
    const masterEv = recordEvidence(input.master.name, r, ['supplier_id', 'approval_status']);
    // §4.1
    let never: FlagResult;
    if (!approved) {
      never = { flag: 'NEVER ASSESSED', raised: false, explanation: `NOT APPLICABLE — approval_status is "${r.approvalStatus || 'NOT STATED'}", not ${P.approvedStatusValue}.`, evidence: [masterEv] };
    } else if (logRows.length === 0) {
      const absence: AbsenceEvidence = {
        kind: 'absence', files: [input.log.name], supplierId: r.supplierId, missing: 'an assessment log row', rowsSearched: log.length, asOf,
        scope: `No row for ${r.supplierId} in ${input.log.name} (${log.length} rows, as of ${asOf}).`,
      };
      never = { flag: 'NEVER ASSESSED', raised: true, explanation: `Approved in ${input.master.name} (line ${r.lineNumber}) with no row in ${input.log.name} (${log.length} rows searched, as of ${asOf}).`, evidence: [masterEv, absence] };
    } else {
      never = { flag: 'NEVER ASSESSED', raised: false, explanation: `Assessed: ${logRows.map((l) => `${input.log.name} line ${l.lineNumber} (${l.lastAssessmentDate || 'date NOT STATED'}, ${l.result || 'result NOT STATED'})`).join('; ')}.`, evidence: logRows.map((l) => recordEvidence(input.log.name, l, ['supplier_id', 'last_assessment_date', 'result'])) };
    }
    // §4.2
    const quals = r.partFamilies.map((f) => qual(r, f));
    const ssFams = families.filter((f) => f.singleSource === true && f.singleSourceSupplierId === r.supplierId);
    const undFams = families.filter((f) => f.singleSource === 'UNDETERMINED' && f.suppliers.some((s) => s.supplierId === r.supplierId && s.qualified !== false));
    let single: FlagResult;
    if (ssFams.length) {
      const ev: Evidence[] = [];
      for (const f of ssFams) for (const s of f.suppliers) ev.push(...s.evidence);
      single = { flag: 'SINGLE SOURCE', raised: true, families: ssFams.map((f) => f.family), explanation: ssFams.map((f) => `${f.family}: ${f.finding}`).join(' '), evidence: dedupeEvidence(ev) };
    } else if (undFams.length) {
      single = { flag: 'SINGLE SOURCE', raised: 'UNDETERMINED', families: undFams.map((f) => f.family), explanation: undFams.map((f) => `${f.family}: ${f.finding}`).join(' '), evidence: dedupeEvidence(undFams.flatMap((f) => f.suppliers.flatMap((s) => s.evidence))) };
    } else {
      const fams = families.filter((f) => r.partFamilies.some((x) => x.toLowerCase() === f.family.toLowerCase()));
      single = { flag: 'SINGLE SOURCE', raised: false, explanation: fams.length ? fams.map((f) => `${f.family}: ${f.qualifiedCount} qualified`).join('; ') + '.' : 'No part family listed (NOT STATED).', evidence: [recordEvidence(input.master.name, r, ['part_families'])] };
    }
    // §4.3
    const indemnity = indemnityFor(r);
    const gap: FlagResult = { flag: 'INDEMNITY GAP', raised: indemnity.position === 'GAP', explanation: indemnity.explanation, evidence: indemnity.evidence };
    const flags: Record<FlagName, FlagResult> = { 'NEVER ASSESSED': never, 'SINGLE SOURCE': single, 'INDEMNITY GAP': gap };

    // §6
    const variants: boolean[] = single.raised === 'UNDETERMINED' ? [true, false] : [single.raised as boolean];
    const outcomes = variants.map((ss) => {
      const facts: Facts = { singleSource: ss, neverAssessed: never.raised === true, indemnity: indemnity.position };
      return { facts, row: decide(rs, facts) };
    });
    let status: Status;
    let statusRule: string;
    let statusExplanation: string;
    const rows = outcomes.map((o) => o.row);
    if (rows.some((x) => x === null)) {
      status = 'CANNOT DETERMINE';
      statusRule = 'INCOMPLETE TABLE';
      statusExplanation = `The rule set ${rs.id} V${rs.version} has no decision row for ${outcomes.map((o) => describeFacts(o.facts)).join(' / ')}.`;
      warnings.push(`${r.supplierId}: ${statusExplanation}`);
    } else if (new Set(rows.map((x) => x!.outcome)).size > 1) {
      status = 'CANNOT DETERMINE';
      statusRule = 'UNDETERMINED INPUT';
      statusExplanation = `SINGLE SOURCE cannot be determined (contradictory qualification statements) and the status depends on it.`;
    } else {
      const row = rows[0]!;
      status = row.outcome;
      statusRule = row.id;
      statusExplanation = `${row.label}. Facts: ${describeFacts(outcomes[0]!.facts)}.`;
      for (const req of row.evidenceRequired) {
        const has = req === 'INDEMNITY POSITION' ? indemnity.evidence.length > 0 : flags[req].evidence.length > 0;
        if (!has) warnings.push(`${r.supplierId}: rule ${row.id} requires evidence for ${req} but none is attached.`);
      }
    }
    const notes = [...(notesBySupplier.get(r.supplierId) ?? [])];
    if (!approved) notes.unshift({ text: `approval_status is "${r.approvalStatus || 'NOT STATED'}" — not counted as an approved or qualified supplier.`, evidence: [masterEv] });
    return {
      supplierId: r.supplierId, supplierName: r.supplierName, partFamilies: r.partFamilies, approvalStatus: r.approvalStatus, spendBand: r.spendBand,
      flags, indemnity, qualifications: quals, status, statusRule, statusExplanation, notes,
      contradictions: contradictions.filter((c) => c.supplierId === r.supplierId),
    };
  });

  // ---------------------------------------------------------------- §3 coverage
  const coverage: CoverageRow[] = master.map((r) => {
    const ms = memos.filter((m) => memoSupplier.get(m.memoId) === r.supplierId).sort((a, b) => a.date.localeCompare(b.date) || a.memoId.localeCompare(b.memoId)).map((m) => m.memoId);
    const lr = (logBySupplier.get(r.supplierId) ?? []).map((l) => l.lineNumber);
    const notes: string[] = [];
    if (ms.length === 0) notes.push('NO MEMO — not a risk flag; the memos cannot tell us about this supplier (e.g. its indemnity position).');
    const viaReview = matches.filter((m) => m.outcome.kind === 'MATCHED' && m.outcome.via === 'REVIEW' && m.outcome.supplierId === r.supplierId).map((m) => m.memoId);
    if (viaReview.length) notes.push(`Attached by human review: ${viaReview.join(', ')}.`);
    return {
      supplierId: r.supplierId, supplierName: r.supplierName, memoIds: ms, memosLabel: ms.length ? ms.join('; ') : 'NO MEMO',
      logRows: lr, hasLogRow: lr.length > 0,
      scope: `${memoCount} memos and ${log.length} ${input.log.name} rows searched, as of ${asOf}.`, notes,
    };
  });

  // ---------------------------------------------------------------- coverage record
  const expected = P.expectedMemoCount;
  const expectedIds = expected ? Array.from({ length: expected }, (_, i) => `MEMO-${String(i + 1).padStart(2, '0')}`) : [];
  const read = memos.map((m) => m.memoId);
  const coverageRecord: CoverageRecord = {
    asOf,
    files: [
      { name: input.master.name, kind: 'master', sha256: input.master.sha256, bytes: input.master.bytes, rowsRead: master.length },
      { name: input.log.name, kind: 'log', sha256: input.log.sha256, bytes: input.log.bytes, rowsRead: log.length },
      ...[...input.memos].sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ name: f.name, kind: f.kind, sha256: f.sha256, bytes: f.bytes })),
    ],
    masterRowsRead: master.length,
    logRowsRead: log.length,
    memosExpected: expected,
    memosRead: read,
    memosMissing: expectedIds.filter((id) => !memoById.has(id)),
    memoSentenceCounts: Object.fromEntries(memos.map((m) => [m.memoId, m.sentences.length])),
    duplicateCopies: duplicates,
  };
  for (const m of memos) for (const w of m.warnings) warnings.push(`${m.memoId}: ${w}`);
  warnings.push(...ignoredDecisions);

  // ---------------------------------------------------------------- summary
  const count = (s: Status) => scorecard.filter((x) => x.status === s).length;
  const summary = {
    totalSuppliers: master.length,
    approvedSuppliers: master.filter(isApproved).length,
    byStatus: { RED: count('RED'), AMBER: count('AMBER'), 'CANNOT DETERMINE': count('CANNOT DETERMINE'), GREEN: count('GREEN') } as Record<Status, number>,
    neverAssessed: scorecard.filter((x) => x.flags['NEVER ASSESSED'].raised === true).length,
    singleSource: scorecard.filter((x) => x.flags['SINGLE SOURCE'].raised === true).length,
    indemnityGap: scorecard.filter((x) => x.indemnity.position === 'GAP').length,
    indemnityCannotDetermine: scorecard.filter((x) => x.indemnity.position === 'CANNOT DETERMINE').length,
    totalFamilies: families.length,
    familiesWithoutQualified: families.filter((f) => f.noQualifiedSupplier).length,
    singleSourceFamilies: families.filter((f) => f.singleSource === true).length,
    unmatchedMemos: matches.filter((m) => m.outcome.kind !== 'MATCHED').length,
    pendingReviews: reviewQueue.filter((q) => !q.resolved).length,
    contradictions: contradictions.length,
    suppliersWithoutMemo: coverage.filter((c) => c.memoIds.length === 0).length,
  };

  const ruleSetHash = hashObject(rs);
  const inputFingerprint = hashObject({
    engine: ENGINE_VERSION,
    master: input.master.sha256,
    log: input.log.sha256,
    memos: [...input.memos].map((m) => [m.name, m.sha256]).sort((a, b) => a[0]!.localeCompare(b[0]!)),
    ruleSetHash,
    decisions: [...decisions.values()].map((d) => canonicalJson(d)).sort(),
  });
  const body = {
    engineVersion: ENGINE_VERSION, ruleSetId: rs.id, ruleSetVersion: rs.version, ruleSetHash, asOf, inputFingerprint,
    scorecard, coverage, coverageRecord, families, matches, statements, contradictions,
    reviewQueue: reviewQueue.sort((a, b) => a.key.localeCompare(b.key)), summary, warnings,
  };
  return { ...body, outputFingerprint: sha256(canonicalJson(body)) };
}

function dedupeEvidence(ev: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return ev.filter((e) => {
    const k = canonicalJson(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function makeSourceFile(name: string, kind: SourceFile['kind'], text: string): SourceFile {
  return { name, kind, text, sha256: sha256(text), bytes: new TextEncoder().encode(text).length };
}
