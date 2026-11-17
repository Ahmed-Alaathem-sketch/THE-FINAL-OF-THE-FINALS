import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildImport, composeMemo } from '../../src/ingest/importer';
import { parseMemo } from '../../src/engine/parse/memo';
import { packZipBytes } from '../helpers/pack';

describe('importer', () => {
  it('imports the official pack zip: 1 master, 1 log, 24 memos + 3 batches, templates ignored', async () => {
    const r = await buildImport([{ name: 'pack.zip', bytes: packZipBytes() }]);
    expect(r.errors).toEqual([]);
    expect(r.master?.name).toBe('SUPPLIER_MASTER.csv');
    expect(r.log?.name).toBe('ASSESSMENT_LOG.csv');
    expect(r.memos.filter((m) => /^MEMO-\d+\.md$/.test(m.name))).toHaveLength(24);
    expect(r.memos.filter((m) => /BATCH/.test(m.name))).toHaveLength(3);
    expect(r.ignored.some((i) => /TEMPLATE/.test(i.name))).toBe(true);
  });
  it('rejects malformed CSV with a clear message and unknown types', async () => {
    const r = await buildImport([
      { name: 'SUPPLIER_MASTER.csv', bytes: strToU8('supplier_id,supplier_name,part_families,approval_status,spend_band\nSUP-01,"A,x,APPROVED,A\n') },
      { name: 'evil.exe', bytes: strToU8('MZ') },
      { name: 'notes.md', bytes: strToU8('hello world') },
    ]);
    expect(r.master).toBeUndefined();
    expect(r.errors[0]!.message).toMatch(/Unterminated/);
    expect(r.ignored.map((i) => i.name)).toEqual(expect.arrayContaining(['evil.exe', 'notes.md']));
  });
  it('guards against zip bombs and over-deep nesting', async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const z = zipSync({ 'big.md': big }, { level: 9 });
    const r = await buildImport([{ name: 'bomb.zip', bytes: z }]);
    expect(r.errors.map((e) => e.message).join(' ')).toMatch(/exceeds/);
    let nested = zipSync({ 'MEMO-01.md': strToU8('# MEMO-01 — x\n**Date:** 2026-01-01 · **Supplier (as written):** A\n\nBody.') });
    for (let i = 0; i < 4; i++) nested = zipSync({ [`l${i}.zip`]: nested });
    const r2 = await buildImport([{ name: 'deep.zip', bytes: nested }]);
    expect(r2.errors.map((e) => e.message).join(' ')).toMatch(/nested deeper/);
  });
  it('composes a canonical memo from the intake form and strips header injection', () => {
    const text = composeMemo({ memoId: 'memo-25', title: 'New', date: '2026-11-10', author: 'Buyer\n**Date:** 1999-01-01', supplierAsWritten: 'Harrowmere Freight Lines', body: 'Body text.' });
    const m = parseMemo({ text, fileName: 'MEMO-25.md' });
    expect(m).toMatchObject({ memoId: 'MEMO-25', date: '2026-11-10', supplierAsWritten: 'Harrowmere Freight Lines' });
  });
});
