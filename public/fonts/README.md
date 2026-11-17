# Brand font

Commit the project's font file(s) here (`.woff2` preferred; `.woff`, `.ttf`, `.otf` also work).
They are picked up automatically at build time and exposed as the CSS family `Brand`, which every element uses.

File names decide weight and style, for example `Brand-Regular.woff2`, `Brand-SemiBold.woff2`, `Brand-BoldItalic.woff2`.
A variable font whose name contains `Variable` or `VF` covers weights 100–900.

Check with `npm run check:font`.

## Current font: MADE Okine Sans

The six solid weights (Thin 100, Light 300, Regular 400, Medium 500, Bold 700, Black 900) were converted from the `.otf` files in
`okine-font-family.zip` (repository root) to `.woff2`. The Outline variants are not used.

**Licence:** the bundled `Befonts-License.txt` says **"Personal Use Only"** (https://befonts.com/okine-font-family.html).
Serving it on a public website may need a commercial or web licence from the foundry. Check this before any non-personal use.
