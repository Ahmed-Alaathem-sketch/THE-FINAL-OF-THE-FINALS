import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalJson, sha256 } from '../../src/engine/hash';

describe('sha256', () => {
  it.each(['', 'abc', 'The quick brown fox jumps over the lazy dog', 'ü€😀', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(10_000)])(
    'matches node:crypto for %#',
    (s) => expect(sha256(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex')),
  );
});

describe('canonicalJson', () => {
  it('sorts keys and drops undefined deterministically', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [1, 'x'] } })).toBe('{"a":{"c":[1,"x"]},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});
