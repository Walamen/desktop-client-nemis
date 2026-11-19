# DEO Reports & Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every row of the DEO Reports & Compliance page real, on the web and on the desktop. The rows are Registration, Teacher Roster and the new Monthly Reports, which agrees with the Schools-page report dots.

**Architecture:** The server rewrites `getDistrictReportsCompliance` in place, with the same route and response shape, around a pure row helper fed by `computeSchoolStandings`. The provisioning snapshot gains two institution dates so the desktop can compute the same rows offline. The desktop mirrors the helper in the application layer, fed by `buildDistrictSchoolRows` and two new read-model queries, and serves it on `deo:reports-compliance` to a new page.

**Tech Stack:**
- Nemis: NestJS + Prisma + Jest (`apps/Server`), `packages/types`, and Next.js + RTK Query + Vitest (`apps/portal-web`).
- desktop-client-nemis: Electron + better-sqlite3, the hexagonal application layer, the vanilla-Zustand presentation layer, a Next.js renderer and Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-deo-reports-compliance-design.md` (desktop-client-nemis repo)

**Branches:** `feat/deo-reports-compliance` in both repos, already created from `main`. Tasks 1–3 are in Nemis; Tasks 4–7 are in desktop-client-nemis.

## Global Constraints

- Statuses are exactly `"APPROVED" | "PENDING" | "REJECTED" | "MISSING"`.
- Row `reportType` values, in this order within a school: `Registration`, `Teacher Roster`, `Monthly Reports`. Row ids: `${schoolId}:registration`, `${schoolId}:teachers`, `${schoolId}:monthly-reports`.
- Schools are sorted by name, taking the order the standings rows already have. There is no date sort.
- **Registration:**
  - status from the approval status: `APPROVED` → APPROVED; `PENDING` or `UNDER_REVIEW` → PENDING; `REJECTED` → REJECTED; anything else or null → MISSING;
  - date `approvedAt ?? createdAt`;
  - submittedBy = the standings `principalName`, else `"Not recorded"`;
  - note `"School onboarding and approval record"`.
- **Teacher Roster** covers active TEACHER / ASSISTANT_TEACHER staff only.
  - Status: total 0 → MISSING; awaiting (PENDING or UNDER_REVIEW) > 0 → PENDING; otherwise APPROVED.
  - date = the newest `createdAt` of those staff, or null.
  - submittedBy: `"1 teacher"`, `` `${n} teachers` ``, or `"No teacher records"` when there are none.
  - note: `` `${p} of ${n} awaiting approval` `` when p > 0; `"No teachers awaiting approval"` when p = 0 and n > 0; `"No teacher records have been submitted"` when n = 0.
- **Monthly Reports:**
  - k = the number of `true` values in `reportMonths` (length 3). Status: k = 3 → APPROVED; 1–2 → PENDING; 0 → MISSING.
  - date = the standings `lastSubmissionAt`, which may be older than the window or null; it is shown even when MISSING.
  - submittedBy `"School reports"`; note `` `${k}/3 months with a submitted report` ``.
- `period`: the date as `toLocaleDateString("en-US", { month: "long", year: "numeric" })`, else `"Awaiting submission"`. The table's date column shows `"Not submitted"` for null, as today.
- `summary = { total, approved, pending, rejected, missing }` counts the rows.
- **Scope:** the server keeps `findOne` + `enforceDistrictAccess`. The desktop takes the district only from `currentDistrictId`, never from the renderer.
- **Rule copies:** one copy of the row rules per app. The report dots and principal come only from `computeSchoolStandings` (server) and `buildDistrictSchoolRows` (desktop).
- **Never commit** desktop `apps/desktop/package.json` or portal-web `apps/portal-web/tsconfig.tsbuildinfo`. Stage files by name, never `git add -A`. No pushes.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Desktop SQLite tests:** if better-sqlite3 reports a NODE_MODULE_VERSION mismatch, run `pnpm rebuild:node` first, and `pnpm rebuild:electron` when done.

## Review Focus

1. **A teacher who is inactive but still PENDING** must not make the roster Pending, on either app. Tests in Task 1 and Task 4.
2. **A device synced before this release** has `details` without `approvedAt` / `createdAt`, or `details` NULL. Registration must show "Awaiting submission", not crash or show "Invalid Date". Tests in Task 4 and Task 5.
3. **A school with no teachers, no reports and an unknown approval status** gives three MISSING rows, all counted in `summary.missing`. Tests in Task 1 and Task 5.
4. **A DEO with no district** gets "No district assigned to your account." on the desktop (`districtId: null`, empty items), not an error. Tests in Task 5 and Task 7.
5. **A status tab plus a type chip that match nothing** show "No compliance records matched your filters.", not a blank table. Tests in Task 3 and Task 7.

---

### Task 1: Server row rules and endpoint rewrite (Nemis)

**Files:**
- Create: `apps/Server/src/common/district/compliance-rows.ts`
- Create: `apps/Server/src/common/district/compliance-rows.spec.ts`
- Modify: `apps/Server/src/districts/districts.service.ts`:
  - `getDistrictReportsCompliance` (l.2359–2574);
  - delete `mapApplicationStatus` (l.679) and `mapInspectionComplianceStatus` (l.697) if nothing else references them;
  - `formatPeriod` (l.387) delegates to the helper's `formatCompliancePeriod`.
- Create: `apps/Server/src/districts/districts.reports-compliance.spec.ts`. Build its Prisma mock the way `districts.school-detail.spec.ts` does.
- Modify: `packages/types/src/deo.ts`. Add a doc comment on `DistrictComplianceItem.reportType` listing the three values. The shape is unchanged.

**Interfaces:**
- Produces, in `compliance-rows.ts`:

```ts
export interface ComplianceSchoolInput {
  id: string; name: string; code: string;
  principalName: string | null;
  reportMonths: boolean[];
  lastSubmissionAt: string | null;
  approvalStatus: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  teachers: { total: number; awaitingApproval: number; newestCreatedAt: string | null };
}
export function formatCompliancePeriod(dateIso: string | null): string;
export function complianceRows(school: ComplianceSchoolInput): DistrictComplianceItem[]; // 3 rows, fixed order
export function complianceSummary(items: DistrictComplianceItem[]): DistrictReportsComplianceResponse["summary"];
```

- [ ] **Step 1: Write the failing helper tests** in `compliance-rows.spec.ts`. Use `const base: ComplianceSchoolInput` with id `"s-1"`, name `"Alpha"`, code `"A1"`, principal `"Ada Obi"`, reportMonths `[true, true, true]`, lastSubmissionAt `"2026-11-03T10:00:00.000Z"`, approval `"APPROVED"`, approvedAt `"2025-02-10T00:00:00.000Z"`, createdAt `"2025-01-05T00:00:00.000Z"`, and teachers `{ total: 12, awaitingApproval: 0, newestCreatedAt: "2026-09-01T00:00:00.000Z" }`.
  - `returns Registration, Teacher Roster, Monthly Reports in order`: the ids are `s-1:registration`, `s-1:teachers`, `s-1:monthly-reports`, and every row carries schoolId/schoolName/schoolCode.
  - `registration maps approval status`: APPROVED→APPROVED, PENDING→PENDING, UNDER_REVIEW→PENDING, REJECTED→REJECTED, null→MISSING.
  - `registration date falls back to createdAt`: with approvedAt null, date = createdAt and period = `"January 2025"`. With both null: date null, period `"Awaiting submission"`, status unaffected.
  - `registration submittedBy falls back to Not recorded` when principalName is null.
  - `teacher roster`, each case asserting status / submittedBy / note:
    - total 0: MISSING / `"No teacher records"` / `"No teacher records have been submitted"`, date null;
    - total 1, awaiting 0: APPROVED / `"1 teacher"` / `"No teachers awaiting approval"`;
    - total 12, awaiting 3: PENDING / `"12 teachers"` / `"3 of 12 awaiting approval"`.
  - `monthly reports`:
    - `[true, true, true]` → APPROVED, `"3/3 months with a submitted report"`;
    - `[false, true, false]` → PENDING, `"1/3 …"`;
    - `[false, false, false]` with lastSubmissionAt `"2026-03-14T00:00:00.000Z"` → MISSING, date kept, period `"March 2026"`;
    - lastSubmissionAt null → date null, period `"Awaiting submission"`.
  - `summary counts every status`: for a school with approval null, teachers total 0 and reportMonths all false, the summary is `{ total: 3, approved: 0, pending: 0, rejected: 0, missing: 3 }`.
- [ ] **Step 2: Write the failing service tests** in `districts.reports-compliance.spec.ts`. Mock `computeSchoolStandings` through the Prisma calls it makes, or spy on it (`jest.spyOn(service as any, "computeSchoolStandings")`), whichever `districts.school-detail.spec.ts` makes simpler.
  - `staff query keeps only active teaching staff`: assert the `staff.findMany` where includes `isActive: true` and `position: { in: [TEACHER, ASSISTANT_TEACHER] }`.
  - `inactive pending teacher does not make the roster pending`: the mock returns staff already filtered as Prisma would. Assert the where clause (above), and that a school whose only returned staff are APPROVED gives APPROVED.
  - `monthly reports follow the standings dots`: with standings `reportMonths [true, false, true]` for school s-1, the s-1 Monthly Reports row is PENDING with note `"2/3 months with a submitted report"`.
  - `rows are grouped by school in standings order`: two schools "Alpha" and "Beta" give six rows, Alpha's three first.
  - `no enrolment applications or inspections are read`: `enrollmentApplication.findMany` and `inspectionHistory.findMany` are not called.
  - `another district's DEO is refused`: `enforceDistrictAccess` throws `ForbiddenException`, as the existing specs show.
- [ ] **Step 3: Run them and make sure they fail.** From `apps/Server`: `pnpm jest src/common/district/compliance-rows.spec.ts src/districts/districts.reports-compliance.spec.ts`. Expected: FAIL (module not found / old rows).
- [ ] **Step 4: Implement.**
  - Write the helper.
  - In the service:
    - keep `findOne` + `enforceDistrictAccess`;
    - `const standings = await this.computeSchoolStandings(districtId)`, returning early with empty items and a zero summary when there are none;
    - read institutions `{ id, approvalStatus, approvedAt, createdAt }` and staff `{ institutionId, approvalStatus, createdAt }` (active, teaching positions) for the standings ids, in one `Promise.all`;
    - reduce staff per school into `{ total, awaitingApproval, newestCreatedAt }`;
    - `flatMap` the standings through `complianceRows`;
    - return `{ summary: complianceSummary(items), items }`.
  - Dates go to the helper as ISO strings.
- [ ] **Step 5: Verify.**
  - Run the same command (expected: PASS), then `pnpm jest src/districts src/common/district`. Expected: all pass, standings specs unchanged.
  - Run `pnpm exec tsc --noEmit -p tsconfig.json`. Expected: no errors.
- [ ] **Step 6: Commit** the five files: `feat(districts): real rows for DEO reports compliance`.

### Task 2: Institution dates in the desktop snapshot (Nemis)

**Files:**
- Modify: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` (the `details` object, l.980). After `registrationDate`, add `approvedAt: row.approvedAt?.toISOString() ?? null` and `createdAt: row.createdAt.toISOString()`. The query already loads the full row (`include: { levels: true }`, l.429).
- Modify: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`. Update the field-by-field `details` assertion (l.1187) and the fixtures (around l.1019 / l.1188) with `approvedAt` and `createdAt` values. Assert one school with `approvedAt: null`.

**Interfaces:**
- Produces: the snapshot `institutions[].details.approvedAt: string | null` and `details.createdAt: string`, which Task 4 reads.

- [ ] **Step 1:** Update the spec's expected `details` and fixtures. Run `pnpm jest src/desktop-provisioning/desktop-provisioning.service.spec.ts`. Expected: FAIL on `details`.
- [ ] **Step 2:** Add the two fields. Run the same command, then `pnpm jest src/desktop-provisioning`. Expected: PASS.
- [ ] **Step 3: Commit** both files: `feat(provisioning): send institution approvedAt and createdAt to desktops`.

### Task 3: Web page (Nemis portal-web)

**Files:**
- Modify: `apps/portal-web/src/app/government/deo/reports/page.tsx`.
- Create: `apps/portal-web/src/app/government/deo/reports/page.test.tsx`. Mock the way `deo/schools/[id]/page.test.tsx` does: `vi.mock("@/store/deo")`, `vi.mock("@/store/hooks")` with `districtId "d-1"`, and `next/navigation` `useRouter` → `{ push }`.

**Interfaces:**
- Consumes: `useGetDistrictReportsComplianceQuery` (unchanged), and `useGetDistrictSettingsQuery({ districtId }, { skip })` as `deo/schools/page.tsx` uses it (l.41–56).

- [ ] **Step 1: Write the failing page tests.** The fixture is one school `s-1` "Alpha" with three rows: Registration APPROVED dated `"2025-02-10T00:00:00.000Z"`, Teacher Roster PENDING, and Monthly Reports MISSING with date null.
  - `shows the real district and county`: settings profile `{ districtName: "Kakata", countyName: "Margibi" }` → the text `"Kakata · Margibi"`, and no `"Buchanan"` anywhere.
  - `has no download button`: no element titled `"Open record"`.
  - `eye opens the school`: clicking the `"View school"` button calls `push("/government/deo/schools/s-1")`.
  - `null date reads Not submitted`.
  - `type chips come from the rows`: buttons `All`, `Registration`, `Teacher Roster`, `Monthly Reports`, and no `Enrollment` or `Infrastructure`.
  - `filters with no match show the empty text`: click `Rejected`, then `Registration` → `"No compliance records matched your filters."`.
  - `error offers retry`: query `{ error: {}, refetch }`; clicking `Retry` calls `refetch`.
- [ ] **Step 2:** From `apps/portal-web`, run `pnpm vitest run src/app/government/deo/reports/page.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The header place is `[districtName, countyName].filter(Boolean).join(" · ")`; when it's empty the line is left out.
  - Remove the Download button and its icon import.
  - The error block gets a `Retry` button calling `refetch`.
  - Nothing else in the layout changes.
- [ ] **Step 4: Verify.** Run the same test (expected: PASS), then `pnpm typecheck`, `pnpm lint` and `pnpm test` in `apps/portal-web`. Expected: no errors, all pass.
- [ ] **Step 5: Commit** both files: `feat(deo): honest Reports & Compliance page`.

### Task 4: Desktop read model (desktop-client-nemis)

**Files:**
- Modify: `packages/application/src/interfaces/deo/district-overview-read-model.ts`. Add, with one-line doc comments:

```ts
/** Active district schools' approval status, with approvedAt / createdAt read from details (null when absent or unparsable). */
listSchoolRegistrations(districtId: string): { institutionId: string; approvalStatus: string; approvedAt: string | null; createdAt: string | null }[];
/** Active TEACHER / ASSISTANT_TEACHER staff per school: total, awaiting approval (PENDING or UNDER_REVIEW), newest createdAt. A school with none is absent. */
teacherRosterBySchool(districtId: string): { institutionId: string; total: number; awaitingApproval: number; newestCreatedAt: string | null }[];
```

- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.ts`.
  - Implement both with `guarded(...)`, `this.#statements` and `DISTRICT_SCHOOLS`, like their neighbours.
  - Parse `details` with the same safe parser `getSchoolProfile` uses (l.~627). A date must be a non-empty string, else null.
- Modify: `packages/application/src/testing/deo/in-memory-district-overview.ts`. Add settable `registrations` / `teacherRoster` fields and the two methods, in the double's style.
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.test.ts`.

- [ ] **Step 1: Write the failing tests**, using the file's `seedDistrict()` / `staff()` helpers:
  - `listSchoolRegistrations reads dates from details`:
    - details `{"approvedAt":"2025-02-10T00:00:00.000Z","createdAt":"2025-01-05T00:00:00.000Z"}` → both dates;
    - details NULL → both null;
    - details `'not json'` → both null;
    - an inactive school and another district's school are absent.
  - `teacherRosterBySchool counts active teaching staff`:
    - at s-a, TEACHER APPROVED, ASSISTANT_TEACHER PENDING, TEACHER UNDER_REVIEW, inactive TEACHER PENDING, and PRINCIPAL PENDING → `{ total: 3, awaitingApproval: 2 }`;
    - newestCreatedAt = the latest of the three active teachers' createdAt;
    - a school with no teachers is absent.
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both methods.
- [ ] **Step 4:** Run the same test (expected: PASS), then `pnpm typecheck`. Expected: no errors.
- [ ] **Step 5: Commit** the four files: `feat(deo): read model for reports compliance`.

### Task 5: Desktop row helper and use case (desktop-client-nemis)

**Files:**
- Modify: `packages/types/src/deo-dashboard.ts`. After `DeoSchoolDetail`, add:

```ts
export type DeoComplianceStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'MISSING';
/** One row of the Reports & Compliance page (Nemis DistrictComplianceItem). */
export interface DeoComplianceItem {
  id: string; schoolId: string; schoolName: string; schoolCode: string;
  /** Registration | Teacher Roster | Monthly Reports */
  reportType: string; period: string; submittedBy: string; note: string;
  date: string | null; status: DeoComplianceStatus;
}
export interface DeoComplianceSummary { total: number; approved: number; pending: number; rejected: number; missing: number }
export interface DeoReportsComplianceResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  summary: DeoComplianceSummary;
  items: DeoComplianceItem[];
}
```

- Create: `packages/application/src/use-cases/deo/compliance-rows.ts` and `compliance-rows.test.ts`. These mirror Task 1's helper: same `ComplianceSchoolInput` fields and the same three functions over the desktop types. The tests are Task 1 Step 1's cases, unchanged.
- Create: `packages/application/src/use-cases/deo/get-deo-reports-compliance.ts` and `.test.ts`. Model them on `get-deo-schools.ts` / `.test.ts`.
- Modify: `packages/application/src/services/deo-application-service.ts`. Add `getReportsCompliance(): Promise<ApplicationResponse<DeoReportsComplianceResult>>`, the way `listSchools` is wired.
- Modify: `packages/application/src/factories/create-application-layer.ts`. In the DEO block, add `GetDeoReportsComplianceUseCase` with the same deps as `GetDeoSchoolsUseCase`.

**Interfaces:**
- Consumes: Task 4's two read-model methods, and `buildDistrictSchoolRows(deps, districtId, now, readModel.listOpenAlerts(districtId))`.
- Produces: `GetDeoReportsComplianceUseCase` (query `Record<string, never>`, name `'GetDeoReportsCompliance'`) and `app.deo.getReportsCompliance()`.

- [ ] **Step 1: Write the failing tests.**
  - The helper tests, copied from Task 1 Step 1.
  - Use-case tests:
    - `no district gives an empty result`: `currentDistrictId: null` → `{ districtId: null, district: null, county: null, summary: { total: 0, … all 0 }, items: [] }`.
    - `monthly reports agree with the Schools page`: for the same in-memory data and clock, each school's Monthly Reports status and note match its `buildDistrictSchoolRows` row's `reportMonths` (k of 3). Also assert `GetDeoSchoolsUseCase` returns the same `reportMonths`.
    - `registration uses the schools-row principal`: a school with a School Admin name gives that name as submittedBy.
    - `school with nothing gives three MISSING rows`: no registration row in the double, no roster, no reports → summary `missing: 3`.
    - `header names come from the district and county`.
- [ ] **Step 2:** Run `pnpm vitest run packages/application/src/use-cases/deo/compliance-rows.test.ts packages/application/src/use-cases/deo/get-deo-reports-compliance.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The use case: resolve the district as `GetDeoSchoolsUseCase` does, build the rows, and join the registrations and roster by `institutionId`. A missing roster becomes `{ total: 0, awaitingApproval: 0, newestCreatedAt: null }`, and a missing registration gives `approvalStatus: null`.
  - Then `flatMap(complianceRows)` and `complianceSummary`.
- [ ] **Step 4:** Run the same tests, then `pnpm vitest run packages/application/src/use-cases/deo` and `pnpm typecheck`. Expected: all PASS, no errors.
- [ ] **Step 5: Commit** the changed files: `feat(deo): reports compliance use case`.

### Task 6: Desktop IPC, bridge and view model (desktop-client-nemis)

**Files:**
- Modify: `packages/types/src/ipc.ts`. After `DEO_STAFF_REPORT`, add `DEO_REPORTS_COMPLIANCE: 'deo:reports-compliance'`.
- Modify: `packages/types/src/deo-dashboard.ts`. In `DeoApi`, after `getStaffComplianceReport`, add `getReportsCompliance(): Promise<DeoReportsComplianceResult>;`.
- Modify: `apps/desktop/electron/ipc/handlers/deo/reports.ts`. Add `handle(IpcChannels.DEO_REPORTS_COMPLIANCE, assertNoArgs, async () => (await app.deo.getReportsCompliance()).data)`.
- Modify: `apps/desktop/electron/ipc/handlers/deo/reports.test.ts`. Assert that the handler returns the use case's data, and that `assertNoArgs` rejects `['d-1']`.
- Modify: `apps/desktop/electron/ipc/authorizeChannel.ts` (add to `DEO_CHANNELS`) and `authorizeChannel.test.ts` (the DEO channel list).
- Modify: `apps/desktop/electron/preload/deo/index.ts`: `getReportsCompliance: () => invoke(IpcChannels.DEO_REPORTS_COMPLIANCE)`.
- Modify: `apps/desktop/renderer/services/nemis-bridge/deo/dashboard-bridge.ts`: `getReportsCompliance: (): Promise<DeoReportsComplianceResult> => api().deo.getReportsCompliance()`.
- Modify: `apps/desktop/renderer/lib/ipc/deo.ts`: `getReportsCompliance: () => query(() => deoBridge.getReportsCompliance())`.
- Create: `packages/presentation/src/view-models/deo/deo-reports-compliance-view-model.ts` plus `.test.ts`, modelled on `deo-schools-view-model.ts` / `.test.ts`. State `{ compliance: AsyncState<DeoReportsComplianceResult> }`; `load(): Promise<void>` via `trackQuery`.
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`: `readonly deoReportsCompliance: DeoReportsComplianceViewModel` and `deoReportsCompliance: new DeoReportsComplianceViewModel({ deo: app.deo })`.
- Modify: `apps/desktop/renderer/lib/presentation/hooks/deo.ts`: `export const useDeoReportsComplianceViewModel = () => usePresentation().viewModels.deoReportsCompliance;`.

- [ ] **Step 1: Write the failing tests:**
  - the IPC tests;
  - the authorize list;
  - view model: `load` moves `idle → loading → success` with the result, and a rejected call gives `error`.
- [ ] **Step 2:** Run `pnpm vitest run packages/presentation/src/view-models/deo apps/desktop/electron/ipc`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the wiring.
- [ ] **Step 4:** Run the same command (expected: PASS), then `pnpm typecheck` and `pnpm lint`. Expected: no errors. The renderer boundary guard only allows `window.nemis` in the bridge.
- [ ] **Step 5: Commit** the changed files: `feat(deo): reports compliance channel and view model`.

### Task 7: Desktop page (desktop-client-nemis)

**Files:**
- Create: `apps/desktop/renderer/components/deo/DeoReportsCompliancePage.tsx`.
  - It reproduces the web page as Task 3 leaves it: the same cards, status tabs, type chips, table, Tailwind classes, Lucide icons and copy.
  - The header place is `[district?.name, county?.name]` joined with `" · "`.
  - The eye button navigates to `` `/government/deo/schools/details?id=${schoolId}` ``, the way `DeoSchoolsPage` links its rows.
  - States:
    - loading: the pulse rows;
    - error: "Failed to load reports and compliance data." with a `Retry` that calls `vm.load()`;
    - `districtId === null`: "No district assigned to your account.";
    - empty filter result: "No compliance records matched your filters.".
  - It calls `load()` on mount.
- Modify: `apps/desktop/renderer/app/government/deo/reports/page.tsx`. Replace the ComingSoon with `<DeoReportsCompliancePage />`, and update the comment.
- Create: `apps/desktop/renderer/app/government/deo/reports/page.test.tsx`, modelled on `deo/schools/page.test.tsx` (`window.nemis` mock + `PresentationProvider` + `createRendererPresentation`).

- [ ] **Step 1: Write the failing page tests,** using Task 3's fixture through `window.nemis.deo.getReportsCompliance`:
  - the real district · county;
  - no `"Open record"` button;
  - the eye routes to `/government/deo/schools/details?id=s-1`;
  - `"Not submitted"` for the null date;
  - the type chips are `All` / `Registration` / `Teacher Roster` / `Monthly Reports`;
  - `Rejected` + `Registration` shows the empty text;
  - `districtId: null` shows "No district assigned to your account.";
  - a rejected call shows the error, and `Retry` calls the bridge again.
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/renderer/app/government/deo/reports/page.test.tsx`. Expected: FAIL (ComingSoon).
- [ ] **Step 3:** Implement the page and the route.
- [ ] **Step 4: Verify.** Run the same test, then:
  - `pnpm vitest run apps/desktop/renderer/app/government/deo`;
  - `pnpm --filter @nemis-desktop/app typecheck`;
  - `pnpm lint`.
  Expected: all PASS, no errors. `deo/reports/automated` tests are unaffected.
- [ ] **Step 5: Commit** the three files: `feat(deo): Reports & Compliance page on the desktop`.
