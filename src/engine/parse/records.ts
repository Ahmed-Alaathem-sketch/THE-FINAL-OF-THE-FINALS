import type { LogRow, MasterRow } from '../types';
import { CsvError, parseCsv, requireHeaders } from './csv';

export const MASTER_HEADERS = ['supplier_id', 'supplier_name', 'part_families', 'approval_status', 'spend_band'] as const;
export const LOG_HEADERS = ['supplier_id', 'last_assessment_date', 'result'] as const;

const SUPPLIER_ID = /^SUP-\d{2,}$/;

function toFields(headers: string[], values: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  headers.forEach((h, i) => (o[h] = values[i] ?? ''));
  return o;
}

export function splitFamilies(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(';')) {
    const f = part.trim().replace(/\s+/g, ' ');
    if (!f) continue;
    const key = f.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(f); }
  }
  return out;
}

export function parseMaster(text: string, fileName = 'SUPPLIER_MASTER.csv'): { rows: MasterRow[]; warnings: string[] } {
  const t = parseCsv(text);
  requireHeaders(t, MASTER_HEADERS, fileName);
  const warnings: string[] = [];
  const ids = new Set<string>();
  const rows = t.rows.map((r, i) => {
    const f = toFields(t.headers, r.values);
    const supplierId = f.supplier_id!.trim();
    if (!supplierId) throw new CsvError(`${fileName}: supplier_id is empty`, r.lineNumber);
    if (!SUPPLIER_ID.test(supplierId)) warnings.push(`${fileName} line ${r.lineNumber}: supplier_id "${supplierId}" does not follow the SUP-nn pattern.`);
    if (ids.has(supplierId)) throw new CsvError(`${fileName}: duplicate supplier_id ${supplierId}`, r.lineNumber);
    ids.add(supplierId);
    if (!f.supplier_name!.trim()) throw new CsvError(`${fileName}: supplier_name is empty for ${supplierId}`, r.lineNumber);
    const fams = splitFamilies(f.part_families ?? '');
    if (fams.length === 0) warnings.push(`${fileName} line ${r.lineNumber}: ${supplierId} lists no part family (NOT STATED).`);
    return {
      rowNumber: i + 1,
      lineNumber: r.lineNumber,
      supplierId,
      supplierName: f.supplier_name!.trim(),
      partFamiliesRaw: f.part_families ?? '',
      partFamilies: fams,
      approvalStatus: (f.approval_status ?? '').trim(),
      spendBand: (f.spend_band ?? '').trim(),
      fields: f,
    } satisfies MasterRow;
  });
  if (rows.length === 0) throw new CsvError(`${fileName}: no supplier rows`);
  return { rows, warnings };
}

export function parseLog(text: string, fileName = 'ASSESSMENT_LOG.csv'): { rows: LogRow[]; warnings: string[] } {
  const t = parseCsv(text);
  requireHeaders(t, LOG_HEADERS, fileName);
  const warnings: string[] = [];
  const rows = t.rows.map((r, i) => {
    const f = toFields(t.headers, r.values);
    const supplierId = (f.supplier_id ?? '').trim();
    if (!supplierId) throw new CsvError(`${fileName}: supplier_id is empty`, r.lineNumber);
    const date = (f.last_assessment_date ?? '').trim();
    if (date && !isIsoDate(date)) warnings.push(`${fileName} line ${r.lineNumber}: last_assessment_date "${date}" is not a valid yyyy-mm-dd date.`);
    if (!date) warnings.push(`${fileName} line ${r.lineNumber}: ${supplierId} has a row with no date (the row still counts as present for §4.1).`);
    return {
      rowNumber: i + 1,
      lineNumber: r.lineNumber,
      supplierId,
      lastAssessmentDate: date,
      result: (f.result ?? '').trim(),
      fields: f,
    } satisfies LogRow;
  });
  return { rows, warnings };
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
