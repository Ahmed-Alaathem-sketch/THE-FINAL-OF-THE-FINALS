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
