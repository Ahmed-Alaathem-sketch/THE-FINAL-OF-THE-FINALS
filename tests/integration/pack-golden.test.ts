import { describe, expect, it } from 'vitest';
import { assess } from '../../src/engine/assess';
import { RR_C5_V1_2, RR_C5_V1_2_HASH } from '../../src/engine/rules/rr-c5-v1.2';
import { packSources } from '../helpers/pack';

/**
 * Golden expectations, derived by hand from RULES/RISK_RULES_RR-C5.md and the 24 memos BEFORE the engine ran.
 * Any change here is a change to the meaning of RR-C5 and must be justified.
 */
const EXPECTED: Record<string, { status: string; indemnity: string; flags: string[]; memos: string }> = {
  'SUP-01': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-01' },
  'SUP-02': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-02' },
  'SUP-03': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-03' },
  'SUP-04': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-04' },
  'SUP-05': { status: 'AMBER', indemnity: 'NO GAP', flags: ['SINGLE SOURCE'], memos: 'MEMO-08' },
  'SUP-06': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-06' },
  'SUP-07': { status: 'AMBER', indemnity: 'GAP', flags: ['INDEMNITY GAP'], memos: 'MEMO-05; MEMO-21' },
  'SUP-08': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-07' },
  'SUP-09': { status: 'RED', indemnity: 'GAP', flags: ['SINGLE SOURCE', 'INDEMNITY GAP'], memos: 'MEMO-09' },
  'SUP-10': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-10' },
  'SUP-11': { status: 'CANNOT DETERMINE', indemnity: 'CANNOT DETERMINE', flags: [], memos: 'MEMO-11' },
  'SUP-12': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-14; MEMO-22' },
  'SUP-13': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-12' },
  'SUP-14': { status: 'CANNOT DETERMINE', indemnity: 'CANNOT DETERMINE', flags: [], memos: 'MEMO-13' },
  'SUP-15': { status: 'AMBER', indemnity: 'GAP', flags: ['INDEMNITY GAP'], memos: 'MEMO-15' },
  'SUP-16': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-17' },
  'SUP-17': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-16' },
  'SUP-18': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-18' },
  'SUP-19': { status: 'AMBER', indemnity: 'NO GAP', flags: ['NEVER ASSESSED'], memos: 'MEMO-19' },
  'SUP-20': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-20' },
  'SUP-21': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-23' },
  'SUP-22': { status: 'GREEN', indemnity: 'NO GAP', flags: [], memos: 'MEMO-24' },
  'SUP-23': { status: 'CANNOT DETERMINE', indemnity: 'CANNOT DETERMINE', flags: [], memos: 'NO MEMO' },
  'SUP-24': { status: 'AMBER', indemnity: 'CANNOT DETERMINE', flags: ['NEVER ASSESSED'], memos: 'NO MEMO' },
  'SUP-25': { status: 'AMBER', indemnity: 'CANNOT DETERMINE', flags: ['NEVER ASSESSED'], memos: 'NO MEMO' },
  'SUP-26': { status: 'CANNOT DETERMINE', indemnity: 'CANNOT DETERMINE', flags: [], memos: 'NO MEMO' },
};

const out = assess({ ...packSources(), ruleSet: RR_C5_V1_2 });

describe('RR-C5 V1.2 on the official pack (26 suppliers, 23 log rows, 24 memos)', () => {
  it('pins the immutable baseline', () => {
    expect(Object.isFrozen(RR_C5_V1_2)).toBe(true);
    expect(Object.isFrozen(RR_C5_V1_2.decisionTable[0]!.when)).toBe(true);
    expect(RR_C5_V1_2.parameters.indemnityThresholdBhd).toBe(50000);
    expect(RR_C5_V1_2.parameters.asOf).toBe('2026-10-31');
    expect(RR_C5_V1_2_HASH).toMatchSnapshot();
  });

  it('has one scorecard row per master supplier with exactly one status', () => {
    expect(out.scorecard).toHaveLength(26);
    expect(new Set(out.scorecard.map((r) => r.supplierId)).size).toBe(26);
  });

  it.each(Object.entries(EXPECTED))('%s matches the hand-derived expectation', (id, e) => {
    const r = out.scorecard.find((x) => x.supplierId === id)!;
    expect(r.status).toBe(e.status);
    expect(r.indemnity.position).toBe(e.indemnity);
    expect(Object.values(r.flags).filter((f) => f.raised === true).map((f) => f.flag)).toEqual(e.flags);
    expect(out.coverage.find((c) => c.supplierId === id)!.memosLabel).toBe(e.memos);
  });

  it('matches every memo to exactly one supplier (MEMO-14 via suffix and plural-s rules)', () => {
    expect(out.matches.every((m) => m.outcome.kind === 'MATCHED')).toBe(true);
    const m14 = out.matches.find((m) => m.memoId === 'MEMO-14')!;
    expect(m14.memoTrace.normalized).toBe('gulfreach fastener');
  });

  it('summary counts', () => {
    expect(out.summary).toMatchObject({
      totalSuppliers: 26, approvedSuppliers: 26, byStatus: { RED: 1, AMBER: 6, 'CANNOT DETERMINE': 4, GREEN: 15 },
      neverAssessed: 3, singleSource: 2, indemnityGap: 3, totalFamilies: 14, familiesWithoutQualified: 0,
      singleSourceFamilies: 2, unmatchedMemos: 0, suppliersWithoutMemo: 4, contradictions: 1,
    });
  });

  it('never-assessed evidence states the scope searched (§1.3)', () => {
    for (const id of ['SUP-19', 'SUP-24', 'SUP-25']) {
      const ev = out.scorecard.find((r) => r.supplierId === id)!.flags['NEVER ASSESSED'].evidence;
      expect(ev.find((e) => e.kind === 'absence')).toMatchObject({ scope: `No row for ${id} in ASSESSMENT_LOG.csv (23 rows, as of 2026-10-31).`, rowsSearched: 23 });
      expect(ev.find((e) => e.kind === 'record')).toMatchObject({ file: 'SUPPLIER_MASTER.csv' });
    }
    const sup19 = out.scorecard.find((r) => r.supplierId === 'SUP-19')!;
    expect(sup19.notes.some((n) => n.evidence.some((e) => e.kind === 'memo' && e.quote === 'Our supplier assessment of Ironvale is scheduled for Q4 2026.'))).toBe(true);
  });

  it('SINGLE SOURCE families and evidence: PCB assemblies (SUP-05) and mechanical seals (SUP-09 after MEMO-17)', () => {
    const ss = out.families.filter((f) => f.singleSource === true).map((f) => [f.family, f.singleSourceSupplierId]);
    expect(ss).toEqual([['PCB assemblies', 'SUP-05'], ['mechanical seals', 'SUP-09']]);
    const seals = out.families.find((f) => f.family === 'mechanical seals')!;
    const sup16 = seals.suppliers.find((s) => s.supplierId === 'SUP-16')!;
    expect(sup16.basis).toBe('MEMO REMOVED');
    expect(sup16.evidence.some((e) => e.kind === 'memo' && e.memoId === 'MEMO-17' && e.quote.startsWith('Amberlode failed requalification for mechanical seals'))).toBe(true);
  });

  it('SUP-07 contradiction: MEMO-21 (2026-04-02) governs over MEMO-05 (2025-03-10); both quotations kept', () => {
    const c = out.contradictions[0]!;
    expect(c).toMatchObject({ supplierId: 'SUP-07', resolution: 'NEWER GOVERNS' });
    expect(c.governing).toMatchObject({ memoId: 'MEMO-21', memoDate: '2026-04-02', quote: "The renewal was signed on Marrowgate's own terms and contains no indemnity clause." });
    expect(c.superseded[0]).toMatchObject({ memoId: 'MEMO-05', memoDate: '2025-03-10', quote: "Marrowgate's 2024 agreement includes a product indemnity capped at BHD 120,000." });
  });

  it('boundary: SUP-08 at exactly BHD 50,000 is NO GAP; SUP-12 keeps MEMO-14 because MEMO-22 is silent', () => {
    const s8 = out.scorecard.find((r) => r.supplierId === 'SUP-08')!;
    expect(s8.indemnity.amountBhd).toBe(50000);
    const s12 = out.scorecard.find((r) => r.supplierId === 'SUP-12')!;
    expect(s12.indemnity.governing?.memoId).toBe('MEMO-14');
    expect(s12.indemnity.explanation).toMatch(/MEMO-22 say nothing about indemnity/);
  });

  it('every memo quotation is an exact substring of its memo body at the stated offsets', () => {
    const memoTexts = new Map(packSources().memos.map((m) => [m.name, m.text]));
    for (const st of out.statements) {
      const text = memoTexts.get(`${st.memoId}.md`)!;
      expect(text.includes(st.quote), `${st.memoId}: ${st.quote}`).toBe(true);
    }
  });

  it('coverage record proves all 24 memos and 49 data rows were read', () => {
    expect(out.coverageRecord.memosRead).toHaveLength(24);
    expect(out.coverageRecord.memosMissing).toEqual([]);
    expect(out.coverageRecord.masterRowsRead + out.coverageRecord.logRowsRead).toBe(49);
  });

  it('batch files and single files give the same assessment; duplicates are recorded', () => {
    const batches = assess({ ...packSources({ batches: true, singles: false }), ruleSet: RR_C5_V1_2 });
    expect(batches.scorecard.map((r) => r.status)).toEqual(out.scorecard.map((r) => r.status));
    const both = assess({ ...packSources({ batches: true, singles: true }), ruleSet: RR_C5_V1_2 });
    expect(both.coverageRecord.memosRead).toHaveLength(24);
    expect(both.coverageRecord.duplicateCopies).toHaveLength(24);
    expect(both.scorecard.map((r) => r.status)).toEqual(out.scorecard.map((r) => r.status));
  });

  it('is deterministic (regression fingerprint is stable across runs)', () => {
    const again = assess({ ...packSources(), ruleSet: RR_C5_V1_2 });
    expect(again.outputFingerprint).toBe(out.outputFingerprint);
  });
});
