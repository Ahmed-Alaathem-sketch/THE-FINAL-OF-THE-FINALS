import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Brand-font wiring. Any font file committed to public/fonts/ (woff2, woff, ttf, otf) is exposed as the
 * CSS family "Brand" via a generated @font-face sheet (virtual:brand-fonts.css). Weight and style are
 * inferred from the file name (e.g. "MyFont-SemiBoldItalic.woff2"). With no file present the app falls back
 * to a system stack and the build prints a warning; the font check (npm run check:font) fails.
 */
const WEIGHTS: [RegExp, string][] = [
  [/variable|\bvf\b|\[wght\]/i, '100 900'],
  [/extra\s*-?light|ultra\s*-?light/i, '200'],
  [/semi\s*-?bold|demi\s*-?bold/i, '600'],
  [/extra\s*-?bold|ultra\s*-?bold/i, '800'],
  [/thin|hairline/i, '100'],
  [/light/i, '300'],
  [/medium/i, '500'],
  [/black|heavy/i, '900'],
  [/bold/i, '700'],
];
const FORMATS: Record<string, string> = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' };

export function findBrandFonts(root: string): { file: string; weight: string; style: string; format: string }[] {
  const dir = resolve(root, 'public/fonts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => Object.keys(FORMATS).some((e) => f.toLowerCase().endsWith(e)))
    .sort()
    .map((file) => {
      const ext = Object.keys(FORMATS).find((e) => file.toLowerCase().endsWith(e))!;
      const weight = WEIGHTS.find(([re]) => re.test(file))?.[1] ?? '400';
      const style = /italic|oblique/i.test(file) ? 'italic' : 'normal';
      return { file, weight, style, format: FORMATS[ext]! };
    });
}

export function brandFontCss(root: string): string {
  const fonts = findBrandFonts(root);
  if (fonts.length === 0) return '/* No brand font file found in public/fonts — system fallback in use. */\n:root { --brand-font-present: 0; }\n';
  // Prefer woff2 > woff > ttf > otf for the same weight/style.
  const groups = new Map<string, typeof fonts>();
  for (const f of fonts) groups.set(`${f.weight}|${f.style}`, [...(groups.get(`${f.weight}|${f.style}`) ?? []), f]);
  const order = ['woff2', 'woff', 'truetype', 'opentype'];
  let css = ':root { --brand-font-present: 1; }\n';
  for (const [, list] of groups) {
    list.sort((a, b) => order.indexOf(a.format) - order.indexOf(b.format));
    const src = list.map((f) => `url('/fonts/${encodeURIComponent(f.file)}') format('${f.format}')`).join(', ');
    css += `@font-face { font-family: 'Brand'; src: ${src}; font-weight: ${list[0]!.weight}; font-style: ${list[0]!.style}; font-display: swap; }\n`;
  }
  return css;
}

export function brandFonts(): Plugin {
  const id = 'virtual:brand-fonts.css';
  const resolved = '\0' + id + '';
  let root = process.cwd();
  return {
    name: 'brand-fonts',
    configResolved(c) { root = c.root; if (findBrandFonts(root).length === 0) c.logger.warn('[brand-fonts] No font file in public/fonts — add the project font file (woff2/woff/ttf/otf).'); },
    resolveId(source) { return source === id ? resolved : null; },
    load(i) { return i === resolved ? brandFontCss(root) : null; },
  };
}
