import { describe, expect, it } from 'vitest';
import { assess } from '../../src/engine/assess';
import { diffRuns } from '../../src/engine/diff';
import { approvalPhrase, conflictsWith, createDraft, validateRuleSet } from '../../src/engine/rules/manage';
import { RR_C5_V1_2 } from '../../src/engine/rules/rr-c5-v1.2';
import { packSources } from '../helpers/pack';
import { memoFile } from '../helpers/build';

describe('rule management', () => {
  it('the official baseline cannot be mutated', () => {
    expect(() => { (RR_C5_V1_2.parameters as { indemnityThresholdBhd: number }).indemnityThresholdBhd = 1; }).toThrow();
    expect(() => { (RR_C5_V1_2.decisionTable as unknown[]).push({}); }).toThrow();
    expect(validateRuleSet(RR_C5_V1_2 as never)).toEqual([]);
  });
  it('a draft copy is EXPERIMENTAL, unapproved, and identical in effect until edited', () => {
    const d = createDraft(RR_C5_V1_2, '1.3', 'Test', '2026-11-17');
    expect(d).toMatchObject({ lifecycle: 'EXPERIMENTAL', state: 'DRAFT', approvedBy: null, basedOn: 'RR-C5@1.2' });
    expect(conflictsWith(d, RR_C5_V1_2)).toEqual({ decisions: [], parameters: [] });
    expect(approvalPhrase(d)).toBe('APPROVE RR-C5@1.3');
  });
  it('rejects unknown facts, unknown statuses, and incomplete tables', () => {
    const d = createDraft(RR_C5_V1_2, '1.3', 'Bad', '2026-11-17');
    d.decisionTable[0]!.outcome = 'PURPLE' as never;
    (d.decisionTable[1]!.when as unknown) = { fact: 'creditRisk', is: true };
    expect(validateRuleSet(d).join(' ')).toMatch(/PURPLE.*|creditRisk/);
    const e = createDraft(RR_C5_V1_2, '1.3', 'Incomplete', '2026-11-17');
    e.decisionTable = e.decisionTable.slice(0, 2);
    expect(validateRuleSet(e).join(' ')).toMatch(/Incomplete/);
  });
  it('detects decision and parameter conflicts with the official rules', () => {
    const d = createDraft(RR_C5_V1_2, '1.3', 'Stricter', '2026-11-17');
    d.parameters.indemnityThresholdBhd = 100000;
    d.decisionTable.find((r) => r.id === 'S6-CD')!.outcome = 'AMBER';
    const c = conflictsWith(d, RR_C5_V1_2);
    expect(c.parameters).toEqual(['Indemnity threshold BHD 50000 → 100000']);
    expect(c.decisions.length).toBe(1);
    expect(c.decisions[0]!.official).toBe('CANNOT DETERMINE');
  });
  it('a sandbox run under a draft never alters the official result; diffs are explicit', () => {
    const src = packSources();
    const official = assess({ ...src, ruleSet: RR_C5_V1_2 });
    const d = createDraft(RR_C5_V1_2, '1.3', 'Stricter', '2026-11-17');
    d.parameters.indemnityThresholdBhd = 100000;
    const sandbox = assess({ ...src, ruleSet: d });
    const again = assess({ ...src, ruleSet: RR_C5_V1_2 });
    expect(again.outputFingerprint).toBe(official.outputFingerprint);
    const diff = diffRuns(official, sandbox);
    // caps below 100,000: SUP-04 75k, SUP-06 60k, SUP-08 50k, SUP-10 80k, SUP-12 90k, SUP-16 70k, SUP-18 55k, SUP-21 60k, SUP-22 75k
    expect(diff.suppliers.map((s) => s.supplierId).sort()).toEqual(['SUP-04', 'SUP-06', 'SUP-08', 'SUP-10', 'SUP-12', 'SUP-16', 'SUP-18', 'SUP-21', 'SUP-22']);
    expect(sandbox.ruleSetVersion).toBe('1.3');
  });
  it('intake of a new memo changes the scorecard only where the rules say', () => {
    const src = packSources();
    const before = assess({ ...src, ruleSet: RR_C5_V1_2 });
    const m25 = memoFile({ id: 'MEMO-25', date: '2026-11-10', supplier: 'Harrowmere Freight Lines', body: "Harrowmere's carriage agreement includes an indemnity capped at BHD 40,000." });
    const after = assess({ ...src, memos: [...src.memos, m25], ruleSet: RR_C5_V1_2 });
    const diff = diffRuns(before, after);
    expect(diff.memosAdded).toEqual(['MEMO-25']);
    expect(diff.suppliers.map((s) => s.supplierId)).toEqual(['SUP-23']);
    expect(after.scorecard.find((r) => r.supplierId === 'SUP-23')!.status).toBe('AMBER');
  });
});
