import { describe, expect, it } from 'vitest';
import { makeEntry, verifyChain, type AuditEntry } from '../../src/audit/audit';

function chain(n: number): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (let i = 0; i < n; i++) out.push(makeEntry(out[i - 1], { at: `2026-11-17T10:0${i}:00Z`, actor: 'A', action: 'TEST', ref: `R${i}`, before: null, after: { i }, reason: 'r' }));
  return out;
}

describe('audit hash chain', () => {
  it('verifies an intact chain', () => expect(verifyChain(chain(5))).toEqual({ ok: true, checked: 5 }));
  it('detects edited content', () => {
    const c = chain(4);
    c[2] = { ...c[2]!, reason: 'edited' };
    expect(verifyChain(c)).toMatchObject({ ok: false, brokenAt: 3 });
  });
  it('detects deleted entries', () => {
    const c = chain(4);
    c.splice(1, 1);
    expect(verifyChain(c).ok).toBe(false);
  });
});
