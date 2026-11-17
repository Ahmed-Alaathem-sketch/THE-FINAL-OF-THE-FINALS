import { canonicalJson, sha256 } from '../engine/hash';

/** Append-only audit entry. Each entry's hash covers its content and the previous hash (tamper-evident chain). */
export interface AuditEntry {
  seq: number;
  at: string;
  actor: string;
  action: string;
  ref: string;
  before: unknown;
  after: unknown;
  reason: string;
  prevHash: string;
  hash: string;
}

export const GENESIS = '0'.repeat(64);

export function hashEntry(e: Omit<AuditEntry, 'hash'>): string {
  return sha256(canonicalJson({ seq: e.seq, at: e.at, actor: e.actor, action: e.action, ref: e.ref, before: e.before ?? null, after: e.after ?? null, reason: e.reason, prevHash: e.prevHash }));
}

export function makeEntry(prev: AuditEntry | undefined, data: Pick<AuditEntry, 'at' | 'actor' | 'action' | 'ref' | 'before' | 'after' | 'reason'>): AuditEntry {
  const partial = { ...data, seq: (prev?.seq ?? 0) + 1, prevHash: prev?.hash ?? GENESIS };
  return { ...partial, hash: hashEntry(partial) };
}

export interface ChainCheck { ok: boolean; checked: number; brokenAt?: number; problem?: string }

export function verifyChain(entries: AuditEntry[]): ChainCheck {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!;
    if (e.seq !== i + 1) return { ok: false, checked: i, brokenAt: e.seq, problem: `Sequence gap: expected ${i + 1}, found ${e.seq}.` };
    if (e.prevHash !== prev) return { ok: false, checked: i, brokenAt: e.seq, problem: `Entry ${e.seq} does not link to the previous entry.` };
    const { hash, ...rest } = e;
    if (hashEntry(rest) !== hash) return { ok: false, checked: i, brokenAt: e.seq, problem: `Entry ${e.seq} content does not match its hash.` };
    prev = hash;
  }
  return { ok: true, checked: sorted.length };
}
