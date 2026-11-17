import { unzipSync } from 'fflate';
import { makeSourceFile } from '../engine/assess';
import { MemoParseError, parseMemo, splitBatch } from '../engine/parse/memo';
import { CsvError, parseCsv } from '../engine/parse/csv';
import { LOG_HEADERS, MASTER_HEADERS, parseLog, parseMaster } from '../engine/parse/records';
import type { SourceFile } from '../engine/types';
import { LIMITS } from './limits';

export interface RawFile { name: string; bytes: Uint8Array }

export interface ImportReport {
  master?: SourceFile;
  log?: SourceFile;
  memos: SourceFile[];
  ignored: { name: string; reason: string }[];
  errors: { name: string; message: string }[];
  warnings: string[];
}

export type TextExtractor = (f: RawFile) => Promise<string>;

const baseName = (p: string) => p.split('/').pop() ?? p;
const ext = (n: string) => (/\.[a-z0-9]+$/i.exec(n)?.[0] ?? '').toLowerCase();
const decoder = new TextDecoder('utf-8', { fatal: false });

/** Expand zips (nested up to LIMITS.maxZipDepth) with zip-bomb guards. */
export function expandZips(files: RawFile[], depth = 0, budget = { entries: 0, bytes: 0 }): { files: RawFile[]; errors: ImportReport['errors'] } {
  const out: RawFile[] = [];
  const errors: ImportReport['errors'] = [];
  for (const f of files) {
    if (ext(f.name) !== '.zip') { out.push(f); continue; }
    if (depth >= LIMITS.maxZipDepth) { errors.push({ name: f.name, message: `Zip nested deeper than ${LIMITS.maxZipDepth} levels — not opened.` }); continue; }
    try {
      let refused = '';
      const entries = unzipSync(f.bytes, {
        filter: (info) => {
          if (info.name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(info.name)) return false;
          budget.entries++;
          budget.bytes += info.originalSize;
          if (budget.entries > LIMITS.maxZipEntries) { refused = 'too many entries'; return false; }
          if (info.originalSize > LIMITS.maxFileBytes && !info.name.toLowerCase().endsWith('.zip')) { refused = `${info.name} exceeds ${LIMITS.maxFileBytes / 1048576} MB`; return false; }
          if (budget.bytes > LIMITS.maxTotalUncompressedBytes) { refused = 'uncompressed size limit exceeded'; return false; }
          return true;
        },
      });
      if (refused) errors.push({ name: f.name, message: `Archive partly refused: ${refused}.` });
      const inner = Object.entries(entries).map(([name, bytes]) => ({ name: `${f.name}/${name}`, bytes }));
      const nested = expandZips(inner, depth + 1, budget);
      out.push(...nested.files);
      errors.push(...nested.errors);
    } catch (e) {
      errors.push({ name: f.name, message: `Not a readable zip archive (${(e as Error).message}).` });
    }
  }
  return { files: out, errors };
}

function sniffCsv(text: string): 'master' | 'log' | null {
  try {
    const t = parseCsv((text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '') + '\n');
    if (MASTER_HEADERS.every((h) => t.headers.includes(h))) return 'master';
    if (LOG_HEADERS.every((h) => t.headers.includes(h)) && t.headers.length <= 5) return 'log';
  } catch { /* not a csv we know */ }
  return null;
}

/**
 * Classify and validate files. Memos are identified by their content (a "# MEMO-nn" heading or header fields),
 * not trusted by file name alone. Nothing here decides risk; it only reads.
 */
export async function buildImport(input: RawFile[], extractText?: TextExtractor): Promise<ImportReport> {
  const report: ImportReport = { memos: [], ignored: [], errors: [], warnings: [] };
  const { files, errors } = expandZips(input);
  report.errors.push(...errors);
  const memoNames = new Set<string>();
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  for (const f of sorted) {
    const name = baseName(f.name);
    const e = ext(name);
    if (f.bytes.byteLength > LIMITS.maxFileBytes) { report.errors.push({ name, message: `File exceeds ${LIMITS.maxFileBytes / 1048576} MB.` }); continue; }
    if (/(^|\/)(TEMPLATES|STRETCH|OPTIONAL_HELP|OUTPUTS|W07_STUDENT_LAUNCH_PACKAGE)\//.test(f.name)) { report.ignored.push({ name, reason: 'Not a source file (templates / studio material).' }); continue; }
    try {
      if (e === '.csv') {
        const text = decoder.decode(f.bytes);
        const kind = sniffCsv(text);
        if (kind === 'master') {
          if (report.master) { report.errors.push({ name, message: `A second supplier master was found (already have ${report.master.name}). Import one master at a time.` }); continue; }
          const { warnings } = parseMaster(text, name);
          report.warnings.push(...warnings);
          report.master = makeSourceFile(name, 'master', text);
        } else if (kind === 'log') {
          if (report.log) { report.errors.push({ name, message: `A second assessment log was found (already have ${report.log.name}).` }); continue; }
          const { warnings } = parseLog(text, name);
          report.warnings.push(...warnings);
          report.log = makeSourceFile(name, 'log', text);
        } else report.ignored.push({ name, reason: 'CSV columns do not match SUPPLIER_MASTER or ASSESSMENT_LOG.' });
        continue;
      }
      let text: string;
      if (e === '.md' || e === '.txt') text = decoder.decode(f.bytes);
      else if ((e === '.pdf' || e === '.docx') && extractText) text = await extractText({ name, bytes: f.bytes });
      else { report.ignored.push({ name, reason: `Unsupported file type ${e || '(none)'}.` }); continue; }
      if (text.length > LIMITS.maxMemoChars * 30) { report.errors.push({ name, message: 'Text too long for a memo file.' }); continue; }
      const sections = splitBatch(text);
      if (sections.length === 0) {
        // Maybe a plain-text memo whose ID is only in header fields.
        const looksLikeMemo = /^\s*(?:\*\*)?\s*(?:Memo ID|Supplier(?: \(as written\))?)\s*:/im.test(text) && /MEMO-\d+/.test(text);
        if (!looksLikeMemo) { report.ignored.push({ name, reason: 'No memo heading or memo header fields — not treated as a memo.' }); continue; }
      }
      const parsed = (sections.length ? sections : [text]).map((t) => parseMemo({ text: t, fileName: name }));
      for (const p of parsed) {
        if (p.body.length > LIMITS.maxMemoChars) throw new MemoParseError(`${p.memoId} body exceeds ${LIMITS.maxMemoChars} characters.`);
        for (const w of p.warnings) report.warnings.push(`${name} ${p.memoId}: ${w}`);
      }
      const storedName = e === '.md' || e === '.txt' ? name : name.replace(/\.(pdf|docx)$/i, '.extracted.md');
      if (memoNames.has(storedName)) { report.errors.push({ name, message: 'Duplicate file name in this import.' }); continue; }
      memoNames.add(storedName);
      report.memos.push(makeSourceFile(storedName, 'memo', text));
    } catch (err) {
      if (err instanceof CsvError || err instanceof MemoParseError) report.errors.push({ name, message: err.message });
      else report.errors.push({ name, message: `Could not read: ${(err as Error).message}` });
    }
  }
  return report;
}

/** Build a canonical Markdown memo from the intake form so the stored source is self-contained. */
export function composeMemo(f: { memoId: string; title: string; date: string; author: string; supplierAsWritten: string; body: string }): string {
  const clean = (s: string) => s.replace(/[\r\n·]+/g, ' ').trim();
  return `# ${clean(f.memoId).toUpperCase()} — ${clean(f.title) || 'Untitled'}\n\n**Date:** ${clean(f.date)} · **Author:** ${clean(f.author) || 'NOT STATED'} · **Supplier (as written):** ${clean(f.supplierAsWritten)} · **Company:** Brightkeel Pumps Manufacturing W.L.L.\n\n${f.body.replace(/\r\n?/g, '\n').trim()}\n`;
}
