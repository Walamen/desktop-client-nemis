# County dashboard — design

Date: 2026-10-16
Repos: desktop-client-nemis (main work), Nemis (server snapshot change)
Entry point: `apps/desktop/renderer/app/government/county/page.tsx` (today a
`ScopedPortalDashboard` placeholder)
Source of truth for design/behaviour: `Nemis/apps/portal-web/src/app/government/county/page.tsx`

## Goal

First page of the County Admin portal migration (one page at a time). Replace the
desktop County dashboard placeholder with portal-web's County dashboard — **same
design, same behaviour** — computed **offline** from the County device's synced
SQLite data.

Success: a County Admin opening the desktop dashboard sees the same greeting band,
4 stat cards, District Scorecard, Enrollment-by-School-Type donut, 3 analytics
charts and Quick Actions as on the web, with the same numbers the web would show
for the same data, with no network connection.

## Decisions (agreed in brainstorming)

| # | Decision |
|---|---|
| 1 | Numbers are **computed locally** from synced SQLite, porting the server's formulas — not fetched from the server's 5 endpoints. |
| 2 | **Close every data gap properly**: store `students.createdAt`, `institutions.isActive`, `districts.isActive`; add a `counties` table fed by a **server snapshot change**. Server ships first. |
| 3 | Quick Actions keep all 4 buttons and portal-web's targets. `county/schools/create` and `county/reports/generate` are added as `ComingSoon` placeholders. "Refresh Data" re-reads the local DB (no sync). |
| 4 | **Full hexagonal path** like the School Admin dashboard: application read-model port + use case + service, presentation ViewModel, SQLite adapter, IPC channel, preload, bridge, IPC facade group. |
| 5 | (Found during design) County-scope districts = **every district of the county, active or not, with `isActive`**. The desktop counts/lists only `isActive = 1` ones (matching the web's `GET /districts?countyId=`), while a school in an inactive district still contributes its students under that district's name (matching chart-data). |
| 6 | (Found during planning) The server builds institution and student snapshot rows **field by field**, so `institutions.isActive` and `students.createdAt` must be added to those mappings — they are not "already sent". |
| 7 | (Found during planning) The importer binds a missing key as NULL, which would violate the new `isActive NOT NULL` columns if a desktop ever met an older server. Institutions and districts get an importer column default (`isActive` → 1), following the existing `initiatedBy` precedent. |

## Background: what the web page computes

portal-web calls 5 endpoints. Their logic (in `Nemis/apps/Server/src/counties/counties.service.ts`
and `districts/districts.service.ts`) is what the desktop use case ports:

| Web source | Used for | Rule |
|---|---|---|
| `GET /counties/:id` | header county name | county row |
| `GET /districts?countyId` | "Districts" card, "Across N districts", scorecard school counts | active districts of the county; `_count.institutions` = **active** institutions |
| `GET /counties/:id/stats` | Schools / Students / Teachers cards, scorecard totals | active institutions; active students in active institutions; active staff in active institutions |
| `GET /counties/:id/chart-data` | 3 charts + scorecard + donut gender | see below |
| `GET /counties/:id/students/stats` | donut `byLevel` | active students in active institutions, `gradeLevel` → level via `GRADE_TO_LEVEL` |

`chart-data` rules (all over active students in active institutions):

- `enrollmentByDistrict`: student count per district **name**; students whose
  institution has no district are skipped. Order: first-seen (not sorted).
- `genderDistribution`: counts of `MALE` and `FEMALE` (other values ignored).
- `enrollmentTrend`: 12 months ending with the current month. Window start =
  1st of (now − 11 months), 00:00. For each month, `period` = `"Mon YYYY"`.
  `enrollment` = (students created **before** the window) + cumulative students
  created up to the end of that month. `male`/`female` are cumulative **only
  within the window** (they do not include the pre-window base) — port as-is.
- `attendanceCompliance` (actually enrollment coverage): per district name,
  `round(100 × activeSchoolsWithAtLeastOneStudent / activeSchools)`.
  **Note:** the server's `_count.students` here counts **all** students of the
  school (no `isActive` filter). Port as-is.
- `dropoutTrend`: always `[]`.

`byLevel` mapping (`GRADE_TO_LEVEL`): `KG, K1, K2` → `PRE_PRIMARY`;
`GRADE_1`–`GRADE_9` → `PRIMARY`; `GRADE_10`–`GRADE_12` → `SECONDARY`; null or
unmapped grade levels are excluded.

## 1. Data and sync

### Nemis server — `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts`

- New snapshot collection **`counties`**: for `scopeType === 'COUNTY'`, the one
  county row `{ id, code, name, isActive }`; every other scope → `[]`. Always sent
  in full, never `since`-filtered (one tiny row; mirrors how `districts` is never
  delta-filtered). Included in `manifest`/checksum like every other collection.
- **County-scope districts**: `where: { countyId: scope.countyId }` (active and
  inactive). Every other scope keeps `where: { institutions: { some: { id: institutionWhere } } }`.
  The district row mapping adds `isActive: row.isActive`.
- The institution row mapping adds `isActive: row.isActive`; the student row
  mapping adds `createdAt: row.createdAt.toISOString()` (departed-cohort
  students, whose query selects a minimal projection, send `createdAt: null`).
- `Nemis/packages/types/src/desktop-provisioning.ts`: `counties: Record<string, unknown>[]`
  on `DesktopProvisioningData`.

### Desktop

- `packages/types/src/provisioning.ts`: append `'counties'` to `PROVISIONING_COLLECTIONS`.
- **Migration 031** `add-county-dashboard-columns`:
  ```sql
  CREATE TABLE counties (id TEXT PRIMARY KEY, code TEXT, name TEXT NOT NULL);
  ALTER TABLE students ADD COLUMN createdAt TEXT;
  ALTER TABLE institutions ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE districts ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;
  ```
  Read-only `counties` table: no outbox triggers (like `districts`, migration 021).
- `ProvisioningImporter` `SPECS`: add `counties: spec('counties', ['id','code','name'])`;
  add `'createdAt'` to `students`, `'isActive'` to `institutions` and `districts`.
  `TableSpec` gains optional `defaults`; `institutions` and `districts` declare
  `{ isActive: 1 }`, applied when the incoming row has no value for the column.
- **Outbox triggers are NOT regenerated.** `installOutboxTriggers` snapshots
  columns at install time, so the students triggers keep excluding `createdAt`
  (server-owned; must not be pushed). Any future migration that regenerates all
  triggers (as 026 did) must exclude `students.createdAt` — leave a comment in
  migration 031 saying so.
- **Backfill**: existing County devices get the new values on the next full
  resync (24h or sign-in). Until then `createdAt` is NULL → treated as
  "created before the trend window" (same bucket the server uses for old
  students); `isActive` defaults to 1.
- **Old server compatibility**: importer already reads `data[c] ?? []` and
  `manifest[c] ?? 0`, so a snapshot without `counties` imports cleanly →
  `county: null` → header omits the name.
- **Release order**: server first, then desktop.

## 2. Application and presentation layers

### `@nemis-desktop/application`

- **Port** `interfaces/county/county-analytics-read-model.ts` —
  `ICountyAnalyticsReadModel`, raw aggregates only (no business math). "Active
  student" = `students.isActive = 1` in an institution with `isActive = 1`;
  "active teacher" = `staff.isActive = 1` in an active institution.
  ```ts
  getCounty(): { id: string; name: string } | null;
  listActiveDistricts(): { id: string; name: string; activeSchoolCount: number }[]; // isActive = 1, ORDER BY name
  countActiveSchools(): number;
  countActiveStudents(): number;
  countActiveTeachers(): number;
  countActiveStudentsByGender(): { gender: string; count: number }[];
  countActiveStudentsByGradeLevel(): { gradeLevel: string; count: number }[]; // non-null only
  countActiveStudentsByDistrict(): { districtName: string; count: number }[]; // GROUP BY name, ORDER BY name
  listActiveStudentCreations(sinceIso: string): { createdAt: string; gender: string }[]; // createdAt >= since
  listActiveSchoolsForCoverage(): { districtName: string | null; totalStudentCount: number }[]; // ALL students, per server
  ```
  The trend's pre-window base is `countActiveStudents() − listActiveStudentCreations(windowStart).length`,
  exactly the server's `students.length − studentsWithDates.length` (NULL
  `createdAt` lands in the base). `enrollmentByDistrict` is ordered by district
  name (the server's order is unspecified Postgres row order).
- **Use case** `use-cases/county/get-county-dashboard.ts` —
  `GetCountyDashboardUseCase` (`QueryHandler<Record<string, never>, ApplicationResponse<CountyDashboardOutput>>`),
  deps `{ readModel, clock, logger }`, body wrapped in `invokeUseCase('GetCountyDashboard', …)`.
  Implements the trend, coverage, `GRADE_TO_LEVEL` and dropout rules from
  Background exactly, using `clock.now()` for "now". Month bucketing uses the
  same local-time `Date` arithmetic as the server.
- **DTO** `dto/county/county-dashboard-dto.ts`: `export type CountyDashboardOutput = CountyDashboardResult`
  (the wire type, defined once in `@nemis-desktop/types` `county-dashboard.ts`):
  ```ts
  interface CountyDashboardResult {
    county: { id: string; name: string } | null;
    districts: { id: string; name: string; activeSchoolCount: number }[];
    stats: { totalSchools: number; totalStudents: number; totalTeachers: number };
    chartData: {
      enrollmentByDistrict: { districtName: string; studentCount: number }[];
      enrollmentTrend: { period: string; enrollment: number; male: number; female: number }[];
      genderDistribution: { male: number; female: number };
      attendanceCompliance: { districtName: string; complianceRate: number }[];
      dropoutTrend: { period: string; dropouts: number }[];
    };
    byLevel: Record<string, number>;
  }
  ```
- **Service** `services/county-application-service.ts` — `CountyApplicationService.getDashboard()`;
  new `county` key on `ApplicationLayer`; wired in `factories/create-application-layer.ts`
  with a new `countyAnalytics` port.

### `@nemis-desktop/presentation`

- `queries/county/get-county-dashboard-ui-query.ts` → `CountyApplicationService.getDashboard()`.
- `view-models/county/county-dashboard-view-model.ts` — `CountyDashboardViewModel`,
  state `{ summary: AsyncState<CountyDashboardView> }`, `loadDashboard()` via
  `trackQuery` (no `isEmpty`: an all-zero county still renders the page).
- `mappers/county/county-dashboard-view-mapper.ts` — maps the DTO to
  `CountyDashboardView`, whose `districts` items carry
  `_count: { institutions: activeSchoolCount }` so the ported scorecard reads
  them unchanged.
- Registered as `viewModels.countyDashboard` in `createPresentationLayer`.

### Main process (`apps/desktop/electron`)

- `data/repositories/sqlite/business/SqliteCountyAnalyticsReadModel.ts` —
  `StatementCache` + `guarded()` per method, plain SQL; wired into the
  application ports where the other business adapters are.
- `packages/types/src/ipc.ts`: `COUNTY_GET_DASHBOARD: 'county:get-dashboard'`
  (matching `DASHBOARD_GET_OVERVIEW: 'dashboard:get-overview'`); result type
  `CountyDashboardResult`; `api.ts` gains `CountyApi { getDashboard() }` and
  `NemisApi.county`.
- `ipc/handlers/county/dashboard.ts` — `handle(COUNTY_GET_DASHBOARD, assertNoArgs, …)`
  returning `res.data`; registered from `ipc/handlers/county/index.ts`.
- `ipc/authorizeChannel.ts`: new `COUNTY_ADMIN_CHANNELS` set containing
  `COUNTY_GET_DASHBOARD`; any other role → `ForbiddenError('This view requires a county administrator workspace.')`.
- `preload/county/dashboard-api.ts`: `getDashboard: () => invoke(COUNTY_GET_DASHBOARD)`,
  exposed from `preload/county/index.ts` as `countyApi = { county: … }`.

### Renderer seam

- `services/nemis-bridge/county/dashboard-bridge.ts` → `countyBridge.getDashboard()`.
- `lib/ipc/county.ts`: `countyIpc = { county: group('county', { getDashboard: () => query(() => countyBridge.getDashboard()) }) }`,
  merged into `createIpcApplicationLayer` in `lib/ipc/index.ts`.
- `lib/presentation/hooks/county.ts`: `useCountyDashboardViewModel`.
- Update the stale "no live endpoints yet" comments in the county bridge, ipc,
  preload and handler index files.

## 3. UI port

### Ported verbatim (import paths only change)

- `renderer/lib/utils.ts` — `cn` identical to portal-web's.
- `renderer/components/ui/chart.tsx` — portal-web's shadcn chart wrapper.
- `renderer/components/county/charts/` — `DistrictScorecardCard`,
  `EnrollmentBySchoolTypeCard`, `EnrollmentByDistrictChart`,
  `EnrollmentTrendChart`, `DropoutTrendChart`. The other 10 County chart
  components come over with the pages that use them.
- `@nemis/types` imports in these files → equivalent types exported from
  `@nemis-desktop/types` (`county-dashboard.ts`): `EnrollmentByDistrictData`,
  `CountyEnrollmentTrendData`, `GenderDistributionData`,
  `AttendanceComplianceData`, `DropoutTrendData`, `InstitutionLevel` (already in
  desktop `enums.ts`), and minimal `CountyDistrict` / `CountyDashboardStats`
  shapes covering only the fields the components read, imported under
  portal-web's names (`type CountyDistrict as District`, …) so component bodies
  stay verbatim.
- `apps/desktop/package.json`: add `clsx` and `tailwind-merge` as direct deps at
  portal-web's versions.

### `app/government/county/page.tsx`

Line-for-line copy of portal-web's `CountyDashboard`, including `font-['Sora']`
(kept verbatim so it renders like the web), `@nemis/ui` → `@nemis-desktop/ui`.
Deliberate differences only:

1. **Data**: `useCountyDashboardViewModel()` + `useViewModel(vm.store, s => s.summary)`
   instead of the 5 RTK queries. `idle`/`loading` → the full-page `Spinner size="lg"`;
   `error` → the page renders with the `Alert variant="error"` "Failed to load
   county data" + Retry and zeroed cards / "No … data available" placeholders;
   `success` **and `refreshing`** → full page (a reload keeps the data on screen,
   like RTK's `isFetching`, instead of flashing the spinner). The web's inner
   per-card spinner branches are dropped: they are unreachable there too,
   because its page-level `loading` already covers every query.
2. **User**: `useCurrentUserViewModel()` instead of Redux `auth.user`; Avatar
   gets first/last name (initials — desktop has no photo).
3. **Hard-coded fallbacks removed**: no "John Doe" (name blank until loaded),
   no "Grand Bassa" (` — <county>` omitted when `county` is null).
4. **Refresh**: "Refresh Data" → `vm.loadDashboard()`; page also loads via
   `useRevalidateOnSync(() => void vm.loadDashboard(), [vm])`.

### New placeholder routes

- `app/government/county/schools/create/page.tsx` → `<ComingSoon title="Add New School" />`
- `app/government/county/reports/generate/page.tsx` → `<ComingSoon title="Generate Report" />`

## 4. Error handling

- Adapter failures → `guarded()` infra errors → `toIpcError` (mind the
  cause-unwrap behaviour).
- The use case runs inside `invokeUseCase`, which logs and normalizes a failure
  into an `ApplicationException` and rethrows it; the IPC layer maps it, and the
  renderer ViewModel's `trackQuery` turns the rejected call into `error` with a
  `userMessage`.
- Non-County roles calling `COUNTY_DASHBOARD_GET` → `ForbiddenError`.
- Empty county (no districts/schools/students) renders zeros and the web's
  "No data available" placeholders — no special empty state.

## 5. Testing (TDD, red first, co-located tests)

**Nemis server (Jest)** — County snapshot contains the county row; County
districts are queried by `countyId` and carry `isActive`; institution rows carry
`isActive`; student rows carry `createdAt`; Institution scope keeps the old
district query and gets `counties: []`.

**Desktop:**
- Migration 031: table + columns + defaults; existing rows survive; a students
  insert/update outbox payload does **not** contain `createdAt`.
- Importer: `counties` imported; new columns stored; snapshot missing `counties` accepted.
- Use case (fake read model, fixed clock): trend matches a hand-computed fixture
  across month boundaries incl. NULL `createdAt` and the within-window-only
  male/female rule; coverage rounding; `GRADE_TO_LEVEL`; dropout `[]`; county null passthrough.
- SQLite adapter (real in-memory DB, Electron-as-Node runner): inactive schools
  and their students/teachers excluded; inactive students/staff excluded;
  gender/district/grade grouping; districts ordered by name with active school counts;
  coverage counts all students.
- ViewModel: idle → loading → success / error; mapper `_count.institutions`.
- IPC: handler returns `res.data`; rejects args; `authorizeChannel` allows
  `COUNTY_ADMIN`, rejects the other 4 roles.
- Renderer page: greeting band name + county; county omitted when null; 4 stat
  values + hrefs; error → Retry reloads; Refresh Data reloads; the 2 new routes render ComingSoon.

**Gate:** desktop `pnpm lint`, typecheck, full test suite (rebuild better-sqlite3
for the right ABI first); Nemis server tests + typecheck. Manual GUI pass by Alvin
signed in as a County Admin.

**Delivery:** branch `feat/county-dashboard` in each repo, merged to local
`main`, not pushed. Server merged before desktop.

## Out of scope

- The other County pages (schools, students, teachers, districts, reports, users, …).
- The 10 County chart components not used by this page.
- Fixing portal-web's own quirks (empty dropout trend, compliance counting
  inactive students, unmatched `font-['Sora']`, and the trend window calling
  `setMonth` before `setDate(1)` — on the 29th–31st that can overflow into the
  next month and shift the 12-month window forward by one); ported as-is for parity.
- Real school creation / report generation.

## Open items

None.
