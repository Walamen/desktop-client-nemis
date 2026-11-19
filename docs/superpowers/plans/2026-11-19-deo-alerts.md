# DEO Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The DEO Alerts page lists the district's alerts by the dashboard's rule, on the web and offline on the desktop. Its server endpoints check district access, and the dead notification links are fixed.

**Architecture:**
- **Server:** the dashboard/incidents alert rule moves into one helper. `getDistrictAlerts`, `resolveDistrictAlert`, `getDistrictIncidents` and `markIncidentReviewed` all use it, and all check `ensureDistrictAccess`.
- **Web:** keeps its layout, with a real header, a school line and a resolve error.
- **Desktop:** adds one read-model query, a paging use case, a `deo:list-alerts` channel and a page. Resolve reuses the existing offline `deo:resolve-alert`.

**Tech Stack:**
- Nemis: NestJS + Prisma + Jest, `packages/types`, Next.js + RTK Query + Vitest.
- desktop-client-nemis: Electron + better-sqlite3, the hexagonal application layer, the vanilla-Zustand presentation layer, the Next.js renderer and Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-deo-alerts-design.md` (desktop-client-nemis repo)

**Branches:** `feat/deo-alerts` in both repos, already created from `main`. Tasks 1–3 are in Nemis and Tasks 4–7 in desktop-client-nemis.

## Global Constraints

- **The rule:** an alert belongs to district D when `alert.districtId = D`, or `alert.institutionId` is an **active** school of D. Teachers' requests to their own school admin are excluded:
  - server: `isSchoolStaffRequest(metadata)` from `common/district/school-standing.ts`;
  - desktop: `notSchoolStaffRequest(...)` from `data/repositories/sqlite/business/support.ts`.

  County-level alerts are never included.
- **Filter values:** web `isResolved` false / true / undefined; desktop `'open' | 'resolved' | 'all'`. Open is the default.
- **Order:** unresolved first; then severity CRITICAL, HIGH, MEDIUM, LOW; then `createdAt` newest first; then `id` ascending.
- **Page size 15.** `meta = { page, limit, total, totalPages }`, where `total` is counted after the rule and filter, and `totalPages = Math.ceil(total / limit)`.
- **Item fields:** `id`, `type`, `severity`, `title`, `description`, `institutionId: string | null`, `schoolName: string | null`, `isResolved`, `resolvedAt`, `resolvedBy` (server only), `createdAt`.
- **Exact copy:**
  - School line: `School: {schoolName}`, shown only when `schoolName` is non-null.
  - Resolve failure: `Couldn't resolve this alert. Try again.`
  - Load error: `Failed to load alerts.`, with a `Retry` button.
  - Empty: `No open alerts — all clear!` for Open, `No alerts found.` otherwise.
  - Teacher-request refusal (server): `This is a request for the school's administrator to answer`.
  - Wrong district (server): `Alert does not belong to this district`.
- **Header place:** district · county names, with parts left out when missing. No fake place.
- **Scope:**
  - The server calls `ensureDistrictAccess(districtId, user)` on list and resolve; incidents already does.
  - The desktop takes the district only from `currentDistrictId`.
- **Notification links:**
  - `DATA_VALIDATION_ISSUE`, `PENDING_APPROVAL` and `NEW_SCHOOL_REGISTRATION` → `/government/deo/alerts`;
  - `INFRASTRUCTURE_ISSUE` → `/government/deo/infrastructure` (unchanged);
  - default → `/government/deo`;
  - message notifications → `/government/deo/messages`.
- **Never commit** desktop `apps/desktop/package.json` or `apps/portal-web/tsconfig.tsbuildinfo`. Stage files by name. No pushes.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Desktop SQLite tests:** on a NODE_MODULE_VERSION error, run `pnpm rebuild:node` first and `pnpm rebuild:electron` when done.

## Review Focus

1. **More than 15 matching alerts, and a teacher request among them.**
   - The page count and `total` must reflect the alerts left after excluding requests.
   - The server must page **after** filtering, never before.
   - Tested in Task 1 (server) and Task 5 (desktop).
2. **An alert resolved on another device** while the page is open. Resolve replies `false`; the alert moves to Resolved with no error shown. Tested in Task 6.
3. **A school that becomes inactive.** Its open alerts drop off the dashboard and the Alerts page on both apps, and can't be resolved. Tested in Task 1 and Task 4.
4. **A page number past the end**, after resolving the last alert on the last page. The desktop returns the last page, not an empty one. Tested in Task 5.
5. **A County Admin of another county calling the list.** They get 403. Tested in Task 1.

---

### Task 1: Server alert rule, list and resolve (Nemis)

**Files:**
- Create: `apps/Server/src/districts/district-alerts.ts`. This holds the rule helpers, which are pure apart from one Prisma lookup.
- Modify: `apps/Server/src/districts/districts.service.ts`:
  - `getDistrictIncidents` (~l.3026) and `markIncidentReviewed` (~l.3074) use the helpers;
  - rewrite `getDistrictAlerts` (~l.3122) and `resolveDistrictAlert` (~l.3172).
- Modify: `apps/Server/src/districts/districts.controller.ts`:
  - `getAlerts` (l.376) passes `@CurrentUser() user: UserContext`;
  - `resolveAlert` (l.397) passes the whole `UserContext` instead of `{ userId }`.
- Modify: `packages/types/src/deo.ts`. `AlertItem` (l.129) gains `institutionId: string | null` and `schoolName: string | null`.
- Create: `apps/Server/src/districts/districts.alerts.spec.ts`. Build its Prisma mock the way `districts.school-standings.spec.ts` mocks incidents.

**Interfaces:**
- Produces (`district-alerts.ts`):

```ts
export const SEVERITY_RANK: Record<string, number>; // CRITICAL 0, HIGH 1, MEDIUM 2, LOW 3, unknown 4
export function compareDistrictAlerts(a: { isResolved: boolean; severity: string; createdAt: Date; id: string }, b: same): number;
export function districtAlertWhere(districtId: string, activeSchoolIds: string[]): Prisma.AlertWhereInput; // { OR: [{ districtId }, { institutionId: { in: activeSchoolIds } }] }
```

- Service (private): `activeSchoolIds(districtId): Promise<string[]>`, and `resolveInDistrict(districtId, alertId, resolvedBy): Promise<Alert>`, shared by `markIncidentReviewed` and `resolveDistrictAlert`.
- `resolveInDistrict` behaves as follows:
  - not found → `NotFoundException("Alert not found")`;
  - not in the rule → `BadRequestException("Alert does not belong to this district")`;
  - a teacher request → `BadRequestException("This is a request for the school's administrator to answer")`;
  - already resolved → return it unchanged, with no update.
- Service signatures:
  - `getDistrictAlerts(districtId, options: { isResolved?: boolean; page?: number; limit?: number }, user: UserContext)`;
  - `resolveDistrictAlert(districtId, alertId, user: UserContext)`, with resolvedBy = `user.userId`.

- [ ] **Step 1: Write the failing tests** in `districts.alerts.spec.ts`. The fixture is district `d-1` with active school `s-1`, inactive school `s-off`, and another district's school `s-x`.
  - `lists district and active-school alerts only`:
    - an alert tagged `d-1` and an `s-1` alert are listed;
    - an `s-off` alert, an `s-x` alert and a county-only alert (`countyId` set, no district or institution) are not;
    - assert the Prisma `where` uses `districtAlertWhere("d-1", ["s-1"])`.
  - `excludes teacher requests and counts after filtering`: 16 open `s-1` alerts plus 1 with `metadata { staffId: "stf-1" }` → `meta.total` 16, `totalPages` 2, and page 2 holds 1 item.
  - `orders open first, then severity, then newest`: mixed fixtures come back in Global Constraints order.
  - `filters by isResolved`: false → open only; true → resolved only; undefined → both.
  - `adds the school name`: the `s-1` item has `schoolName: "Alpha"` and `institutionId: "s-1"`; a district-tagged item has both null.
  - `refuses another district's DEO` on list and on resolve: `ForbiddenException`.
  - `refuses a county admin of another county` on list: `ForbiddenException`.
  - `resolve`:
    - an `s-1` alert updates with `resolvedBy` = the user;
    - a teacher request → BadRequest with the exact text;
    - an `s-off` alert → BadRequest with "Alert does not belong to this district";
    - an already resolved alert returns it, and `alert.update` is not called.
  - `compareDistrictAlerts` unit cases: the open/resolved tie-break, severity rank, `createdAt`, then `id`.
- [ ] **Step 2:** From `apps/Server`, run `pnpm jest src/districts/districts.alerts.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `getDistrictAlerts`:
    - access check, then `activeSchoolIds`;
    - `findMany({ where: { AND: [districtAlertWhere(...), isResolved filter] } })`, selecting the item fields, `metadata` and `institution: { select: { name: true } }`;
    - drop teacher requests, sort with `compareDistrictAlerts`, then slice for the page;
    - `page` defaults to 1 and `limit` to 20 (the web sends 15).
  - `getDistrictIncidents` and `markIncidentReviewed` switch to the helpers (active schools) and `resolveInDistrict`. Keep their existing response shapes.
- [ ] **Step 4: Verify.**
  - Run the same spec, then `pnpm jest src/districts src/common/district`. Expected: all pass, including the incidents cases in `districts.school-standings.spec.ts`. Update only the assertions that the active-school rule, or idempotent re-resolve, intentionally changes, and say which in the report.
  - Run `pnpm exec tsc --noEmit -p tsconfig.json`. Expected: no errors.
- [ ] **Step 5: Commit** the changed files: `feat(districts): DEO alerts follow the dashboard rule, with access checks`.

### Task 2: Notification links (Nemis)

**Files:**
- Modify: `apps/Server/src/districts/districts.service.ts`:
  - `getAlertActionUrl` (~l.503);
  - the two `"/government/deo/communications"` literals in `getDistrictNotifications` (~l.3694, ~l.3747).
- Test: add to `apps/Server/src/districts/districts.alerts.spec.ts`. Call `getDistrictNotifications` through the service, as an existing spec does if one exists. Otherwise, test `getAlertActionUrl` through `(service as any)`.

- [ ] **Step 1: Write the failing tests:**
  - `DATA_VALIDATION_ISSUE`, `PENDING_APPROVAL` and `NEW_SCHOOL_REGISTRATION` → `/government/deo/alerts`;
  - `INFRASTRUCTURE_ISSUE` → `/government/deo/infrastructure`;
  - `TEACHER_SHORTAGE` → `/government/deo`;
  - a message notification's `actionUrl` → `/government/deo/messages`.
- [ ] **Step 2:** Run the spec. Expected: FAIL.
- [ ] **Step 3:** Change the mapping and the two literals.
- [ ] **Step 4:** Run `pnpm jest src/districts`. Expected: PASS.
- [ ] **Step 5: Commit:** `fix(districts): DEO notifications link to live pages`.

### Task 3: Web Alerts page (Nemis portal-web)

**Files:**
- Modify: `apps/portal-web/src/store/deo/Api/deoApi.ts`. `resolveDistrictAlert` (l.474) `invalidatesTags` becomes `["DistrictAlerts", "DistrictIncidents", "DistrictOverview"]`.
- Modify: `apps/portal-web/src/app/government/deo/alerts/page.tsx`.
- Create: `apps/portal-web/src/app/government/deo/alerts/page.test.tsx`, mocked like `deo/reports/page.test.tsx`.

**Interfaces:**
- Consumes: `AlertItem.institutionId` and `.schoolName` (Task 1), and `useGetDistrictSettingsQuery` as `deo/reports/page.tsx` uses it.

- [ ] **Step 1: Write the failing page tests:**
  - `shows the real district and county`: `"Kakata · Margibi"`, and no `"Buchanan"`.
  - `shows the school line only for school alerts`: `"School: Alpha"` is present for one alert, and no `School:` text appears for a district-tagged alert.
  - `shows a resolve failure next to the alert`: the mutation's `unwrap` rejects, then clicking `Resolve` shows `Couldn't resolve this alert. Try again.`
  - `open empty text`: no data → `No open alerts — all clear!`
  - `pagination only with more than one page`: `totalPages` 1 → no `Page 1 of`; `totalPages` 2 → `Page 1 of 2 (16 total)`.
  - `error offers retry`: query error → `Failed to load alerts.`, and `Retry` calls `refetch`.
- [ ] **Step 2:** From `apps/portal-web`, run `pnpm vitest run src/app/government/deo/alerts/page.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The header place, as the Reports & Compliance page does it.
  - The `School: {schoolName}` line: `text-xs text-gray-500 mt-1`, placed under the description.
  - The resolve error: keep a `failedAlertId` state, set it in the `catch` and clear it on the next attempt. Show the message under that alert's button as `text-xs text-red-600`.
  - A `Retry` under the error text.
  - The rest of the layout is unchanged.
- [ ] **Step 4: Verify.** Run the same test, then `pnpm typecheck`, `pnpm lint` and `pnpm test` in `apps/portal-web`. Expected: all pass.
- [ ] **Step 5: Commit** the three files: `feat(deo): honest Alerts page`.

### Task 4: Desktop alert query and active-school alignment (desktop-client-nemis)

**Files:**
- Modify: `packages/application/src/interfaces/deo/district-overview-read-model.ts`. Add `DistrictAlertListRow` and:

```ts
export interface DistrictAlertListRow {
  readonly id: string; readonly type: string; readonly severity: string;
  readonly title: string; readonly description: string;
  readonly institutionId: string | null; readonly schoolName: string | null;
  readonly isResolved: boolean; readonly resolvedAt: string | null; readonly createdAt: string;
}
/** The district's alerts by the dashboard rule (district-tagged or an active school's; no staff requests; no county-level), in page order. */
listDistrictAlerts(districtId: string, filter: 'open' | 'resolved' | 'all'): DistrictAlertListRow[];
```

- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.ts`:
  - implement `listDistrictAlerts`, ordering in SQL by `isResolved ASC`, then a `CASE severity` rank, then `createdAt DESC`, then `id ASC`;
  - in `listOpenAlerts` (l.303), add `AND i.isActive = 1` to the institution sub-select.
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictAlertStore.ts` (l.31). Same `AND i.isActive = 1`.
- Modify: `packages/application/src/testing/deo/in-memory-district-overview.ts`. Add a settable `districtAlerts` field and the method.
- Tests: `SqliteDistrictOverviewReadModel.test.ts` and `SqliteDistrictAlertStore.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `listDistrictAlerts`:
    - **'open':** a district-tagged alert and an active-school alert, in order. An inactive school's alert, another district's alert, a county-only alert and a teacher request (`metadata {"staffId":"stf-1"}`) are all absent.
    - **'resolved':** only resolved alerts, with `resolvedAt`.
    - **'all':** open before resolved.
    - Field values: `schoolName` is the school's name, or null for a district-tagged alert; `isResolved` is a boolean.
    - **Severity order:** CRITICAL, HIGH, MEDIUM, LOW within the open alerts.
  - `listOpenAlerts`: leaves out an inactive school's alert.
  - The store: `resolve` refuses an inactive school's alert (returns `false`, the row is unchanged, nothing is queued).
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictOverviewReadModel.test.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictAlertStore.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests, then `pnpm typecheck`. Expected: PASS, no errors.
- [ ] **Step 5: Commit** the changed files: `feat(deo): district alerts query; school alerts only from active schools`.

### Task 5: Desktop alerts use case (desktop-client-nemis)

**Files:**
- Modify: `packages/types/src/deo-dashboard.ts`. After `DeoReportsComplianceResult`, add:

```ts
export type DeoAlertFilter = 'open' | 'resolved' | 'all';
export interface DeoAlertsQuery { filter: DeoAlertFilter; page: number }
export interface DeoAlertListItem {
  id: string; type: string; severity: string; title: string; description: string;
  institutionId: string | null; schoolName: string | null;
  isResolved: boolean; resolvedAt: string | null; createdAt: string;
}
export interface DeoAlertsResult {
  districtId: string | null;
  district: { id: string; name: string } | null;
  county: { id: string; name: string } | null;
  alerts: DeoAlertListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
```

  Put one field per line, like the rest of the file.
- Create: `packages/application/src/use-cases/deo/get-deo-alerts.ts` and `.test.ts`, modelled on `get-deo-schools.ts` (district and county from the read model).
- Modify: `packages/application/src/services/deo-application-service.ts`. Add `listAlerts(query: DeoAlertsQuery): Promise<ApplicationResponse<DeoAlertsResult>>`.
- Modify: `packages/application/src/factories/create-application-layer.ts`. Wire `GetDeoAlertsUseCase` with `{ readModel: ports.districtOverview, currentDistrictId: ports.currentDistrictId, logger }`.

**Interfaces:**
- Consumes: Task 4's `listDistrictAlerts`.
- Produces: `app.deo.listAlerts(query)` and `GetDeoAlertsUseCase`, named `'GetDeoAlerts'`.
- `limit` = 15 and `totalPages = Math.ceil(total / 15)`.
- When `page > totalPages > 0`, the result uses `page = totalPages`. With `total` 0, page is 1 and totalPages 0.

- [ ] **Step 1: Write the failing tests:**
  - `no district`: `{ districtId: null, district: null, county: null, alerts: [], meta: { page: 1, limit: 15, total: 0, totalPages: 0 } }`, and the read model is not called.
  - `pages 15 at a time`: 16 rows, page 2 → one alert, `meta { page: 2, limit: 15, total: 16, totalPages: 2 }`.
  - `a page past the end returns the last page`: 16 rows, page 5 → page 2 with one alert.
  - `passes the filter and the session district`: the double recorded `listDistrictAlerts('d-1', 'resolved')`.
  - `header names`: the district and county come from the read model.
- [ ] **Step 2:** Run `pnpm vitest run packages/application/src/use-cases/deo/get-deo-alerts.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm vitest run packages/application/src/use-cases/deo` and `pnpm typecheck`. Expected: PASS, no errors.
- [ ] **Step 5: Commit:** `feat(deo): alerts use case`.

### Task 6: Desktop IPC, bridge and view model (desktop-client-nemis)

**Files:**
- `packages/types/src/ipc.ts`:
  - add `DEO_LIST_ALERTS: 'deo:list-alerts'` after `DEO_RESOLVE_ALERT`;
  - add its `IpcContract` entry: `{ args: [DeoAlertsQuery]; result: DeoAlertsResult }`.
- `packages/types/src/deo-dashboard.ts`: in `DeoApi`, add `listAlerts(query: DeoAlertsQuery): Promise<DeoAlertsResult>`.
- `apps/desktop/electron/security/validateIpc.ts`: add `assertDeoAlertsQueryArgs`, modelled on `assertDeoAttendanceReportQueryArgs`:
  - exactly one plain object;
  - the only keys allowed are `filter` and `page`;
  - `filter` is one of `open`, `resolved`, `all`;
  - `page` is an integer from 1 to 10000.
- `apps/desktop/electron/ipc/handlers/deo/dashboard.ts` (next to `DEO_RESOLVE_ALERT`): `handle(IpcChannels.DEO_LIST_ALERTS, assertDeoAlertsQueryArgs, async (query: DeoAlertsQuery) => (await app.deo.listAlerts(query)).data)`. Test it in `dashboard.test.ts`.
- `apps/desktop/electron/ipc/authorizeChannel.ts` and its test: add the channel to `DEO_CHANNELS`.
- Expose it through `apps/desktop/electron/preload/deo/index.ts`, `renderer/services/nemis-bridge/deo/dashboard-bridge.ts` and `renderer/lib/ipc/deo.ts`, as `listAlerts`.
- Create `packages/presentation/src/view-models/deo/deo-alerts-view-model.ts` and its `.test.ts`, modelled on `deo-dashboard-view-model.ts`. State:

```ts
{ alerts: AsyncState<DeoAlertsResult>; filter: DeoAlertFilter; page: number; resolvingAlertId: string | null; failedAlertId: string | null }
```

  Methods:
  - `load(): Promise<void>` loads with the current filter and page;
  - `setFilter(filter)` sets page 1, then loads;
  - `setPage(page)` loads;
  - `resolve(alertId)`.
- `packages/presentation/src/factories/create-presentation-layer.ts`: `deoAlerts: new DeoAlertsViewModel({ deo: app.deo })`. Hook in `renderer/lib/presentation/hooks/deo.ts`: `useDeoAlertsViewModel`.

**Interfaces:**
- `resolve(alertId)`:
  - ignored while another resolve runs;
  - sets `resolvingAlertId` and clears `failedAlertId`;
  - calls `deo.resolveAlert(alertId)`, then `load()`.
- `failedAlertId = alertId` when the call rejects. It is also set when the call returned `false` **and** the reloaded `alerts.data.alerts` still has that id with `isResolved === false`.
- `resolvingAlertId` returns to null in `finally`.

- [ ] **Step 1: Write the failing tests:**
  - IPC:
    - forwards `{ filter: 'open', page: 1 }`;
    - rejects `[]`, `[{ filter: 'x', page: 1 }]`, `[{ filter: 'open', page: 0 }]`, `[{ filter: 'open', page: 1.5 }]` and `[{ filter: 'open', page: 1, districtId: 'd-2' }]`.
  - The authorize list.
  - View model:
    - `load` uses the filter and page;
    - `setFilter('resolved')` resets the page to 1;
    - resolve then reload;
    - resolve rejects → `failedAlertId`;
    - resolve returns false and the reload no longer lists the alert as open → `failedAlertId` null;
    - resolve returns false and it is still open → `failedAlertId` set.
- [ ] **Step 2:** Run `pnpm vitest run packages/presentation/src/view-models/deo apps/desktop/electron/ipc apps/desktop/electron/security`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command, then `pnpm typecheck` and `pnpm lint`. Expected: PASS, no errors.
- [ ] **Step 5: Commit:** `feat(deo): alerts channel and view model`.

### Task 7: Desktop Alerts page (desktop-client-nemis)

**Files:**
- Create: `apps/desktop/renderer/components/deo/DeoAlertsPage.tsx`.
  - It reproduces the web page as Task 3 leaves it (`Nemis/apps/portal-web/src/app/government/deo/alerts/page.tsx`): the same markup, classes, icons and copy.
  - The header place comes from `district?.name` and `county?.name`.
  - The filter `<select>` calls `vm.setFilter`, and the arrows call `vm.setPage`.
  - Resolve calls `vm.resolve`. Its button is disabled while `resolvingAlertId` is set, and the failure message appears under the alert whose id is `failedAlertId`.
  - It loads through `useRevalidateOnSync`, as `DeoReportsCompliancePage` does, so it reloads after each sync.
  - States:
    - `districtId === null` → "No district assigned to your account.";
    - the error with `Retry` → `vm.load()`.
- Modify: `apps/desktop/renderer/app/government/deo/alerts/page.tsx`. Replace the raw `SchoolAdminCollectionPage` with `<DeoAlertsPage />`.
- Create: `apps/desktop/renderer/app/government/deo/alerts/page.test.tsx`, modelled on `deo/reports/page.test.tsx`, with a `window.nemis.deo.listAlerts` / `resolveAlert` mock.

- [ ] **Step 1: Write the failing page tests**, mirroring Task 3's:
  - header place;
  - school line;
  - resolve failure message (`resolveAlert` rejects);
  - the open empty text;
  - pagination only with more than one page;
  - changing the select to `Resolved` calls `listAlerts({ filter: 'resolved', page: 1 })`;
  - the error and `Retry`;
  - `districtId: null`.
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/renderer/app/government/deo/alerts/page.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the page and the route.
- [ ] **Step 4: Verify.** Run `pnpm vitest run apps/desktop/renderer/app/government/deo`, `pnpm --filter @nemis-desktop/app typecheck` and `pnpm lint`. Expected: all pass. The dashboard page tests are unaffected.
- [ ] **Step 5: Commit** the three files: `feat(deo): Alerts page on the desktop`.
