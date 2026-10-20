# County Finance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the County Admin Finance overview and Fee Rules pages from portal-web to the desktop, offline, with the web's quirks fixed on both sides. All figures are scoped to each school's current academic year.

**Architecture:**
- **Nemis:** the server's CEO finance service gains current-year scoping, word-by-word payment search and inactive fee rules; portal-web gets the matching UI fixes.
- **Desktop:** the full hexagonal chain, the same as County Teachers. The chain is:
  1. `ICountyFinanceReadModel` port and 4 use cases on `CountyApplicationService`
  2. 2 ViewModels
  3. `SqliteCountyFinanceReadModel`
  4. 4 IPC channels, plus preload, bridge and the renderer `countyIpc` facade
  5. 2 pages

**Tech Stack:** NestJS + Prisma + Jest (server); Next.js + RTK Query + Vitest (portal-web); Electron + better-sqlite3 + Zustand vanilla + Next.js static export + Vitest (desktop).

**Spec:** `docs/superpowers/specs/2026-10-20-county-finance-design.md`

## Global Constraints

- Branch `feat/county-finance` in both **main checkouts**. No worktrees, no subagents; the build is native inline (Alvin, 2026-10-20).
- The full hexagonal path. The pages read ViewModels only, never a bridge.
- Never stage unrelated user changes; run `git status` before each commit.
- Rate rule everywhere: `>= 70` green (`text-active` / `bg-active`), `40–69` amber (`pending`), `< 40` red (`error`). Badges: `< 40` "Below Target", `>= 70` "On Track", else "At Risk".
- Rate = `Math.round(collected / expected * 100)`, or 0 when expected is 0.
- Current year = the obligation's `academicYearId` points at a year with `isCurrent` true. A payment counts only through such an obligation.
- Settled statuses: `PAID_IN_FULL`, `WAIVED`. Progress statuses: `PARTIALLY_PAID`, `PAID_IN_FULL`, `WAIVED`.
- Header label "Academic Year". Its value is the single shared current-year name, else `"Current academic year"`.
- Page sizes: payments 50, fee-rule schools 10.
- Ownership values: `GOVERNMENT, PRIVATE, NGO, COMMUNITY, MISSION`.
- Desktop academic-year name column is `academic_years.code`.
- Desktop own-county clause, copied from `SqliteCountyTeachersReadModel`: `(NOT EXISTS (SELECT 1 FROM counties) OR i.countyId IN (SELECT id FROM counties))`.
- **Test environment:** the main checkout's better-sqlite3 is the Electron ABI. For Node test runs of SQLite adapters, drop a Node-ABI `better_sqlite3.node` into `node_modules/better-sqlite3/build/Debug/` (from the npm-cache `_prebuilds` tarball) and **delete it after**. Never run `pnpm rebuild:*`. Run server jest and desktop vitest serially, never at the same time.
- Commands:
  - desktop: `pnpm vitest run <path>`, `pnpm typecheck`, `pnpm lint` (repo root)
  - server: `npx jest <path>`, `npx tsc --noEmit` (from `Nemis/apps/server`)
  - portal-web: `npx vitest run <path>` (from `Nemis/apps/portal-web`)
- Known pre-existing failure: desktop `renderer/app/page.test.tsx`.

## Review Focus

1. **A school with no current academic year.** It counts in `totalSchools`, expects 0, isn't "reporting", and its active students are all "unpaid". It still appears on All Schools at 0% "Below Target". The test is in Task 6.
2. **Search text with `%`, `_`, or repeated or leading spaces.** It's matched literally, word by word, and blank search means no filter. Tests are in Tasks 2 and 6.
3. **A payment reversed on the server (`isReversed = 1`), or with a local `fee_payment_reversals` row.** It's excluded from the list, the count and the sum. The test is in Task 6.
4. **A filter change while on page > 1.** The page goes back to 1 and loads once with page 1. The tests are in Tasks 9 and 10.
5. **A school with no district.** It's left out of `districtComparison`, but included in totals and on All Schools with "—". The test is in Task 6.

---

### Task 1: Server — current-year summaries and the academic-year name

**Files:**
- Modify: `Nemis/apps/server/src/fees/finance-summary.service.ts`
- Modify: `Nemis/apps/server/src/fees/ceo-finance.service.ts` (`getCountyDashboard`, `getSchoolFinanceSummaries`)
- Test: `Nemis/apps/server/src/fees/finance-summary.service.spec.ts` (add cases)
- Test: create `Nemis/apps/server/src/fees/ceo-finance.service.spec.ts`. Mock Prisma the way `finance-summary.service.spec.ts` does; mock `FinanceSummaryService` and `AuditService`.

**Interfaces:**
- Produces: `summarizeInstitutions(institutionIds: string[], options?: { currentYearOnly?: boolean }): Promise<InstitutionFinanceSummary[]>`. The dashboard response gains `academicYearName: string | null`.

- [ ] **Step 1: Write the failing tests**
  - `summarizeInstitutions scopes both obligation queries to the current year when asked`: with `{ currentYearOnly: true }`, expect `prisma.studentFeeObligation.groupBy` and `.findMany` to be called with `where` containing `academicYear: { isCurrent: true }`. Without options, expect `where` to have no `academicYear` key.
  - `getCountyDashboard asks for current-year summaries and names the shared current year`: institutions `[a, b]` and `prisma.academicYear.findMany` resolves `[{name:"2025/2026"},{name:"2025/2026"}]`. Expect `summarizeInstitutions` called with `(["a","b"], { currentYearOnly: true })` and `academicYearName === "2025/2026"`.
  - `getCountyDashboard returns a null year name when current years differ or none exist`: `[{name:"2025/2026"},{name:"2026"}]` gives `null`; `[]` gives `null`. The empty-county early return also has `academicYearName: null`.
  - `getSchoolFinanceSummaries asks for current-year summaries`: `summarizeInstitutions` called with `{ currentYearOnly: true }`.
- [ ] **Step 2: Run, expect FAIL.** `npx jest src/fees`
- [ ] **Step 3: Implement**
  - Thread `options` into both obligation `where`s as `...(options?.currentYearOnly ? { academicYear: { isCurrent: true } } : {})`.
  - In `getCountyDashboard`, query `prisma.academicYear.findMany({ where: { institutionId: { in: institutionIds }, isCurrent: true }, select: { name: true } })`. Distinct names of size 1 give that name, otherwise `null`.
  - DEO and districts callers stay untouched.
- [ ] **Step 4: Run, expect PASS.** `npx jest src/fees && npx tsc --noEmit`
- [ ] **Step 5: Commit** `feat(finance): County finance figures cover the current academic year`

### Task 2: Server — current-year payments, word-by-word search, all fee rules

**Files:**
- Modify: `Nemis/apps/server/src/fees/ceo-finance.service.ts` (`getCountyFeeCollections`, `getAllSchoolFeeRules`)
- Test: `Nemis/apps/server/src/fees/ceo-finance.service.spec.ts`

**Interfaces:**
- Produces: export `buildPaymentSearch(search: string | undefined): Prisma.FeePaymentWhereInput` from `ceo-finance.service.ts`. Blank or whitespace-only input gives `{}`.

- [ ] **Step 1: Write the failing tests**
  - `fee collections count only current-year obligations`: the `where` passed to `feePayment.findMany`, `count`, `aggregate` and `groupBy` contains `isReversed: false` and `obligation: { academicYear: { isCurrent: true } }`.
  - `buildPaymentSearch requires every word to match a name, NEMIS ID or school`: `"  Mary   Kollie "` gives `{ AND: [ {OR:[4 clauses for "Mary"]}, {OR:[…"Kollie"]} ] }`. The 4 clauses, each `mode: "insensitive"` contains: student.firstName, student.lastName, student.nemisId, institution.name. `"   "` and `undefined` give `{}`.
  - `fee rules include inactive rules, active first`: `feeRule.findMany` `where` has no `isActive` key, and `orderBy` equals `[{ isActive: "desc" }, { isMandatory: "desc" }, { createdAt: "desc" }]`.
- [ ] **Step 2: Run, expect FAIL.** `npx jest src/fees/ceo-finance`
- [ ] **Step 3: Implement** per the interfaces. Spread `buildPaymentSearch(search)` into `where`, replacing the old `OR`.
- [ ] **Step 4: Run, expect PASS.** `npx jest src/fees && npx tsc --noEmit`
- [ ] **Step 5: Commit** `fix(finance): County payments search by full name; fee rules show inactive rules`

### Task 3: portal-web — header, district filter, one colour rule, card border

**Files:**
- Create: `Nemis/apps/portal-web/src/app/government/county/finance/finance-display.ts`
- Test: `Nemis/apps/portal-web/src/app/government/county/finance/finance-display.test.ts`
- Modify: `…/county/finance/page.tsx`, `…/county/finance/fee-rules/page.tsx`
- Modify: the `CeoFinanceDashboard` type, wherever `financeApi.ts` imports it from; add `academicYearName: string | null`

**Interfaces:**
- Produces (same names are reused on the desktop in Task 9):
  - `rateColor(rate: number): "text-active" | "text-pending" | "text-error"`
  - `rateBarColor(rate: number): "bg-active" | "bg-pending" | "bg-error"`
  - `rateStatus(rate: number): "below" | "on-track" | "at-risk"`
  - `academicYearLabel(name: string | null): string`
  - `districtOptions(rows: { districtId: string; districtName: string }[]): [string, string][]`, sorted by name with `localeCompare`

- [ ] **Step 1: Write the failing tests**
  - `rateColor/rateBarColor agree at the boundaries`: 39 → error, 40 → pending, 69 → pending, 70 → active (both functions).
  - `rateStatus`: 39 → below, 40 → at-risk, 70 → on-track.
  - `academicYearLabel`: `"2025/2026"` → `"2025/2026"`, `null` → `"Current academic year"`.
  - `districtOptions` returns `[id, name]` pairs sorted by name.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/app/government/county/finance`
- [ ] **Step 3: Implement the helpers, then edit the pages**
  - **Finance page:**
    - Delete the local `rateColor`/`rateBarColor` and use the helpers.
    - Badges via `rateStatus`.
    - Header right block: label `Academic Year`, value `academicYearLabel(dashboard?.academicYearName ?? null)`. The `period` variable is removed.
    - District select options come from `districtOptions(dashboard?.districtComparison ?? [])`.
    - Remove `"audit"` from `Tab`.
  - **Fee rules:** `rounded-lg5border` becomes `rounded-lg border`.
- [ ] **Step 4: Run, expect PASS.** `npx vitest run src/app/government/county/finance && npx tsc --noEmit -p .`
- [ ] **Step 5: Commit** `fix(county): Finance page shows the academic year, always offers the district filter, one rate colour rule`

### Task 4: Desktop — shared types and IPC channels

**Files:**
- Create: `packages/types/src/county-finance.ts`, exported from `packages/types/src/index.ts`
- Modify: `packages/types/src/ipc.ts` (channels), `packages/types/src/api.ts` (`CountyApi`)

**Interfaces:**
- Produces, in `county-finance.ts`:
```ts
export type CountyOwnership = 'GOVERNMENT' | 'PRIVATE' | 'NGO' | 'COMMUNITY' | 'MISSION';
export interface CountyFinanceDistrictRow { districtId: string; districtName: string; totalExpected: number; totalCollected: number; collectionRate: number; schoolCount: number }
export interface CountyFinanceDashboard {
  county: { id: string; name: string } | null; academicYearName: string | null;
  totalExpected: number; totalCollected: number; totalOutstanding: number; collectionRate: number;
  schoolsReporting: number; totalSchools: number; studentsPaid: number; studentsPartial: number; studentsUnpaid: number;
  currency: string; districtComparison: CountyFinanceDistrictRow[];
}
export interface CountySchoolFinanceRow {
  institutionId: string; institutionName: string; institutionCode: string; districtId: string | null; districtName: string | null;
  totalExpected: number; totalCollected: number; totalOutstanding: number; collectionRate: number;
  studentCount: number; paidCount: number; partialCount: number; unpaidCount: number; currency: string;
}
export interface CountyFeeCollectionsQuery { search?: string; districtId?: string; ownership?: CountyOwnership; page: number; limit: number }
export interface CountyFeeCollectionRecord {
  id: string; studentName: string; nemisId: string | null; schoolName: string; schoolOwnership: string; districtName: string | null;
  feeRuleName: string; amountPaid: number; method: string; reference: string | null; paidAt: string;
}
export interface CountyFeeCollectionsResult {
  summary: { totalCollected: number; totalTransactions: number; schoolsWithPayments: number };
  records: CountyFeeCollectionRecord[]; total: number; page: number; limit: number;
}
export interface CountyFeeRulesQuery { search?: string; ownership?: CountyOwnership; page: number; limit: number }
export interface CountyFeeRuleItem {
  id: string; name: string; description: string | null; category: string; amount: number; currency: string;
  applicableLevels: string[]; isMandatory: boolean; isActive: boolean;
}
export interface CountyFeeRulesSchool { id: string; name: string; ownership: string; district: { id: string; name: string } | null; ownFeeRules: CountyFeeRuleItem[] }
export interface CountyFeeRulesResult { schools: CountyFeeRulesSchool[]; total: number; page: number; limit: number }
```
- Channels:
  - `COUNTY_FINANCE_DASHBOARD: 'county:finance-dashboard'`
  - `COUNTY_FINANCE_SCHOOLS: 'county:finance-schools'`
  - `COUNTY_FINANCE_PAYMENTS: 'county:finance-payments'`
  - `COUNTY_FINANCE_FEE_RULES: 'county:finance-fee-rules'`
- `CountyApi` gains:
  - `getFinanceDashboard(): Promise<CountyFinanceDashboard>`
  - `listFinanceSchools(): Promise<CountySchoolFinanceRow[]>`
  - `listFeeCollections(q: CountyFeeCollectionsQuery): Promise<CountyFeeCollectionsResult>`
  - `listFeeRules(q: CountyFeeRulesQuery): Promise<CountyFeeRulesResult>`

- [ ] **Step 1: Add the types.** No test; it's types only. Typecheck errors where `CountyApi` is implemented (preload) are expected until Task 7.
- [ ] **Step 2: Commit together with Task 5** (types alone don't stand alone as a deliverable).

### Task 5: Desktop — application port, use cases, service

**Files:**
- Create: `packages/application/src/interfaces/county/county-finance-read-model.ts`
- Create: `packages/application/src/use-cases/county/get-county-finance.ts` (all 4 use cases)
- Create: `packages/application/src/testing/county/in-memory-county-finance-read-model.ts` (+ export in `testing/county/index.ts`)
- Modify: `packages/application/src/services/county-application-service.ts`, `packages/application/src/factories/create-application-layer.ts` (port `countyFinance: ICountyFinanceReadModel`), `packages/application/src/index.ts`
- Test: `packages/application/src/use-cases/county/county-finance.test.ts`

**Interfaces:**
- `ICountyFinanceReadModel`:
  - `getDashboard(): Omit<CountyFinanceDashboard, 'county'>`
  - `listSchools(): CountySchoolFinanceRow[]`
  - `listFeeCollections(query: CountyFeeCollectionsQuery): CountyFeeCollectionsResult`
  - `listFeeRules(query: CountyFeeRulesQuery): CountyFeeRulesResult`
- Use cases (`QueryHandler` + `invokeUseCase`, like `GetCountyTeachersUseCase`):
  - `GetCountyFinanceDashboardUseCase` (deps `readModel`, `countyReadModel: ICountyAnalyticsReadModel`, `logger`) adds `county: countyReadModel.getCounty()`.
  - `GetCountyFinanceSchoolsUseCase`, `GetCountyFeeCollectionsUseCase`, `GetCountyFeeRulesUseCase` (deps `readModel`, `logger`). These two query use cases pass `{ ...query, search: query.search?.trim() || undefined }`.
- `CountyApplicationService` gains `getFinanceDashboard()`, `listFinanceSchools()`, `listFeeCollections(query)` and `listFeeRules(query)`, returning `Promise<ApplicationResponse<…>>` with the `CountyApi` names from Task 4.
- `InMemoryCountyFinanceReadModel`: settable `dashboard`, `schools`, `collections`, `rules`; records `lastCollectionsQuery`, `lastRulesQuery`.

- [ ] **Step 1: Write the failing tests** in `county-finance.test.ts`:
  - `dashboard carries the county from the analytics read model`
  - `fee collections trim the search and drop a blank one`: `'  mary  '` becomes `'mary'`, `'   '` becomes `undefined`, page and limit unchanged.
  - `fee rules trim the search the same way`
  - `schools pass the read model's rows through`
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/application/src/use-cases/county/county-finance.test.ts`
- [ ] **Step 3: Implement and wire.** Wire `ports.countyFinance` in `create-application-layer.ts` next to `countyTeachers`. Add `countyFinance: new InMemoryCountyFinanceReadModel()` to `packages/presentation/src/testing/create-test-application.ts`, so presentation tests compile.
- [ ] **Step 4: Run, expect PASS.** Run that test, plus `pnpm vitest run packages/application packages/presentation`.
- [ ] **Step 5: Commit (with Task 4)** `feat(county): finance read-model port and use cases`

### Task 6: Desktop — SQLite read model

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyFinanceReadModel.ts`
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts` (`countyFinance` repository), `apps/desktop/electron/data/adapters/createApplicationComposition.ts` (`countyFinance: dataLayer.repositories.countyFinance`)
- Test: `…/business/SqliteCountyFinanceReadModel.test.ts`, with fixtures in the `SqliteCountyTeachersReadModel.test.ts` style (`createTestContext`, inline INSERT helpers)

**Interfaces:**
- Consumes: `ICountyFinanceReadModel` (Task 5).
- Produces: `class SqliteCountyFinanceReadModel implements ICountyFinanceReadModel`, built with `constructor(repository: RepositoryContext)`. Each method is wrapped in `guarded('SqliteCountyFinanceReadModel.<method>', …)`.

**Approach:**
- One private `#summaries()` computes per active own-county school, scoped to current-year obligations:
  - expected and collected from `fee_obligations o JOIN academic_years y ON y.id = o.academicYearId AND y.isCurrent = 1`
  - per-student `MIN(status IN settled)` / `MAX(status IN progress)` grouped by `(o.institutionId, o.studentId)`
  - active student count from `students WHERE isActive = 1`
- `getDashboard` and `listSchools` both derive from `#summaries()`. `listSchools` sorts by rate ascending.
- `academicYearName`: `SELECT DISTINCT y.code` over own-county active schools' `isCurrent = 1` years. One row gives that name, otherwise null.
- Payments:
  - `fee_payments p JOIN fee_obligations o ON o.id = p.obligationId JOIN academic_years y … isCurrent = 1 JOIN institutions i …`, with `p.isReversed = 0 AND NOT EXISTS (SELECT 1 FROM fee_payment_reversals r WHERE r.paymentId = p.id)`.
  - Each search word adds `(s.firstName LIKE ? ESCAPE '\' OR s.lastName LIKE … OR s.nemisId LIKE … OR i.name LIKE …)`, with `%`, `_` and `\` escaped.
  - `ORDER BY p.paidAt DESC, p.id`, with `LIMIT/OFFSET` from page and limit.
  - The summary comes from the same `FROM/WHERE`: `SUM(p.amount)`, `COUNT(*)`, `COUNT(DISTINCT p.institutionId)`.
  - `studentName` = `firstName || ' ' || lastName`; `feeRuleName` = `COALESCE(fee_rules.name, '')`.
- Fee rules:
  - All `fee_rules` with a non-null `institutionId` at active own-county schools, filtered by ownership and school name `LIKE`.
  - Grouped in JS. Schools are sorted by `name.localeCompare`, rules `isActive DESC, isMandatory DESC, createdAt DESC`. Then sliced by page.
  - `applicableLevels` is `JSON.parse`d; anything that isn't a string array becomes `[]`.

- [ ] **Step 1: Write the failing tests.** The fixture county has:
  - districts d-1 and d-2; schools A (d-1), B (d-2), N (no district, active), Closed (inactive), Far (other county)
  - A and B each with a current and an old year; N with **no** current year
  - students with obligations in both years, and payments: one reversed (`isReversed = 1`), one with a local reversal row, one at Closed

  The tests:
  - `dashboard counts only current-year obligations`: expected and collected equal the current-year sums; old-year amounts are excluded.
  - `paid, partial and unpaid follow the server rule`: a student with PAID_IN_FULL + WAIVED is paid; one with PAID_IN_FULL + PENDING is partial; one with PENDING only is unpaid; active students with no obligations are unpaid.
  - `a school with no current year expects nothing and is not reporting` (Review Focus 1)
  - `schools without a district are totalled but left out of the district comparison` (Review Focus 5)
  - `inactive and other-county schools are excluded everywhere`
  - `the year name is shared or null`
  - `payments exclude reversed and locally reversed payments and old-year payments` (Review Focus 3)
  - `payment search needs every word` and `search wildcards are literal`: `'Mary Kollie'` finds the one; `'%'` finds nothing (Review Focus 2)
  - `payments filter by district and ownership; summary covers the whole filtered set, records the page`
  - `fee rules include inactive ones, active first, schools by name, 10 per page`
- [ ] **Step 2: Run, expect FAIL** (with the temporary Node-ABI binary in place; see Global Constraints). `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyFinanceReadModel.test.ts`
- [ ] **Step 3: Implement and wire.**
- [ ] **Step 4: Run, expect PASS.** Also run `pnpm vitest run apps/desktop/electron/data`.
- [ ] **Step 5: Commit** `feat(county): finance read model over the synced fee ledger`

### Task 7: Desktop — IPC, validation, preload, bridge, renderer facade

**Files:**
- Create: `apps/desktop/electron/ipc/handlers/county/finance.ts` (+ export in `county/index.ts`; register in `registrar.ts` next to `registerCountyTeacherHandlers`)
- Modify: `apps/desktop/electron/security/validateIpc.ts`, `apps/desktop/electron/ipc/authorizeChannel.ts` (the COUNTY_ADMIN list)
- Create: `apps/desktop/electron/preload/county/finance-api.ts` (+ spread into `countyApi.county` in `preload/county/index.ts`)
- Create: `apps/desktop/renderer/services/nemis-bridge/county/finance-bridge.ts` (+ merged into `countyBridge` in `county/index.ts`, following the teachers bridge)
- Modify: `apps/desktop/renderer/lib/ipc/county.ts` (4 `query(() => countyBridge.…)` entries)
- Test: `apps/desktop/electron/ipc/handlers/county/finance.test.ts` (follow `teachers.test.ts`), plus validateIpc cases in its existing test file

**Interfaces:**
- `registerCountyFinanceHandlers(handle: IpcHandle, app: ApplicationLayer): void`. Each handler returns `(await app.county.<method>(…)).data`. The dashboard and schools channels use `assertNoArgs`.
- `assertCountyFeeCollectionsQueryArgs(args)`: arity 1, plain object, keys `search, districtId, ownership, page, limit`. `page` is an int from 1 to 1,000,000 and `limit` from 1 to 50. `search` and `districtId` are optional strings of at most `ID_MAX_LENGTH`. `ownership` is an optional member of the 5 ownership values.
- `assertCountyFeeRulesQueryArgs(args)`: the same, without `districtId`.

- [ ] **Step 1: Write the failing tests**
  - Each channel calls the matching `app.county` method and returns `.data`.
  - The validators reject unknown keys, `limit: 51`, `ownership: 'X'`, and a non-object.
  - `authorizeChannel` allows the 4 channels for COUNTY_ADMIN and refuses them for INSTITUTION_ADMIN, following the existing authorizeChannel tests.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run apps/desktop/electron/ipc apps/desktop/electron/security`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.** Then `pnpm typecheck`, which should be clean now that preload implements `CountyApi`.
- [ ] **Step 5: Commit** `feat(county): finance IPC channels`

### Task 8: Desktop — ViewModels

**Files:**
- Create: `packages/presentation/src/view-models/county/county-finance-view-model.ts`, `…/county-fee-rules-view-model.ts`
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts` (`countyFinance`, `countyFeeRules`), `apps/desktop/renderer/lib/presentation/hooks/county.ts` (`useCountyFinanceViewModel`, `useCountyFeeRulesViewModel`), and the presentation index if view models are exported there
- Test: `packages/presentation/src/view-models/county/county-finance-view-models.test.ts`

**Interfaces:**
- `CountyFinanceState`:
  - `dashboard: AsyncState<CountyFinanceDashboard>`
  - `schools: AsyncState<CountySchoolFinanceRow[]>`
  - `payments: AsyncState<CountyFeeCollectionsResult>`
  - `paymentsQuery: CountyFeeCollectionsQuery`, default `{ page: 1, limit: 50 }`
- `CountyFinanceViewModel({ county })` has `loadDashboard()`, `loadSchools()` and `loadPayments(query)`, each through `trackQuery` with no `isEmpty`, so an empty list is `success` with `[]`.
- `CountyFeeRulesState`: `rules: AsyncState<CountyFeeRulesResult>` and `query: CountyFeeRulesQuery`, default `{ page: 1, limit: 10 }`.
- `CountyFeeRulesViewModel({ county })` has `load(query)`.

- [ ] **Step 1: Write the failing tests**
  - `loadPayments passes the query through and stores it`
  - `loadSchools with no rows is success with an empty list`
  - `a failed dashboard load is an error state`: make `ports.countyFinance.getDashboard` throw.
  - `fee rules load passes the query through`
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/presentation/src/view-models/county/county-finance-view-models.test.ts`
- [ ] **Step 3: Implement and register.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(county): finance ViewModels`

### Task 9: Desktop — Finance page

**Files:**
- Create: `apps/desktop/renderer/components/county/finance/finance-display.ts`. This is the same 5 helpers as Task 3, plus `OWNERSHIP_LABELS`, `METHOD_LABELS` and `LEVEL_LABELS`, copied from the web pages.
- Test: `apps/desktop/renderer/components/county/finance/finance-display.test.ts` (the Task 3 cases)
- Replace: `apps/desktop/renderer/app/government/county/finance/page.tsx`
- Test: `apps/desktop/renderer/app/government/county/finance/page.test.tsx` (follow `county/teachers/page.test.tsx`: real presentation layer, `window.nemis` stubs)

**Approach:**
- The page is a markup-for-markup port of the web `finance/page.tsx`, with the Task 3 fixes and these substitutions:
  - `@nemis-desktop/ui` `Spinner`/`Alert`/`Card`
  - `formatCurrency` from `@/components/finance/shared`
  - `formatNemisId` from `@nemis-desktop/shared`
  - a local `formatDate`: `new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })`
- **County name:** `dashboard.county?.name ?? "County"`.
- **Loading:**
  - `useRevalidateOnSync(() => { void vm.loadDashboard(); }, [])`
  - `loadSchools` when the tab is `schools`
  - `loadPayments({ search, districtId, ownership, page, limit: 50 })` when the tab is `payments`; its deps are the filters and page
- Every filter change sets the page to 1 in the same handler, so only one load fires with page 1.
- Full-page spinner while the dashboard is idle or loading. Error → the `Alert` "Failed to load finance data. Please try again."

- [ ] **Step 1: Write the failing tests**
  - `shows the county name and the shared academic year`
  - `cards show totals, rate and schools reporting`
  - `districts sorted by rate, Below Target under 40`
  - `All Schools sorts worst first and labels On Track / At Risk / Below Target`
  - `the district filter is offered before All Schools is opened` (fix 2)
  - `changing a filter on page 2 reloads page 1 once` (Review Focus 4)
  - `a load error shows the alert`
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run apps/desktop/renderer/components/county/finance apps/desktop/renderer/app/government/county/finance/page.test.tsx`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(county): Finance overview page`

### Task 10: Desktop — Fee Rules page

**Files:**
- Replace: `apps/desktop/renderer/app/government/county/finance/fee-rules/page.tsx`
- Test: `…/finance/fee-rules/page.test.tsx`

**Approach:**
- A markup port of the web `fee-rules/page.tsx`, with `rounded-lg border` and real Active/Inactive badges.
- `useRevalidateOnSync(() => { void vm.load({ search, ownership, page, limit: 10 }); }, [search, ownership, page])`.
- Search and ownership changes reset the page to 1.
- Error → `Alert` "Failed to load fee rules."

- [ ] **Step 1: Write the failing tests**
  - `lists each school with its rules and an Inactive badge for inactive rules`
  - `All Levels when a rule has no levels; at most 4 level chips then +N`
  - `filter change on page 2 reloads page 1 once` (Review Focus 4)
  - `empty states: no rules vs no match`
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(county): Fee Rules page`

### Task 11: Verify both repos

- [ ] Desktop: `pnpm typecheck`, `pnpm lint`, and `pnpm vitest run`, where only `renderer/app/page.test.tsx` may fail. Then `pnpm build:renderer`. Delete the temporary Node-ABI binary.
- [ ] Server: `npx tsc --noEmit` and `npx jest`.
- [ ] portal-web: `npx tsc --noEmit -p .` and `npx vitest run`.
- [ ] Inline whole-branch review against the spec (no subagent, by Alvin's choice); fix anything found and commit.
- [ ] Update the `county-portal-migration` memory; hand over to `superpowers:finishing-a-development-branch`.
