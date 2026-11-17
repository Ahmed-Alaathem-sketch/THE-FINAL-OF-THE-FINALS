import type { NormalizationTrace } from './types';

/**
 * RR-C5 §2 — supplier-name normalisation, applied IN THIS ORDER:
 *  1. Remove full stops ("W.L.L." → "WLL", "Co." → "Co").
 *  2. Replace every other punctuation mark with a space.
 *  3. Ignore letter case.
 *  4. Remove the legal suffixes (WLL, Co, Company, Ltd, LLC, FZE) wherever they appear as separate words.
 *  5. Ignore a plural "s" at the end of the last remaining word.
 * Any other difference → CANNOT DETERMINE (MATCH). No fuzzy/approximate matching.
 */

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

export function normalizeSupplierName(input: string, legalSuffixes: readonly string[]): NormalizationTrace {
  const raw = input.normalize('NFC');
  // Step 1: full stops only (U+002E). Other dot-like characters are "other punctuation".
  const step1 = raw.replace(/\./g, '');
  // Step 2: every remaining punctuation or symbol character becomes a space.
  const step2 = step1.replace(/[\p{P}\p{S}]/gu, ' ');
  // Step 3: case-insensitive.
  const step3 = step2.toLowerCase();
  // Step 4: drop suffix words (whole-word tokens).
  const suffixes = new Set(legalSuffixes.map((s) => s.toLowerCase()));
  const tokens = collapse(step3).split(' ').filter((t) => t.length > 0);
  const kept = tokens.filter((t) => !suffixes.has(t));
  const step4 = kept.join(' ');
  // Step 5: a single trailing "s" on the last remaining word (only when the word is longer than one letter).
  let step5 = step4;
  if (kept.length > 0) {
    const last = kept[kept.length - 1]!;
    if (last.length > 1 && last.endsWith('s')) {
      step5 = [...kept.slice(0, -1), last.slice(0, -1)].join(' ');
    }
  }
  return {
    input,
    step1RemoveFullStops: step1,
    step2PunctuationToSpace: step2,
    step3IgnoreCase: step3,
    step4RemoveSuffixes: step4,
    step5IgnorePluralS: step5,
    normalized: step5,
  };
}

export function namesMatch(a: string, b: string, legalSuffixes: readonly string[]): boolean {
  const na = normalizeSupplierName(a, legalSuffixes).normalized;
  const nb = normalizeSupplierName(b, legalSuffixes).normalized;
  return na.length > 0 && na === nb;
}
