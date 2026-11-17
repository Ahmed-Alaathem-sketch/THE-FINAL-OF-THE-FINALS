import { expect, type Page } from '@playwright/test';
import { packZipBytes } from '../helpers/pack';

export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function importPack(page: Page) {
  await page.goto('/data');
  await page.getByTestId('import-files').setInputFiles({ name: 'C5-A_SUPPLIER_RISK_CONTROL_TOWER_PACK_V1_2.zip', mimeType: 'application/zip', buffer: Buffer.from(packZipBytes()) });
  const rep = page.getByTestId('import-report');
  await expect(rep).toContainText('SUPPLIER_MASTER.csv');
  await expect(rep).toContainText('ASSESSMENT_LOG.csv');
  await expect(rep).toContainText('24 distinct memo ID(s)');
  await page.getByRole('button', { name: 'Import & run RR-C5' }).click();
  await expect(page.getByText('Sources imported and assessed')).toBeVisible();
}

export async function kpi(page: Page, label: string) {
  return (await page.locator(`[data-kpi="${label}"] .value`).textContent())?.trim();
}
