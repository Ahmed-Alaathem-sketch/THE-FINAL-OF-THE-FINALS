import { expect, test } from '@playwright/test';
import { jsPDF } from 'jspdf';
import { importPack } from './helpers';

test('a PDF memo goes through intake with text extraction (pdf.js worker under CSP)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await importPack(page);
  const doc = new jsPDF();
  ['MEMO-26 — Enclosure supply', 'Date: 2026-11-12', 'Supplier: Pinemoor Enclosure Fabrication', '', "Pinemoor's contract includes an indemnity capped at BHD 45,000."].forEach((l, i) => doc.text(l, 15, 20 + i * 10));
  const bytes = Buffer.from(doc.output('arraybuffer'));
  await page.goto('/memos/intake');
  await page.getByRole('button', { name: 'Upload a memo file' }).click();
  await page.getByTestId('intake-file').setInputFiles({ name: 'MEMO-26.pdf', mimeType: 'application/pdf', buffer: bytes });
  const pv = page.getByTestId('intake-preview');
  await expect(pv).toContainText('Preview — MEMO-26.extracted.md');
  await expect(pv).toContainText('SUP-25');
  await expect(pv.locator('tbody tr').filter({ hasText: 'indemnity' }).first()).toContainText('GAP');
  expect(errors).toEqual([]);
});
