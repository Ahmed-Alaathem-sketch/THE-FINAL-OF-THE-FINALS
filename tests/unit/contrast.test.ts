import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** WCAG 2.x contrast checks on the design tokens actually declared in app.css. */
const css = readFileSync(resolve(process.cwd(), 'src/ui/styles/app.css'), 'utf8');
const token = (name: string) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${name} missing`);
  return m[1]!;
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe('brand palette', () => {
  it('uses the three mandated colours', () => {
    expect(token('sand').toLowerCase()).toBe('#f8e6c2');
    expect(token('brass').toLowerCase()).toBe('#b8a85d');
    expect(token('ink').toLowerCase()).toBe('#1c393f');
  });
  it.each([
    ['ink on sand (body text)', 'ink', 'sand', 4.5],
    ['ink on brass (button text)', 'ink', 'brass', 4.5],
    ['sand on ink (sidebar)', 'sand', 'ink', 4.5],
    ['muted ink-500 on sand', 'ink-500', 'sand', 4.5],
    ['brass-700 on sand-50 (eyebrows)', 'brass-700', 'sand-50', 4.5],
    ['RED label on its badge', 'st-red', 'st-red-bg', 4.5],
    ['AMBER label on its badge', 'st-amber', 'st-amber-bg', 4.5],
    ['GREEN label on its badge', 'st-green', 'st-green-bg', 4.5],
    ['GREY label on its badge', 'st-grey', 'st-grey-bg', 4.5],
  ])('%s meets AA', (_l, fg, bg, min) => {
    expect(ratio(token(fg as string), token(bg as string))).toBeGreaterThanOrEqual(min as number);
  });
});
