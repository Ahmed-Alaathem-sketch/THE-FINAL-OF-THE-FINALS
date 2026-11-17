import type { StatementKind } from './types';

/**
 * Human reviewer decisions. They are explicit, attributed run inputs (part of the input fingerprint),
 * never silent overrides. Each one is pinned to the memo content hash it was made against.
 */
export type ReviewDecision =
  | {
      id: string;
      type: 'MATCH_MEMO';
      memoId: string;
      memoSha256: string;
      /** null = reviewer confirms the memo matches no master supplier. */
      supplierId: string | null;
      reason: string;
      actor: string;
      at: string;
    }
  | {
      id: string;
      type: 'CLASSIFY_STATEMENT';
      memoId: string;
      memoSha256: string;
      sentenceIndex: number;
      kind: Extract<StatementKind, 'INDEMNITY_CAP' | 'INDEMNITY_NONE' | 'INDEMNITY_NOT_STATED' | 'QUALIFICATION_REMOVED' | 'QUALIFICATION_AFFIRMED'> | 'NOT_RELEVANT';
      amountBhd?: number;
      families?: string[];
      reason: string;
      actor: string;
      at: string;
    }
  | {
      id: string;
      type: 'ACKNOWLEDGE';
      key: string;
      reason: string;
      actor: string;
      at: string;
    };

export function decisionKey(d: ReviewDecision): string {
  if (d.type === 'MATCH_MEMO') return `MEMO_MATCH:${d.memoId}`;
  if (d.type === 'CLASSIFY_STATEMENT') return `STATEMENT:${d.memoId}:${d.sentenceIndex}`;
  return d.key;
}

/** Latest decision per key wins (ordered by `at`, then id) — deterministic. */
export function latestDecisions(ds: readonly ReviewDecision[]): Map<string, ReviewDecision> {
  const sorted = [...ds].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const m = new Map<string, ReviewDecision>();
  for (const d of sorted) m.set(decisionKey(d), d);
  return m;
}
