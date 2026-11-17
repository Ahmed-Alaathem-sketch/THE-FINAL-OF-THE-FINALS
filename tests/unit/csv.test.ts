import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv } from '../../src/engine/parse/csv';
import { parseLog, parseMaster } from '../../src/engine/parse/records';

describe('CSV parser', () => {
  it('handles quotes, escaped quotes, CRLF and BOM with physical line numbers', () => {
    const t = parseCsv('\uFEFFa,b\r\n"x, y","He said ""hi"""\r\n1,2\r\n');
    expect(t.headers).toEqual(['a', 'b']);
    expect(t.rows[0]!.values).toEqual(['x, y', 'He said "hi"']);
    expect(t.rows[1]!.lineNumber).toBe(3);
  });
  it('rejects ragged rows, unterminated quotes and empty files', () => {
    expect(() => parseCsv('a,b\n1\n')).toThrow(CsvError);
    expect(() => parseCsv('a,b\n"1,2\n')).toThrow(/Unterminated/);
    expect(() => parseCsv('')).toThrow(/empty/);
  });
});

describe('records', () => {
  it('master requires the template columns and unique supplier IDs', () => {
    expect(() => parseMaster('id,name\nSUP-01,A\n')).toThrow(/missing required column/);
    expect(() => parseMaster('supplier_id,supplier_name,part_families,approval_status,spend_band\nSUP-01,A,x,APPROVED,A\nSUP-01,B,x,APPROVED,A\n')).toThrow(/duplicate supplier_id/);
  });
  it('splits part families on semicolons and de-duplicates', () => {
    const { rows } = parseMaster('supplier_id,supplier_name,part_families,approval_status,spend_band\nSUP-01,A,motors; machined shafts;Motors,APPROVED,A\n');
    expect(rows[0]!.partFamilies).toEqual(['motors', 'machined shafts']);
  });
  it('log rows with a missing or invalid date still count as rows, with a warning', () => {
    const { rows, warnings } = parseLog('supplier_id,last_assessment_date,result\nSUP-01,,PASS\nSUP-02,2025-02-30,PASS\n');
    expect(rows).toHaveLength(2);
    expect(warnings.join(' ')).toMatch(/no date/);
    expect(warnings.join(' ')).toMatch(/not a valid/);
  });
});
