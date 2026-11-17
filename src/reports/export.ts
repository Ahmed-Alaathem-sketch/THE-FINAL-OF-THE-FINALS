import type { ReportTable } from './tables';

/** CSV with formula-injection protection (cells starting with = + - @ tab or CR are prefixed with '). */
export function escapeCsvCell(v: string | number): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(t: ReportTable): string {
  const lines = [t.columns.map((c) => escapeCsvCell(c.label)).join(','), ...t.rows.map((r) => t.columns.map((c) => escapeCsvCell(r[c.key] ?? '')).join(','))];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function download(name: string, data: BlobPart, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_');
export const fileBase = (t: ReportTable) => `C5_${safeName(t.id)}_${new Date().toISOString().slice(0, 10)}`;

export function exportCsv(t: ReportTable) { download(`${fileBase(t)}.csv`, toCsv(t), 'text/csv;charset=utf-8'); }

export async function exportXlsx(t: ReportTable) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = t.columns.map((c) => ({ value: c.label, type: String, fontWeight: 'bold' as const, backgroundColor: '#1C393F', color: '#F8E6C2', wrap: true }));
  // Explicit String type: cell text is never interpreted as a formula.
  const body = t.rows.map((r) => t.columns.map((c) => {
    const v = r[c.key];
    return typeof v === 'number' ? { type: Number, value: v } : { type: String, value: String(v ?? ''), wrap: true };
  }));
  const titleRow = t.columns.map((_, i) => (i === 0 ? { value: `${t.title} — ${t.subtitle}`, type: String, fontWeight: 'bold' as const } : null));
  const blob = await writeXlsxFile([titleRow, head, ...body] as never, { columns: t.columns.map((c) => ({ width: Math.min(c.width ?? 20, 80) })), sheet: t.id.slice(0, 31), stickyRowsCount: 2 } as never).toBlob();
  download(`${fileBase(t)}.xlsx`, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function exportPdf(t: ReportTable) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFillColor(28, 57, 63);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 58, 'F');
  doc.setTextColor(248, 230, 194);
  doc.setFontSize(16);
  doc.text(`C5 Risk Control Tower — ${t.title}`, 32, 30);
  doc.setFontSize(8.5);
  doc.setTextColor(184, 168, 93);
  doc.text(t.subtitle, 32, 46);
  autoTable(doc, {
    startY: 72,
    head: [t.columns.map((c) => c.label)],
    body: t.rows.map((r) => t.columns.map((c) => String(r[c.key] ?? ''))),
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', textColor: [28, 57, 63] },
    headStyles: { fillColor: [184, 168, 93], textColor: [28, 57, 63], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [253, 247, 234] },
    margin: { left: 24, right: 24 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(77, 106, 112);
      doc.text(`Generated ${new Date().toISOString()} · shows risk; decides nothing · page ${doc.getNumberOfPages()}`, 24, h - 12);
    },
  });
  download(`${fileBase(t)}.pdf`, doc.output('blob'), 'application/pdf');
}
