import { expect, test } from '@playwright/test';
import { importPack, watchConsole } from './helpers';

test('responsive layout: navigation, tables, dialogs, no horizontal scroll', async ({ page }, info) => {
  const errors = watchConsole(page);
  await importPack(page);
  const narrow = (page.viewportSize()?.width ?? 1000) <= 900;
  for (const path of ['/', '/dashboard', '/suppliers', '/suppliers/SUP-09', '/families', '/memos/MEMO-17', '/evidence', '/reports', '/rules', '/audit', '/data', '/reviews', '/runs']) {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} horizontal overflow on ${info.project.name}`).toBeLessThanOrEqual(1);
  }
  if (narrow) {
    await page.goto('/suppliers');
    await expect(page.locator('.sidebar')).not.toBeInViewport();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.locator('.sidebar')).toBeInViewport();
    await page.locator('.sidebar').getByRole('link', { name: 'Part families' }).click();
    await expect(page).toHaveURL(/\/families$/);
    await expect(page.locator('.sidebar')).not.toBeInViewport();
  }
  if ((page.viewportSize()?.width ?? 1000) <= 640) {
    await page.goto('/suppliers');
    await expect(page.getByTestId('supplier-table').locator('thead')).toBeHidden();
    await page.goto('/reviews');
    await page.getByRole('button', { name: 'Decide' }).first().click();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    const box = await page.getByRole('dialog').boundingBox();
    expect(box!.width).toBeGreaterThan((page.viewportSize()!.width) - 2);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
