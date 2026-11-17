import { describe, expect, it } from 'vitest';
import { namesMatch, normalizeSupplierName } from '../../src/engine/normalize';
import { RR_C5_V1_2 } from '../../src/engine/rules/rr-c5-v1.2';

const S = RR_C5_V1_2.parameters.legalSuffixes;
const n = (s: string) => normalizeSupplierName(s, S).normalized;

describe('RR-C5 §2 matching — steps in order', () => {
  it('step 1 removes full stops (W.L.L. → WLL, Co. → Co)', () => {
    const t = normalizeSupplierName('Corranby Foundry Works W.L.L.', S);
    expect(t.step1RemoveFullStops).toBe('Corranby Foundry Works WLL');
    expect(t.normalized).toBe('corranby foundry work');
  });
  it('step 2 turns other punctuation into spaces', () => {
    expect(normalizeSupplierName('Kestrel-wire (Electronics) & Co, FZE', S).step2PunctuationToSpace).toBe('Kestrel wire  Electronics    Co  FZE');
    expect(n('Kestrel-wire')).toBe('kestrel wire');
  });
  it('step 3 ignores case and step 4 removes suffix words anywhere', () => {
    expect(n('TALBECK CASTINGS CO.')).toBe('talbeck casting');
    expect(n('Ltd Talbeck Company Castings LLC')).toBe('talbeck casting');
  });
  it('step 4 removes suffixes only as separate words', () => {
    expect(n('Coldharbour Enclosures')).toBe('coldharbour enclosure');
    expect(n('Costa Co')).toBe('costa');
  });
  it('step 5 ignores a plural s only on the last remaining word', () => {
    expect(n('Gulfreach Fastener Co')).toBe(n('Gulfreach Fasteners Company W.L.L.'));
    expect(n('Talbecks Casting')).not.toBe(n('Talbeck Casting'));
  });
  it('order matters: "W.L.L" becomes WLL before suffix removal; "W-L-L" does not', () => {
    expect(n('Acme W.L.L.')).toBe('acme');
    expect(n('Acme W-L-L')).toBe('acme w l l');
  });
  it('rejects approximate matches', () => {
    expect(namesMatch('Corranby Foundry', 'Corranby Foundry Works W.L.L.', S)).toBe(false);
    expect(namesMatch('Coranby Foundry Works', 'Corranby Foundry Works W.L.L.', S)).toBe(false);
    expect(namesMatch('Corranby Foundry Works', 'Corranby Foundry Works W.L.L.', S)).toBe(true);
  });
  it('empty or suffix-only names never match', () => {
    expect(namesMatch('', '', S)).toBe(false);
    expect(namesMatch('Co. Ltd', 'LLC', S)).toBe(false);
  });
});
