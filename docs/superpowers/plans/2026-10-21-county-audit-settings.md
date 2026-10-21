# County Audit Trail + Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** County Admin Audit Trail (scoped, offline + online, 12-month window) and Settings (exact web copy) on the desktop, with the web audit quirks fixed on both sides.

**Architecture:** The server gets one county-audit scope rule used by the list, the stats and a new `auditLogs` snapshot collection. The desktop imports those rows into a pull-only `audit_logs` table (pruned to 365 days) and reads them through the full hexagonal path (port + use case → ViewModel → SQLite read model → IPC/preload/bridge/countyIpc). Settings reads the synced county row (plus new columns) the same way.

**Tech Stack:** NestJS + Prisma (Nemis `apps/Server`), Next.js + RTK Query (`apps/portal-web`), Electron + better-sqlite3 + Zustand vanilla ViewModels + React (desktop).

**Spec:** `docs/superpowers/specs/2026-10-21-county-audit-settings-design.md`

## Global Constraints

- Scope (§3.1): self + users with an **active** DEO link where `countyId = C` or `district.countyId = C` + users with an **active** INSTITUTION_ADMIN link whose `institution.countyId = C`. Pool DEOs and teachers excluded. SUPER_ADMIN / MINISTRY_ADMIN stay unscoped.
- Window: 365 days. Total Actions = last 12 months on **both** sides, sub-label "Last 12 months".
- Live Updates switch removed on both sides; 4th card = "This Month" (web) / "Last Synced" (desktop, "Never" before the first sync).
- `scoop` → `scope` everywhere; header "Scope".
- Scope label priority: INSTITUTION_ADMIN → "School", DEO → "District", COUNTY_ADMIN → "County", else "System" (active links only).
- Page size 50, newest first, "Load more".
- Snapshot does NOT ship `changes`, `metadata`, `userEmail`.
- Settings is an exact copy of `portal-web/src/app/government/county/settings/page.tsx`; no controls work; no web change for Settings.
- Repo rules: Nemis server dir is `apps/Server` (capital S); files are CRLF (use Edit or `\r\n`-normalising node scripts in the scratchpad); after editing `packages/types` run `pnpm --filter @nemis/types build`; restore `apps/portal-web/tsconfig.tsbuildinfo` after tsc; server jest and desktop vitest run serially; desktop SQLite tests need the temporary Node-ABI `better_sqlite3.node` in `node_modules/better-sqlite3/build/Debug/` (delete at the end).
- Copy kept from the web: "Audit Trail", "Real-time monitoring of all system activities within your county", "Search by user, action, or entity...", "All Actions", "All Entities", "Activity Timeline", "No audit logs found", "Error loading audit logs. Please try again later.".

## Review Focus

1. **Search text with `%`, `_` or quotes** — must match literally on the desktop (escape LIKE with `ESCAPE '\'`), never error. Test in Task 8.
2. **Filter or search changed while Load more is in flight** — the late page must not be appended to the new list. Test in Task 10.
3. **Full import with rows near the 365-day edge** — prune runs *after* `verifyDatabase`, so the manifest count check never fails. Test in Task 5.
4. **Device not resynced yet (no county row, no audit rows)** — Settings shows "N/A"/0 and Audit shows "No audit logs found", no crash. Tests in Tasks 11 and 12.
5. **A user holding both an in-county DEO link and an out-of-county link** — their rows appear once, labelled "District". Test in Task 1.

---

### Task 1: Server — county audit scope + `GET /audit/ceo` confined and searchable

**Files:**
- Create: `Nemis/apps/Server/src/audit/county-audit-scope.ts`
- Modify: `Nemis/apps/Server/src/audit/audit.service.ts` (`findForCEO`), `audit.controller.ts` (`getCeoAuditLogs`), `audit/utils/action-mapper.ts` (extend `ENTITY_MAPPINGS`), `audit/dto/ceo-audit.dto.ts`, `Nemis/packages/types/src/ceo-audit.ts`
- Test: `Nemis/apps/Server/src/audit/audit.service.ceo.spec.ts`

**Interfaces:**
- Produces:
  - `countyAdminCountyId(user: UserContext): string | null` — the COUNTY_ADMIN link's countyId when the caller is County-Admin-only (no SUPER/MINISTRY link), else null.
  - `countyAuditActorWhere(countyId: string, selfId: string): Prisma.UserWhereInput` — §3.1.
  - `auditScopeLabel(orgs: {role; isActive}[]): 'School'|'District'|'County'|'System'`.
  - `entityLabel(entityType: string): string` (mapping, fallback humanise: split camel/underscore/dash, capitalise words) and `matchingEntityTypes(search, known: string[]): string[]`, `matchingActions(search): AuditAction[]` (label contains, case-insensitive).
  - `findForCEO(caller: UserContext, filters: {limit; offset; action?; entityType?; search?})`.
  - `CeoAuditDto.scope` (replaces `scoop`) in both the DTO class and `@nemis/types`.

- [ ] **Step 1: Write the failing spec** `audit.service.ceo.spec.ts` with a mocked `PrismaService` capturing `auditLog.findMany/count` args:
  - `it('confines a county-admin-only caller to the county actor scope')` — `where.user` equals `countyAuditActorWhere('c-1','ceo-1')`.
  - `it('leaves super/ministry admins unscoped')` — no `user` key in `where`.
  - `it('search matches actor name/email, action label and entity label')` — search `"creat"` → `where.OR` contains `{ action: { in: ['CREATE'] } }`; search `"jam"` → contains `user.firstName contains 'jam' insensitive`.
  - `it('entityType filter is an exact match')`.
  - `it('labels scope by priority, active links only')` — orgs `[{role:TEACHER},{role:DEO,isActive:true}]` → `"District"`; `[{role:INSTITUTION_ADMIN,isActive:false},{role:DEO,isActive:true}]` → `"District"`.
  - `it('countyAuditActorWhere: DEO by county, DEO by district, school admin by institution county, active only')` — snapshot of the returned object's three OR arms + `{ id: selfId }`, each with `isActive: true`.
  - `it('never logs rows')` — `jest.spyOn(console,'log')` not called.
- [ ] **Step 2: Run** `cd Nemis/apps/Server && npx jest src/audit/audit.service.ceo.spec.ts` — FAIL (module not found / signature).
- [ ] **Step 3: Implement** the helpers and `findForCEO(caller, filters)`; include `user.organizations` with `isActive` for the label; remove every `console.log` in `findForCEO`; controller adds `@CurrentUser() user: UserContext` and `@Query('search') search?: string`. A County-Admin-only caller with no countyId gets `ForbiddenException`.
- [ ] **Step 4: Run** the spec — PASS. Run `npx tsc --noEmit` — 0 errors; `pnpm --filter @nemis/types build`.
- [ ] **Step 5: Commit** `fix(audit): County Admins see only their county's audit trail, searchable server-side`.

### Task 2: Server — scoped stats with 12-month total, month count and filter options

**Files:**
- Modify: `audit.service.ts` (`getAuditStats`), `audit.controller.ts` (`getCountyStats`)
- Test: `Nemis/apps/Server/src/audit/audit.service.stats.spec.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `getCountyAuditStats(caller: UserContext, countyId: string): Promise<{ totalLogs; todayLogs; weekLogs; monthLogs; actionStats: Record<string, number>; entityTypes: {value: string; label: string}[] }>`. `totalLogs` = `timestamp ≥ now − 365 days`. `monthLogs` = since the 1st of the current month 00:00. `actionStats` and `entityTypes` (distinct, sorted by label) use the same scope, over the 365-day window.
- `getAuditStats(undefined, districtId)` (DEO route) is left as it is.

- [ ] **Step 1: Write failing spec:**
  - `it('refuses a county admin asking for another county')` → `ForbiddenException`.
  - `it('scopes every count and the action breakdown')` — every `count`/`groupBy` `where.user` equals `countyAuditActorWhere`.
  - `it('total counts the last 365 days; month counts from the 1st')` — with `jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00'))`: total `gte` = `2025-10-21T12:00:00` (local), month `gte` = `2026-10-01T00:00:00` (local).
  - `it('entityTypes are distinct and labelled')` — groupBy rows `[{entityType:'Staff'},{entityType:'feeRule'}]` → `[{value:'feeRule',label:'Fee Rule'},{value:'Staff',label:'Staff'}]`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; controller passes `@CurrentUser()`.
- [ ] **Step 4: Run** spec + `npx tsc --noEmit` — PASS / 0.
- [ ] **Step 5: Commit** `fix(audit): county audit stats scoped like the list, 12-month total`.

### Task 3: Server — `auditLogs` in the County desktop snapshot

**Files:**
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts`, `Nemis/packages/types/src/desktop-provisioning.ts`, existing county snapshot spec tx mock (add `auditLog: { findMany: async () => [] }`)
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.audit-logs.spec.ts`

**Interfaces:**
- Produces: snapshot `data.auditLogs: { id; userId; action; entityType; entityId: string|null; timestamp: string; actorName: string; actorScope: string }[]` and `manifest.auditLogs`. COUNTY scope only (other scopes `[]`). Where = `user: countyAuditActorWhere(countyId, userId)` AND `timestamp ≥ now − 365d` AND (delta) `timestamp > since − 5 min`. Counties rows now also carry `isActive, createdAt, updatedAt` (already on the Prisma row — check they are not stripped).

- [ ] **Step 1: Failing spec** (Proxy tx like `desktop-provisioning.direct-messages.spec.ts`): `it('ships scoped audit rows of the last 365 days with actor name and scope')`, `it('delta uses timestamp > since minus 5 minutes')`, `it('non-county scopes ship none')`, `it('omits changes, metadata and userEmail')`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `auditLogsFor(tx, countyId, userId, since)` next to `directMessagesFor`; output key `auditLogs`.
- [ ] **Step 4: Run** the new spec + the existing county snapshot spec + `npx tsc --noEmit` — PASS; `pnpm --filter @nemis/types build`.
- [ ] **Step 5: Commit** `feat(desktop-provisioning): County snapshot ships the county audit trail (12 months)`.

### Task 4: portal-web — AuditSection fixes

**Files:**
- Modify: `Nemis/apps/portal-web/src/components/county/AuditSection.tsx`, `src/store/county/Api/auditApi.ts` (`AuditStats` gains `monthLogs`, `entityTypes`; `getCeoAuditLogs` passes `search`)
- Create: `src/components/county/audit-state.ts` (`mergeAuditPage(prev, next, offset)`, `hasMoreAudit(shown, total)`)
- Test: `src/components/county/AuditSection.test.tsx`, `audit-state.test.ts`

**Interfaces:** consumes Task 1–2 API shapes.

- [ ] **Step 1: Failing tests** (mock the two RTK hooks like other portal-web tests):
  - `it('search is sent to the server, debounced')` — type "jam", advance 300 ms → hook called with `filters.search === 'jam'`, offset 0.
  - `it('dropdowns come from stats')` — options = "All Actions" + labels of `actionStats` keys; "All Entities" + `entityTypes` labels.
  - `it('Load more requests the next 50 and appends')`.
  - `it('shows Total "Last 12 months", Today, This Week, This Month; no Live Updates')`.
  - `it('Scope column header')`.
  - `audit-state.test.ts`: `mergeAuditPage` replaces at offset 0, appends otherwise; `hasMoreAudit(50, 51) === true`, `(51, 51) === false`.
- [ ] **Step 2: Run** `cd Nemis/apps/portal-web && npx vitest run src/components/county` — FAIL.
- [ ] **Step 3: Implement**; delete the client-side `filteredLogs` filtering and the `realTimeUpdates` state.
- [ ] **Step 4: Run** tests + `npx tsc --noEmit` — PASS; restore `tsconfig.tsbuildinfo`.
- [ ] **Step 5: Commit** `fix(portal-web): county audit search, filters and paging over the whole log`.

### Task 5: Desktop — migration 039, importer, 365-day prune

**Files:**
- Create: `apps/desktop/electron/database/migrations/039-create-audit-logs.ts` (+ `.test.ts`), register in `registry.ts`
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts` (spec `auditLogs`, counties spec gains `isActive, createdAt, updatedAt`, prune), `PROVISIONING_COLLECTIONS` (add `'auditLogs'`), `tableNames.ts`
- Test: importer test file next to the existing direct-messages importer test

**Interfaces:**
- Produces: table `audit_logs(id TEXT PRIMARY KEY, userId TEXT NOT NULL, action TEXT NOT NULL, entityType TEXT NOT NULL, entityId TEXT, timestamp TEXT NOT NULL, actorName TEXT NOT NULL, actorScope TEXT NOT NULL)`, `idx_audit_logs_timestamp`; counties `isActive INTEGER NOT NULL DEFAULT 1, createdAt TEXT, updatedAt TEXT`; migration sets `lastFullResyncAt = NULL`. No outbox triggers. `pruneAuditLogs(db, now: Date): void` deletes `timestamp < now − 365 days`, called after `verifyDatabase` in both full and merge paths.

- [ ] **Step 1: Failing tests:** migration creates both; no trigger on `audit_logs`; importer full import stores audit rows + county columns; `it('prunes audit rows older than 365 days after verification')` — full import with one row at now−364d and manifest 1 succeeds, then a merge with an old local row present removes only the old one.
- [ ] **Step 2: Run** `pnpm vitest run --project node apps/desktop/electron/database/migrations/039 apps/desktop/electron/provisioning` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(desktop): audit_logs table + county dates, synced and kept to 12 months`.

### Task 6: Desktop — types, channels, CountyApi

**Files:**
- Create: `packages/types/src/county-audit.ts`
- Modify: `packages/types/src/ipc.ts` (channels + `IpcContract`), `packages/types/src/api.ts` (`CountyApi`), types index

**Interfaces — Produces:**
```ts
export interface CountyAuditLog { id: string; action: string; actionLabel: string; entityType: string; entityLabel: string; actorName: string; scope: string; timestamp: string }
export interface CountyAuditOption { value: string; label: string }
export interface CountyAuditStats { total: number; today: number; week: number; actions: CountyAuditOption[]; entityTypes: CountyAuditOption[] }
export interface CountyAuditQuery { search?: string; action?: string; entityType?: string; page: number; limit: number }
export interface CountyAuditPage { items: CountyAuditLog[]; total: number; page: number; limit: number }
export interface CountySettings { county: { id: string; name: string; code: string | null; isActive: boolean; createdAt: string | null; updatedAt: string | null } | null; districtCount: number; schoolCount: number }
```
Channels: `COUNTY_AUDIT_STATS: 'county:audit-stats'`, `COUNTY_AUDIT_LIST: 'county:audit-list'`, `COUNTY_SETTINGS: 'county:settings'`. CountyApi: `getAuditStats(): Promise<CountyAuditStats>`, `listAuditLogs(query: CountyAuditQuery): Promise<CountyAuditPage>`, `getCountySettings(): Promise<CountySettings>`.

- [ ] **Step 1:** add the types; **Step 2:** `pnpm typecheck` — errors only where the facade/preload do not yet implement them (expected; fixed in Task 9). Fold into Task 7's commit if typecheck must stay green per commit.

### Task 7: Application — ports, use cases, fakes

**Files:**
- Create: `packages/application/src/interfaces/county/county-audit-read-model.ts`, `packages/application/src/use-cases/county/get-county-audit.ts` (+ `county-audit.test.ts`), `packages/application/src/testing/county/in-memory-county-audit.ts`
- Modify: county service, factory (ports `countyAudit`, `countySettings`), indexes, both test apps

**Interfaces — Produces:**
- `ICountyAuditReadModel { getStats(): Promise<CountyAuditStats>; list(query: CountyAuditQuery): Promise<CountyAuditPage> }`
- `ICountySettingsReadModel { get(): Promise<CountySettings> }`
- `GetCountyAuditStatsUseCase`, `GetCountyAuditLogsUseCase` (clamps `limit` to 1..100, `page ≥ 1`, trims `search`, empty → undefined), `GetCountySettingsUseCase`.
- `CountyApplicationService.getAuditStats / listAuditLogs / getCountySettings`.

- [ ] **Step 1: Failing tests:** use cases delegate; `listAuditLogs({page:0,limit:500,search:'  '})` reaches the port as `{page:1,limit:100,search:undefined}`.
- [ ] **Step 2–4:** run `pnpm vitest run packages/application/src/use-cases/county/county-audit.test.ts` FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(application): county audit + settings use cases`.

### Task 8: SQLite read models

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyAuditReadModel.ts` (+ test), `SqliteCountySettingsReadModel.ts` (+ test), `audit-labels.ts` (desktop copy of `ACTION_MAPPINGS` descriptions + extended `ENTITY_MAPPINGS` + the same humanise fallback as Task 1)
- Modify: `createDataLayer.ts`, `createApplicationComposition.ts`

**Interfaces:**
- `new SqliteCountyAuditReadModel(context, now: () => Date)`.
- Stats over the 365-day window: `total`; `today` = since local midnight; `week` = since local midnight 7 days ago; `actions` / `entityTypes` = distinct present values, labelled, sorted by label.
- `list`: `ORDER BY timestamp DESC, id DESC`, `LIMIT/OFFSET` from page; filters exact; search = `actorName LIKE ? ESCAPE '\'` OR `action IN (labels matching)` OR `entityType IN (labels matching)`; `total` of the filtered set.
- Settings: first `counties` row (or null), `COUNT(*)` of districts / institutions in that county (all, matching the web's `_count.institutions` and districts list), `isActive` as boolean.

- [ ] **Step 1: Failing tests:** windows with a fixed `now`; search "creat" finds CREATE rows; search `"50%_"` returns 0 rows without error (Review Focus 1); paging 120 rows → page 3 has 20; rows older than 365 days excluded from stats; settings with no county row → `{county:null, districtCount:0, schoolCount:0}`.
- [ ] **Step 2–4:** `pnpm vitest run --project node apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyAudit apps/desktop/electron/data/repositories/sqlite/business/SqliteCountySettings` FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(desktop): county audit + settings SQLite read models`.

### Task 9: IPC, validators, preload, bridge, facade

**Files:**
- Create: `apps/desktop/electron/ipc/handlers/county/audit.ts` (`registerCountyAuditHandlers(handle, app)`, three read channels), `apps/desktop/preload/county/audit-api.ts`, `apps/desktop/renderer/services/nemis-bridge/county/audit-bridge.ts`
- Modify: `security/validateIpc.ts` (`assertCountyAuditQueryArgs`: page int ≥1, limit int 1..100, optional strings ≤ 200 chars), `authorizeChannel` (COUNTY_ADMIN-only for the three), registrar, preload county index, bridge index, `renderer/lib/ipc/county.ts`
- Test: handler test + validator cases

- [ ] **Step 1: Failing tests:** handlers call the app; validator rejects `{page:0}`, `{limit:101}`, `{search: 'x'.repeat(201)}`; authorize refuses a SCHOOL_ADMIN workspace.
- [ ] **Step 2–4:** FAIL → implement → PASS; `pnpm typecheck` 0.
- [ ] **Step 5: Commit** `feat(desktop): county audit + settings IPC`.

### Task 10: Presentation ViewModels

**Files:**
- Create: `packages/presentation/src/view-models/county/county-audit-view-model.ts` (+ test), `county-settings-view-model.ts` (+ test)
- Modify: registration (`countyAudit`, `countySettings`), `apps/desktop/renderer/lib/presentation/hooks/county.ts` (`useCountyAuditViewModel`, `useCountySettingsViewModel`)

**Interfaces:**
- `CountyAuditViewModel` state: `stats: AsyncState<CountyAuditStats>`, `status: 'idle'|'loading'|'ready'|'error'`, `filters: {search; action; entityType}`, `items`, `total`, `page`, `hasMore`, `loadingMore`. Methods: `load(filters)` (page 1, also reloads stats), `loadMore()`. A request id guards both: a response from an older `load` is dropped (Review Focus 2).
- `CountySettingsViewModel` state `settings: AsyncState<CountySettings>`; `load()`.

- [ ] **Step 1: Failing tests:** load → ready with items; loadMore appends page 2; `it('drops a load-more response that arrives after the filters changed')` (deferred promise); hasMore false when `items.length >= total`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(presentation): county audit + settings view models`.

### Task 11: Desktop Audit Trail page

**Files:**
- Create: `apps/desktop/renderer/components/county/audit/CountyAuditPage.tsx` (+ `.test.tsx`)
- Modify: `apps/desktop/renderer/app/government/county/audit/page.tsx` (replace ComingSoon)

Port of `AuditSection` + page wrapper (`bg-slate-100` band, `px-6 py-6`), with the Global Constraints copy; search debounced 300 ms; Last Synced card from `useConnectivityStore()` `lastSyncAt` (relative time "Just now/5m ago/2h ago/3d ago", "Never"); `useRevalidateOnSync` reload.

- [ ] **Step 1: Failing tests:** cards (Total with "Last 12 months", Today, This Week, Last Synced "Never"); rows render "Created Student", actor, Scope pill; typing search calls `listAuditLogs` with `search` after 300 ms; dropdown options from stats; Load more calls page 2 and appends; empty → "No audit logs found" (Review Focus 4); error copy.
- [ ] **Step 2–4:** `pnpm vitest run --project renderer apps/desktop/renderer/components/county/audit` FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(county): Audit Trail page, offline`.

### Task 12: Desktop Settings page

**Files:**
- Create: `apps/desktop/renderer/components/county/settings/CountySettingsPage.tsx` (+ `.test.tsx`)
- Modify: `apps/desktop/renderer/app/government/county/settings/page.tsx`

Exact port; "Back to Dashboard" links to `/government/county`; County field disabled with the name; dates `toLocaleDateString()`; missing values "N/A"; loading copy "Loading county data...".

- [ ] **Step 1: Failing tests:** County Information shows name, code, district count, school count, "Active" with `text-success`, created/updated dates; no county → "N/A" and 0 (Review Focus 4); Save Changes / Change Password do not call any bridge method.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(county): Settings page (web copy)`.

### Task 13: Verify and finish

- [ ] Desktop: `pnpm typecheck`, `pnpm lint`, `pnpm vitest run` (only the 2 known failures: `renderer/app/page.test.tsx`, `teacher/timetable/timetable.test.tsx`), `pnpm --filter @nemis-desktop/app build:renderer`.
- [ ] Delete `node_modules/better-sqlite3/build/Debug`.
- [ ] Server: `cd Nemis/apps/Server && npx tsc --noEmit && npx jest` — all pass.
- [ ] portal-web: `npx tsc --noEmit && npx vitest run`; restore `tsconfig.tsbuildinfo`.
- [ ] Update memory `county-portal-migration.md` (pages 11–12, server-first).
- [ ] Finishing-branch menu.
