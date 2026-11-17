import { expect, test } from '@playwright/test';
import { packZipBytes } from '../helpers/pack';
import { importPack, kpi, watchConsole } from './helpers';

const zip = () => ({ name: 'C5-pack.zip', mimeType: 'application/zip', buffer: Buffer.from(packZipBytes()) });

test('Reset: disabled when empty, clears staged and imported data, and allows a fresh import', async ({ page }) => {
  const errors = watchConsole(page);

  // 1. Nothing imported: Reset is disabled.
  await page.goto('/data');
  const reset = page.getByTestId('reset-import');
  await expect(reset).toBeDisabled();

  // 2. Files dropped but not imported: Reset clears the preview without a dialog.
  await page.getByTestId('import-files').setInputFiles(zip());
  await expect(page.getByTestId('import-report')).toBeVisible();
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('import-report')).toHaveCount(0);
  await expect(page.getByText('Selected files cleared.')).toBeVisible();
  await expect(reset).toBeDisabled();

  // 3. Import, review a sentence, then Reset with confirmation.
  await importPack(page);
  await page.goto('/reviews');
  await page.locator('[data-review="STATEMENT:MEMO-08:3"]').getByRole('button', { name: 'Decide' }).click();
  await page.getByRole('dialog').getByLabel('Nothing relevant to RR-C5 (ignore)').check();
  await page.getByRole('dialog').getByLabel('Reason (recorded in the audit trail)').fill('Not about Kestrelwire.');
  await page.getByRole('dialog').getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Decision recorded')).toBeVisible();

  await page.goto('/data');
  await expect(reset).toBeEnabled();
  await reset.click();
  const dlg = page.getByRole('dialog', { name: 'Reset imported data?' });
  await expect(dlg).toContainText('1 review decision(s)');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('no-data')).toHaveCount(0); // cancel keeps everything
  await reset.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByText('Reset complete')).toBeVisible();
  await expect(page.getByTestId('no-data')).toBeVisible();
  await expect(reset).toBeDisabled();
  await expect(page.locator('.topbar')).toContainText('Awaiting source data');
  await expect(page.locator('.sidebar .count')).toHaveCount(0);

  // Every data view is back to its first-visit state (no page reload).
  for (const path of ['/dashboard', '/suppliers', '/families', '/evidence', '/memos', '/reviews', '/reports']) {
    await page.locator('.sidebar').getByRole('link', { name: { '/dashboard': 'Executive dashboard', '/suppliers': 'Supplier directory', '/families': 'Part families', '/evidence': 'Evidence register', '/memos': 'Memos & intake', '/reviews': 'Review queue', '/reports': 'Reports & exports' }[path]! }).click();
    await expect(page.getByTestId('awaiting-data')).toBeVisible();
  }
  await page.locator('.sidebar').getByRole('link', { name: 'Assessment history' }).click();
  await expect(page.getByText('No runs yet.')).toBeVisible();

  // 4. Import again straight away (same file, no refresh): fresh results, old review decision gone.
  await page.locator('.sidebar').getByRole('link', { name: 'Data & privacy' }).click();
  await page.getByTestId('import-files').setInputFiles(zip());
  await expect(page.getByTestId('import-report')).toContainText('24 distinct memo ID(s)');
  await page.getByRole('button', { name: 'Import & run RR-C5' }).click();
  await expect(page.getByText('Sources imported and assessed')).toBeVisible();
  await page.locator('.sidebar').getByRole('link', { name: 'Executive dashboard' }).click();
  expect(await kpi(page, 'RED')).toBe('1');
  expect(await kpi(page, 'Pending reviews')).toBe('1');
  await page.locator('.sidebar').getByRole('link', { name: 'Assessment history' }).click();
  await expect(page.getByTestId('run-table').locator('tbody tr')).toHaveCount(1);

  // 5. Reset persists across a reload; the audit trail records it and stays intact.
  await page.goto('/data');
  await reset.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByTestId('no-data')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('no-data')).toBeVisible();
  await page.goto('/audit');
  await expect(page.getByText(/Hash chain intact/)).toBeVisible();
  await expect(page.getByTestId('audit-table').getByText('DATA_RESET').first()).toBeVisible();

  expect(errors).toEqual([]);
});
