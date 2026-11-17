import { hashObject } from '../hash';
import type { RuleSet } from './ruleset';

/**
 * RR-C5 — Brightkeel Pumps Manufacturing W.L.L. supplier scorecard. Version V1.2 (pack 2026-11-08).
 * As-of date 2026-10-31. IMMUTABLE BASELINE: deep-frozen; its content hash is pinned by a test.
 *
 * §6 Scorecard status (one per supplier):
 *  RED  — SINGLE SOURCE and (INDEMNITY GAP or NEVER ASSESSED)
 *  AMBER — otherwise, any one of SINGLE SOURCE, INDEMNITY GAP, NEVER ASSESSED
 *  CANNOT DETERMINE — no flag, but the indemnity position is CANNOT DETERMINE
 *  GREEN — no flag and indemnity NO GAP
 */
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

export const RR_C5_V1_2: Readonly<RuleSet> = deepFreeze<RuleSet>({
  id: 'RR-C5',
  version: '1.2',
  name: 'RR-C5 V1.2 — official baseline',
  lifecycle: 'OFFICIAL',
  state: 'ACTIVE',
  basedOn: null,
  description:
    'Official RR-C5 rule card V1.2 (as of 2026-10-31): evidence §1, matching §2, coverage §3, flags §4 (NEVER ASSESSED, SINGLE SOURCE, INDEMNITY), contradictions §5, status §6.',
  parameters: {
    asOf: '2026-10-31',
    indemnityThresholdBhd: 50000,
    legalSuffixes: ['WLL', 'Co', 'Company', 'Ltd', 'LLC', 'FZE'],
    approvedStatusValue: 'APPROVED',
    expectedMemoCount: 24,
  },
  decisionTable: [
    {
      id: 'S6-RED',
      priority: 1,
      label: 'RED — SINGLE SOURCE and (INDEMNITY GAP or NEVER ASSESSED)',
      when: { all: [{ fact: 'singleSource', is: true }, { any: [{ fact: 'indemnityGap', is: true }, { fact: 'neverAssessed', is: true }] }] },
      outcome: 'RED',
      evidenceRequired: ['SINGLE SOURCE'],
    },
    {
      id: 'S6-AMBER',
      priority: 2,
      label: 'AMBER — otherwise, any one of SINGLE SOURCE, INDEMNITY GAP, NEVER ASSESSED',
      when: { any: [{ fact: 'singleSource', is: true }, { fact: 'indemnityGap', is: true }, { fact: 'neverAssessed', is: true }] },
      outcome: 'AMBER',
      evidenceRequired: [],
    },
    {
      id: 'S6-CD',
      priority: 3,
      label: 'CANNOT DETERMINE — no flag, but the indemnity position is CANNOT DETERMINE',
      when: { fact: 'indemnity', is: 'CANNOT DETERMINE' },
      outcome: 'CANNOT DETERMINE',
      evidenceRequired: ['INDEMNITY POSITION'],
    },
    {
      id: 'S6-GREEN',
      priority: 4,
      label: 'GREEN — no flag and indemnity NO GAP',
      when: { fact: 'indemnity', is: 'NO GAP' },
      outcome: 'GREEN',
      evidenceRequired: ['INDEMNITY POSITION'],
    },
  ],
  createdAt: '2026-11-08',
  approvedBy: 'Pack issuer (RR-C5 V1.2)',
  approvedAt: '2026-11-08',
  approvalReason: 'Official rule card as issued in pack V1.2.',
});

/** Content hash of the official baseline (excluding nothing). Pinned in tests. */
export const RR_C5_V1_2_HASH = hashObject(RR_C5_V1_2);
export const ENGINE_VERSION = '1.0.0';
