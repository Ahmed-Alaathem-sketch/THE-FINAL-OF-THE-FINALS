import { isIsoDate } from '../parse/records';
import { STATUSES, type Status } from '../types';
import { allFactCombinations, decide, describeFacts, type Condition, type Facts, type RuleSet } from './ruleset';

/**
 * Rule-version management. Drafts may change parameters and decision rows only — the fact vocabulary
 * (3 flags + indemnity position) and the 4 statuses are closed, so no new flag or status can appear.
 */

export function createDraft(from: RuleSet, version: string, name: string, now: string): RuleSet {
  const copy = JSON.parse(JSON.stringify(from)) as RuleSet;
  return {
    ...copy,
    version: version.trim(),
    name: name.trim() || `${from.id} V${version} draft`,
    lifecycle: 'EXPERIMENTAL',
    state: 'DRAFT',
    basedOn: `${from.id}@${from.version}`,
    createdAt: now,
    approvedBy: null,
    approvedAt: null,
    approvalReason: null,
  };
}

const BOOL_FACTS = new Set(['singleSource', 'indemnityGap', 'neverAssessed']);
const POSITIONS = new Set(['GAP', 'NO GAP', 'CANNOT DETERMINE']);

function validateCondition(c: Condition, path: string, errors: string[], depth = 0): void {
  if (depth > 8) { errors.push(`${path}: condition nested too deeply.`); return; }
  if (c && typeof c === 'object') {
    if ('all' in c || 'any' in c) {
      const arr = 'all' in c ? c.all : c.any;
      if (!Array.isArray(arr) || arr.length === 0) errors.push(`${path}: empty group.`);
      else arr.forEach((x, i) => validateCondition(x, `${path}.${i}`, errors, depth + 1));
      return;
    }
    if ('not' in c) { validateCondition(c.not, `${path}.not`, errors, depth + 1); return; }
    if ('fact' in c) {
      if (c.fact === 'indemnity') { if (!POSITIONS.has(c.is as string)) errors.push(`${path}: unknown indemnity position "${String(c.is)}".`); return; }
      if (!BOOL_FACTS.has(c.fact)) errors.push(`${path}: unknown fact "${String(c.fact)}" — only the three RR-C5 flags and the indemnity position exist.`);
      else if (typeof c.is !== 'boolean') errors.push(`${path}: value must be true/false.`);
      return;
    }
  }
  errors.push(`${path}: malformed condition.`);
}

export function validateRuleSet(rs: RuleSet): string[] {
  const errors: string[] = [];
  if (!/^[0-9]+(\.[0-9]+){0,3}([-.][A-Za-z0-9]+)?$/.test(rs.version)) errors.push('Version must look like 1.3 or 1.3-draft.');
  const p = rs.parameters;
  if (!isIsoDate(p.asOf)) errors.push('As-of date must be yyyy-mm-dd.');
  if (!Number.isFinite(p.indemnityThresholdBhd) || p.indemnityThresholdBhd <= 0 || p.indemnityThresholdBhd > 1e12) errors.push('Indemnity threshold must be a positive amount in BHD.');
  if (!Array.isArray(p.legalSuffixes) || p.legalSuffixes.some((s) => !/^[A-Za-z0-9]+$/.test(s))) errors.push('Legal suffixes must be single words of letters/digits (step 1–2 already remove punctuation).');
  if (!p.approvedStatusValue.trim()) errors.push('Approved status value is required.');
  if (rs.decisionTable.length === 0) errors.push('The decision table has no rows.');
  const ids = new Set<string>();
  rs.decisionTable.forEach((row, i) => {
    if (!row.id.trim()) errors.push(`Row ${i + 1}: id is required.`);
    if (ids.has(row.id)) errors.push(`Row ${i + 1}: duplicate id ${row.id}.`);
    ids.add(row.id);
    if (!STATUSES.includes(row.outcome as Status)) errors.push(`Row ${row.id}: outcome "${row.outcome}" is not one of ${STATUSES.join(', ')}.`);
    if (!Number.isFinite(row.priority)) errors.push(`Row ${row.id}: priority must be a number.`);
    validateCondition(row.when, `Row ${row.id}`, errors);
  });
  if (errors.length === 0) {
    for (const f of allFactCombinations()) if (!decide(rs, f)) errors.push(`Incomplete: no row decides ${describeFacts(f)}.`);
  }
  return errors;
}

export interface RuleConflict { facts: Facts; official: Status; proposed: Status; description: string }

/** Every fact combination where the proposed table disagrees with the official baseline. */
export function conflictsWith(proposed: RuleSet, official: RuleSet): { decisions: RuleConflict[]; parameters: string[] } {
  const decisions: RuleConflict[] = [];
  for (const f of allFactCombinations()) {
    const a = decide(official, f)?.outcome;
    const b = decide(proposed, f)?.outcome;
    if (a && b && a !== b) decisions.push({ facts: f, official: a, proposed: b, description: `${describeFacts(f)}: official ${a}, proposed ${b}` });
  }
  const parameters: string[] = [];
  const po = official.parameters, pp = proposed.parameters;
  if (po.asOf !== pp.asOf) parameters.push(`As-of date ${po.asOf} → ${pp.asOf}`);
  if (po.indemnityThresholdBhd !== pp.indemnityThresholdBhd) parameters.push(`Indemnity threshold BHD ${po.indemnityThresholdBhd} → ${pp.indemnityThresholdBhd}`);
  if (po.legalSuffixes.join(',') !== pp.legalSuffixes.join(',')) parameters.push(`Legal suffixes [${po.legalSuffixes.join(', ')}] → [${pp.legalSuffixes.join(', ')}]`);
  if (po.approvedStatusValue !== pp.approvedStatusValue) parameters.push(`Approved status value ${po.approvedStatusValue} → ${pp.approvedStatusValue}`);
  if (po.expectedMemoCount !== pp.expectedMemoCount) parameters.push(`Expected memo count ${po.expectedMemoCount} → ${pp.expectedMemoCount}`);
  return { decisions, parameters };
}

export function approvalPhrase(rs: Pick<RuleSet, 'id' | 'version'>): string {
  return `APPROVE ${rs.id}@${rs.version}`;
}
