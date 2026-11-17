import { describe, expect, it } from 'vitest';
import { assess } from '../../src/engine/assess';
import type { ReviewDecision } from '../../src/engine/decisions';
import { parseMemo } from '../../src/engine/parse/memo';
import { RR_C5_V1_2 } from '../../src/engine/rules/rr-c5-v1.2';
import { allFactCombinations, decide } from '../../src/engine/rules/ruleset';
import { FLAG_NAMES } from '../../src/engine/types';
import { logCsv, masterCsv, memoFile, type MiniSupplier } from '../helpers/build';

const RS = RR_C5_V1_2;
const base: MiniSupplier[] = [
  { id: 'SUP-01', name: 'Alpha Pumps W.L.L.', families: 'widgets' },
  { id: 'SUP-02', name: 'Beta Parts Co.', families: 'widgets; gizmos' },
];
const logAll = logCsv([['SUP-01', '2025-01-01', 'PASS'], ['SUP-02', '2025-01-01', 'PASS']]);
const run = (memos: ReturnType<typeof memoFile>[], opts: { log?: ReturnType<typeof logCsv>; master?: typeof base; decisions?: ReviewDecision[] } = {}) =>
  assess({ master: masterCsv(opts.master ?? base), log: opts.log ?? logAll, memos, ruleSet: RS, decisions: opts.decisions ?? [] });
const row = (out: ReturnType<typeof assess>, id: string) => out.scorecard.find((r) => r.supplierId === id)!;

describe('§6 decision table (exhaustive over all 12 fact combinations)', () => {
  it('produces exactly the official status for every combination', () => {
    for (const f of allFactCombinations()) {
      const expected = f.singleSource && (f.indemnity === 'GAP' || f.neverAssessed)
        ? 'RED'
        : f.singleSource || f.indemnity === 'GAP' || f.neverAssessed
          ? 'AMBER'
          : f.indemnity === 'CANNOT DETERMINE' ? 'CANNOT DETERMINE' : 'GREEN';
      expect(decide(RS, f)?.outcome, JSON.stringify(f)).toBe(expected);
    }
  });
  it('has exactly three flags', () => {
    expect([...FLAG_NAMES]).toEqual(['NEVER ASSESSED', 'SINGLE SOURCE', 'INDEMNITY GAP']);
  });
});

describe('§4.3 indemnity and the BHD 50,000 threshold', () => {
  it.each([
    [49999, 'GAP'],
    [50000, 'NO GAP'],
    [50001, 'NO GAP'],
    [0, 'GAP'],
  ])('cap BHD %i → %s', (amt, pos) => {
    const out = run([memoFile({ id: 'MEMO-01', date: '2025-01-01', supplier: 'Alpha Pumps', body: `The contract includes a product indemnity capped at BHD ${amt.toLocaleString('en-US')}.` })]);
    expect(row(out, 'SUP-01').indemnity.position).toBe(pos);
  });
  it('"no indemnity clause" → GAP', () => {
    const out = run([memoFile({ id: 'MEMO-01', date: '2025-01-01', supplier: 'Alpha Pumps', body: 'The contract contains no indemnity clause.' })]);
    expect(row(out, 'SUP-01').indemnity.position).toBe('GAP');
  });
  it('"standard terms apply", silence or no memo → CANNOT DETERMINE with stated scope', () => {
    const out = run([memoFile({ id: 'MEMO-01', date: '2025-01-01', supplier: 'Alpha Pumps', body: 'On liability, standard terms apply.' })]);
    const r1 = row(out, 'SUP-01');
    expect(r1.indemnity.position).toBe('CANNOT DETERMINE');
    expect(r1.status).toBe('CANNOT DETERMINE');
    const abs = row(out, 'SUP-02').indemnity.evidence.find((e) => e.kind === 'absence');
    expect(abs && abs.kind === 'absence' && abs.scope).toMatch(/NO MEMO: none of the 1 memos matches SUP-02, as of 2026-10-31/);
  });
  it('newest memo stating a position governs; contradiction keeps both quotations', () => {
    const out = run([
      memoFile({ id: 'MEMO-01', date: '2025-01-01', supplier: 'Alpha Pumps', body: 'The contract includes an indemnity capped at BHD 120,000.' }),
      memoFile({ id: 'MEMO-02', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'The renewal contains no indemnity clause.' }),
    ]);
    const r = row(out, 'SUP-01');
    expect(r.indemnity.position).toBe('GAP');
    expect(r.contradictions).toHaveLength(1);
    expect(r.contradictions[0]!.governing.memoId).toBe('MEMO-02');
    expect(r.contradictions[0]!.superseded[0]!.quote).toBe('The contract includes an indemnity capped at BHD 120,000.');
  });
  it('a newer memo silent on indemnity (or saying "standard terms") does not change it', () => {
    const out = run([
      memoFile({ id: 'MEMO-01', date: '2025-01-01', supplier: 'Alpha Pumps', body: 'The contract includes an indemnity capped at BHD 30,000.' }),
      memoFile({ id: 'MEMO-02', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'Delivery was good.' }),
      memoFile({ id: 'MEMO-03', date: '2026-02-01', supplier: 'Alpha Pumps', body: 'On liability, standard terms apply.' }),
    ]);
    expect(row(out, 'SUP-01').indemnity.position).toBe('GAP');
    expect(row(out, 'SUP-01').indemnity.governing?.memoId).toBe('MEMO-01');
  });
  it('memo order is by date, not by ID', () => {
    const out = run([
      memoFile({ id: 'MEMO-09', date: '2025-01-01', supplier: 'Alpha Pumps', body: 'Indemnity capped at BHD 10,000.' }),
      memoFile({ id: 'MEMO-02', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'Indemnity capped at BHD 90,000.' }),
    ]);
    expect(row(out, 'SUP-01').indemnity.position).toBe('NO GAP');
  });
  it('same-date contradiction → CANNOT DETERMINE and a review item', () => {
    const out = run([
      memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'Indemnity capped at BHD 90,000.' }),
      memoFile({ id: 'MEMO-02', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'The contract contains no indemnity clause.' }),
    ]);
    expect(row(out, 'SUP-01').indemnity.position).toBe('CANNOT DETERMINE');
    expect(out.reviewQueue.some((q) => q.type === 'CONTRADICTION_SAME_DATE')).toBe(true);
  });
  it('liability-only caps and ambiguous wording go to review, never to a flag', () => {
    const out = run([memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'Liability is capped at BHD 10,000.' })]);
    expect(row(out, 'SUP-01').indemnity.position).toBe('CANNOT DETERMINE');
    expect(out.reviewQueue.map((q) => q.type)).toContain('STATEMENT');
  });
});

describe('§4.1 NEVER ASSESSED', () => {
  it('approved with no log row → flag with absence scope; planned assessment is not an assessment', () => {
    const out = run([memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'Our supplier assessment of Alpha is scheduled for Q4 2026.' })], { log: logCsv([['SUP-02', '2025-01-01', 'PASS']]) });
    const r = row(out, 'SUP-01');
    expect(r.flags['NEVER ASSESSED'].raised).toBe(true);
    const abs = r.flags['NEVER ASSESSED'].evidence.find((e) => e.kind === 'absence');
    expect(abs && abs.kind === 'absence' && abs.scope).toBe('No row for SUP-01 in ASSESSMENT_LOG.csv (1 rows, as of 2026-10-31).');
    expect(r.notes.some((n) => /planned assessment is not an assessment/.test(n.text))).toBe(true);
  });
  it('a supplier without a memo is not thereby never assessed', () => {
    expect(row(run([]), 'SUP-02').flags['NEVER ASSESSED'].raised).toBe(false);
  });
  it('NOT APPLICABLE for a supplier that is not APPROVED', () => {
    const out = run([], { master: [...base, { id: 'SUP-03', name: 'Gamma', families: 'widgets', status: 'SUSPENDED' }] });
    expect(row(out, 'SUP-03').flags['NEVER ASSESSED'].raised).toBe(false);
    expect(row(out, 'SUP-03').flags['NEVER ASSESSED'].explanation).toMatch(/NOT APPLICABLE/);
  });
});

describe('§4.2 qualification and SINGLE SOURCE (part-family level)', () => {
  it('approved = qualified by default; one supplier family → SINGLE SOURCE on that supplier', () => {
    const out = run([]);
    expect(row(out, 'SUP-02').flags['SINGLE SOURCE'].raised).toBe(true);
    expect(row(out, 'SUP-02').flags['SINGLE SOURCE'].families).toEqual(['gizmos']);
    expect(row(out, 'SUP-01').flags['SINGLE SOURCE'].raised).toBe(false);
  });
  it('a memo removing qualification for a family makes the other supplier single source', () => {
    const out = run([memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Beta Parts', body: 'Beta failed requalification for widgets and must not be used for new orders.' })]);
    expect(row(out, 'SUP-01').flags['SINGLE SOURCE'].raised).toBe(true);
    expect(row(out, 'SUP-02').approvalStatus).toBe('APPROVED');
    expect(row(out, 'SUP-02').notes.some((n) => /Failed qualification/.test(n.text))).toBe(true);
  });
  it('a newer memo affirming qualification for the family restores it; a newer silent memo does not', () => {
    const fail = memoFile({ id: 'MEMO-01', date: '2025-01-01', supplier: 'Beta Parts', body: 'Beta failed qualification for widgets.' });
    const silent = memoFile({ id: 'MEMO-02', date: '2026-01-01', supplier: 'Beta Parts', body: 'Prices are stable.' });
    expect(row(run([fail, silent]), 'SUP-01').flags['SINGLE SOURCE'].raised).toBe(true);
    const ok = memoFile({ id: 'MEMO-03', date: '2026-02-01', supplier: 'Beta Parts', body: 'Beta passed requalification for widgets.' });
    expect(row(run([fail, silent, ok]), 'SUP-01').flags['SINGLE SOURCE'].raised).toBe(false);
  });
  it('zero qualified suppliers is a family finding, not a supplier flag', () => {
    const out = run([memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Beta Parts', body: 'Beta failed qualification for gizmos.' })]);
    const fam = out.families.find((f) => f.family === 'gizmos')!;
    expect(fam.noQualifiedSupplier).toBe(true);
    expect(row(out, 'SUP-02').flags['SINGLE SOURCE'].raised).toBe(false);
    expect(out.summary.familiesWithoutQualified).toBe(1);
  });
  it('a removal sentence that names no listed family goes to review and changes nothing', () => {
    const out = run([memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Beta Parts', body: 'Beta failed qualification for sprockets.' })]);
    expect(row(out, 'SUP-01').flags['SINGLE SOURCE'].raised).toBe(false);
    expect(out.reviewQueue.find((q) => q.type === 'STATEMENT')?.detail).toMatch(/does not name a part family/);
  });
  it('a sentence about another supplier never sets that supplier\'s position', () => {
    const out = run([memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'Beta failed qualification for widgets.' })]);
    expect(row(out, 'SUP-01').flags['SINGLE SOURCE'].raised).toBe(false);
    expect(row(out, 'SUP-02').notes.some((n) => /does not set SUP-02/.test(n.text))).toBe(true);
  });
  it('same-date contradictory qualification → status CANNOT DETERMINE only where it matters', () => {
    const out = run([
      memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Beta Parts', body: 'Beta failed qualification for widgets.' }),
      memoFile({ id: 'MEMO-02', date: '2026-01-01', supplier: 'Beta Parts', body: 'Beta remains qualified for widgets.' }),
      memoFile({ id: 'MEMO-03', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'Indemnity capped at BHD 10,000.' }),
    ]);
    expect(row(out, 'SUP-01').flags['SINGLE SOURCE'].raised).toBe('UNDETERMINED');
    expect(row(out, 'SUP-01').status).toBe('CANNOT DETERMINE');
  });
});

describe('§2 matching and human review', () => {
  const odd = memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Alfa Pumps', body: 'Indemnity capped at BHD 10,000.' });
  it('a near-miss name is CANNOT DETERMINE (MATCH), never attached', () => {
    const out = run([odd]);
    expect(out.matches[0]!.outcome.kind).toBe('CANNOT DETERMINE (MATCH)');
    expect(row(out, 'SUP-01').indemnity.position).toBe('CANNOT DETERMINE');
    expect(out.summary.unmatchedMemos).toBe(1);
    expect(out.summary.pendingReviews).toBe(1);
  });
  it('a reviewer decision attaches it, is attributed, and changes the fingerprint', () => {
    const before = run([odd]);
    const sha = parseMemo({ text: odd.text, fileName: odd.name }).sha256;
    const d: ReviewDecision = { id: 'R-1', type: 'MATCH_MEMO', memoId: 'MEMO-01', memoSha256: sha, supplierId: 'SUP-01', reason: 'typo', actor: 'Buyer', at: '2026-11-17T10:00:00Z' };
    const after = run([odd], { decisions: [d] });
    expect(after.matches[0]!.outcome).toMatchObject({ kind: 'MATCHED', via: 'REVIEW', reviewId: 'R-1' });
    expect(row(after, 'SUP-01').indemnity.position).toBe('GAP');
    expect(after.coverage[0]!.notes.join(' ')).toMatch(/human review/);
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
    expect(after.summary.pendingReviews).toBe(0);
  });
  it('a decision made against different memo content is ignored', () => {
    const d: ReviewDecision = { id: 'R-2', type: 'MATCH_MEMO', memoId: 'MEMO-01', memoSha256: 'deadbeef', supplierId: 'SUP-01', reason: 'typo', actor: 'Buyer', at: '2026-11-17T10:00:00Z' };
    const stale = run([odd], { decisions: [d] });
    expect(stale.matches[0]!.outcome.kind).toBe('CANNOT DETERMINE (MATCH)');
    expect(stale.warnings.join(' ')).toMatch(/content changed/);
  });
  it('a reviewer can classify an unclassified sentence; the quotation stays exact', () => {
    const f = memoFile({ id: 'MEMO-01', date: '2026-01-01', supplier: 'Alpha Pumps', body: 'Liability is capped at BHD 10,000.' });
    const sha = parseMemo({ text: f.text, fileName: f.name }).sha256;
    const out = run([f], { decisions: [{ id: 'R-3', type: 'CLASSIFY_STATEMENT', memoId: 'MEMO-01', memoSha256: sha, sentenceIndex: 0, kind: 'INDEMNITY_CAP', amountBhd: 10000, reason: 'Legal confirmed the liability cap is the indemnity cap', actor: 'Legal', at: '2026-11-17T10:00:00Z' }] });
    const r = row(out, 'SUP-01');
    expect(r.indemnity.position).toBe('GAP');
    expect(r.indemnity.governing).toMatchObject({ quote: 'Liability is capped at BHD 10,000.', reviewId: 'R-3' });
  });
});

describe('determinism', () => {
  it('same inputs → byte-identical output regardless of file order', () => {
    const memos = [
      memoFile({ id: 'MEMO-01', date: '2025-01-01', supplier: 'Alpha Pumps', body: 'Indemnity capped at BHD 120,000.' }),
      memoFile({ id: 'MEMO-02', date: '2026-01-01', supplier: 'Beta Parts', body: 'The contract contains no indemnity clause.' }),
    ];
    const a = run(memos);
    const b = run([...memos].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.outputFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
