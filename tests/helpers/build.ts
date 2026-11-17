import { makeSourceFile } from '../../src/engine/assess';
import type { SourceFile } from '../../src/engine/types';

export interface MiniSupplier { id: string; name: string; families: string; status?: string; band?: string }
export interface MiniMemo { id: string; date: string; supplier: string; body: string }

export function masterCsv(rows: MiniSupplier[]): SourceFile {
  const lines = ['supplier_id,supplier_name,part_families,approval_status,spend_band', ...rows.map((r) => `${r.id},${csvCell(r.name)},${csvCell(r.families)},${r.status ?? 'APPROVED'},${r.band ?? 'B'}`)];
  return makeSourceFile('SUPPLIER_MASTER.csv', 'master', lines.join('\n') + '\n');
}

export function logCsv(rows: [string, string, string][]): SourceFile {
  return makeSourceFile('ASSESSMENT_LOG.csv', 'log', ['supplier_id,last_assessment_date,result', ...rows.map((r) => r.join(','))].join('\n') + '\n');
}

export function memoFile(m: MiniMemo): SourceFile {
  const text = `# ${m.id} — Test memo\n\n**Date:** ${m.date} · **Author:** Tester · **Supplier (as written):** ${m.supplier} · **Company:** Brightkeel Pumps Manufacturing W.L.L.\n\n${m.body}\n`;
  return makeSourceFile(`${m.id}.md`, 'memo', text);
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
