import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { importPack, kpi, watchConsole } from './helpers';

test.describe.configure({ mode: 'serial' });

// One browser context for the whole journey: IndexedDB state carries from import to audit, as for a real user.
let ctx: BrowserContext;
let page: Page;
test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
});
test.afterAll(async () => { await ctx.close(); });

test('empty state: no invented data, palette applied, no console errors', async () => {
  const errors = watchConsole(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('awaiting-data')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Awaiting source data' })).toBeVisible();
  const styles = await page.evaluate(() => {
    const b = getComputedStyle(document.body);
    const h1 = getComputedStyle(document.querySelector('h1')!);
    const btn = getComputedStyle(document.querySelector('.empty .btn')!);
    const side = getComputedStyle(document.querySelector('.sidebar')!);
    return { bg: b.backgroundColor, font: b.fontFamily, h1: h1.color, btn: btn.backgroundColor, btnFont: btn.fontFamily, side: side.backgroundColor };
  });
  expect(styles.bg).toBe('rgb(248, 230, 194)');
  expect(styles.h1).toBe('rgb(28, 57, 63)');
  expect(styles.btn).toBe('rgb(184, 168, 93)');
  expect(styles.side).toBe('rgb(28, 57, 63)');
  expect(styles.font).toMatch(/^"?Brand"?,/);
  expect(styles.btnFont).toMatch(/^"?Brand"?,/);
  expect(errors).toEqual([]);
});

test('brand font file loads and is applied', async () => {
  const dir = resolve(process.cwd(), 'public/fonts');
  const fonts = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(woff2?|ttf|otf)$/i.test(f)) : [];
  test.skip(fonts.length === 0, 'BLOCKED: no brand font file committed in public/fonts (see npm run check:font)');
  await page.goto('/');
  const ok = await page.evaluate(async () => { await document.fonts.ready; await document.fonts.load('16px Brand'); return document.fonts.check('16px Brand') && Array.from(document.fonts as unknown as Iterable<FontFace>).some((f) => f.family.replace(/"/g, '') === 'Brand' && f.status === 'loaded'); });
  expect(ok).toBe(true);
  await page.goto('/data');
  await expect(page.getByTestId('font-status')).toHaveText('loaded');
});

test('imports the pack and the dashboard matches the engine (golden numbers)', async () => {
  const errors = watchConsole(page);
  await importPack(page);
  await page.goto('/dashboard');
  const expected: Record<string, string> = {
    Suppliers: '26', Approved: '26', RED: '1', AMBER: '6', GREEN: '15', 'Cannot determine': '4', 'Never assessed': '3', 'Single source': '2',
    'Indemnity gap': '3', 'Part families': '14', 'Families, 0 qualified': '0', 'Unmatched memos': '0', 'Pending reviews': '1',
  };
  for (const [k, v] of Object.entries(expected)) expect(await kpi(page, k), k).toBe(v);
  expect(errors).toEqual([]);
});

test('every navigation link opens a working page', async () => {
  const errors = watchConsole(page);
  await page.goto('/');
  const links = await page.locator('.sidebar nav a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
  expect(links.length).toBe(12);
  for (const href of links) {
    await page.goto(href);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Page not found');
  }
  await page.goto('/suppliers/SUP-09');
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Tidewell Seal Systems Co.');
  await page.goto('/no-such-page');
  await expect(page.locator('main h1')).toHaveText('Page not found');
  expect(errors).toEqual([]);
});

test('dashboard tiles and chart segments drill down to the right rows', async () => {
  await page.goto('/dashboard');
  await page.locator('[data-kpi="RED"]').click();
  await expect(page.getByTestId('result-count')).toHaveText(/^1 of 26 suppliers/);
  await expect(page.locator('[data-supplier="SUP-09"]')).toBeVisible();
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /^AMBER: 6/ }).click();
  await expect(page.getByTestId('result-count')).toHaveText(/^6 of 26/);
  await page.goto('/dashboard');
  await page.getByRole('link', { name: /NEVER ASSESSED: 3/ }).click();
  await expect(page.getByTestId('result-count')).toHaveText(/^3 of 26/);
});

test('directory search, filters and sorting', async () => {
  await page.goto('/suppliers');
  await page.getByLabel('Search').fill('marrowgate');
  await expect(page.getByTestId('result-count')).toHaveText(/^1 of 26/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Coverage').selectOption('nomemo');
  await expect(page.getByTestId('result-count')).toHaveText(/^4 of 26/);
  await page.getByLabel('Status').selectOption('CANNOT DETERMINE');
  await expect(page.getByTestId('result-count')).toHaveText(/^2 of 26/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Part family').selectOption('mechanical seals');
  await expect(page.getByTestId('result-count')).toHaveText(/^2 of 26/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('button', { name: /^Status/ }).click();
  await expect(page.locator('tbody tr').first()).toHaveAttribute('data-supplier', 'SUP-09');
});

test('trace a flag from the scorecard to the exact memo sentence and record row', async () => {
  await page.goto('/suppliers?status=RED');
  await page.locator('[data-supplier="SUP-09"] a.flag', { hasText: 'INDEMNITY GAP' }).click();
  const sec = page.locator('#flag-INDEMNITY-GAP');
  await expect(sec).toContainText("The supply agreement caps Tidewell's indemnity at BHD 30,000.");
  await page.locator('#flag-SINGLE-SOURCE').getByRole('link', { name: 'MEMO-17' }).click();
  await expect(page).toHaveURL(/\/memos\/MEMO-17\?s=0/);
  await expect(page.locator('mark.hl.focus')).toHaveText(/^Amberlode failed requalification for mechanical seals/);
  await page.goto('/suppliers/SUP-19');
  await expect(page.locator('#flag-NEVER-ASSESSED')).toContainText('No row for SUP-19 in ASSESSMENT_LOG.csv (23 rows, as of 2026-10-31).');
  await expect(page.locator('#flag-NEVER-ASSESSED [data-ev="record"]')).toContainText('SUPPLIER_MASTER.csv');
  await page.goto('/suppliers/SUP-07');
  await page.getByRole('tab', { name: 'Indemnity' }).click();
  await expect(page.getByText('Contradiction — indemnity')).toBeVisible();
  await expect(page.locator('main')).toContainText("Marrowgate's 2024 agreement includes a product indemnity capped at BHD 120,000.");
  await expect(page.locator('main')).toContainText('contains no indemnity clause');
});

test('part family analysis explains SINGLE SOURCE', async () => {
  await page.goto('/families?ss=1');
  await expect(page.getByTestId('family-table').locator('tbody tr')).toHaveCount(2);
  await page.getByRole('link', { name: 'mechanical seals' }).first().click();
  await expect(page.locator('main')).toContainText('SINGLE SOURCE — exactly one qualified approved supplier (SUP-09)');
  await expect(page.locator('main')).toContainText('NOT QUALIFIED · MEMO REMOVED');
});

test('memo search, match trace and contradictions tab', async () => {
  await page.goto('/memos');
  await page.getByLabel('Search memo content').fill('requalification');
  await expect(page.getByTestId('memo-table').locator('tbody tr')).toHaveCount(1);
  await page.goto('/memos/MEMO-14');
  await expect(page.locator('dl.trace')).toContainText('gulfreach fastener');
  await page.goto('/memos');
  await page.getByRole('tab', { name: /Contradictions/ }).click();
  await expect(page.locator('main')).toContainText('NEWER GOVERNS');
});

test('XSS: memo text is rendered as text, never as HTML', async () => {
  let dialog = false;
  page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
  await page.goto('/memos/intake');
  await page.getByLabel('Memo ID').fill('MEMO-90');
  await page.getByLabel('Date (yyyy-mm-dd)').fill('2026-11-12');
  await page.getByLabel('Supplier (as written in the memo)').fill('Nobody <script>alert(1)</script>');
  await page.getByLabel('Memo text').fill('Hello <img src=x onerror="alert(1)"> world.');
  await page.getByRole('button', { name: 'Preview the effect' }).click();
  await expect(page.getByTestId('intake-preview')).toContainText('CANNOT DETERMINE (MATCH)');
  await page.getByRole('button', { name: 'Add memo and record a new run' }).click();
  await expect(page).toHaveURL(/MEMO-90/);
  await expect(page.getByTestId('memo-body')).toContainText('<img src=x onerror="alert(1)">');
  expect(await page.getByTestId('memo-body').locator('img').count()).toBe(0);
  expect(dialog).toBe(false);
  await page.goto('/dashboard');
  expect(await kpi(page, 'Unmatched memos')).toBe('1');
});

test('new memo intake changes the scorecard only where the rules say', async () => {
  await page.goto('/memos/intake');
  await page.getByLabel('Memo ID').fill('MEMO-25');
  await page.getByLabel('Date (yyyy-mm-dd)').fill('2026-11-10');
  await page.getByLabel('Supplier (as written in the memo)').fill('Harrowmere Freight Lines');
  await page.getByLabel('Title').fill('Freight contract review');
  await page.getByLabel('Memo text').fill("Harrowmere's carriage agreement includes an indemnity capped at BHD 40,000.");
  await page.getByRole('button', { name: 'Preview the effect' }).click();
  const pv = page.getByTestId('intake-preview');
  await expect(pv).toContainText('SUP-23');
  await expect(pv.locator('tbody tr').filter({ hasText: 'status' })).toContainText('AMBER');
  // status, INDEMNITY GAP, indemnity, indemnity source, memos — all for SUP-23 and no other supplier
  await expect(pv.locator('tbody tr')).toHaveCount(5);
  for (const row of await pv.locator('tbody tr').all()) await expect(row.locator('td').first()).toHaveText('SUP-23');
  await page.getByRole('button', { name: 'Add memo and record a new run' }).click();
  await expect(page).toHaveURL(/\/memos\/MEMO-25$/);
  await page.goto('/dashboard');
  expect(await kpi(page, 'AMBER')).toBe('7');
  expect(await kpi(page, 'Cannot determine')).toBe('3');
});

test('review queue: a person decides, with a reason, and a new run is recorded', async () => {
  await page.goto('/reviews');
  const item = page.locator('[data-review="STATEMENT:MEMO-08:3"]');
  await item.getByRole('button', { name: 'Decide' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Nothing relevant to RR-C5 (ignore)').check();
  await dlg.getByRole('button', { name: 'Record decision' }).click();
  // The reason is mandatory: the form refuses to submit without one.
  await expect(dlg).toBeVisible();
  expect(await dlg.getByLabel('Reason (recorded in the audit trail)').evaluate((el) => (el as HTMLTextAreaElement).validity.valueMissing)).toBe(true);
  await dlg.getByLabel('Reason (recorded in the audit trail)').fill('Sentence is about a possible second source, not Kestrelwire qualification.');
  await dlg.getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Decision recorded')).toBeVisible();
  await expect(page.locator('[data-review="STATEMENT:MEMO-08:3"]')).toHaveCount(0);
  // the unmatched XSS memo still waits for a person
  await expect(page.locator('[data-review="MEMO_MATCH:MEMO-90"]')).toBeVisible();
});

test('reports export CSV, Excel and PDF', async () => {
  await page.goto('/reports?r=scorecard');
  await expect(page.getByTestId('report-preview').locator('tbody tr')).toHaveCount(26);
  for (const kind of ['csv', 'xlsx', 'pdf']) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-export="${kind}"]`).click()]);
    expect(dl.suggestedFilename()).toMatch(new RegExp(`^C5_scorecard_\\d{4}-\\d{2}-\\d{2}\\.${kind}$`));
    const p = await dl.path();
    const buf = readFileSync(p!);
    if (kind === 'csv') { const t = buf.toString('utf8'); expect(t).toContain('SUP-09,Tidewell Seal Systems Co.'); expect(t).toContain('RED'); }
    if (kind === 'xlsx') expect(buf.subarray(0, 2).toString()).toBe('PK');
    if (kind === 'pdf') expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  }
  for (const r of ['executive', 'risk-register', 'families', 'coverage', 'coverage-record', 'unmatched', 'evidence', 'audit']) {
    await page.goto(`/reports?r=${r}`);
    await expect(page.getByTestId('report-preview')).toBeVisible();
  }
  await page.goto('/reports?r=coverage-record');
  await expect(page.getByTestId('report-preview')).toContainText('26 memos read of 24 expected; missing: none');
});

test('rules: baseline is locked; a draft is tested, conflicts shown, approved, then deactivated', async () => {
  await page.goto('/rules');
  await expect(page.getByText('immutable baseline')).toBeVisible();
  await expect(page.getByLabel('Indemnity threshold (BHD)')).toBeDisabled();
  await page.getByLabel(/New draft version from/).fill('1.3');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Indemnity threshold (BHD)').fill('100000');
  await expect(page.locator('main')).toContainText('Indemnity threshold BHD 50000 → 100000');
  await page.getByRole('button', { name: 'Test in sandbox' }).click();
  await expect(page.getByTestId('sandbox-result')).toContainText('SUP-08');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();
  await page.getByRole('button', { name: 'Approve & activate…' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Administrator name').fill('Category director');
  await dlg.getByLabel('Reason for adopting this version').fill('E2E test of the approval gate.');
  await expect(dlg.getByRole('button', { name: 'Approve & activate' })).toBeDisabled();
  await dlg.getByLabel(/Type APPROVE RR-C5@1.3/).fill('APPROVE RR-C5@1.3');
  await dlg.getByRole('button', { name: 'Approve & activate' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Acknowledge the conflicts');
  await dlg.getByLabel(/I have reviewed the/).check();
  await dlg.getByRole('button', { name: 'Approve & activate' }).click();
  await expect(page.getByText(/approved and active/)).toBeVisible();
  await expect(page.locator('.sidebar-foot')).toContainText('RR-C5@1.3');
  await page.goto('/runs');
  await expect(page.getByTestId('run-diff')).toContainText('RR-C5@1.2 → RR-C5@1.3');
  await page.goto('/rules');
  await page.getByRole('button', { name: /RR-C5@1.3 · active/ }).click();
  await page.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.locator('.sidebar-foot')).toContainText('RR-C5@1.2');
});

test('history keeps every run and reassessment is reproducible', async () => {
  await page.goto('/runs');
  await expect(page.getByTestId('run-table').locator('tbody tr').first()).toBeVisible();
  const before = await page.getByTestId('run-table').locator('tbody tr').count();
  await page.getByRole('button', { name: 'Run and store' }).click();
  await expect(page.getByTestId('run-table').locator('tbody tr')).toHaveCount(before + 1);
  // compare the two newest runs: same inputs + rule → byte-identical
  const radiosA = page.getByTestId('run-table').locator('input[name="ra"]');
  const radiosB = page.getByTestId('run-table').locator('input[name="rb"]');
  await radiosA.nth(1).check();
  await radiosB.nth(0).check();
  await expect(page.getByTestId('run-diff')).toContainText('byte-identical (deterministic)');
});

test('audit trail is intact and records each action', async () => {
  await page.goto('/audit');
  await expect(page.getByText(/Hash chain intact/)).toBeVisible();
  for (const a of ['DATASET_IMPORTED', 'RUN_CREATED', 'MEMO_INTAKE', 'REVIEW_DECISION', 'RULE_DRAFT_CREATED', 'RULE_APPROVED_ACTIVATED', 'RULE_DEACTIVATED']) {
    await expect(page.getByTestId('audit-table').getByText(a).first()).toBeVisible();
  }
});

test('reduced motion is respected', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('.reveal').first().waitFor();
  await page.locator('.radar .sweep').waitFor();
  const r = await page.evaluate(() => {
    const el = document.querySelector('.reveal')!;
    const sweep = document.querySelector('.radar .sweep')!;
    return { opacity: getComputedStyle(el).opacity, anim: getComputedStyle(sweep).animationName, dur: getComputedStyle(document.querySelector('.btn')!).transitionDuration };
  });
  expect(r.opacity).toBe('1');
  expect(r.anim).toBe('none');
  expect(parseFloat(r.dur)).toBeLessThan(0.01);
  await ctx.close();
});

test('interactive home: steps and rule cards respond', async () => {
  await page.goto('/');
  await page.getByRole('button', { name: /Match memos/ }).click();
  await expect(page.locator('.notice').first()).toContainText('CANNOT DETERMINE (MATCH)');
  const card = page.getByRole('button', { name: /^INDEMNITY: show rule/ });
  await card.click();
  await expect(page.getByRole('button', { name: /^INDEMNITY: Read from the newest memo/ })).toHaveAttribute('aria-pressed', 'true');
});
