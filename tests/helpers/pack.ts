import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { makeSourceFile } from '../../src/engine/assess';
import type { SourceFile } from '../../src/engine/types';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Loads the official pack straight from the repository zip (never copied into the build).
 * Group_5_C5_Supplier_Risk_Control_Tower.zip → C5-A_…V1_2….zip → INPUTS/…
 */
export function loadPackFiles(): Record<string, string> {
  const outer = unzipSync(readFileSync(resolve(HERE, '../../Group_5_C5_Supplier_Risk_Control_Tower.zip')));
  const innerName = Object.keys(outer).find((n) => /C5-A_.*\.zip$/.test(n));
  if (!innerName) throw new Error('C5 pack zip not found inside the repository zip');
  const inner = unzipSync(outer[innerName]!);
  const files: Record<string, string> = {};
  for (const [name, data] of Object.entries(inner)) {
    if (name.endsWith('/')) continue;
    const short = name.replace(/^[^/]+\//, '');
    if (/^INPUTS\//.test(short) || /^RULES\/.*\.md$/.test(short)) files[short] = strFromU8(data);
  }
  return files;
}

export function packZipBytes(): Uint8Array {
  const outer = unzipSync(readFileSync(resolve(HERE, '../../Group_5_C5_Supplier_Risk_Control_Tower.zip')));
  const innerName = Object.keys(outer).find((n) => /C5-A_.*\.zip$/.test(n))!;
  return outer[innerName]!;
}

export function packSources(opts: { batches?: boolean; singles?: boolean } = { singles: true }): { master: SourceFile; log: SourceFile; memos: SourceFile[] } {
  const f = loadPackFiles();
  const memos: SourceFile[] = [];
  for (const [name, text] of Object.entries(f)) {
    const base = name.split('/').pop()!;
    if (opts.singles !== false && /^INPUTS\/MEMOS\/MEMO-\d+\.md$/.test(name)) memos.push(makeSourceFile(base, 'memo', text));
    if (opts.batches && /^INPUTS\/MEMOS_BATCH_\d\.md$/.test(name)) memos.push(makeSourceFile(base, 'memo', text));
  }
  return {
    master: makeSourceFile('SUPPLIER_MASTER.csv', 'master', f['INPUTS/SUPPLIER_MASTER.csv']!),
    log: makeSourceFile('ASSESSMENT_LOG.csv', 'log', f['INPUTS/ASSESSMENT_LOG.csv']!),
    memos,
  };
}
