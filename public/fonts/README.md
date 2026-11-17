# Brand font

Commit the project's font file(s) here (`.woff2` preferred; `.woff`, `.ttf`, `.otf` also work).
They are picked up automatically at build time and exposed as the CSS family `Brand`, which every element uses.

File names decide weight and style, for example `Brand-Regular.woff2`, `Brand-SemiBold.woff2`, `Brand-BoldItalic.woff2`.
A variable font whose name contains `Variable` or `VF` covers weights 100–900.

Check with `npm run check:font`.
