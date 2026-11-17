import { describe, expect, it } from 'vitest';
import { MemoParseError, parseMemo, splitBatch, splitSentences } from '../../src/engine/parse/memo';

const SAMPLE = `# MEMO-07 — Cable supply — review

**Date:** 2025-05-19 · **Author:** Buyer, electrical · **Supplier (as written):** Linnetbrook Cables · **Company:** Brightkeel Pumps Manufacturing W.L.L.

Linnetbrook supplies power and control cable cut to length. Delivery has been reliable; one drum was mislabelled in March.

Linnetbrook's indemnity is capped at BHD 50,000.

---
*SYNTHETIC — for teaching.*`;

describe('memo parser', () => {
  it('reads ID, title, date, author, supplier and excludes the header/footer from the body', () => {
    const m = parseMemo({ text: SAMPLE, fileName: 'MEMO-07.md' });
    expect(m).toMatchObject({ memoId: 'MEMO-07', title: 'Cable supply — review', date: '2025-05-19', author: 'Buyer, electrical', supplierAsWritten: 'Linnetbrook Cables' });
    expect(m.body).not.toMatch(/SYNTHETIC|\*\*Date/);
    expect(m.sentences.map((s) => s.text)).toEqual([
      'Linnetbrook supplies power and control cable cut to length.',
      'Delivery has been reliable; one drum was mislabelled in March.',
      "Linnetbrook's indemnity is capped at BHD 50,000.",
    ]);
    for (const s of m.sentences) expect(m.body.slice(s.start, s.end)).toBe(s.text);
  });
  it('accepts plain-text headers (PDF/DOCX extraction)', () => {
    const m = parseMemo({ text: 'MEMO-30 — Plain\nDate: 2026-11-01\nSupplier: Talbeck Castings\n\nTalbeck is fine.', fileName: 'x.txt' });
    expect(m.memoId).toBe('MEMO-30');
    expect(m.supplierAsWritten).toBe('Talbeck Castings');
    expect(m.date).toBe('2026-11-01');
  });
  it('treats an invalid or missing date as NOT STATED with a warning', () => {
    const m = parseMemo({ text: '# MEMO-31 — X\n**Date:** 31/12/2025 · **Supplier (as written):** A\n\nBody.', fileName: 'm.md' });
    expect(m.date).toBe('');
    expect(m.warnings.join(' ')).toMatch(/NOT STATED/);
  });
  it('refuses a memo without an ID', () => {
    expect(() => parseMemo({ text: 'hello', fileName: 'note.txt' })).toThrow(MemoParseError);
  });
  it('does not split on decimals, "Co." or initials', () => {
    expect(splitSentences('Yield is 99.2 % at Talbeck Castings Co. which is fine. Next one.').map((s) => s.text)).toEqual([
      'Yield is 99.2 % at Talbeck Castings Co. which is fine.',
      'Next one.',
    ]);
  });
  it('splits batch files into memo sections', () => {
    const parts = splitBatch('# MEMOS BATCH 1\n\nintro\n\n# MEMO-01 — A\nx\n\n---\n\n# MEMO-02 — B\ny');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^# MEMO-01/);
  });
});
