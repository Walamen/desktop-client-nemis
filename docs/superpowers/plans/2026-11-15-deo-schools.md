# DEO Schools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The DEO Schools Management page, offline on the desktop with real columns, and the web page fixed to match.

**Architecture:** Extends the dashboard slice. Shared per-school row builder in the application layer; new `deo:list-schools` channel; server `school-standings` gains two fields the web Schools page then reads.

**Spec:** `docs/superpowers/specs/2026-11-15-deo-schools-design.md`

## Global Constraints

Same as `2026-11-15-deo-dashboard.md` (branches, CRLF, `@nemis/types` build, Node-ABI SQLite for tests, serial test runs, no placeholder words). Report months: 3, oldest first. Attendance bar: green ≥ 80, amber ≥ 70, else red.

## Review Focus

1. A school with no School Admin and no metadata principal → "Not recorded", never "undefined undefined".
2. A school whose profile JSON is malformed → no throw, principal from the admin user or "Not recorded".
3. A report dated on the first or last day of a month lands in that month (dates stored as full ISO or bare dates).
4. A school with both PRIMARY and SECONDARY appears under both tabs; counts match the rows shown.
5. The tab resets paging/scroll nothing: switching tabs never shows an empty table when rows exist.

---

### Task 1: Server — principal and report months on standings
Files: `Nemis/apps/Server/src/districts/districts.service.ts`, `districts.school-standings.spec.ts`, `packages/types/src/deo.ts`.
- [ ] Failing tests: principal from active INSTITUTION_ADMIN user; else metadata `contact.principal`; else null. `reportMonths` for today 2026-11-16: reports on 2026-09-01 and 2026-11-30T23:00Z → `[true, false, true]`; a school with none → `[false, false, false]`.
- [ ] Implement in `computeSchoolStandings` (grouped queries: `userOrganization.findMany` active INSTITUTION_ADMIN with user name; `report.findMany` submittedAt ≥ first of month −2, select schoolId+submittedAt). Add fields to `DistrictSchoolStanding` type; build types.
- [ ] Server jest districts + tsc. Commit.

### Task 2: Web — Schools page reads standings
Files: `portal-web/src/app/government/deo/schools/page.tsx`, `src/lib/deo-dashboard.ts` (+ test).
- [ ] Failing tests for `schoolTabCounts(rows)` and `filterSchoolsByTab(rows, tab)` (Primary/Secondary via levels, a both-levels school in both).
- [ ] Rewrite the page over `useGetDistrictSchoolStandingsQuery` + district settings: banner names, level via `formatLevels`, principal or "Not recorded", attendance "—", dots from `reportMonths`, compliance chip, tab counts.
- [ ] portal-web vitest + tsc + eslint on changed files. Commit.

### Task 3: Desktop — types, read model, shared rows, use case
Files: `packages/types/src/deo-dashboard.ts` (+ `deo-schools.ts`), application `interfaces/deo/*`, `testing/deo/*`, `use-cases/deo/district-school-rows.ts` (new), `get-deo-dashboard.ts`, `get-deo-schools.ts` (new, + tests), service, factory; `SqliteDistrictOverviewReadModel.ts` (+ test).
- [ ] Failing use-case tests (principal fallback order; report months; dashboard unchanged) and read-model tests (`schoolAdminNameBySchool`, `reportMonthsBySchool`, `metadataPrincipal` incl. malformed JSON).
- [ ] Implement; dashboard uses the shared builder.
- [ ] vitest application + data; typecheck. Commit.

### Task 4: Desktop — channel, view model, page
Files: ipc `handlers/deo/schools.ts` (+ test), `authorizeChannel.ts` (+ test), preload, `presentation/view-models/deo/deo-schools-view-model.ts` + helpers (+ tests), renderer bridge/ipc/hook, `app/government/deo/schools/page.tsx` (+ test), `app/government/deo/schools/details/page.tsx` (Coming Soon).
- [ ] Failing tests: handler args; DEO-only authorisation; view model load/error; helpers; page (banner names, tab counts, Secondary tab, dots, "Not recorded", row link).
- [ ] Implement.
- [ ] lint, typecheck, build:renderer, desktop suite. Commit.

### Task 5: Review and finish
- [ ] Fresh reviewer over both branches; one fix pass with failing-first tests; report rulings and deferred minors.
