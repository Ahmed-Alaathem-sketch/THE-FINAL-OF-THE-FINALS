import { sha256 } from '../hash';
import type { Memo, Sentence } from '../types';
import { isIsoDate } from './records';

/**
 * Memo parser. Accepts the pack's Markdown format:
 *   # MEMO-01 — Title
 *   **Date:** 2024-11-12 · **Author:** … · **Supplier (as written):** … · **Company:** …
 *   body paragraphs …
 * and plain-text variants ("Date: …" lines) produced by PDF/DOCX extraction.
 */

export class MemoParseError extends Error {
  constructor(message: string) { super(message); this.name = 'MemoParseError'; }
}

const ID_RE = /\bMEMO-\d{1,4}\b/;
const FOOTER_RE = /^\*?SYNTHETIC\b/i;

interface HeaderFields { date?: string; author?: string; supplier?: string; company?: string; memoId?: string }

function readHeaderFields(lines: string[]): { fields: HeaderFields; consumed: Set<number> } {
  const fields: HeaderFields = {};
  const consumed = new Set<number>();
  const keyRe = /\*{0,2}\s*(Memo ID|Date|Author|Supplier \(as written\)|Supplier|Company)\s*:\s*\*{0,2}\s*:?\s*/gi;
  lines.forEach((line, idx) => {
    if (idx > 12) return;
    const parts = line.split('·');
    let hit = false;
    for (const part of parts) {
      keyRe.lastIndex = 0;
      const m = keyRe.exec(part);
      if (!m || m.index > 3) continue;
      const key = m[1]!.toLowerCase();
      const value = part.slice(m.index + m[0].length).replace(/\*+/g, '').trim();
      hit = true;
      if (key === 'date') fields.date ??= value;
      else if (key === 'author') fields.author ??= value;
      else if (key.startsWith('supplier')) fields.supplier ??= value;
      else if (key === 'company') fields.company ??= value;
      else if (key === 'memo id') fields.memoId ??= value;
    }
    if (hit) consumed.add(idx);
  });
  return { fields, consumed };
}

const ABBREV_END = /(?:\b(?:Co|Ltd|No|Mr|Mrs|Ms|Dr|St|vs|etc|approx|e\.g|i\.e|W\.L\.L|L\.L\.C)\.|\b[A-Z]\.)$/;

/** Split a body into sentences with offsets. Deterministic, abbreviation-aware. */
export function splitSentences(body: string): Sentence[] {
  const out: Sentence[] = [];
  const paraRe = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(body))) {
    const para = pm[0];
    const base = pm.index;
    let start = 0;
    const boundary = /([.!?])(["')\]]?)(\s+)(?=["'([]?[A-Z0-9])/g;
    let bm: RegExpExecArray | null;
    while ((bm = boundary.exec(para))) {
      const endIdx = bm.index + bm[1]!.length + bm[2]!.length;
      const candidate = para.slice(start, endIdx);
      if (ABBREV_END.test(candidate)) continue;
      pushSentence(out, para, base, start, endIdx);
      start = endIdx + bm[3]!.length;
    }
    pushSentence(out, para, base, start, para.length);
  }
  return out;
}

function pushSentence(out: Sentence[], para: string, base: number, s: number, e: number) {
  let a = s, b = e;
  while (a < b && /\s/.test(para[a]!)) a++;
  while (b > a && /\s/.test(para[b - 1]!)) b--;
  if (b <= a) return;
  out.push({ index: out.length, text: para.slice(a, b), start: base + a, end: base + b });
}

export interface ParsedMemoInput { text: string; fileName: string; overrides?: Partial<{ memoId: string; date: string; supplierAsWritten: string; author: string; title: string }> }

export function parseMemo({ text, fileName, overrides }: ParsedMemoInput): Memo {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const warnings: string[] = [];

  let memoId = '';
  let title = '';
  let titleLine = -1;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const m = /^#{0,3}\s*(MEMO-\d{1,4})\s*(?:[—–-]+\s*(.*))?$/.exec(lines[i]!.trim());
    if (m) { memoId = m[1]!; title = (m[2] ?? '').trim(); titleLine = i; break; }
  }
  const { fields, consumed } = readHeaderFields(lines);
  if (!memoId && fields.memoId && ID_RE.test(fields.memoId)) memoId = ID_RE.exec(fields.memoId)![0];
  if (!memoId) {
    const fm = ID_RE.exec(fileName);
    if (fm) { memoId = fm[0]; warnings.push(`Memo ID taken from the file name ${fileName}.`); }
  }
  if (overrides?.memoId) memoId = overrides.memoId.trim();
  if (!memoId) throw new MemoParseError(`${fileName}: no memo ID found (expected a heading like "# MEMO-25 — Title").`);
  memoId = memoId.toUpperCase().replace(/^MEMO-(\d)$/, 'MEMO-0$1');

  let date = (overrides?.date ?? fields.date ?? '').trim();
  if (date && !isIsoDate(date)) { warnings.push(`Date "${date}" is not a valid yyyy-mm-dd date — treated as NOT STATED.`); date = ''; }
  if (!date) warnings.push('Memo date NOT STATED — the memo cannot be ordered against other memos (§4.3, §5).');
  const supplierAsWritten = (overrides?.supplierAsWritten ?? fields.supplier ?? '').trim();
  if (!supplierAsWritten) warnings.push('Supplier (as written) NOT STATED — the memo cannot be matched (§2).');

  const bodyLines = lines.filter((l, i) => i !== titleLine && !consumed.has(i) && l.trim() !== '---' && !FOOTER_RE.test(l.trim()));
  const body = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!body) warnings.push('Memo body is empty.');

  return {
    memoId,
    title: overrides?.title ?? title,
    date,
    author: overrides?.author ?? fields.author ?? '',
    supplierAsWritten,
    company: fields.company ?? '',
    body,
    sentences: splitSentences(body),
    fileName,
    sha256: sha256(normalized),
    duplicateFiles: [],
    warnings,
  };
}

/** Split a batch file ("# MEMOS BATCH …" followed by "# MEMO-xx" sections) into memo texts. */
export function splitBatch(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const starts: number[] = [];
  const re = /^#{1,3}\s*MEMO-\d{1,4}\b.*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) starts.push(m.index);
  return starts.map((s, i) => normalized.slice(s, starts[i + 1] ?? normalized.length).replace(/\n-{3,}\s*$/, '').trim());
}

/** Content identity for de-duplicating the same memo found in a single file and a batch file. */
export function memoContentKey(m: Memo): string {
  return sha256([m.memoId, m.date, m.supplierAsWritten, m.title, m.body.replace(/\s+/g, ' ').trim()].join('\u0000'));
}
