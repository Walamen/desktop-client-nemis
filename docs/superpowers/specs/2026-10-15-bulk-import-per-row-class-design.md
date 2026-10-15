# Bulk student import: a class per row (desktop)

Date: 2026-10-15
Branch: `feat/bulk-import-per-row-class`

The full design lives in the Nemis repo, because the server contract
(`POST /students/bulk`) is its source of truth:
`Nemis/docs/superpowers/specs/2026-10-15-bulk-import-per-row-class-design.md`
(commit `f566c89e`).

Desktop's share of it (spec sections 2, 3 "Desktop" and 4):

- `bulk-import/class-placement.ts` — `resolveRowClass` and the `Class`
  template column (spec section 2).
- `BulkImportPage.tsx` — the batch class picker becomes a Term picker
  (`TermPicker` extracted from `ClassTermPicker`); the grid gains a Class
  column; all current-year classes are loaded once.
- `run-bulk-import.ts` — each local create uses its row's class; NEMIS-ID rows
  still go in one `bulkClaim` call, now with `classId` on each row.
- `packages/types` `BulkClaimRow.classId` added, `BulkClaimRequest.classId`
  removed; `validateIpc.ts` updated.

**Rollout:** release this desktop build only after the Nemis server carrying
the per-row `classId` is deployed. Against an older server, NEMIS-ID claim
rows get a 400; local creates are unaffected.
