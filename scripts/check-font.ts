// Release gate: fails when no brand font file is committed in public/fonts/.
import { findBrandFonts } from './brand-fonts';
const fonts = findBrandFonts(process.cwd());
if (fonts.length === 0) {
  console.error('FAIL: no brand font file in public/fonts/ (expected .woff2/.woff/.ttf/.otf). The UI uses the system fallback stack.');
  process.exit(1);
}
for (const f of fonts) console.log(`OK: ${f.file} → weight ${f.weight}, ${f.style}, ${f.format}`);
