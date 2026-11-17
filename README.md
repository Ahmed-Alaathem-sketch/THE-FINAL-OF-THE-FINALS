# THE-FINAL-OF-THE-FINALS
## The problem

Brightkeel Pumps has **26 approved suppliers**, an **assessment log**, and **24 memos** written by different buyers over two years. The category director wants one page she can trust that answers:

- **Who is a single point of failure?** Part families with only one qualified supplier.
- **Whose contract leaves the company exposed?** Missing or low indemnity cover.
- **Who has never been assessed?** Approved suppliers with no assessment on record.

Every statement on that page must be traceable to a memo quotation or a record row. The tool **shows** risks; the director and buyers **decide** what to do about them.

## What the prototype must do

1. **Take the inputs as supplied:** the supplier master, the assessment log and all 24 memos, plus an **intake step** for new memos.
2. **Apply the RR-C5 risk rules exactly:** evidence, memo-to-supplier matching, coverage, flags, contradictions and status.
3. **Produce three outputs:**
   - **Coverage table:** for all 26 suppliers, which memos and log rows exist. This is kept separate from risk ("no memo" is not a risk).
   - **Scorecard:** one row per supplier with its flags, evidence and status, and a link from each flag to its source.
   - **Coverage record:** proof of which memos and rows each run actually read.
4. **Handle uncertainty honestly** using fixed terms: `NOT STATED`, `CANNOT DETERMINE`, `UNKNOWN`, `NO FEASIBLE OPTION`, `NOT APPLICABLE`.
5. **Be checkable:** a second person can follow any flag back to its source.
6. **Be demonstrated live** at the Week 10 showcase.

## Risk rules at a glance (RR-C5, as of 2026-10-31)

| Flag | Meaning |
|---|---|
| **NEVER ASSESSED** | Approved supplier with no row in the assessment log |
| **SINGLE SOURCE** | A part family with exactly one qualified approved supplier |
| **INDEMNITY GAP** | Newest memo with an indemnity position says no clause, or a cap below BHD 50,000 |

| Status | Condition |
|---|---|
| 🔴 **RED** | SINGLE SOURCE **and** (INDEMNITY GAP **or** NEVER ASSESSED) |
| 🟠 **AMBER** | Any one of the three flags otherwise |
| ⚪ **CANNOT DETERMINE** | No flag, but the indemnity position can't be determined |
| 🟢 **GREEN** | No flag and indemnity NO GAP |

---

# The application — C5 Supplier Risk Control Tower

A browser-based, rule-based control tower that applies **RR-C5 V1.2** exactly, keeps **every flag traceable** to a memo quotation, a record row or a stated search scope, and leaves every decision about what to do with a person.

> **Governing principle:** my rules control the decisions · the software executes them · evidence justifies them · the user keeps control.

## What it does

| Module | Route | Purpose |
|---|---|---|
| Overview | `/` | Interactive introduction: radar of live risk signals, step-by-step "how a decision is made", flip cards with the rule card |
| Executive dashboard | `/dashboard` | Totals, approved, RED / AMBER / GREEN / CANNOT DETERMINE, NEVER ASSESSED, SINGLE SOURCE, INDEMNITY GAP, part families, families with no qualified supplier, unmatched memos, pending reviews; donut, bar chart, family matrix, attention list, run activity. Every number links to its rows |
| Supplier directory | `/suppliers` | Search and filter (status, flag, family, coverage), sortable; cards on phones |
| Supplier profile | `/suppliers/:id` | Status and rule row, each flag with its evidence, indemnity with contradictions (both quotations), qualification per family, coverage and memos, notes, status history across runs |
| Part families | `/families`, `/families/:name` | Qualified count per family, why SINGLE SOURCE or none qualified, with evidence |
| Evidence register | `/evidence` | Every raised flag and undeterminable indemnity with its evidence (the "trace five flags" view) |
| Memos & intake | `/memos`, `/memos/:id`, `/memos/intake` | Full-text search, match trace through the five §2 steps, highlighted statements, contradiction comparison; intake of one memo (form, MD, TXT, PDF or DOCX) with a **preview of the scorecard change before saving** |
| Review queue | `/reviews` | Unmatched memos, sentences the extractor cannot classify, same-date contradictions. A person decides, with a mandatory reason; the decision becomes a recorded input to a new run |
| Reports & exports | `/reports` | Executive summary, scorecard (template layout), individual supplier scorecard, risk register (owner = DRAFT — for approval), part-family report, source coverage, coverage record, unmatched memos, evidence report, audit report, each as **CSV, Excel (.xlsx) or PDF** |
| Assessment history | `/runs` | Every run stored unchanged with its fingerprints; compare any two runs ("what changed"); reassess under any approved rule version |
| Rules & versions | `/rules` | Immutable RR-C5 V1.2 baseline; drafts (EXPERIMENTAL) with editable parameters and decision rows; validation; conflict detection against the official table; sandbox test; approval gate (typed confirmation, approver, reason, conflict acknowledgement); deactivation; comparison of versions over all 12 fact combinations |
| Audit trail | `/audit` | Append-only, SHA-256 hash-chained log: actor, time, action, reference, reason, previous and new values; chain verification |
| Data & privacy | `/data` | Import, current data, display name, privacy explanation, brand-font status, delete all local data |

## Architecture

```
src/engine/      Pure, deterministic RR-C5 engine (no DOM, IO, clock or randomness)
  rules/           rr-c5-v1.2.ts (frozen, hash-pinned baseline), ruleset.ts (decision table), manage.ts (drafts, validation, conflicts)
  parse/           csv.ts (RFC 4180, keeps line numbers), records.ts (master/log), memo.ts (header, sentences with offsets, batches)
  normalize.ts     §2 matching steps 1–5 in the prescribed order, with a trace of each step
  extract.ts       Deterministic statement extractor (patterns, no AI); uncertain sentences → review
  assess.ts        §2 matching, §3 coverage, §4 flags, §5 contradictions, §6 status, coverage record, fingerprints
  decisions.ts     Human review decisions (pinned to memo content hashes)
  diff.ts          Run-to-run differences
  hash.ts          Synchronous SHA-256 + canonical JSON
src/ingest/      File import: zips (nested, with bomb guards), CSV sniffing, MD/TXT/PDF/DOCX text extraction
src/storage/     IndexedDB: immutable datasets and runs, decisions, rule versions, audit, meta
src/audit/       Hash-chained audit entries and verification
src/reports/     Report tables and CSV / XLSX / PDF exporters
src/state/       Application store (Zustand): orchestrates import → assess → store → audit
src/ui/          Design system, layout and pages (React + React Router)
scripts/         brand-fonts.ts (Vite plugin + check), dump-run.ts (developer aid)
tests/unit, tests/integration (Vitest) · tests/e2e (Playwright)
```

Design decisions:

- **The engine is separate from the UI.** `assess(sources, ruleSet, decisions)` is a pure function. The same inputs always give a byte-identical output, and its `outputFingerprint` proves it. The input fingerprint covers file hashes, the rule-set hash and the review decisions.
- **Datasets and runs are immutable.** Intake creates a new dataset version and a new run. Nothing historical is edited.
- **No AI makes or influences a classification.** The extractor is plain pattern matching. When it is unsure (liability-only caps, unknown wording, a removal without a part family, a sentence naming another supplier), the sentence goes to the review queue. No AI or LLM service is called, because the studio rules allow no API keys or paid services. A future AI helper could only *suggest* text extraction, summaries or possible contradictions in the review queue; it must never set a flag or status.

## RR-C5 V1.2 as implemented

Source of truth: `RULES/RISK_RULES_RR-C5.md` inside the pack (as of **2026-10-31**). Only `SUPPLIER_MASTER.csv`, `ASSESSMENT_LOG.csv` and the memos count.

- **§1 Evidence.**
  - Memo evidence = memo ID, date, sentence number, exact quotation (an exact substring of the memo, checked by a test).
  - Record evidence = file, data row, file line, all fields with the relied-on fields highlighted.
  - Absence evidence = files searched, row or memo counts, supplier, what is missing, as-of date (e.g. *No row for SUP-19 in ASSESSMENT_LOG.csv (23 rows, as of 2026-10-31).*).
- **§2 Matching.** Five steps, in this order:
  1. Remove full stops.
  2. Turn every other punctuation mark or symbol into a space.
  3. Ignore case.
  4. Drop the suffix words WLL, Co, Company, Ltd, LLC and FZE.
  5. Drop one trailing "s" from the last remaining word.

  Only an identical result matches. Anything else, including an ambiguous result, is **CANNOT DETERMINE (MATCH)** and waits for a person. A memo is "about" only the supplier named in its `Supplier (as written)` header. A sentence about another supplier becomes a **note** on that supplier and never sets its flags.
- **§3 Coverage.** For each master supplier, the coverage table records its memo IDs (or NO MEMO) and whether the log has a row. It is kept separate from risk: NO MEMO is not a flag.
- **§4.1 NEVER ASSESSED.** An APPROVED supplier with no row in the log. A memo that says an assessment is planned is a note, not an assessment. For a supplier that is not APPROVED this flag is NOT APPLICABLE.
- **§4.2 Qualification and SINGLE SOURCE.**
  - Approved means qualified for every listed family.
  - Only the **newest memo about that supplier stating qualification for that family** can remove it, and a newer affirmation restores it. A newer memo that is silent changes nothing.
  - Exactly one qualified supplier in a family → SINGLE SOURCE on that supplier. Zero → a family finding, not a flag.
- **§4.3 Indemnity.** Read from the newest memo **stating a position**:
  - No clause, or a cap **below BHD 50,000** → GAP.
  - A cap of **BHD 50,000 or more** → NO GAP. Exactly 50,000 is NO GAP; there is a boundary test.
  - "Standard terms apply", silence or no memo → CANNOT DETERMINE.
- **§5 Contradictions.** The newer statement governs, and both quotations and dates are shown, never blended. If the newest position cannot be identified (same date, or an undated memo), the result is CANNOT DETERMINE and the item goes to the review queue.
- **§6 Status.** The decision table gives exactly one status per supplier:
  - RED = SINGLE SOURCE and (GAP or NEVER ASSESSED).
  - AMBER = any one flag otherwise.
  - CANNOT DETERMINE = no flag, but the indemnity position is undeterminable.
  - GREEN = no flag and NO GAP.

  If SINGLE SOURCE itself is undeterminable, both outcomes are evaluated. If they differ, the status is CANNOT DETERMINE.
- **Fixed vocabulary.** The app uses exactly NOT STATED, CANNOT DETERMINE, CANNOT DETERMINE (MATCH), UNKNOWN, NO FEASIBLE OPTION, NOT APPLICABLE and NO MEMO. Owners and actions in the risk register are left blank and labelled **DRAFT — for approval**; the tool assigns nobody.

Result on the official pack (26 suppliers, 23 log rows, 24 memos), derived by hand and pinned by `tests/integration/pack-golden.test.ts`:

| Status | Suppliers |
|---|---|
| RED (1) | SUP-09 (SINGLE SOURCE in mechanical seals after MEMO-17 removes SUP-16; cap BHD 30,000) |
| AMBER (6) | SUP-05 (SINGLE SOURCE, PCB assemblies) · SUP-07 (MEMO-21 "no indemnity clause" supersedes MEMO-05) · SUP-15 (no clause) · SUP-19, SUP-24, SUP-25 (NEVER ASSESSED) |
| CANNOT DETERMINE (4) | SUP-11 ("standard terms apply") · SUP-14 (memo silent) · SUP-23, SUP-26 (NO MEMO) |
| GREEN (15) | all others (SUP-08 at exactly BHD 50,000 is NO GAP) |

One sentence goes to review by design: MEMO-08 sentence 4, *"A second source has been discussed but no supplier has started qualification."*

### Rule versions

RR-C5 V1.2 is deep-frozen and its content hash is pinned by a snapshot test.

- **Drafts.** A draft is EXPERIMENTAL. It may change parameters (as-of date, threshold, suffix list, approved value) and decision rows (priority, conditions, outcome, required evidence). The fact vocabulary is closed (the three flags plus the indemnity position) and only the four statuses exist, so no new flag or score can be introduced.
- **Before activation.** Drafts are validated for completeness over all 12 fact combinations, compared with the official table, and can be tested in the sandbox.
- **Approval.** Approving needs an administrator name, a reason, acknowledgement of any conflicts and the typed phrase `APPROVE <id>@<version>`. Every step is audited.
- **History is never rewritten.** Activation creates a new run; earlier runs stay untouched. Because there is no login, approval is a recorded workflow gate, **not** a security control.

## Data, privacy and security

- **The public site ships with no supplier data.** Visitors import the pack themselves, and the data is stored **only in that browser's IndexedDB on that device**. It is not synchronised to other devices or people. Clearing site data deletes it, and **Data & privacy → Delete all local data** removes everything.
- **Anyone using the same browser profile can see what is stored**, because there is no login. Do not import confidential documents on a shared computer.
- **Nothing is uploaded to a server.** There are no API keys, secrets, analytics or third-party scripts, and the site needs no environment variables or bindings.
- **XSS:**
  - Memo text and audit values are always rendered as text.
  - `dangerouslySetInnerHTML` and `innerHTML` are banned by ESLint.
  - An e2e test injects `<img onerror>` and `<script>` content.
- **Exports:** CSV cells are protected against formula injection, and XLSX cells are written as strings.
- **Uploads:**
  - 10 MB per file and 60 MB uncompressed per import.
  - At most 2,000 zip entries and 3 levels of zip nesting.
  - PDFs are read for text only (no scripting or rendering).
- **Headers:** `public/_headers` sets a strict Content-Security-Policy (`script-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, `noindex` and a restrictive Permissions-Policy.
- **The official pack zip in this repository is public**, because the repository is public. The app neither needs it nor deploys it; tests read it in place.

## Brand font

Commit the project font to **`public/fonts/`** (`.woff2` preferred; `.woff`, `.ttf` and `.otf` also work). A Vite plugin (`scripts/brand-fonts.ts`) generates the `@font-face` rules for the family `Brand`, inferring weight and style from the file name. Every element uses it: headings, text, buttons, menus, tables, form controls and chart labels.

- `npm run check:font` fails while no font file is present.
- The e2e test "brand font file loads and is applied" is **skipped with an explicit BLOCKED reason** until a font file is committed.
- **Data & privacy** shows the live font status.

## Local setup

```bash
nvm use            # Node 22 (see .nvmrc; Node ≥ 20.19)
npm ci
npm run dev        # http://localhost:5173
```

Then open **Data & privacy** and drop in `C5-A_SUPPLIER_RISK_CONTROL_TOWER_PACK_V1_2_EXPLORATORY_DRAFT_V1.zip`, or the outer `Group_5_…zip`; nested zips are opened.

## Testing and quality gates

```bash
npm run lint         # ESLint (incl. XSS bans)
npm run typecheck    # TypeScript strict
npm test             # Vitest: unit + integration (golden pack results, rules, matching, CSV, memos, importer, audit, contrast)
npm run build        # production build
npm run test:e2e     # Playwright against `vite preview` (desktop, tablet, phone)
npm run audit:prod   # npm audit, fails on high/critical
npm run check:font   # release gate: brand font present
```

To test exactly as Cloudflare serves the site, including the `_headers` CSP and the `_redirects` SPA fallback, run:

```bash
npm run build && npx wrangler pages dev dist --port 8788
```

```bash
E2E_BASE_URL=http://127.0.0.1:8788 npx playwright test --trace off
```

The same variable can point the suite at the deployed URL.

## Deployment — Cloudflare Pages (Free plan) via GitHub

The app is a static site, so it needs **no Workers, D1, R2 or KV, no environment variables and no bindings**. `wrangler.toml` declares only `pages_build_output_dir = "dist"`.

### One-time connection (dashboard)
1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git**, and authorise the Cloudflare GitHub app for `Ahmed-Alaathem-sketch/THE-FINAL-OF-THE-FINALS`.
2. Use these build settings:
   - Project name: `c5-risk-control-tower`.
   - Production branch: `main`.
   - Framework preset: *None*.
   - Build command: `npm run build`.
   - Build output directory: `dist`.
3. Set the environment variable `NODE_VERSION` = `22`. It is not a secret, only the build image's Node version.
4. Save and deploy. Every push to `main` now builds and publishes production, and every other branch gets a preview URL.

### Manual deploy (alternative)
```bash
npm run build
```

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npx wrangler pages deploy dist --project-name c5-risk-control-tower --branch main
```

Use a token with the *Cloudflare Pages: Edit* permission only, and never commit it. A project created this way (Direct Upload) **cannot later be switched to Git integration**, so use a different project name if you also want Git-connected builds.

### Free plan limits

The figures below are the commonly documented Pages Free limits. Check them against <https://developers.cloudflare.com/pages/platform/limits/> before relying on them; they could not be fetched from this build session.

- 500 builds per month, 1 concurrent build, 20 minutes per build.
- 20,000 files per deployment and 25 MiB per file. This build is about 3.4 MB and under 50 files; the largest asset is about 0.45 MB.
- `_headers` up to 100 rules; `_redirects` up to 2,000 static and 100 dynamic rules (this project uses 3 and 1).
- Static asset requests are not metered on Pages. This app has no Functions, so no Workers request quota applies.

IndexedDB storage is limited by the visitor's browser quota, typically a share of free disk space. The app stores a few MB per dataset and run.

### Future updates
Commit to a branch, open a pull request, and check its preview URL. When all quality gates pass, merge to `main`; Cloudflare then builds and publishes automatically. A rule change belongs in a **new rule version** through the Rules page, never in an edit to `src/engine/rules/rr-c5-v1.2.ts`, which the hash test protects.
