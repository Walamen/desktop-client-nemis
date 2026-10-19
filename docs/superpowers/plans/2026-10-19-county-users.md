# County Administrative Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port portal-web's County "User Management" page into the desktop:
- the list and stats work offline;
- Assign, Enable/Disable, Activation URL, Create User and Bulk Create run as online-only commands.

On both sides, the broken list membership and stats are fixed, and the user endpoints are locked to the County Admin's own county.

**Architecture:**
- **Server:** a single `countyUserScope(countyId)` rule decides who is "in the county". The list, the stats and the County Admin write checks all use it. Responses gain `activationUrl`, and the snapshot gains `users.emailVerified`.
- **Desktop reads:** `ICountyUsersReadModel` (SQLite) → use cases on `CountyApplicationService` → `CountyUsersViewModel` → IPC → pages.
- **Desktop commands:** they follow the Manage DEO path: `BackendProvisioningGateway` → `runOnline(…, refresh)` handlers → preload/bridge. Pages call them through `countyBridge` directly, as the Districts page does.

**Tech Stack:** TypeScript.
- Desktop: Electron + better-sqlite3 + Next.js static export; Vitest + Testing Library.
- Server: NestJS + Prisma + Jest.
- portal-web: Next.js + RTK Query + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-county-users-design.md` (in `desktop-client-nemis-users`). Read it before any task. Section numbers below (§) refer to it.

## Global Constraints

- **Worktrees:** work only in `Walamen/desktop-client-nemis-users` and `Walamen/Nemis-users`, branch `feat/county-users`. Never touch `Walamen/desktop-client-nemis` or `Walamen/Nemis`.
- **Server ships first.** A desktop on an old server must still import (`emailVerified` absent → NULL, which counts as verified).
- **Migration:** the desktop migration number is **037**. It must not call `installOutboxTriggers` or touch any trigger.
- **Listed roles are exactly `DEO` and `INSTITUTION_ADMIN`.**
  - Assignable roles are `DEO`, `INSTITUTION_ADMIN` and `DATA_OFFICER`.
  - A County Admin may create only `DEO`, `INSTITUTION_ADMIN` and `DATA_OFFICER` on the server.
  - The desktop Create and Bulk Create only send `DEO` / `INSTITUTION_ADMIN`.
- **Page size 12.** Validators: `limit` 1…50, `page` 1…1,000,000, bulk rows 1…500, ids ≤ `ID_MAX_LENGTH`, names ≤ 100, email ≤ 255, phone `^\+?[1-9]\d{1,14}$`.
- **Copy is the web's, verbatim** (files in §2), with these exceptions:
  - the Total Users sub-line is **"DEOs and School Admins"**;
  - the offline hint is **"User changes need an internet connection."**;
  - `SYNC_NOTE` is **"Saved — this will appear once this device syncs."**
- **The 403 message is exactly "You can only manage users in your county."** It is used for every County Admin refusal in §5.5, except list/stats, which reuse the existing "You do not have access to this county".
- **Activation tokens never reach SQLite or a log line** on the desktop. Only `activationUrl` crosses IPC.
- **Shared files:** keep edits to them appended at the end of existing lists:
  - types: `packages/types/src/ipc.ts`, `api.ts`, `index.ts`;
  - application: `county-application-service.ts`, `create-application-layer.ts`;
  - data: `createDataLayer.ts`, `createApplicationComposition.ts`;
  - IPC: `authorizeChannel.ts`, `registrar.ts`, `validateIpc.ts`;
  - the county preload, bridge and facade indexes.

  Do **not** edit `electron/main/main.ts`: the `county` key is already deferred.
- **Commits:** messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Desktop tests:** run with the Electron runner from the desktop worktree root:
  `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>`.
  The known pre-existing failure is `apps/desktop/renderer/app/page.test.tsx`; the `Sidebar.test.tsx` unhandled error is also known.
- **Never run the server jest suite and the desktop vitest suite at the same time** (5 s timeouts).
- **Disk:** C: had 9.6 GB free on 2026-10-19. Check `df -h /c` before each `pnpm install`, and stop and report if it is under 3 GB.

## Review Focus

1. **A School Admin whose link has no `countyId` is listed and counted,** on both server and desktop. That is today's real data: all principals. Tests: Task 1, Task 8.
2. **A user with two qualifying links (a DEO link and a School Admin link) appears once,** shows role DEO, and is counted once in every stat. Tests: Task 1, Task 8.
3. **A County Admin from county A gets 403 on every user endpoint aimed at county B or at a ministry/super admin,** while a ministry admin's calls behave as before. Tests: Tasks 1–3.
4. **Offline, every command button is disabled, and the list and stats still render** from local data. Test: Task 11.
5. **A bulk CSV with a school id from another county, a repeated email, or a role of SUPER_ADMIN is blocked on the preview step** and never sent. Test: Task 13.

---

## Part A — Nemis repo (`Walamen/Nemis-users`)

### Task 0: Worktree setup (both repos)

- [ ] **Step 1:** In `Nemis-users`, run `pnpm install`, `pnpm build:packages`, then `DATABASE_URL=postgresql://x:x@localhost:5432/x pnpm --filter ./apps/Server exec prisma generate`.
- [ ] **Step 2:** In `desktop-client-nemis-users`, run `pnpm install`.
  - Do **not** run `pnpm rebuild:node` or `rebuild:electron`. The pnpm cache hardlinks `better_sqlite3.node` across checkouts, so a rebuild rewrites the main checkout's binary.
  - Instead, to run Node-ABI tests, copy a Node prebuild of better-sqlite3 (from the pnpm/npm cache `_prebuilds` tarball for the installed version) into this worktree's `node_modules/better-sqlite3/build/Debug/better_sqlite3.node`. `bindings` checks Debug first.
  - The Electron runner above needs no copy.
  - Delete the Debug copy at the end of the project.
- [ ] **Step 3: Baselines.** Record the counts. No commit.
  - Server: `pnpm --filter ./apps/Server test`.
  - portal-web: `pnpm --filter ./apps/portal-web test`.
  - Desktop: the Electron-runner suite, `pnpm lint`, `pnpm typecheck`.

### Task 1: County user scope, list and stats (server)

**Files:**
- Modify: `apps/Server/src/users/users.service.ts`: `getUsersByCounty` (≈1032) and `getCountyUserStats` (≈1115); add the exported `countyUserScope` near the top.
- Modify: `apps/Server/src/users/users.controller.ts`: the `county/:countyId` and `county/:countyId/stats` routes (≈336–371).
- Test: create `apps/Server/src/users/users.county-scope.spec.ts`, using the mock-prisma `setup` style of `users.role-eligibility.spec.ts`.

**Interfaces:**
- Produces:
  - `export const COUNTY_LISTED_ROLES = [SystemRole.DEO, SystemRole.INSTITUTION_ADMIN] as const;`
  - `export function countyUserScope(countyId: string): Prisma.UserWhereInput` returns:
    `{ organizations: { some: { isActive: true, role: { in: [...COUNTY_LISTED_ROLES] }, OR: [ { countyId }, { institution: { countyId } }, { district: { countyId } }, { role: SystemRole.DEO, countyId: null, districtId: null } ] } } }`.
  - `private assertOwnCounty(countyId: string, caller: UserContext): void`: returns for SUPER_ADMIN or MINISTRY_ADMIN callers (any org with that role). Otherwise it requires an org `{ role: COUNTY_ADMIN, countyId }`, else `ForbiddenException("You do not have access to this county")`.
  - `getUsersByCounty(countyId, filters, caller: UserContext)` and `getCountyUserStats(countyId, caller: UserContext)` both call `assertOwnCounty` first.

- [ ] **Step 1: Write failing tests:**
  - `it("lists users through countyUserScope and orders createdAt desc, id")`: assert `prisma.user.findMany` was called with `where` containing `countyUserScope("county-1")`'s `organizations.some` (as `AND` with the `role` filter when given). Assert `orderBy: [{ createdAt: "desc" }, { id: "asc" }]`, and that `organizations` select carries the same `where` (isActive, roles, OR) with `institution: { select: { id, name, code, countyId } }` and `district: { select: { id, name, code } }`.
  - `it("omits isActive filter when includeInactive")` / `it("adds isActive true otherwise")`.
  - `it("stats count over countyUserScope")`: `prisma.user.count` is mocked to return 7, 3 and 2 in call order, and `prisma.user.findMany` (for usersByRole) returns users with organizations. Expect `{ totalUsers: 7, activeUsers: 3, pendingActivation: 2, usersByRole: { DEO: 1, INSTITUTION_ADMIN: 2 } }`. Assert:
    - the total `where` is `countyUserScope` only (no `isActive`);
    - the active `where` has `isActive: true` and `lastLoginAt: { gte: <Date ≈ now-30d> }`;
    - the pending `where` has `emailVerified: false` and **no** `isActive`.
  - `it("usersByRole counts each user once by listed role, DEO first")`: a user with DEO and INSTITUTION_ADMIN links counts as DEO only.
  - `it("403 for another county's admin")` on both methods; `it("allows a ministry admin")`.
- [ ] **Step 2:** Run `pnpm --filter ./apps/Server test -- users.county-scope`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **usersByRole:** fetch `user.findMany({ where: countyUserScope, select: { organizations: { where: <same link filter>, select: { role: true } } } })`. Then for each user take DEO if any link is DEO, else INSTITUTION_ADMIN.
  - **Controller:** add `@CurrentUser() user: UserContext` to both routes and pass it through.
- [ ] **Step 4:** Rerun. Expected: PASS. Run the whole server suite: green. (The web Districts page calls the list with `role=DEO`; its shape is unchanged.)
- [ ] **Step 5:** Commit: `fix(users): county user list and stats count school admins through their school`.

### Task 2: Create paths fill the county; activation URL; County Admin create limits (server)

**Files:**
- Modify: `apps/Server/src/users/users.service.ts`: `createUserWithActivation` (≈130), `bulkCreateUsers` (≈1369), `getActivationToken` (≈946).
- Modify: `apps/Server/src/institutions/institutions.service.ts`: `createAdminUser`'s `userOrganization.create` (≈277).
- Test: `apps/Server/src/users/users.county-create.spec.ts`; extend `institutions.service` spec, or create `institutions.admin-link.spec.ts` if no harness fits.

**Interfaces:**
- Consumes: `assertOwnCounty` and `COUNTY_LISTED_ROLES` (Task 1).
- Produces:
  - `private activationUrl(token: string): string` = `${this.config.get("FRONTEND_URL", "http://localhost:3002")}/activate?token=${token}`. The activation email uses it too.
  - The `createUserWithActivation` result gains `activationUrl`.
  - `getActivationToken` returns `{ activationToken, activationUrl }`.
  - The bulk `success[].user` therefore carries `activationUrl`.
  - `private isCountyAdminOnly(caller): boolean` is true when the caller has a COUNTY_ADMIN org and no SUPER_ADMIN/MINISTRY_ADMIN org.
  - `private callerCountyId(caller): string | null` returns that COUNTY_ADMIN org's `countyId`.
  - `export const COUNTY_CREATABLE_ROLES = [DEO, INSTITUTION_ADMIN, DATA_OFFICER]`.

- [ ] **Step 1: Write failing tests:**
  - `it("fills countyId and districtId from the institution")`: dto `{ role: INSTITUTION_ADMIN, institutionId: "school-1" }`, with `institution.findUnique` returning `{ countyId: "county-1", districtId: "district-1" }`. Expect the nested org create to carry `{ institutionId: "school-1", countyId: "county-1", districtId: "district-1" }`.
  - `it("returns activationUrl")`: config `FRONTEND_URL = "https://portal.test"` and token `"tok"`. Expect `result.activationUrl === "https://portal.test/activate?token=tok"`.
  - `it.each([SUPER_ADMIN, MINISTRY_ADMIN, COUNTY_ADMIN, TEACHER])("county admin cannot create %s")`: expect `ForbiddenException("You can only manage users in your county.")` and no `user.create`.
  - `it("county admin: countyId is forced to their own")`: dto `countyId: "county-2"`. Expect the create to carry `countyId: "county-1"`.
  - `it("county admin: institution in another county → 403")` and the same for `districtId`.
  - `it("ministry admin may still create MINISTRY_ADMIN")`.
  - `it("bulk: refused rows land in failed with the message, others succeed")`.
  - `it("getActivationToken returns activationUrl")`.
  - `it("school registration principal link carries the school's countyId and districtId")` (institutions).
- [ ] **Step 2:** Run both specs. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Order in `createUserWithActivation`:**
    1. the existing permission check;
    2. if the caller is County-Admin-only: check the role is creatable, force `countyId`, and verify any `institutionId`/`districtId` belongs to that county (`institution.findUnique` / `district.findUnique`);
    3. the existing email check;
    4. create.
  - **Institution links:** when `institutionId` is set, look up the institution (once) and take its `countyId`/`districtId` for the link.
  - **Principal link:** in `createAdminUser`, read `db.institution.findUnique({ where: { id: institutionId }, select: { countyId: true, districtId: true } })` and add both fields to the link.
- [ ] **Step 4:** Rerun the specs, then the whole server suite. Expected: green.
- [ ] **Step 5:** Commit: `fix(users): county admins create only administrator roles in their county; responses carry activationUrl`.

### Task 3: County Admin limits on update, activation token and assign (server)

**Files:**
- Modify: `apps/Server/src/users/users.service.ts`: `updateUser` (≈373), `getActivationToken`, `assignUserToDistrict` (≈1193), `assignUserToInstitution` (≈1281).
- Test: `apps/Server/src/users/users.county-manage.spec.ts`.

**Interfaces:**
- Consumes: `countyUserScope`, `isCountyAdminOnly` and `callerCountyId` (Tasks 1–2).
- Produces: `private async assertManagesTarget(caller: UserContext, userId: string): Promise<void>`. It does nothing unless the caller is County-Admin-only. Otherwise it requires `prisma.user.count({ where: { id: userId, ...countyUserScope(callerCountyId) } }) > 0`, else `ForbiddenException("You can only manage users in your county.")`.

- [ ] **Step 1: Write failing tests** (each with a County Admin of county-1):
  - `it("update: target outside the county → 403, no write")`;
  - `it("update: county admin may change only isActive")`: `{ firstName: "X" }` → 403, while `{ isActive: false }` → update called;
  - `it("activation token: target outside → 403")`;
  - `it("assign district: target outside → 403")`;
  - `it("assign district: district of county-2 → 403")`;
  - `it("assign institution: school of county-2 → 403")`;
  - `it("assign: role SUPER_ADMIN → 403")`: the role must be in `COUNTY_CREATABLE_ROLES`;
  - `it("ministry admin unaffected")` for each of the four;
  - `it("pool DEO is manageable")`: the count mock returns 1 for a pool DEO.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** Call `assertManagesTarget` right after the existing `canManage*` checks. The district/institution county check goes after its `findUnique`, comparing `district.countyId` / `institution.countyId` to `callerCountyId`.
- [ ] **Step 4:** Rerun the spec and the whole suite. The existing `users.role-eligibility.spec.ts` uses a SUPER_ADMIN caller and must stay green.
- [ ] **Step 5:** Commit: `fix(users): county admins manage only their county's users`.

### Task 4: Snapshot ships `emailVerified` (server)

**Files:**
- Modify: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts`: the `users:` mapping (≈743); also the declared row type if one exists.
- Test: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`.

**Interfaces:**
- Produces: every snapshot `users[]` row carries `emailVerified: boolean`. The desktop importer (Task 6) reads it.

- [ ] **Step 1: Write the failing test** `it("ships each user's emailVerified")`, in the existing Proxy-`tx` style. Two org rows have users with `emailVerified: true` and `false`; assert both values in `data.users`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Add `emailVerified: row.emailVerified` after `isActive`.
- [ ] **Step 4:** Rerun, then the suite. Expected: green.
- [ ] **Step 5:** Commit: `feat(desktop-provisioning): ship users.emailVerified`.

### Task 5: portal-web role pick and card sub-line

**Files:**
- Modify: `apps/portal-web/src/store/county/Api/userManagementApi.ts`: `transformApiUserToManagementUser`; export it.
- Modify: `apps/portal-web/src/app/government/county/users/page.tsx`: the Total Users sub-line.
- Test: `apps/portal-web/src/store/county/Api/userManagementApi.test.ts`.

**Interfaces:**
- Produces: `export function transformApiUserToManagementUser(apiUser: ApiUser): ManagementUser`. Its `primaryOrg` is the active org with role DEO, else the active org with INSTITUTION_ADMIN, else the first active, else `organizations[0]`.

- [ ] **Step 1: Write failing tests:**
  - `it("a pool DEO (countyId null) maps to DEO, not VIEWER")`;
  - `it("DEO link wins over an earlier INSTITUTION_ADMIN link")`;
  - `it("school link gives schoolName and scopeType SCHOOL")`.
- [ ] **Step 2:** Run `pnpm --filter ./apps/portal-web test -- userManagementApi`. Expected: FAIL.
- [ ] **Step 3:** Implement. Change "All roles" to "DEOs and School Admins" on the users page.
- [ ] **Step 4:** Rerun, then the whole portal-web suite and its typecheck/lint (`pnpm --filter ./apps/portal-web lint`).
- [ ] **Step 5:** Commit: `fix(portal-web): county users show pool DEOs as DEO; Total Users sub-line`.

---

## Part B — desktop repo (`Walamen/desktop-client-nemis-users`)

### Task 6: Migration 037 and importer column

**Files:**
- Create: `apps/desktop/electron/database/migrations/037-add-user-email-verified.ts` (+ `.test.ts`).
- Modify: `apps/desktop/electron/database/migrations/registry.ts`.
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts:69` (`users` spec, append `'emailVerified'`); also `ProvisioningImporter.test.ts`.

**Interfaces:**
- Produces: the column `users.emailVerified INTEGER` (NULL = unknown).

- [ ] **Step 1: Write failing tests:**
  - Migration: after 037, `PRAGMA table_info(users)` has `emailVerified`, and existing rows read NULL. Mirror `036-add-guardian-photo.test.ts`.
  - Importer: `it("stores users.emailVerified, NULL when absent")`.
- [ ] **Step 2:** Run both tests. Expected: FAIL.
- [ ] **Step 3:** Migration `{ version: 37, name: 'add-user-email-verified', up: ALTER TABLE users ADD COLUMN emailVerified INTEGER }`. Register it, and append the importer column. If the importer coerces booleans per column, it must store `true`/`false` as 1/0, as it does for `isActive`.
- [ ] **Step 4:** Rerun, plus the whole `migrations/` and `provisioning/` folders.
- [ ] **Step 5:** Commit: `feat(data): migration 037 stores users.emailVerified`.

### Task 7: Types and application layer

**Files:**
- Create: `packages/types/src/county-users.ts`; export it from `packages/types/src/index.ts`.
- Create: `packages/application/src/interfaces/county/county-users-read-model.ts`; export it from `interfaces/county/index.ts`.
- Create: `packages/application/src/use-cases/county/get-county-users.ts`, `get-county-user-options.ts`, and `county-users.test.ts`.
- Create: `packages/application/src/testing/county/in-memory-county-users-read-model.ts`; export it from `testing/county/index.ts`.
- Modify: `county-application-service.ts`, `create-application-layer.ts` (+ its `.test.ts`), `packages/application/src/index.ts`.
- Modify: the test-application factory used by the guardians change (same file that commit 27afed2 touched under `testing/`).

**Interfaces:**
- Produces, in `@nemis-desktop/types`:
```ts
export type CountyUserRole = 'DEO' | 'INSTITUTION_ADMIN';
export type CountyAssignableRole = CountyUserRole | 'DATA_OFFICER';
export interface CountyUsersQuery { search?: string; role?: CountyUserRole; page: number; limit: number }
export interface CountyUserListItem {
  id: string; firstName: string; lastName: string; email: string | null; phoneNumber: string | null;
  photoUrl: string | null; role: CountyUserRole; isActive: boolean; emailVerified: boolean | null;
  lastLoginAt: string | null; districtId: string | null; districtName: string | null;
  institutionId: string | null; schoolName: string | null;
}
export interface CountyUserStats { totalUsers: number; activeUsers: number; pendingActivation: number; schoolAdmins: number }
export interface CountyUsersResult { county: { id: string; name: string } | null; stats: CountyUserStats; data: CountyUserListItem[]; total: number }
export interface CountyUserOptions {
  county: { id: string; name: string } | null;
  districts: Array<{ id: string; name: string }>;
  schools: Array<{ id: string; name: string; districtId: string | null }>;
}
export interface CountySetUserActiveRequest { userId: string; isActive: boolean }
export interface CountyAssignUserRequest { userId: string; role: CountyAssignableRole; districtId?: string; institutionId?: string } // exactly one of districtId / institutionId
export interface CountyActivationLink { activationUrl: string }
export interface CountyCreateUserRequest { firstName: string; lastName: string; email: string; phoneNumber: string; role: CountyUserRole; institutionId?: string }
export interface CountyCreateUserResult { userId: string; activationUrl: string }
export interface CountyBulkUserRow { firstName: string; lastName: string; email: string; phoneNumber: string; role: CountyUserRole; districtId?: string; institutionId?: string }
export interface CountyBulkCreateUsersResult {
  succeeded: Array<{ email: string; name: string; activationUrl: string | null }>;
  failed: Array<{ email: string; error: string }>;
}
```
- Produces, in `@nemis-desktop/application`:
  - `ICountyUsersReadModel { listUsers(query: CountyUsersQuery): Omit<CountyUsersResult, 'county'>; listOptions(): Omit<CountyUserOptions, 'county'> }`;
  - `GetCountyUsersUseCase` adds `county` from `ICountyAnalyticsReadModel.getCounty()`;
  - `GetCountyUserOptionsUseCase` does the same;
  - `CountyApplicationService.listUsers(query): Promise<ApplicationResponse<CountyUsersResult>>`;
  - `CountyApplicationService.getUserOptions(): Promise<ApplicationResponse<CountyUserOptions>>`;
  - the port key `countyUsers: ICountyUsersReadModel`;
  - `InMemoryCountyUsersReadModel` (constructor takes a `{ list, options }` seed).

- [ ] **Step 1: Write the failing test `county-users.test.ts`:** "listUsers merges the county into the read model's page"; "getUserOptions merges the county into districts and schools". Mirror `county-guardians.test.ts`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement and wire, mirroring the guardians commit 27afed2 file for file. In `createApplicationComposition.ts`, add the placeholder that commit used:

  ```ts
  // Real SQLite read model lands with the County Users read model (Task 8).
  countyUsers: new Proxy({} as never, { get: () => () => notBuilt('CountyUsers') }),
  ```

  Task 8 replaces it with `dataLayer.repositories.countyUsers`.
- [ ] **Step 4:** Rerun, plus `pnpm typecheck`.
- [ ] **Step 5:** Commit: `feat(application): county users list and assignment options`.

### Task 8: SQLite read model

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyUsersReadModel.ts` (+ `.test.ts`).
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts`, `apps/desktop/electron/data/adapters/createApplicationComposition.ts`.

**Interfaces:**
- Consumes: the types and `ICountyUsersReadModel` (Task 7); the column `users.emailVerified` (Task 6).
- Produces: `SqliteCountyUsersReadModel implements ICountyUsersReadModel` and the data-layer key `repositories.countyUsers`.

**Rules (§5.1–5.2):**
- **Qualifying link:** `o.isActive = 1 AND o.role IN ('DEO','INSTITUTION_ADMIN')`, plus any of:
  - `o.countyId` in the county;
  - `o.institutionId` → `institutions.countyId` in the county;
  - `o.districtId` → `districts.countyId` in the county;
  - or `o.role='DEO' AND o.countyId IS NULL AND o.districtId IS NULL`.

  "In the county" uses the `OWN_COUNTY` fallback of `SqliteCountyDistrictsReadModel` (no `counties` row → all).
- **Chosen link per user:** among qualifying links, `ORDER BY (o.role = 'DEO') DESC, o.id LIMIT 1`. Its role, `districtId`/district name and `institutionId`/school name fill the row. For a school link, `districtName` is null; the page shows `schoolName`.
- **Search:** `lower(firstName|lastName|email) LIKE '%' || lower(?) || '%' ESCAPE '\'`, with `%`, `_` and `\` escaped in the input.
- **Role filter:** applies to the chosen link's role.
- **Order:** `createdAt IS NULL, createdAt DESC, id ASC`. `LIMIT/OFFSET` from page/limit.
- **Stats:** over all qualifying users, ignoring search and role:
  - `totalUsers` = count;
  - `activeUsers` = `isActive = 1 AND lastLoginAt >= <now − 30 days ISO>`;
  - `pendingActivation` = `emailVerified = 0`;
  - `schoolAdmins` = chosen role INSTITUTION_ADMIN.

  "Now" comes from a constructor-injectable `now: () => Date` (default `() => new Date()`), so tests can pin it.
- **`emailVerified`:** NULL → `null`, 1 → `true`, 0 → `false`.
- **`listOptions()`:**
  - `districts`: the county's districts (any `isActive`), by name;
  - `schools`: `institutions` with `type = 'SCHOOL' AND isActive = 1` in the county, by name, with `districtId`.

- [ ] **Step 1: Write failing tests** (seed with the helpers the guardians read-model test uses):
  - `it("lists a principal whose link has no countyId (through the school)")`;
  - `it("lists a district-only legacy DEO link")`;
  - `it("lists a pool DEO as DEO with no district or school")`;
  - `it("excludes inactive links, TEACHER/COUNTY_ADMIN roles and another county's users")`;
  - `it("a user with DEO and school-admin links appears once, as DEO, counted once")`;
  - `it("search matches name or email case-insensitively and % literally")`;
  - `it("role filter; createdAt desc then id; null createdAt last; paging 12")`;
  - `it("stats: 30-day edge (29d in, 31d out), inactive excluded from active, pending counts emailVerified=0 any isActive, NULL not pending")`;
  - `it("no counties row → all schools' admins (OWN_COUNTY fallback)")`;
  - `it("listOptions: county districts by name; active SCHOOL-type institutions only")`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with the `StatementCache` + `guarded` pattern. Add `countyUsers` to `createDataLayer`, and replace Task 7's composition placeholder with `dataLayer.repositories.countyUsers`.
- [ ] **Step 4:** Rerun, plus `pnpm typecheck`.
- [ ] **Step 5:** Commit: `feat(data): SQLite county users read model`.

### Task 9: Presentation view models

**Files:**
- Create: `packages/presentation/src/view-models/county/county-users-view-model.ts`, `county-user-options-view-model.ts`, and `county-users-view-models.test.ts`.
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`, `packages/presentation/src/index.ts`, `apps/desktop/renderer/lib/presentation/hooks/county.ts`.

**Interfaces:**
- Consumes: `CountyApplicationService.listUsers` / `getUserOptions` (Task 7).
- Produces:
  - `CountyUsersViewModel`: store `{ summary: AsyncState<CountyUsersResult>; query: CountyUsersQuery }`, default query `{ page: 1, limit: 12 }`, and `load(query)`. A copy of `CountyGuardiansViewModel`.
  - `CountyUserOptionsViewModel`: store `{ options: AsyncState<CountyUserOptions> }` and `load()`.
  - Presentation keys `countyUsers` and `countyUserOptions`.
  - Hooks `useCountyUsersViewModel()` and `useCountyUserOptionsViewModel()`.

- [ ] **Step 1:** Write failing tests mirroring `county-guardians-view-models.test.ts`: load sets the query and reaches success; errors reach the error state.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Rerun, plus typecheck.
- [ ] **Step 5:** Commit: `feat(presentation): county users view models`.

### Task 10: Gateway, IPC channels, preload, bridge, facade

**Files:**
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts`: five methods after `removeDistrictOfficer`; also its test file.
- Create: `apps/desktop/electron/ipc/handlers/county/users.ts` (+ `.test.ts`); export it from `handlers/county/index.ts`.
- Modify:
  - `registrar.ts`: the read handlers next to guardians; the commands after `registerCountyDeoHandlers`;
  - `authorizeChannel.ts` (+ test): all 7 channels COUNTY_ADMIN;
  - `security/validateIpc.ts`;
  - `packages/types/src/ipc.ts` and `api.ts`;
  - preload: create `preload/county/users-api.ts`, add it in `preload/county/index.ts`;
  - bridge: create `renderer/services/nemis-bridge/county/users-bridge.ts`, add it in that folder's `index.ts`;
  - facade: `renderer/lib/ipc/county.ts` (+ `index.test.ts`).

**Interfaces:**
- Consumes: Task 7 types; `runOnline` from `ipc/handlers/school-admin/online.ts`.
- Produces:
  - **Channels:**
    - `county:list-users` (`CountyUsersQuery` → `CountyUsersResult`);
    - `county:get-user-options` (→ `CountyUserOptions`);
    - `county:set-user-active` (→ `OnlineCommandResult<null>`);
    - `county:assign-user` (→ `OnlineCommandResult<null>`);
    - `county:get-activation-link` (`userId` → `OnlineCommandResult<CountyActivationLink>`);
    - `county:create-user` (→ `OnlineCommandResult<CountyCreateUserResult>`);
    - `county:bulk-create-users` (`CountyBulkUserRow[]` → `OnlineCommandResult<CountyBulkCreateUsersResult>`).

    Constants `COUNTY_LIST_USERS`, `COUNTY_GET_USER_OPTIONS`, `COUNTY_SET_USER_ACTIVE`, `COUNTY_ASSIGN_USER`, `COUNTY_GET_ACTIVATION_LINK`, `COUNTY_CREATE_USER`, `COUNTY_BULK_CREATE_USERS`.
  - **`CountyApi` methods:** `listUsers`, `getUserOptions`, `setUserActive`, `assignUser`, `getActivationLink`, `createUser`, `bulkCreateUsers`. The same names exist on `countyBridge`.
  - **Gateway:**
    - `setUserActive(r): Promise<null>`: PATCH `/users/:id` `{ isActive }`.
    - `assignCountyUser(r): Promise<null>`: POST `/users/:id/assign-district` `{ districtId, role }` or `/assign-institution` `{ institutionId, role }`.
    - `getActivationLink(userId): Promise<CountyActivationLink>`: GET `/users/:id/activation-token`; requires a string `activationUrl`.
    - `createCountyUser(r: CountyCreateUserRequest & { countyId: string }): Promise<CountyCreateUserResult>`: POST `/users/with-activation`, body `{ firstName, lastName, email, phoneNumber, role, countyId, institutionId? }`; maps `{ userId: requireId, activationUrl: string }`.
    - `bulkCreateCountyUsers(rows: CountyBulkUserRow[], countyId: string): Promise<CountyBulkCreateUsersResult>`: POST `/users/bulk-create`, each row plus `countyId`. Maps `success[]` to `{ email, name: "first last", activationUrl: user.activationUrl ?? null }` and `failed[]` as-is.

    All use `ONLINE_COMMAND`. Unwrap a `{ data }` envelope if present (as the other gateway methods do).
  - **Handler:** `registerCountyUserHandlers(handle, app)` for the reads, and `registerCountyUserCommandHandlers(handle, gateway, refresh, countyId: () => string)` for the commands. `countyId` comes from `workspaces.active.user.scope.scopeId`, as the students handler does.
  - **Validators:** `assertCountyUsersQueryArgs`, `assertCountySetUserActiveArgs`, `assertCountyAssignUserArgs` (exactly one target), `assertCountyCreateUserArgs`, `assertCountyBulkCreateUsersArgs`. The activation link uses `assertSingleIdArg`; options use the no-arg validator the other list channels use. Limits are in Global Constraints. Role sets: `CountyUserRole` for create/bulk/query, `CountyAssignableRole` for assign.

- [ ] **Step 1: Write failing tests:**
  - **Gateway:** each method's URL, method and body, and that the response maps to the result type. `getActivationLink` with no `activationUrl` in the response throws. **No token is in the mapped result.**
  - **Handler:** each command runs the gateway, then `refresh`, and returns `{ data, refreshed }`. A gateway throw propagates without calling refresh. Create/bulk receive `countyId` from the injected function.
  - **Validators:** accept/reject cases for each limit; assign with both or neither target is rejected; a role of `SUPER_ADMIN` is rejected everywhere.
  - **authorizeChannel:** the 7 channels are COUNTY_ADMIN-only.
  - **Facade `index.test.ts`:** the read channels go through `query()`, mirroring guardians.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Rerun, plus `pnpm typecheck` and `pnpm lint`. The ESLint renderer boundary guard must pass.
- [ ] **Step 5:** Commit: `feat(ipc): county users channels and online commands`.

### Task 11: Users list page, Assign/Disable modals, activation dialog

**Files:**
- Modify: `apps/desktop/renderer/app/government/county/users/page.tsx` (replaces the ComingSoon).
- Create: `apps/desktop/renderer/app/government/county/users/page.test.tsx`.
- Create, in `apps/desktop/renderer/components/county/users/`: `UserCard.tsx`, `AssignUserModal.tsx`, `DisableUserModal.tsx`, `ActivationLinkDisplay.tsx`.

**Interfaces:**
- Consumes:
  - `useCountyUsersViewModel` and `useCountyUserOptionsViewModel` (Task 9);
  - the `countyBridge` commands (Task 10);
  - `useConnectivityStore`, `useRevalidateOnSync`, `parseIpcError`, and `SchoolPhoto` (with `fallback="/deo-fallback.jpg"`);
  - `CopyButton` from `components/county/schools/registration/CopyButton.tsx`.

**Behaviour:** an exact port of the web page (§2), with these desktop rules:
- **Layout:** the header band shows `county.name || "County"`. Cards and table are as on the web. The pager is the web's.
- **Query:** search and role changes reset to page 1, and filtering is server-side, through `vm.load({ search, role, page, limit: 12 })`.
- **Role labels:** "DEO", "School Admin".
- **Scope line:** `schoolName ?? districtName ?? "County Level"`. "Assigned" = `districtId || institutionId`.
- **Activation URL** shows only when `emailVerified === false`.
- **Offline:** every action button (Bulk Create, Create User, Activation URL, Assign/Re-assign, Disable/Enable) is disabled, and the amber hint "User changes need an internet connection." shows.
- **Enable** runs immediately. **Disable** opens `DisableUserModal` (the web's copy) and runs on confirm.
- **After any command:** set `SYNC_NOTE` when `refreshed` is false, then `vm.load(current query)`. Errors use `parseIpcError(e)?.message || <web fallback text>`, shown inline in a red banner, not `alert()`.
- **The Assign modal** is the web's (type District/Institution; roles DEO/Data Officer or School Admin/Data Officer; dropdowns from `useCountyUserOptionsViewModel`), sending `countyBridge.assignUser`.
- **`ActivationLinkDisplay`** shows the name, email and URL, a `CopyButton`, and Close. The URL is held in page state only.
- **Toggle:** aria-labels "Card view" / "Table view". Create User → `/government/county/users/create`; Bulk Create → `/government/county/users/create/bulk`.

- [ ] **Step 1: Write failing tests** (mock the view-model hooks and `countyBridge`, as `parents/page.test.tsx` does):
  - renders the 4 cards with the stats and the "DEOs and School Admins" sub-line;
  - cards by default, table after "Table view";
  - search/role call `load` with page 1;
  - the pager calls `load` with page 2 when `total` is 13;
  - Activation URL is shown only for `emailVerified === false`, and clicking it shows the returned URL;
  - Re-assign vs Assign;
  - Disable opens the modal and confirm calls `setUserActive({ isActive: false })`; Enable calls it with `true` directly;
  - **offline:** every action button is disabled, the hint shows, and the list still renders;
  - a rejected command shows the parsed message;
  - `refreshed: false` shows `SYNC_NOTE`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun, plus typecheck, lint and `pnpm build:renderer`.
- [ ] **Step 5:** Commit: `feat(county): port the Administrative Users page`.

### Task 12: Create User wizard

**Files:**
- Create: `apps/desktop/renderer/app/government/county/users/create/page.tsx` (+ `page.test.tsx`).

**Interfaces:**
- Consumes: `countyBridge.createUser`, `useCountyUserOptionsViewModel` (the school picker), `ActivationLinkDisplay` (Task 11), connectivity.

**Behaviour:** the web's 3-step wizard (same steps, labels and validation messages). It uses the form library already used by the desktop's CreateSchoolPage; if there is none, use controlled state with the same rules:
- names required and ≤ 100;
- email required and valid;
- phone required and matching the phone regex;
- role DEO or School Admin;
- a school is required for School Admin.

`getErrorMessage` from the web is ported as `friendlyCreateError(message: string): string`, keeping the duplicate-email text, applied to `parseIpcError(e)?.message`. On success, `ActivationLinkDisplay` replaces the form, and Close returns to `/government/county/users`. Offline: Submit is disabled with the hint.

- [ ] **Step 1: Write failing tests:**
  - step navigation;
  - School Admin requires a school;
  - submit sends `{ firstName, lastName, email, phoneNumber, role, institutionId }`;
  - a duplicate-email error shows the friendly text;
  - success shows the activation link;
  - offline, Submit is disabled.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun, plus typecheck, lint and `build:renderer`.
- [ ] **Step 5:** Commit: `feat(county): Create User wizard`.

### Task 13: Bulk Create page

**Files:**
- Create: `apps/desktop/renderer/app/government/county/users/create/bulk/page.tsx` (+ `page.test.tsx`).
- Create: `apps/desktop/renderer/components/county/users/bulkUserCsv.ts` (+ `.test.ts`).

**Interfaces:**
- Consumes: `countyBridge.bulkCreateUsers`, `useCountyUserOptionsViewModel`, `ActivationLinkDisplay`/`CopyButton`.
- Produces:
  - `parseUserCsv(text: string): { rows: CountyBulkUserRow[]; error: string | null }`: the web's comma-split parse, its messages verbatim ("CSV file must contain a header row and at least one data row", "Missing required columns: …", "Row N: Missing required fields");
  - `checkUserRows(rows: CountyBulkUserRow[], options: CountyUserOptions): Array<{ row: number; message: string }>`: the desktop-only checks of §5.4.

**`checkUserRows` messages** (row numbers 1-based plus the header, as the web counts):
- "Row N: role must be DEO or INSTITUTION_ADMIN";
- "Row N: school is not in this county";
- "Row N: district is not in this county";
- "Row N: invalid email";
- "Row N: email repeats row M".

**Page behaviour:** the web's 3 steps and the template download (same template text). A Blob download works in Electron; if `hardenWindow` blocks it, use the existing save-file path the schools bulk import uses. Problems are listed on Preview, and Submit is disabled while any exist. Results show succeeded rows, each with a `CopyButton` for its URL (or "—" when null), and failed rows with their error. Offline: Submit is disabled with the hint.

- [ ] **Step 1: Write failing tests:**
  - **Parser:** each web error, and the optional columns.
  - **`checkUserRows`:** each message; a school from another county; a repeated email (case-insensitive); role `SUPER_ADMIN`.
  - **Page:** a problem blocks Submit; a clean file sends the rows and renders the results.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun, plus typecheck, lint and `build:renderer`.
- [ ] **Step 5:** Commit: `feat(county): Bulk Create users page`.

### Task 14: Final verification

- [ ] **Step 1:** Run the server suite, then (separately) the portal-web suite, its lint and its typecheck. Expected: baseline counts plus the new tests, all green.
- [ ] **Step 2:** Run the desktop Electron-runner suite, `pnpm lint`, `pnpm typecheck` and `pnpm build:renderer`. Expected: green, except the known pre-existing failures.
- [ ] **Step 3:** Delete any `node_modules/better-sqlite3/build/Debug` copy made in Task 0. Confirm that `git status` is clean in both worktrees.
