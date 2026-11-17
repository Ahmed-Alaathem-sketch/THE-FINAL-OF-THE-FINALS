import type { IndemnityPosition, Status } from '../types';

/**
 * Rule-set model. RR-C5 V1.2 is the immutable official baseline (see rr-c5-v1.2.ts).
 * Draft versions may change parameters and decision-table rows only; they can never add
 * flags or statuses — the fact and outcome vocabularies below are closed.
 */

export type RuleLifecycle = 'OFFICIAL' | 'USER' | 'EXPERIMENTAL';
export type RuleState = 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'RETIRED';

/** Facts available to the decision table. Closed set. */
export type BoolFact = 'singleSource' | 'indemnityGap' | 'neverAssessed';
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { fact: BoolFact; is: boolean }
  | { fact: 'indemnity'; is: IndemnityPosition };

export interface DecisionRow {
  id: string;
  priority: number;
  label: string;
  when: Condition;
  outcome: Status;
  /** Flags whose evidence must be attached when this row applies. */
  evidenceRequired: ('NEVER ASSESSED' | 'SINGLE SOURCE' | 'INDEMNITY GAP' | 'INDEMNITY POSITION')[];
}

export interface RuleParameters {
  asOf: string;
  indemnityThresholdBhd: number;
  legalSuffixes: string[];
  approvedStatusValue: string;
  expectedMemoCount: number | null;
}

export interface RuleSet {
  id: string;
  version: string;
  name: string;
  lifecycle: RuleLifecycle;
  state: RuleState;
  basedOn: string | null;
  description: string;
  parameters: RuleParameters;
  decisionTable: DecisionRow[];
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
}

export interface Facts {
  singleSource: boolean;
  neverAssessed: boolean;
  indemnity: IndemnityPosition;
}

export function evalCondition(c: Condition, f: Facts): boolean {
  if ('all' in c) return c.all.every((x) => evalCondition(x, f));
  if ('any' in c) return c.any.some((x) => evalCondition(x, f));
  if ('not' in c) return !evalCondition(c.not, f);
  if (c.fact === 'indemnity') return f.indemnity === c.is;
  const v = c.fact === 'indemnityGap' ? f.indemnity === 'GAP' : f[c.fact];
  return v === c.is;
}

export function sortedRows(rs: RuleSet): DecisionRow[] {
  return [...rs.decisionTable].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/** First matching row by priority. Returns null when the table is incomplete for these facts. */
export function decide(rs: RuleSet, f: Facts): DecisionRow | null {
  for (const row of sortedRows(rs)) if (evalCondition(row.when, f)) return row;
  return null;
}

/** All 12 fact combinations (SS × NA × indemnity). */
export function allFactCombinations(): Facts[] {
  const out: Facts[] = [];
  for (const singleSource of [true, false])
    for (const neverAssessed of [true, false])
      for (const indemnity of ['GAP', 'NO GAP', 'CANNOT DETERMINE'] as IndemnityPosition[])
        out.push({ singleSource, neverAssessed, indemnity });
  return out;
}

export function describeCondition(c: Condition): string {
  if ('all' in c) return c.all.map(describeCondition).join(' AND ');
  if ('any' in c) return '(' + c.any.map(describeCondition).join(' OR ') + ')';
  if ('not' in c) return 'NOT ' + describeCondition(c.not);
  const names: Record<string, string> = { singleSource: 'SINGLE SOURCE', indemnityGap: 'INDEMNITY GAP', neverAssessed: 'NEVER ASSESSED' };
  if (c.fact === 'indemnity') return `indemnity = ${c.is}`;
  return c.is ? names[c.fact]! : `no ${names[c.fact]}`;
}

export function describeFacts(f: Facts): string {
  return `SINGLE SOURCE=${f.singleSource ? 'Y' : 'N'}, NEVER ASSESSED=${f.neverAssessed ? 'Y' : 'N'}, indemnity=${f.indemnity}`;
}
