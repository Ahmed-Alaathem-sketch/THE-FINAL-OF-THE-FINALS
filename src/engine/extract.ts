import { normalizeSupplierName } from './normalize';
import type { MasterRow, Memo, Sentence, Statement } from './types';

/**
 * Deterministic statement extractor (pattern-based, no AI).
 * It classifies memo sentences into typed statements that the rule engine consumes.
 * Anything it cannot classify with certainty becomes UNCLASSIFIED and goes to the human review queue.
 */

const WORD = (s: string) => s.toLowerCase().replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Distinctive name tokens per supplier, used only to detect that a sentence names *another* supplier. */
export function buildMentionIndex(master: MasterRow[], legalSuffixes: readonly string[]): { supplierId: string; tokens: string[] }[] {
  const firstTokens = new Map<string, number>();
  const norm = master.map((r) => ({ id: r.supplierId, n: normalizeSupplierName(r.supplierName, legalSuffixes).normalized }));
  for (const { n } of norm) {
    const t = n.split(' ')[0] ?? '';
    firstTokens.set(t, (firstTokens.get(t) ?? 0) + 1);
  }
  return norm.map(({ id, n }) => {
    const first = n.split(' ')[0] ?? '';
    const tokens = [n];
    if (first.length >= 4 && firstTokens.get(first) === 1) tokens.push(first);
    return { supplierId: id, tokens };
  });
}

function mentionedSuppliers(sentence: string, index: ReturnType<typeof buildMentionIndex>, selfId: string | null): string[] {
  const w = ' ' + WORD(sentence) + ' ';
  const out: string[] = [];
  for (const { supplierId, tokens } of index) {
    if (supplierId === selfId) continue;
    if (tokens.some((t) => t && (w.includes(' ' + t + ' ') || w.includes(' ' + t + 's ') || w.includes(' ' + t + ' s ')))) out.push(supplierId);
  }
  return out;
}

function familyRegex(family: string): RegExp {
  const words = WORD(family).split(' ').map((x) => x.replace(/s$/, '')).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?');
  return new RegExp('(^| )' + words.join(' ') + '( |$)');
}

export function familiesInSentence(sentence: string, families: readonly string[]): string[] {
  const w = WORD(sentence);
  return families.filter((f) => familyRegex(f).test(w));
}

const RE = {
  indemnity: /\bindemnit/i,
  liability: /\bliabilit/i,
  none: /\bno (?:product )?indemnity\b|\bwithout (?:an |any )?(?:product )?indemnity\b|\b(?:does not|doesn't|do not) (?:include|contain|carry|have|provide) (?:an |any )?(?:product )?indemnity\b|\bindemnity clause (?:is|was|has been) (?:absent|missing|removed|deleted|dropped)\b/i,
  amount: /\bBHD\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?\b|\b([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?\s*BHD\b/gi,
  capCue: /\bcap(?:s|ped)?\b|\blimit(?:ed)?\b|\bup to\b|\bmaximum\b/i,
  notStated: /\bstandard terms\b|\bterms and conditions apply\b|\bto be confirmed\b|\bunder negotiation\b|\bnot (?:yet )?(?:agreed|confirmed|stated)\b/i,
  qualif: /qualif|\bmust not be used\b|\bnot to be used\b/i,
  removed: /\bfail(?:ed|s)?\b[^.]*qualif|\bdisqualif|\bmust not be used\b|\bnot to be used\b|\bno longer qualified\b|\bnot qualified\b|\bqualification (?:was |has been |is )?(?:withdrawn|suspended|revoked|removed)\b/i,
  affirmed: /\b(?:remains?|is|are|was|now|fully|still)\s+(?:our\s+)?(?:sole\s+|only\s+)?(?:fully\s+)?qualified\b|\bqualified (?:source|supplier)\b|\bpassed (?:re)?qualification\b|\brequalified\b/i,
  assessmentPlanned: /\bassessment\b[^.]*\b(?:scheduled|planned|due|will take place|booked)\b|\b(?:scheduled|planned)\b[^.]*\bassessment\b/i,
  quality: /\bfailed\b|\bcorrective action\b|\brejected\b/i,
};

export function parseAmount(s: string): number[] {
  const out: number[] = [];
  RE.amount.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.amount.exec(s))) {
    const digits = (m[1] ?? m[2] ?? '').replace(/,/g, '');
    const n = Number(digits);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function classifySentence(
  memo: Memo,
  sentence: Sentence,
  selfSupplierId: string | null,
  selfFamilies: readonly string[],
  mentionIndex: ReturnType<typeof buildMentionIndex>,
): Statement | null {
  const s = sentence.text;
  const base = { memoId: memo.memoId, memoDate: memo.date, sentenceIndex: sentence.index, quote: s };
  const mentions = mentionedSuppliers(s, mentionIndex, selfSupplierId);
  const hasIndemnity = RE.indemnity.test(s);
  const hasLiability = RE.liability.test(s);

  if (hasIndemnity || hasLiability) {
    if (mentions.length > 0) {
      return { ...base, kind: 'UNCLASSIFIED', mentions, reviewReason: 'Indemnity/liability sentence names another master supplier — it cannot be attributed by pattern.' };
    }
    const amounts = parseAmount(s);
    const none = RE.none.test(s);
    if (none && amounts.length === 0) return { ...base, kind: 'INDEMNITY_NONE' };
    if (hasIndemnity && !none && amounts.length === 1 && RE.capCue.test(s)) return { ...base, kind: 'INDEMNITY_CAP', amountBhd: amounts[0]! };
    if (RE.notStated.test(s) && amounts.length === 0 && !none) return { ...base, kind: 'INDEMNITY_NOT_STATED' };
    const reason = !hasIndemnity
      ? 'Mentions liability but not indemnity — a liability cap is not necessarily an indemnity position.'
      : amounts.length > 1
        ? 'More than one amount in one indemnity sentence.'
        : 'Indemnity wording not recognised by the deterministic patterns.';
    return { ...base, kind: 'UNCLASSIFIED', reviewReason: reason };
  }

  if (RE.qualif.test(s)) {
    if (mentions.length > 0) return { ...base, kind: 'OTHER_SUPPLIER_MENTION', mentions };
    const removed = RE.removed.test(s);
    const affirmed = RE.affirmed.test(s);
    const families = familiesInSentence(s, selfFamilies);
    if (removed && !affirmed) {
      if (families.length === 0) return { ...base, kind: 'UNCLASSIFIED', reviewReason: 'Qualification removal does not name a part family listed for this supplier.' };
      return { ...base, kind: 'QUALIFICATION_REMOVED', families };
    }
    if (affirmed && !removed) return { ...base, kind: 'QUALIFICATION_AFFIRMED', families };
    return { ...base, kind: 'UNCLASSIFIED', reviewReason: 'Qualification wording not recognised by the deterministic patterns.' };
  }

  if (RE.assessmentPlanned.test(s) && mentions.length === 0) return { ...base, kind: 'ASSESSMENT_PLANNED' };
  if (mentions.length > 0) return { ...base, kind: 'OTHER_SUPPLIER_MENTION', mentions };
  if (RE.quality.test(s)) return { ...base, kind: 'QUALITY_NOTE' };
  return null;
}

export function extractStatements(
  memo: Memo,
  selfSupplierId: string | null,
  selfFamilies: readonly string[],
  mentionIndex: ReturnType<typeof buildMentionIndex>,
): Statement[] {
  const out: Statement[] = [];
  for (const sentence of memo.sentences) {
    const st = classifySentence(memo, sentence, selfSupplierId, selfFamilies, mentionIndex);
    if (st) out.push(st);
  }
  return out;
}
