# County Offline School Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** County Admins can register schools on the desktop, by form or spreadsheet, with no connection. Each school waits on the device, is sent when the device is back online, and the principal's login stays available afterwards.

**Architecture:**
- Waiting schools live in a new local `school_registrations` table, never in `institutions`.
- A dedicated push service sends each one to the web's own `POST /institutions`. The server gains an optional, idempotent client `id`, a create that runs in one transaction, and `communityTown`.
- Reads go through the hexagonal path. The Schools list and detail use cases merge registrations in.
- The online "wait a few seconds" goes renderer → bridge → IPC → `syncWorker.pullNow`, the same way the Districts DEO commands call the bridge directly.

**Tech Stack:** Electron 42.7.0, Next 15 static export, React 19, Zustand vanilla ViewModels, better-sqlite3/SQLCipher, Vitest; Nemis server NestJS + Prisma + Jest. New desktop deps: `validator@13.15.26` (+ `@types/validator`), `react-phone-number-input@^3.4.16`.

**Spec:** `docs/superpowers/specs/2026-10-17-county-school-registration-design.md` (read §2 for exact user-facing copy, §5 for the technical calls).

## Global Constraints

- Branch `feat/county-school-registration` in both repos. **Nemis (server) task ships first.**
- Copy is fixed by the spec, verbatim:
  - `"Saved on this device. It will be sent when you're back online."`
  - `"Waiting to sync"`
  - `"Couldn't be added"`
  - `"Fix and resend"`
  - `"Discard"`
  - `"Principal Login"`
  - `"N school(s) added: principal logins are ready."`
  - `"N school(s) couldn't be added"`
  - `"N schools saved; they'll be sent when you're back online."`
- Pages are ports of portal-web (`Nemis/apps/portal-web/src/app/government/county/schools/create/page.tsx`, `…/bulk-import/page.tsx`).
  - Keep their markup, classes, copy, steps, validation and payload mapping.
  - Change only what this plan names: data source, save path, the desktop-only checks, `router.push` → desktop routes.
- `institutions` gets no outbox triggers. `ProvisioningImporter` never reads or writes `school_registrations`.
- Every registration read and push filters on `createdBy = signed-in user` AND `countyId IN (SELECT id FROM counties)`.
- Only `rejected` registrations can be resubmitted or discarded.
- Business refusals cross IPC as data (`status` unions), never as thrown `WorkflowException`. That error's text is lost over IPC today: it is mapped to UNEXPECTED_ERROR.
- Detail/edit routes use `?id=` / `?registration=` query strings (static export; `useSearchParams` inside `Suspense`).
- New application services/keys need a line in `apps/desktop/electron/main/main.ts` `deferredApplication`. CountyApplicationService methods need none: the `county` key exists.
- SQLite tests: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>` from the desktop repo root. Server: `npx jest <path>` in `Nemis/apps/Server`.
- Known pre-existing desktop failures (leave alone): `apps/desktop/renderer/app/page.test.tsx`, `apps/desktop/renderer/app/government/teacher/timetable/timetable.test.tsx`.
- Never stage unrelated uncommitted changes; check `git status` before each commit.

## Review Focus

1. **Double-click on Save / Import while saving** → exactly one registration per school. The button stays disabled until the save resolves (Tasks 9, 12).
2. **Session expired (401), rate limit (429) or server unreachable during a background send** → the school stays amber and is retried. It never turns red (Task 5).
3. **District removed or deactivated on the server before the send** → red, with the server's reason. Fix and resend opens with District empty, so step 1 forces a new choice (Task 9).
4. **A large spreadsheet (200 rows)** → saved in one transaction. A failure saves none (Task 4).
5. **A different County Admin signs in on the same device** → never sees, counts or sends the first admin's waiting schools or logins (Tasks 4, 5).

---

## Stage 1 — machinery + Create School

### Task 1: Server — idempotent client `id`, `communityTown`, transactional create (Nemis)

**Files:**
- Modify: `Nemis/apps/Server/src/institutions/dto/create-institution.dto.ts`
- Modify: `Nemis/apps/Server/src/institutions/institutions.service.ts` (`createAdminUser` lines 79-328, `create` lines 399-647)
- Test: `Nemis/apps/Server/src/institutions/institutions.create.spec.ts` (new)

**Interfaces:**
- Produces:
  - `POST /institutions` accepts optional `id` (UUID) and `communityTown`.
  - The response stays `{ ...institution, adminActivations?: Array<{ autoActivated: true; email: string; name: string; defaultPassword: string } | …> }`, inside the global `{ data }` envelope.
  - A replay of an existing id answers the same shape.

- [ ] **Step 1: Write the failing tests** in `institutions.create.spec.ts`. Use the mocked-prisma style of `institutions.role-eligibility.spec.ts` and add `$transaction: jest.fn((fn) => fn(prisma))`. The `user` is a COUNTY_ADMIN `UserContext` for county `c-1`; `dto` is a web-shaped body (`code: 'GB-1234'`, `countyId: 'c-1'`, district in `c-1`, `levels: ['PRIMARY']`, `admins: [{ email: 'Head@School.lr', firstName: 'Ada', lastName: 'Doe' }]`, `isActive: true`).
  - `it('creates the institution with the client id and stores communityTown')`: `prisma.institution.create` is called with `data` containing `id: ID` and `communityTown: 'Kakata'`.
  - `it('replays an existing id in the same county with the same code: no writes, same credential')`:
    - Setup: `institution.findUnique({where:{id}})` returns `{ id: ID, countyId: 'c-1', code: 'GB-1234', … }`, and `userOrganization.findFirst` (role INSTITUTION_ADMIN, institutionId ID, include user) returns user `head@school.lr`.
    - Expect: `institution.create` not called, `user.create` not called, and the result's `adminActivations` is `[{ autoActivated: true, email: 'head@school.lr', name: 'Ada Doe', defaultPassword: <config DEFAULT_USER_PASSWORD> }]`.
  - `it('refuses an existing id with a different code')` → rejects `ConflictException`; no create.
  - `it('refuses an existing id in another county')` → rejects `ConflictException`.
  - `it('runs the whole create in one transaction and never deletes by hand on an email conflict')`:
    - Setup: the pre-flight email check finds an existing INSTITUTION_ADMIN role.
    - Expect: rejects `ConflictException`, `prisma.$transaction` was called, and `institution.delete` was not called.
  - `it('a web-shaped create without id still returns adminActivations')`.
  - `it('validates id as a UUID and accepts communityTown')`: use `plainToInstance` + `validate`. `id: 'nope'` → one error on `id`; `communityTown: 'Kakata'` → no error.

- [ ] **Step 2: Run** `npx jest src/institutions/institutions.create.spec.ts`. Expected: FAIL — `id`/`communityTown` not on the DTO, no replay, no `$transaction`.

- [ ] **Step 3: Implement.**
  - **DTO:** add `@IsOptional() @IsUUID() id?: string` and `@IsOptional() @IsString() communityTown?: string`, each with `@ApiProperty({ required: false })`.
  - **`createAdminUser`:** gains a trailing parameter `db: Prisma.TransactionClient | PrismaService = this.prisma` and uses it for every query and write.
    - When `db !== this.prisma`, a P2002 on `user.create` must not re-fetch: Postgres has aborted the transaction. Throw `new ConflictException("This email was just registered by another request. Please try again.")` instead.
    - Other callers are unchanged.
  - **`create`:**
    1. If `dto.id` is set, look it up first. Same `countyId` and same `code` → return the replay (the institution with `county`/`district` included, plus `adminActivations` built from its active INSTITUTION_ADMIN link). Otherwise → `ConflictException("A different school already uses this id.")`.
    2. Then run every existing check and write inside `this.prisma.$transaction(async (tx) => …, { timeout: 15_000 })`. That covers the code check, the county/district checks, the institution create (`id: dto.id`, `communityTown: dto.communityTown`), the levels, the email pre-flight (throw; no manual `institution.delete`) and the `createAdminUser(…, true, tx)` loop.
    3. Keep the permission check and the error messages exactly as they are.

- [ ] **Step 4: Run** `npx jest src/institutions` and `npx tsc --noEmit -p .`. Expected: all pass (including the existing `institutions.role-eligibility.spec.ts`); tsc exit 0.

- [ ] **Step 5: Commit** in `Nemis`: `feat(institutions): idempotent client id, communityTown, one-transaction create`.

### Task 2: Desktop — types + migration 034

**Files:**
- Create: `packages/types/src/county-school-registrations.ts`; export from `packages/types/src/index.ts`
- Modify: `packages/types/src/county-schools.ts`
- Create: `apps/desktop/electron/database/migrations/034-create-school-registrations.ts`, `034-create-school-registrations.test.ts`; register in `migrations/registry.ts`; add `schoolRegistrations: 'school_registrations'` to `database/schema/tableNames.ts`
- Test: also add one case to `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`

**Interfaces:**
- Produces (in `county-school-registrations.ts`):
  ```ts
  export type SchoolRegistrationSyncState = 'pending' | 'synced' | 'rejected';
  export type SchoolRegistrationSource = 'form' | 'bulk';
  export interface SchoolRegistrationAdmin { email: string; firstName: string; lastName: string }
  /** Exactly the POST /institutions body portal-web builds (create submitSchool / bulk handleSubmit). */
  export interface SchoolRegistrationPayload {
    name: string; code: string; type: 'SCHOOL'; levels: string[]; ownership: string;
    countyId: string; districtId: string; isActive: true; admins: SchoolRegistrationAdmin[];
    address?: string; communityTown?: string; emisCode?: string; waecCode?: string;
    isBoarding?: boolean; isUrban?: boolean; contactPhone?: string; establishedYear?: number;
    accessMode?: string; principalName?: string; contactPersonPhone?: string;
    numBuildings?: number; numClassrooms?: number; numChairs?: number; numBenches?: number;
    numDesks?: number; numTables?: number; numBathrooms?: number; hasWaterAccess?: boolean;
    waterSource?: string; hasMoeSupport?: boolean; partnerOrganization?: string; hasPTA?: boolean;
    hasLibrary?: boolean; hasKitchen?: boolean; hasCafeteria?: boolean; hasSportsField?: boolean;
    hasSportsActivities?: boolean; hasAuditorium?: boolean; hasElectricity?: boolean;
    hasComputerLab?: boolean; hasClinic?: boolean; hasSafeWater?: boolean; hasWash?: boolean;
    hasTextbooks?: boolean; hasCurriculum?: boolean; isSpacious?: boolean; isVentilated?: boolean;
    isWellLighted?: boolean; metadata?: Record<string, unknown>;
  }
  export type SchoolRegistrationInput = Omit<SchoolRegistrationPayload, 'code' | 'countyId'>;
  export interface PrincipalLogin { email: string; password: string }
  export interface SchoolRegistration {
    id: string; countyId: string; source: SchoolRegistrationSource; payload: SchoolRegistrationPayload;
    syncState: SchoolRegistrationSyncState; syncError: string | null; principalLogin: PrincipalLogin | null;
    createdAt: string; updatedAt: string; syncedAt: string | null;
  }
  export interface SchoolRegistrationContext {
    county: { id: string; name: string; code: string | null } | null;
    districts: Array<{ id: string; name: string }>;   // active, by name
  }
  export interface SchoolCodeClash { index: number; code: string; existingName: string }
  export interface RegisterSchoolsRequest { source: SchoolRegistrationSource; schools: SchoolRegistrationInput[] }
  export interface ResubmitSchoolRegistrationRequest { id: string; school: SchoolRegistrationInput }
  export type RegisterSchoolsResult =
    | { status: 'saved'; ids: string[] }
    | { status: 'code-clash'; clashes: SchoolCodeClash[] }
    | { status: 'no-county' }
    | { status: 'not-found' };
  export interface CountySchoolRegistrationInfo {
    syncState: SchoolRegistrationSyncState; syncError: string | null;
    source: SchoolRegistrationSource; principalLogin: PrincipalLogin | null;
  }
  ```
- Produces (in `county-schools.ts`):
  - `CountySchoolListItem` gains `syncState: SchoolRegistrationSyncState | null; syncError: string | null`.
  - `CountySchoolDetail` gains `registration: CountySchoolRegistrationInfo | null`.
- Produces migration 034: table `school_registrations` with the spec §5.1 columns:
  - `id TEXT PRIMARY KEY`, `countyId TEXT NOT NULL`, `createdBy TEXT NOT NULL`;
  - `source TEXT NOT NULL CHECK (source IN ('form','bulk'))`, `payload TEXT NOT NULL`;
  - `syncState TEXT NOT NULL DEFAULT 'pending' CHECK (syncState IN ('pending','synced','rejected'))`, `syncError TEXT`;
  - `principalEmail TEXT`, `principalPassword TEXT`;
  - `createdAt TEXT NOT NULL`, `updatedAt TEXT NOT NULL`, `syncedAt TEXT`;
  - index `(createdBy, syncState)`.
  - No outbox triggers.

- [ ] **Step 1: Write failing tests.**
  - `034-…test.ts`:
    - `it('creates school_registrations with no outbox triggers')`: the PRAGMA columns match the list above, and `SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='school_registrations'` is empty.
    - `it('rejects an unknown syncState')`.
  - `ProvisioningImporter.test.ts`: `it('a full import leaves school_registrations untouched')`. Insert one pending row, run a non-merge import, and the row is still there.
- [ ] **Step 2: Run** the two files with the Electron runner. Expected: FAIL (no migration).
- [ ] **Step 3: Implement** the types, migration and registry entry. The existing `SqliteCountySchoolsReadModel.listActiveSchools` must now return `syncState: null, syncError: null`, and `getSchool` must return `registration: null` (types are required). Fix compile errors in its test fixtures and in `InMemoryCountySchoolsReadModel` fixtures by adding those fields.
- [ ] **Step 4: Run** the two files plus `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountySchoolsReadModel.test.ts`, then `pnpm typecheck`. Expected: PASS; exit 0.
- [ ] **Step 5: Commit** `feat(data): school_registrations table and registration types`.

### Task 3: Application — port, use cases, list/detail merge

**Files:**
- Create: `packages/application/src/interfaces/county/school-registration-store.ts` (export via `interfaces/county/index.ts`)
- Create: `packages/application/src/use-cases/county/`:
  - `school-registration-codes.ts`
  - `get-school-registration-context.ts`
  - `register-schools.ts`
  - `resubmit-school-registration.ts`
  - `discard-school-registration.ts`
  - `get-school-registrations.ts`
- Create: `packages/application/src/mappers/county/school-registration-mapper.ts`
- Modify: `use-cases/county/get-county-schools.ts`, `get-county-school-detail.ts`, `services/county-application-service.ts`, `factories/create-application-layer.ts` (+ its test), `index.ts`, `testing/create-test-application.ts`
- Create: `packages/application/src/testing/county/in-memory-school-registration-store.ts` (export via `testing/county/index.ts`)
- Test: `packages/application/src/use-cases/county/school-registrations.test.ts`, extend `county-schools.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ISchoolRegistrationStore {
    context(): SchoolRegistrationContext;
    /** Codes already used by a local institution or a non-rejected registration (any user), with that school's name. */
    existingCodes(codes: readonly string[]): Array<{ code: string; name: string }>;
    insertMany(rows: readonly NewSchoolRegistration[]): void;        // one transaction
    getForUser(id: string, userId: string): SchoolRegistration | null;
    listForUser(userId: string, ids?: readonly string[]): SchoolRegistration[];   // createdAt order
    resubmit(id: string, userId: string, payload: SchoolRegistrationPayload, now: string): boolean; // rejected only
    discard(id: string, userId: string): boolean;                                                    // rejected only
  }
  export interface NewSchoolRegistration {
    id: string; countyId: string; createdBy: string; source: SchoolRegistrationSource;
    payload: SchoolRegistrationPayload; now: string;
  }
  ```
- `school-registration-codes.ts`:
  - `formSchoolCode(countyCode: string | null, emisCode: string | undefined, nowIso: string): string` → `${countyCode || 'XX'}-${(emisCode ?? '').slice(-4) || String(Date.parse(nowIso)).slice(-6)}`
  - `randomSchoolCode(countyCode: string | null, random: () => number): string` → `${countyCode ?? 'XX'}-${random().toString(36).slice(2, 7).toUpperCase()}`
- `CountyApplicationService` gains:
  - `getRegistrationContext(): Promise<ApplicationResponse<SchoolRegistrationContext>>`
  - `registerSchools(req: RegisterSchoolsRequest): Promise<ApplicationResponse<RegisterSchoolsResult>>`
  - `resubmitSchoolRegistration(req: ResubmitSchoolRegistrationRequest): Promise<ApplicationResponse<RegisterSchoolsResult>>`
  - `discardSchoolRegistration(id: string): Promise<ApplicationResponse<{ discarded: boolean }>>`
  - `getSchoolRegistrations(ids: string[]): Promise<ApplicationResponse<SchoolRegistration[]>>` (empty `ids` = all of the user's)
- `ApplicationPorts` gains `schoolRegistrations: ISchoolRegistrationStore`. `RegisterSchoolsUseCase` deps also take `random?: () => number` (default `Math.random`), so tests are deterministic.
- `school-registration-mapper.ts`:
  - `registrationToListItem(r: SchoolRegistration, districtName: string | null): CountySchoolListItem` (`studentCount: 0`, `photoUrl: null`, `isActive: true`, `levels` from payload).
  - `registrationToDetail(r, districtName, countyName): CountySchoolDetail`:
    - `approvalStatus 'APPROVED'`, `street` = `payload.address ?? null`, `staffCount 0`;
    - `details` built from the payload's same-named fields (establishedYear, accessMode, isBoarding, isUrban, numBuildings, numClassrooms, numBathrooms, waecCode, principalName, has*);
    - `principal` from `admins[0]` (photoUrl null), `metadata` = `payload.metadata ?? null`;
    - `registration` = `{ syncState, syncError, source, principalLogin }`.

- [ ] **Step 1: Write failing tests** in `school-registrations.test.ts`, using `createTestApplication()` with `ports.schoolRegistrations` as the in-memory store. Seed the context county `{ id: 'c-1', name: 'Grand Bassa', code: 'GB' }`, district `d-1`, current user `u-1`.
  - `it('form: mints id and the web code from the EMIS code')`: register one form school with `emisCode: 'LR-0042'`. Expect `status 'saved'`, one row with `payload.code === 'GB-0042'`, `countyId 'c-1'`, `createdBy 'u-1'`, `syncState 'pending'`.
  - `it('form: reports a code clash with the existing school name and saves nothing')`: the store's `existingCodes` returns `GB-0042 → 'Old School'`. Expect `{ status: 'code-clash', clashes: [{ index: 0, code: 'GB-0042', existingName: 'Old School' }] }` and no rows.
  - `it('bulk: random codes; a clash is re-drawn silently')`: `random` yields a clashing value first, then a free one. Expect saved, with the second code.
  - `it('returns no-county when no county row has synced')`.
  - `it('resubmit: rejected row goes back to pending with a new random code, same id')`.
  - `it('resubmit/discard: not-found for a pending, synced or other user\'s row')`.
  - `it('getSchoolRegistrations returns only the current user\'s rows')`.
  - Extend `county-schools.test.ts`:
    - `it('merges waiting and refused registrations into the list by name; an institution with the same id wins')`: one institution `Bravo`; registrations `Alpha` (pending), `Charlie` (rejected, `syncError 'Email taken'`), and `Bravo-id` (synced, same id as the institution). Expect names `['Alpha','Bravo','Charlie']`, Alpha `syncState 'pending'`, Charlie `'rejected'`/`'Email taken'`, Bravo `syncState null`.
    - `it('detail falls back to the registration and attaches the principal login once synced')`: with no institution, `getSchool('r-1')` returns `registrationToDetail(…)`. With an institution and a synced registration with a login, the detail is the institution plus `registration.principalLogin`.
- [ ] **Step 2: Run** the Electron runner on `packages/application/src/use-cases/county`. Expected: FAIL (missing modules).
- [ ] **Step 3: Implement** the port, fake, codes, mapper, use cases (each through `invokeUseCase`, user from `ports.currentUserId`, `now` from `clock`, ids from `ids`), the service methods, ports and factory wiring.
  - Merge sort: compare names with `<` (binary), like the SQL.
  - Get district and county names from `context()`. The district may be missing (deactivated); its name is then `null`.
- [ ] **Step 4: Run** the same command plus `pnpm typecheck`. Expected: PASS. `create-application-layer.test.ts` lists the new methods.
- [ ] **Step 5: Commit** `feat(application): offline school registration use cases`.

### Task 4: SQLite adapter — `SqliteSchoolRegistrationStore`

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteSchoolRegistrationStore.ts` + `.test.ts`
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts`, `apps/desktop/electron/data/adapters/createApplicationComposition.ts`

**Interfaces:**
- Consumes: `ISchoolRegistrationStore` (Task 3).
- Produces: `dataLayer.repositories.schoolRegistrations`.
  - Follow `SqliteCountySchoolsReadModel`: `StatementCache`, `guarded`, the `OWN_COUNTY`-style clause.
  - The county filter is `countyId IN (SELECT id FROM counties)`.
  - `context().county` is the single `counties` row (`id`, `name`, `code`), or null when there is none.
  - `context().districts` are active districts of that county, ordered by name.
  - `payload` is stored as JSON. A corrupt payload reads as missing: that row is skipped by `listForUser` and is null from `getForUser`.
  - `principalLogin` is non-null only when both principal columns are set.

- [ ] **Step 1: Write failing tests**, using the migrated-DB fixture pattern from `SqliteCountySchoolsReadModel.test.ts`:
  - `it('insertMany writes every row in one transaction; a bad row saves none')`: 200 rows, the 150th with a duplicate id → throws, and `COUNT(*)` is 0. (Review Focus 4.)
  - `it('listForUser and getForUser hide other users and other counties')`. (Review Focus 5.)
  - `it('existingCodes finds institutions and non-rejected registrations, not rejected ones')`.
  - `it('resubmit and discard only touch the user\'s rejected rows')`: resubmit sets `syncState 'pending'`, clears `syncError`, and updates `payload` and `updatedAt`.
  - `it('context returns the county with its code and only active districts')`.
- [ ] **Step 2: Run** the file with the Electron runner. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the adapter, and wire `schoolRegistrations` into `createDataLayer` and `createApplicationComposition`.
- [ ] **Step 4: Run** the file, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(data): SQLite school registration store`.

### Task 5: Sending — gateway, push service, worker, pending source

**Files:**
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts` (+ `.test.ts`)
- Create: `apps/desktop/electron/sync/SchoolRegistrationSyncService.ts` + `.test.ts`
- Modify: `apps/desktop/electron/sync/pendingPredicates.ts`, `sync/DesktopSyncWorker.ts` (+ `.test.ts`)
- Create: `apps/desktop/electron/sync/pending/SchoolRegistrationPendingSource.ts`
- Modify: `sync/pending/types.ts`, `groups.ts`, `PendingChangesService.ts`, `PendingLabelResolver.ts`, `BespokePendingSources.test.ts`, `packages/types/src/sync.ts`

**Interfaces:**
- Produces:
  - `gateway.createInstitution(id: string, payload: SchoolRegistrationPayload): Promise<{ principal: { email: string; defaultPassword: string } | null }>`
    - POSTs to `/institutions` with body `JSON.stringify({ id, ...payload })` and `ONLINE_COMMAND`.
    - Parses `data.adminActivations` for the first entry with `autoActivated === true` and string `email`/`defaultPassword`. No such entry → `principal: null`. A non-object `data` → throws `Error('Malformed server response.')`.
  - `SCHOOL_REGISTRATION_PENDING = "syncState='pending' AND createdBy=? AND countyId IN (SELECT id FROM counties)"`.
  - `new SchoolRegistrationSyncService(gateway: Pick<BackendProvisioningGateway,'createInstitution'>).pushPending(db, userId): Promise<{ accepted: number }>`:
    - Oldest first, one request per row. Never throws.
    - 2xx → `syncState='synced'`, `syncedAt`, `principalEmail`/`principalPassword` from `principal`, `syncError NULL`.
    - `RemoteRejectedError` → `'rejected'` with `error.remoteMessage || 'The server refused this school.'`.
    - Anything else → unchanged.
  - `PendingSource` union gains `'school_registrations'`. `PendingContext` gains `userId: string`.
  - Group label: `'school_registrations:school_registrations': 'New schools'`.
  - Label resolver row: `json_extract(payload,'$.name')`.

- [ ] **Step 1: Write failing tests.**
  - Gateway, in the style of the existing `.test.ts` fetch stubs:
    - posts `{id,…payload}` to `/institutions`;
    - parses the credential;
    - `principal: null` without `autoActivated`;
    - 409 → `RemoteRejectedError` with the server message.
  - `SchoolRegistrationSyncService.test.ts` (real migrated DB, fake gateway):
    - `it('2xx: synced with the principal login, accepted count 1')`.
    - `it('4xx: rejected with the server message; the next row is still sent')`.
    - `it('401, 429, 5xx and unreachable leave the row pending')`, using `UnauthorizedError`, `RateLimitedError`, a status-500 error and `OfflineError` from the gateway's own error types. (Review Focus 2.)
    - `it('never sends another user\'s or another county\'s rows')`. (Review Focus 5.)
  - `DesktopSyncWorker.test.ts`:
    - `it('a pending registration keeps an idle cycle alive and is pushed')`.
    - `it('an accepted registration forces a pull in the same cycle')`.
  - `BespokePendingSources.test.ts`: `it('school registrations: pending counted for this user, rejected counted as failed')`.
- [ ] **Step 2: Run** the four test files with the Electron runner. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Worker:**
    - Construct the service next to `gradeCompletionSync`.
    - Before the early return, compute `registrationPending` (`SELECT 1 … WHERE ${SCHOOL_REGISTRATION_PENDING} LIMIT 1` with `workspace.user.id`), and include it in the idle check.
    - Call `pushPending(connection, workspace.user.id)` after the grade-completion push, in its own try/catch.
    - The pull condition becomes `stillPending.count === 0 && (claimed.length > 0 || pullDue || registrationsAccepted > 0)`.
  - **Pending context:** build `userId: workspace.user.id` wherever `PendingContext` is created.
  - **Pending service:** register the new source in `PendingChangesService`'s default list and add it to `SOURCES` in `groups.ts`.
- [ ] **Step 4: Run** the four files plus `apps/desktop/electron/sync/pending/*.test.ts`, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sync): send waiting school registrations and count them as pending`.

### Task 6: IPC chain

**Files:**
- Modify: `packages/types/src/ipc.ts`, `packages/types/src/api.ts` (`CountyApi`)
- Modify: `apps/desktop/electron/security/validateIpc.ts`, `ipc/authorizeChannel.ts` (+ test)
- Create: `apps/desktop/electron/ipc/handlers/county/registrations.ts` + `.test.ts`
- Modify: `ipc/handlers/county/index.ts`, `ipc/registrar.ts`
- Create: `apps/desktop/electron/preload/county/registrations-api.ts`; modify `preload/county/index.ts`
- Create: `apps/desktop/renderer/services/nemis-bridge/county/registrations-bridge.ts`; modify `county/index.ts`
- Modify: `apps/desktop/renderer/lib/ipc/county.ts`, `lib/ipc/index.test.ts`

**Interfaces:**
- Channels, all added to `COUNTY_ADMIN_CHANNELS`:

  | Channel | Args | Result | Handler |
  |---|---|---|---|
  | `COUNTY_GET_REGISTRATION_CONTEXT: 'county:get-registration-context'` | none | `SchoolRegistrationContext` | application |
  | `COUNTY_REGISTER_SCHOOLS: 'county:register-schools'` | `RegisterSchoolsRequest` | `RegisterSchoolsResult` | application |
  | `COUNTY_RESUBMIT_SCHOOL_REGISTRATION: 'county:resubmit-school-registration'` | `ResubmitSchoolRegistrationRequest` | `RegisterSchoolsResult` | application |
  | `COUNTY_DISCARD_SCHOOL_REGISTRATION: 'county:discard-school-registration'` | id | `{ discarded: boolean }` | application |
  | `COUNTY_GET_SCHOOL_REGISTRATIONS: 'county:get-school-registrations'` | `ids: string[]` | `SchoolRegistration[]` | application |
  | `COUNTY_SETTLE_SCHOOL_REGISTRATIONS: 'county:settle-school-registrations'` | `ids: string[]`, `timeoutMs: number` | `SchoolRegistration[]` | `await refresh(clamp(timeoutMs, 1_000, 30_000))`, then `app.county.getSchoolRegistrations(ids)` |

  The settle handler's `refresh` is `(t) => syncWorker.pullNow(t)`.
- `CountyApi` gains the matching six methods. The bridge exposes them. The `lib/ipc/county.ts` facade wires the five application-backed ones through `query(...)`. `settleSchoolRegistrations` is bridge-only (renderer pages call `countyBridge` directly, as Districts does for DEO).
- Validators reject:
  - non-arrays, or more than 500 schools / ids;
  - non-string `name`/`districtId`, and `source` outside `form|bulk`;
  - non-UUID ids;
  - a non-finite `timeoutMs`.

- [ ] **Step 1: Write failing tests.**
  - `registrations.test.ts` (fake `handle`, fake app, fake refresh):
    - each channel forwards and returns `res.data`;
    - settle clamps `60_000` → `30_000` and `0` → `1_000`, and reads states after refresh;
    - validators throw on a 501-item array and on `source: 'x'`.
  - `authorizeChannel.test.ts`: the six channels are COUNTY_ADMIN-only.
  - `lib/ipc/index.test.ts`: the five facade methods call the bridge.
- [ ] **Step 2: Run** those three files. Expected: FAIL.
- [ ] **Step 3: Implement** the chain. Register `registerCountyRegistrationHandlers(securedHandle, app, (t) => syncWorker.pullNow(t))` in `registrar.ts`, next to the DEO handlers.
- [ ] **Step 4: Run** the three files + `pnpm typecheck` + `pnpm lint`. Expected: PASS / 0 errors.
- [ ] **Step 5: Commit** `feat(ipc): county school registration channels`.

### Task 7: Presentation — registration ViewModel, badge and login in views

**Files:**
- Create: `packages/presentation/src/view-models/county/county-school-registration-view-model.ts` + `.test.ts`
- Modify: `view-models/county/county-schools-views.ts`, `mappers/county/county-schools-view-mapper.ts`, `factories/create-presentation-layer.ts`, `index.ts`, `view-models/county/county-schools-view-models.test.ts`
- Modify: `apps/desktop/renderer/lib/presentation/hooks/county.ts`

**Interfaces:**
- Produces:
  - `SchoolCardView` gains `syncState`, `syncError`. `SchoolDetailView` gains `registration: CountySchoolRegistrationInfo | null`. The mapper copies them through.
  - `CountySchoolRegistrationViewModel({ county, notifications })`:
    - store `{ context: AsyncState<SchoolRegistrationContext>; registration: AsyncState<SchoolRegistration>; submitting: boolean }`;
    - `loadContext(): Promise<void>` (trackQuery);
    - `loadRegistration(id: string): Promise<void>` (trackQuery; a missing id → `empty`);
    - `register(req: RegisterSchoolsRequest): Promise<RegisterSchoolsResult | null>`;
    - `resubmit(req: ResubmitSchoolRegistrationRequest): Promise<RegisterSchoolsResult | null>`;
    - `discard(id: string): Promise<boolean>`;
    - `states(ids: string[]): Promise<SchoolRegistration[]>`, returning `[]` on failure.
  - `register`/`resubmit`/`discard` set `submitting` true/false. A second call while `submitting` returns `null`/`false` without calling the service (Review Focus 1). A thrown error → `notifications.error(toPresentationError(err,'command').userMessage)` and `null`/`false`. They show **no success toast**; pages show the spec's messages.
  - Registered as `viewModels.countySchoolRegistration`; hook `useCountySchoolRegistrationViewModel`.

- [ ] **Step 1: Write failing tests** (`createTestApplication`):
  - `it('register forwards and returns the result without a success toast')`.
  - `it('a second register while the first is in flight is ignored')`: start two calls without awaiting the first. The service is called once; the second returns `null`.
  - `it('loadRegistration is empty for an unknown id')`.
  - `it('list and detail views carry syncState, syncError and registration')`.
- [ ] **Step 2: Run** the Electron runner on `packages/presentation/src/view-models/county`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same + `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(presentation): school registration view model`.

### Task 8: Renderer helpers — server-equivalent checks, settle outcome, notices diff, deps

**Files:**
- Modify: `apps/desktop/package.json` (deps `validator@13.15.26`, `react-phone-number-input@^3.4.16`, devDep `@types/validator`); run `pnpm install`
- Create in `apps/desktop/renderer/components/county/schools/registration/`:
  - `server-rules.ts` + `.test.ts`
  - `settle.ts` + `.test.ts`
  - `notices.ts` + `.test.ts`

**Interfaces:**
- `server-rules.ts` mirrors `CreateInstitutionDto`/`AdminUserDto`:
  - `emailError(email: string): string | null` — `'Required'` if blank, `'Invalid email'` unless `isEmail(email.trim())` from `validator/lib/isEmail` (the library class-validator uses).
  - `principalNameError(name: string): string | null` — after the web split (`first = parts[0]`, `last = rest || first`), `'First and last name must each be at least 2 characters'` when either is shorter than 2.
  - `establishedYearError(value: string): string | null` — non-empty and `parseInt < 1800` → `'Must be 1800 or later'`.
  - `countError(value: string): string | null` — non-empty and `parseInt < 0` → `'Cannot be negative'`.
- `settle.ts`:
  - `settleOne(r: SchoolRegistration | undefined): { kind: 'accepted'; login: PrincipalLogin | null } | { kind: 'refused'; message: string } | { kind: 'waiting' }`
  - `settleMany(rows: SchoolRegistration[]): { created: SchoolRegistration[]; failed: SchoolRegistration[]; waiting: SchoolRegistration[] }`
- `notices.ts`:
  - `registrationNotices(prev: ReadonlyMap<string, SchoolRegistrationSyncState>, next: readonly SchoolRegistration[], acknowledged: ReadonlySet<string>): { added: number; refused: number }`. Counts `pending → synced` and `pending → rejected` transitions whose id is not acknowledged.
  - `addedMessage(n) → \`${n} school${n === 1 ? '' : 's'} added: principal logins are ready.\``
  - `refusedMessage(n) → \`${n} school${n === 1 ? '' : 's'} couldn't be added\``
  - Module-level `acknowledgeRegistrations(ids: string[]): void` and `acknowledgedRegistrations(): ReadonlySet<string>`.

- [ ] **Step 1: Write failing tests:**
  - `emailError('jane@school')` → `'Invalid email'`; `emailError('jane@school.lr')` → null.
  - `principalNameError('A')` → message; `principalNameError('Ada')` → null (first=last='Ada').
  - `establishedYearError('1799')` → message; `countError('-1')` → message.
  - `settleOne` covers all three kinds.
  - `registrationNotices`: pending→synced counted, an acknowledged id ignored, synced→synced ignored.
- [ ] **Step 2: Run** the three files (Electron runner or `pnpm vitest run` — no SQLite). Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(county): registration checks, settle and notice helpers`.

### Task 9: Create School page (port) + Fix and resend

**Files:**
- Create: `apps/desktop/renderer/components/county/schools/CreateSchoolPage.tsx` + `.test.tsx`
- Modify: `apps/desktop/renderer/app/government/county/schools/create/page.tsx` (ComingSoon → `<Suspense><CreateSchoolPage /></Suspense>`)

**Interfaces:**
- Consumes:
  - `useCountySchoolRegistrationViewModel` (Task 7);
  - `countyBridge.settleSchoolRegistrations` (Task 6);
  - `server-rules`, `settle`, `acknowledgeRegistrations` (Task 8);
  - `showCredentials`, `showError` from `@nemis-desktop/ui`.

**Port rules (portal-web `create/page.tsx`):**
- Copy `STEPS`, `SchoolFormData`, `GenderRow`, `inputCls`, `checkboxCls`, all seven step bodies, `isStep1Valid` / `isStep2Valid` and the payload mapping.
- `PhoneInput` uses bundled flags: `import flags from 'react-phone-number-input/flags'` and `<PhoneInput flags={flags} …/>`.
- Districts and county come from `vm.loadContext()`. `router.push("/government/county/schools")` stays.
- **Desktop-only checks** (inline, red text under the field, web input styling plus `border-red-500`):
  - step 2 blocks Next on `emailError` / `principalNameError`;
  - step 3 shows `establishedYearError`;
  - step 4 shows `countError` per number field;
  - submit blocks while any is non-null.
  - A `code-clash` result shows under the EMIS Code field on step 1 (`This school code already exists: <existingName>`) and jumps to step 1.
- **Save:**
  1. `vm.register({ source:'form', schools:[input] })`. `no-county` → `showError("This device has not finished syncing your county yet. Connect once and try again.", "Registration Failed")`.
  2. `saved` → `const [r] = await countyBridge.settleSchoolRegistrations(ids, 5_000)`, then `settleOne(r)`:
     - **accepted:** `acknowledgeRegistrations(ids)`, `showCredentials({ email, password })` when there is a login, then go to the list;
     - **refused:** `acknowledgeRegistrations(ids)`, `vm.discard(id)`, `showError(message, "Registration Failed")`, stay on the form;
     - **waiting:** `showSuccess("Saved on this device. It will be sent when you're back online.", "Saved")`, then go to the list.
  3. Save is disabled and shows the web's spinner while submitting.
- **`?registration=<id>`:**
  - `vm.loadRegistration(id)`, then prefill from the payload. The district is kept only if it is in `context.districts`; otherwise it is left empty (Review Focus 3).
  - Save calls `vm.resubmit({ id, school })`. For a `source:'bulk'` row, merge the rebuilt input over the stored payload so `metadata.phone` / `metadata.principalName` survive. Omit enrollment/teacher stats unless any count is non-zero.
  - Then the same settle flow.
  - A row that is not found or not rejected shows `showError("This school can no longer be changed.")` and goes back to the list.

- [ ] **Step 1: Write failing tests** (RTL with a mocked `window.nemis`, following `apps/desktop/renderer/app/government/county/schools/page.test.tsx`):
  - `it('walks the seven steps and saves the web payload')`: fill steps 1-2, Save. `county.registerSchools` receives `levels`, `districtId`, `admins:[{email:'ada@school.lr',firstName:'Ada',lastName:'Doe'}]`, `metadata.enrollmentStats.grade1 = {male:0,female:0,total:0}`, `type:'SCHOOL'`, `isActive:true`.
  - `it('blocks step 2 on an invalid email and a one-letter name')`.
  - `it('shows the saved-on-device message and returns to the list when the school is still waiting')`.
  - `it('shows the principal login pop-up when the server accepts within the wait')`.
  - `it('shows the server reason and keeps the form when refused within the wait')`. Also assert discard was called.
  - `it('ignores a second Save click while saving')`. (Review Focus 1.)
  - `it('Fix and resend prefills, clears a district that no longer exists, and resubmits')`. (Review Focus 3.)
  - `it('shows a code clash under EMIS Code on step 1')`.
- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file + `pnpm typecheck` + `pnpm lint`. Expected: PASS / 0 errors.
- [ ] **Step 5: Commit** `feat(county): port Create School with offline save`.

### Task 10: List badge, detail states, Principal Login card, notices

**Files:**
- Create in `apps/desktop/renderer/components/county/schools/registration/`:
  - `SchoolRegistrationBadge.tsx` + test
  - `PrincipalLoginCard.tsx` + test
  - `SchoolRegistrationNotices.tsx` + test
- Modify: `apps/desktop/renderer/app/government/county/schools/page.tsx`, `components/county/schools/SchoolDetailPage.tsx` (+ their tests), `app/government/county/layout.tsx`

**Interfaces:**
- `SchoolRegistrationBadge({ syncState, syncError })` → null for `null`/`'synced'`.
  - Amber pill `"Waiting to sync"`: `bg-amber-100 text-amber-800`.
  - Red pill `"Couldn't be added"`: `bg-red-100 text-red-700`, with `title={syncError}`.
- `PrincipalLoginCard({ login })`: card titled `"Principal Login"`.
  - Rows `Email` / `Default Password` in `font-mono`, each with the bulk page's `CopyButton` (lift `CopyButton` into `registration/CopyButton.tsx` for reuse).
  - One line: `"Share this login with the principal. They can change the password from their dashboard."`.
- `SchoolRegistrationNotices()`:
  - Mounted once in the county layout next to `ToastHost`.
  - On each `lastSyncAt` change (`useRevalidateOnSync`), it calls `vm.states([])` and diffs it with `registrationNotices` against the previous map and `acknowledgedRegistrations()`.
  - It pushes `notifications.success(addedMessage(n))` / `notifications.warning(refusedMessage(n))`.
  - The first load only seeds the map.

**Page changes:**
- **List card:** render the badge under the school name.
- **Detail page:**
  - Show the badge in the header card.
  - For `rejected`: show the reason (`syncError`) and two buttons.
    - `"Fix and resend"` → `create/?registration=<id>`.
    - `"Discard"` → `showConfirm("Discard this school? It has not been added to NEMIS.")` → `vm.discard(id)`, then back to the list.
  - Show `PrincipalLoginCard` when `registration?.principalLogin`.

- [ ] **Step 1: Write failing tests:**
  - badge renders each state;
  - the card shows the email and password, and copy calls `navigator.clipboard.writeText`;
  - list page: a pending school shows "Waiting to sync";
  - detail: a rejected registration shows the reason + both buttons, Discard confirms then calls `discardSchoolRegistration`, a synced one shows "Principal Login";
  - notices: seeded first, then one pending→synced → toast `"1 school added: principal logins are ready."`, acknowledged ids are silent.
- [ ] **Step 2: Run** the new and changed test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them + `pnpm typecheck` + `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(county): waiting/refused badges, Principal Login card and sync notices`.

### Task 11: Stage 1 gate

- [ ] **Step 1:** In `Nemis/apps/Server`, run `npx tsc --noEmit -p .` and `npx jest src/institutions src/desktop-provisioning`. Expected: exit 0; all pass.
- [ ] **Step 2:** In the desktop repo, run `pnpm lint`, `pnpm typecheck` and `pnpm --filter @nemis-desktop/app build:renderer`. Expected: 0 errors; `/government/county/schools/create` prerendered.
- [ ] **Step 3:** Run the full suite with the Electron runner (output to a file; read the tail). Expected: only the two known pre-existing failures.

---

## Stage 2 — Bulk Import

### Task 12: Bulk Import page (port) with offline save

**Files:**
- Modify: `apps/desktop/renderer/app/government/county/schools/bulk-import/page.tsx` (ComingSoon → port) and `page.test.tsx`

**Interfaces:**
- Consumes: Task 7 VM, Task 6 `countyBridge.settleSchoolRegistrations`, Task 8 `emailError`/`principalNameError`/`settleMany`/`acknowledgeRegistrations`, Task 10 `CopyButton`.

**Port rules (portal-web `bulk-import/page.tsx`):**
- Copy as-is: `BulkRow`, `LEVEL_OPTIONS`, `emptyRow`, `parseLevels`, the 10 template headers and example row, the Districts and Reference sheets, the file name `school-import-template.xlsx`, the "example" skip, the upload drop-zone, the review table, Add Row, the Import button text and the done-step markup.
- In `validateRow`, the email branch becomes `emailError(row.email)`. Add `principalNameError` on `principalName`. District names come from `context.districts`.
- **Import:**
  1. `vm.register({ source: 'bulk', schools })`, using the web's mapping minus `code`/`countyId`.
  2. `saved` → `settleSchoolRegistrations(ids, 30_000)` → `settleMany`.
     - All waiting (offline) → the done step shows only `"N schools saved; they'll be sent when you're back online."` and the "Go to Schools List" button.
     - Otherwise → the web's done step: Submitted = rows, Created = `created.length`, Failed = `failed.length`; the credentials table comes from `created[].principalLogin`; Failed Schools come from `failed[].syncError`. Add one line `"N schools saved; they'll be sent when you're back online."` when `waiting.length > 0`.
  3. `acknowledgeRegistrations` for created and failed ids.
  4. Failed registrations are discarded (`vm.discard`). Retry Failed Rows works as on the web.
  5. Import is disabled while submitting.

- [ ] **Step 1: Write failing tests:**
  - `it('downloads the web template')`: `XLSX.writeFile` is called with sheet names `['Schools','Districts','Reference']` and headers equal to the web's 10.
  - `it('parses an upload, skips the example row and validates rows')`: an `'Invalid email'` row for `jane@school`, and an unknown district → `'Must match a district in this county'`.
  - `it('saves valid rows offline and shows the saved-on-device summary')`: the settle mock returns all pending.
  - `it('shows created, failed and logins when the server answers within the wait')`.
  - `it('Retry Failed Rows returns the refused rows to review')`.
  - `it('ignores a second Import click while saving')`. (Review Focus 1.)
- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file + `pnpm typecheck` + `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(county): port Bulk Import Schools with offline save`.

### Task 13: Full gate

- [ ] **Step 1:** Repeat Task 11 Steps 1-3. In the renderer build, `/government/county/schools/bulk-import` must also be prerendered.
- [ ] **Step 2:** Record in the ledger what Alvin still has to check in the GUI:
  - offline create → amber → reconnect → notice + Principal Login;
  - a refused school (reuse a principal email) → red → Fix and resend / Discard;
  - online create → pop-up;
  - bulk import offline and online.
