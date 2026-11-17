/**
 * Strict RFC 4180 CSV parser. Keeps physical line numbers so evidence can cite "file, row, line".
 */

export interface CsvTable {
  headers: string[];
  rows: { lineNumber: number; values: string[] }[];
}

export class CsvError extends Error {
  constructor(message: string, public readonly lineNumber?: number) {
    super(lineNumber ? `${message} (line ${lineNumber})` : message);
    this.name = 'CsvError';
  }
}

export function parseCsv(text: string): CsvTable {
  const src = text.replace(/^﻿/, '');
  const records: { lineNumber: number; values: string[] }[] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  let fieldWasQuoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field.length > 0) throw new CsvError('Unexpected quote inside an unquoted field', line);
      inQuotes = true;
      fieldWasQuoted = true;
    } else if (ch === ',') {
      row.push(fieldWasQuoted ? field : field.trim());
      field = ''; fieldWasQuoted = false;
    } else if (ch === '\r') {
      // swallow; handled by \n
    } else if (ch === '\n') {
      row.push(fieldWasQuoted ? field : field.trim());
      records.push({ lineNumber: rowStartLine, values: row });
      row = []; field = ''; fieldWasQuoted = false;
      line++; rowStartLine = line;
    } else {
      if (fieldWasQuoted) throw new CsvError('Characters after a closing quote', line);
      field += ch;
    }
  }
  if (inQuotes) throw new CsvError('Unterminated quoted field', rowStartLine);
  if (field.length > 0 || row.length > 0 || fieldWasQuoted) {
    row.push(fieldWasQuoted ? field : field.trim());
    records.push({ lineNumber: rowStartLine, values: row });
  }
  // Drop fully blank lines.
  const nonBlank = records.filter((r) => !(r.values.length === 1 && r.values[0] === ''));
  if (nonBlank.length === 0) throw new CsvError('The file is empty');
  const [header, ...rows] = nonBlank;
  const headers = header!.values.map((h) => h.trim());
  for (const r of rows) {
    if (r.values.length !== headers.length) {
      throw new CsvError(`Expected ${headers.length} fields but found ${r.values.length}`, r.lineNumber);
    }
  }
  return { headers, rows };
}

export function requireHeaders(table: CsvTable, required: readonly string[], fileLabel: string): void {
  const missing = required.filter((h) => !table.headers.includes(h));
  if (missing.length) throw new CsvError(`${fileLabel}: missing required column(s): ${missing.join(', ')}. Found: ${table.headers.join(', ')}`);
  const dup = table.headers.filter((h, i) => table.headers.indexOf(h) !== i);
  if (dup.length) throw new CsvError(`${fileLabel}: duplicate column(s): ${dup.join(', ')}`);
}
