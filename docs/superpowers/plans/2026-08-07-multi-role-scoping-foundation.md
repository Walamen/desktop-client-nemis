# Multi-Role Scoping Foundation + County Schools List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the desktop client's "one device = one institution" assumption into a scope-aware model (additive, non-breaking), and prove it with one real feature: the County Admin "Schools" list.

**Architecture:** Backend already computes multi-institution scope for sync (no change needed there beyond adding a `districts` reference table). The gap is entirely in the desktop client's repository interfaces (`findFirst()` → add `findAll()`), a missing district name lookup, and wiring a real feature through application → SQLite → IPC → renderer. Every change is additive: existing School Admin/Teacher code paths and tests are untouched.

**Tech Stack:** TypeScript, NestJS + Prisma (backend), Electron + better-sqlite3 (desktop main), React + Zustand (desktop renderer), Vitest (all test suites).

## Global Constraints

- This plan spans **two separate git repositories**: `desktop-client-nemis` (this repo) and `Nemis` (sibling directory, contains `apps/Server` and `packages/types`). Tasks 1–2 operate in `Nemis`; all other tasks operate in `desktop-client-nemis`. Commit each repo separately.
- `Nemis` is currently on branch `staging` with an unrelated pre-existing uncommitted change (`apps/Server/src/connectivity.controller.ts`) — do not touch or commit that file. Branch off `staging` before starting Task 1/2 work, the same way `desktop-client-nemis` already branched off `main` to `multi-role-scoping-foundation`.
- Every new/changed repository method is **additive** — never remove or change the signature of `findFirst()`, `countAll()`, or any other existing method other users depend on.
- Follow existing patterns exactly: `guarded(...)` wrapping in SQLite repos, `invokeUseCase(...)` in use cases, `trackQuery(...)` in ViewModels, `group()`/`query()` in renderer IPC facades. Don't introduce new patterns for problems these already solve.
- No `any`. Strict TypeScript throughout (existing `tsconfig.base.json` settings apply).
- Design reference: [docs/superpowers/specs/2026-08-07-multi-role-scoping-foundation-design.md](../specs/2026-08-07-multi-role-scoping-foundation-design.md).

---

### Task 1: Backend — add `districts` to the desktop provisioning snapshot type

**Repo:** `Nemis`

**Files:**
- Modify: `Nemis/packages/types/src/desktop-provisioning.ts:63-125` (the `DesktopProvisioningData` interface)

**Interfaces:**
- Produces: `DesktopProvisioningData.districts: Record<string, unknown>[]` — consumed by Task 2 (service) and Task 4 (desktop-side type mirror).

- [ ] **Step 1: Branch off `staging`**

```bash
cd "Nemis"
git checkout -b multi-role-scoping-foundation
```

- [ ] **Step 2: Add the `districts` field**

In `desktop-provisioning.ts`, add a new field to `DesktopProvisioningData`, placed before `institutions` (districts is the parent — matches insertion-order conventions used for FK-dependent collections elsewhere in this file):

```typescript
export interface DesktopProvisioningData {
  /** County-scoped reference data (id, name, countyId) for every district that
   * owns at least one institution in this snapshot's scope. Read-only — the
   * desktop client never writes districts locally. */
  districts: Record<string, unknown>[];
  institutions: Record<string, unknown>[];
  users: Record<string, unknown>[];
  // ... (rest of the interface unchanged)
```

- [ ] **Step 3: Verify the package still builds**

Run: `cd Nemis/packages/types && npx tsc --noEmit`
Expected: no new errors (this is an additive interface field; any compile errors would come from a consumer providing an object literal without `districts` — Task 2 supplies it in the same commit, so run this check again after Task 2 instead if it fails now).

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/desktop-provisioning.ts
git commit -m "feat(types): add districts to DesktopProvisioningData

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Backend — query and return `districts` in the snapshot

**Repo:** `Nemis`

**Files:**
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts`
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`

**Interfaces:**
- Consumes: `DesktopProvisioningData.districts` (Task 1).
- Produces: `getSnapshot()`'s returned `data.districts` — every district referenced by an institution in `data.institutions`, as `{ id, name, countyId }`.

- [ ] **Step 1: Write the failing test**

Open `desktop-provisioning.service.spec.ts` and find the existing test that asserts on `snapshot.data.institutions` (the one exercising `getSnapshot` for a `COUNTY_ADMIN` or similar multi-institution scope — use whichever existing test already seeds two institutions in the same county; add to it rather than duplicating fixture setup). Add:

```typescript
    expect(snapshot.data.districts).toContainEqual({
      id: 'district-1',
      name: 'Sinkor District',
      countyId: 'county-1',
    });
```

(Adjust the district id/name/countyId literals to match whatever fixture data that test already seeds — if the existing fixture's institutions don't yet reference a district, add `districtId: 'district-1'` to one seeded institution and seed a matching `district` row via `prisma.district.create(...)` in that test's setup, following the same pattern the test already uses for `prisma.institution.create(...)`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Nemis/apps/Server && npx jest desktop-provisioning.service.spec.ts`
Expected: FAIL — `snapshot.data.districts` is `undefined` (the field doesn't exist in the response yet).

- [ ] **Step 3: Implement — query districts after the institution query resolves**

In `desktop-provisioning.service.ts`, immediately after the `] = await Promise.all([...]);` block that resolves `institution` and its siblings (around line 410, right before `const now = new Date().toISOString();`), add:

```typescript
        const districtIds = [
          ...new Set(
            institution
              .map((row) => row.districtId)
              .filter((id): id is string => id != null),
          ),
        ];
        const districts = await tx.district.findMany({
          where: { id: { in: districtIds } },
          orderBy: { id: 'asc' },
        });
```

Then add the mapped field to the object returned by the transaction (next to the existing `institutions: institution.map(...)` entry):

```typescript
          districts: districts.map((row) => ({
            id: row.id,
            name: row.name,
            countyId: row.countyId,
          })),
```

This runs inside the same `tx.$transaction(...)` callback, after institutions resolve, so it sees a consistent snapshot and requires no changes to `resolveDesktopScope`, `authorizedInstitutionIds`, or `restrictTeacherSnapshot` — a `TEACHER` device's single institution naturally yields at most one district.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Nemis/apps/Server && npx jest desktop-provisioning.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts
git commit -m "feat(desktop-provisioning): include districts in the sync snapshot

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Desktop types — mirror `districts` into the provisioning/IPC contracts

**Repo:** `desktop-client-nemis`

**Files:**
- Modify: `packages/types/src/provisioning.ts`
- Modify: `packages/types/src/dashboard.ts`
- Modify: `packages/types/src/ipc.ts`
- Modify: `packages/types/src/api.ts`
- Test: `packages/types/src/desktop-portals.test.ts` (no change needed — confirms nothing here breaks `DESKTOP_PORTAL_ROLES`/`DESKTOP_PORTALS`, which this task doesn't touch)

**Interfaces:**
- Produces: `ProvisioningCollection` now includes `'districts'`; `InstitutionSummaryResult`; `IpcChannels.INSTITUTION_LIST`; `IpcContract['institution:list']`; `InstitutionApi`; `NemisApi.institution`.
- Consumes: nothing new (this is the desktop-side hand-synced mirror of Task 1/2, per the existing convention documented in `packages/types/src/enums.ts`'s file header).

- [ ] **Step 1: Add `'districts'` to `PROVISIONING_COLLECTIONS`**

In `provisioning.ts`, add `'districts'` as the **first** entry (it has no FK dependency on anything else, and `institutions.districtId` will reference it, so it must import/delete in the position matching its role as a parent table — first-in on import, last-out on delete, exactly mirroring how `institutions` itself is already first):

```typescript
export const PROVISIONING_COLLECTIONS = [
  'districts', 'institutions', 'users', 'userOrganizations', 'academicYears', 'terms',
  'classes', 'subjects', 'classSubjects', 'students', 'guardians',
  'studentGuardians', 'enrollments', 'attendance', 'staff', 'staffDirectory', 'institutionAdmin', 'subjectTeachers',
  'classTeachers', 'classSubjectTeachers',
  'timetableEntries',
  'studentTransfers',
  'institutionGradingConfigs', 'gradingPeriods', 'assessmentTemplates', 'assessments', 'gradeEntryWindows',
  'gradeEntryWindowClasses', 'grades',
  'feeRules', 'feeObligations', 'feePayments',
  'announcements', 'conversations', 'messages', 'userNotifications',
  'reports', 'alerts',
  'assignments', 'assignmentSubmissions', 'classResources',
] as const;
```

- [ ] **Step 2: Add `InstitutionSummaryResult` to `dashboard.ts`**

Add next to `SchoolSummaryResult`:

```typescript
export interface InstitutionSummaryResult {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  districtId?: string;
  districtName?: string;
  approvalStatus: ApprovalStatus;
  studentCount: number;
}
```

- [ ] **Step 3: Add the IPC channel + contract entry**

In `ipc.ts`, add to the `IpcChannels` const (near `SCHOOL_GET_SUMMARY`):

```typescript
  INSTITUTION_LIST: 'institution:list',
```

Add to the `IpcContract` interface (near `'school:get-summary'`), and add `InstitutionSummaryResult` to that file's existing import from `./dashboard`:

```typescript
  'institution:list': { args: []; result: InstitutionSummaryResult[] };
```

- [ ] **Step 4: Add `InstitutionApi` to `api.ts`**

Add `InstitutionSummaryResult` to the existing `./dashboard` import at the top of the file, then add next to `SchoolApi`:

```typescript
export interface InstitutionApi {
  /** Every institution present in this device's local database — for
   * School Admin/Teacher that's their own one institution; for County/DEO/
   * Ministry it's every institution the backend scoped into their sync
   * snapshot (see Nemis/apps/Server desktop-provisioning.service.ts). No
   * role branching needed here: the local data is already scoped. */
  list(): Promise<InstitutionSummaryResult[]>;
}
```

Add `institution: InstitutionApi;` to the `NemisApi` interface, next to `school: SchoolApi;`.

- [ ] **Step 5: Run the package's typecheck and existing tests**

Run: `cd packages/types && npx vitest run`
Expected: PASS — this task only adds new fields/types, nothing existing changes shape.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/provisioning.ts packages/types/src/dashboard.ts packages/types/src/ipc.ts packages/types/src/api.ts
git commit -m "feat(types): add districts collection and institution:list IPC contract

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Electron — `districts` migration and table registration

**Repo:** `desktop-client-nemis`

**Files:**
- Create: `apps/desktop/electron/database/migrations/021-create-districts-table.ts`
- Modify: `apps/desktop/electron/database/migrations/registry.ts`
- Modify: `apps/desktop/electron/database/schema/tableNames.ts`

**Interfaces:**
- Produces: SQLite table `districts (id, name, countyId)`; `TableNames.districts`.

- [ ] **Step 1: Create the migration**

```typescript
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County-scoped reference data (id, name, countyId) for district name
 * lookups — e.g. the County Admin schools list showing which district each
 * institution belongs to. Read-only: never written locally, so it carries no
 * outbox triggers, matching institution_admin (migration 015) and
 * staff_directory (migration 014). */
export const createDistrictsTable: Migration = {
  version: 21,
  name: 'create-districts-table',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE districts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        countyId TEXT NOT NULL
      );
      CREATE INDEX idx_districts_county ON districts (countyId);
    `);
  },
};
```

- [ ] **Step 2: Register it**

In `registry.ts`, add the import and append to the `migrations` array (after `addAssignmentSyncTracking`, the current last entry):

```typescript
import { createDistrictsTable } from './021-create-districts-table';
```

```typescript
  addAssignmentSyncTracking,
  createDistrictsTable,
];
```

- [ ] **Step 3: Add the table name constant**

In `tableNames.ts`, add `districts: 'districts',` next to `institutions: 'institutions',`.

- [ ] **Step 4: Verify migrations run cleanly**

Run: `npx vitest run apps/desktop/electron/database/migrations`
Expected: PASS — existing migration test suites run the full registry against a fresh database; a new table with no data dependency can't break them.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/database/migrations/021-create-districts-table.ts apps/desktop/electron/database/migrations/registry.ts apps/desktop/electron/database/schema/tableNames.ts
git commit -m "feat(db): add districts reference table (migration 021)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Electron — import `districts` in `ProvisioningImporter`

**Repo:** `desktop-client-nemis`

**Files:**
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts`
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`

**Interfaces:**
- Consumes: `TableNames.districts` (Task 4), `PROVISIONING_COLLECTIONS` including `'districts'` (Task 3).

- [ ] **Step 1: Write the failing test**

In `ProvisioningImporter.test.ts`, add a new fixture and test after the existing `BASE_DATA`-based tests (following the exact pattern `ASSESSMENT_FK_DATA` already uses for testing an FK dependency):

```typescript
const DISTRICT_FK_DATA: Partial<ProvisioningData> = {
  ...BASE_DATA,
  districts: [{ id: 'district-1', name: 'Sinkor District', countyId: 'county-1' }],
  institutions: [{ ...BASE_DATA.institutions![0], districtId: 'district-1' }],
};
```

```typescript
  it('imports districts and links institutions to them', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf(DISTRICT_FK_DATA), CONTEXT);
    expect(countRows('districts')).toBe(1);
    expect(
      (manager.connection.prepare('SELECT districtId FROM institutions WHERE id=?').get('school-1') as { districtId: string }).districtId,
    ).toBe('district-1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`
Expected: FAIL — `SPECS` has no `districts` entry, so `upsertRows` throws (or the table doesn't exist error, depending on which runs first — either way, a failure).

- [ ] **Step 3: Add the table spec**

In `ProvisioningImporter.ts`, add to `SPECS`, as the **first** entry (matches its position in `PROVISIONING_COLLECTIONS` from Task 3):

```typescript
const SPECS: Record<ProvisioningCollection, TableSpec> = {
  districts: spec('districts', ['id', 'name', 'countyId']),
  institutions: spec('institutions', ['id','code','name','type','ownership','countyId','districtId','approvalStatus','street','communityTown','latitude','longitude','rejectionReason','profile','version','updatedAt','lastModifiedBy']),
  // ...(unchanged)
```

- [ ] **Step 4: Add the dependency check**

In `verifyDatabase`'s `dependencies` array, add as the first entry:

```typescript
  const dependencies = [
    ['institutions', 'districtId', 'districts'],
    ['academic_years', 'institutionId', 'institutions'],
    // ...(unchanged)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`
Expected: PASS (all tests, including the pre-existing ones — `districts: []` is auto-filled by `snapshotOf` for every test that doesn't override it, so nothing else breaks).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/provisioning/ProvisioningImporter.test.ts
git commit -m "feat(provisioning): import districts and verify institution->district FK

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Domain — expose `countyId`/`districtId` on `UserOrganization`

**Repo:** `desktop-client-nemis`

**Files:**
- Modify: `packages/domain/src/identity/entities/user-organization.ts`
- Modify: `packages/domain/src/identity/identity.test.ts`

**Interfaces:**
- Produces: `UserOrganization.countyId: string | undefined`, `UserOrganization.districtId: string | undefined`.

- [ ] **Step 1: Write the failing test**

Append to `identity.test.ts`:

```typescript
describe('UserOrganization', () => {
  it('exposes countyId and districtId alongside institutionId', () => {
    const org = UserOrganization.reconstitute({
      id: 'org-2',
      role: SystemRole.COUNTY_ADMIN,
      countyId: 'county-1',
      districtId: 'district-1',
      isActive: true,
    });
    expect(org.countyId).toBe('county-1');
    expect(org.districtId).toBe('district-1');
  });

  it('leaves countyId and districtId undefined when not provided', () => {
    const org = UserOrganization.reconstitute({
      id: 'org-3',
      role: SystemRole.TEACHER,
      institutionId: 'inst-1',
      isActive: true,
    });
    expect(org.countyId).toBeUndefined();
    expect(org.districtId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/domain && npx vitest run identity.test.ts`
Expected: FAIL — `Property 'countyId' does not exist on type 'UserOrganization'`.

- [ ] **Step 3: Add the getters**

In `user-organization.ts`, add next to the existing `institutionId` getter:

```typescript
  get countyId(): string | undefined {
    return this.#props.countyId;
  }
  get districtId(): string | undefined {
    return this.#props.districtId;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/domain && npx vitest run identity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/identity/entities/user-organization.ts packages/domain/src/identity/identity.test.ts
git commit -m "feat(domain): expose countyId/districtId on UserOrganization

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Application — `IInstitutionRepository.findAll()`

**Repo:** `desktop-client-nemis`

**Files:**
- Modify: `packages/application/src/interfaces/institution/institution-repository.ts`
- Modify: `packages/application/src/testing/institution/in-memory-institution-repository.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.test.ts`

**Interfaces:**
- Produces: `IInstitutionRepository.findAll(): Institution[]` — consumed by Task 10's `ListInstitutionsUseCase`.

- [ ] **Step 1: Write the failing test (SQLite adapter)**

In `SqliteInstitutionRepository.test.ts`, add:

```typescript
  it('findAll returns every institution, ordered by name', () => {
    seedInstitution(test.context.connection, 'inst-2');
    test.context.connection.exec(`UPDATE institutions SET name='Zorzor Elementary' WHERE id='inst-2'`);
    seedInstitution(test.context.connection, 'inst-1');
    const names = repo.findAll().map((i) => i.name);
    expect(names).toEqual(['Monrovia Central', 'Zorzor Elementary']);
  });
```

(`seedInstitution` inserts `name='Monrovia Central'` for every id per the existing helper — the `UPDATE` line above gives the second row a distinct, alphabetically-later name so ordering is actually exercised.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.test.ts`
Expected: FAIL — `repo.findAll is not a function`.

- [ ] **Step 3: Update the interface**

In `institution-repository.ts`:

```typescript
import type { Institution } from '@nemis-desktop/domain';

export interface IInstitutionRepository {
  findById(id: string): Institution | null;
  /** The single institution this install manages — valid for School Admin
   * and Teacher devices, which only ever hold one institution's data. */
  findFirst(): Institution | null;
  /** Every institution present in this device's local database, ordered by
   * name. For School Admin/Teacher this returns the same one row as
   * findFirst(); for County/DEO/Ministry it returns every institution the
   * backend scoped into this device's sync snapshot. */
  findAll(): Institution[];
}
```

- [ ] **Step 4: Implement in the SQLite adapter**

In `SqliteInstitutionRepository.ts`, add next to `findFirst()`:

```typescript
  findAll(): Institution[] {
    return guarded('SqliteInstitutionRepository.findAll', () => {
      const rows = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.institutions} ORDER BY name ASC, id ASC`)
        .all() as InstitutionRow[];
      return rows.map(toInstitution);
    });
  }
```

- [ ] **Step 5: Implement in the in-memory fake**

In `in-memory-institution-repository.ts`, add:

```typescript
  findAll(): Institution[] {
    return [...this.store.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full application package suite to confirm nothing else broke**

Run: `cd packages/application && npx vitest run`
Expected: PASS — `findAll` is additive; every existing test still only calls `findFirst`/`findById`.

- [ ] **Step 8: Commit**

```bash
git add packages/application/src/interfaces/institution/institution-repository.ts packages/application/src/testing/institution/in-memory-institution-repository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.test.ts
git commit -m "feat(application): add IInstitutionRepository.findAll()

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Application — `IDistrictRepository` (new port)

**Repo:** `desktop-client-nemis`

**Files:**
- Create: `packages/application/src/interfaces/institution/district-repository.ts`
- Modify: `packages/application/src/interfaces/institution/index.ts`
- Create: `packages/application/src/testing/institution/in-memory-district-repository.ts`
- Modify: `packages/application/src/testing/institution/index.ts`
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictRepository.ts`
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictRepository.test.ts`

**Interfaces:**
- Produces: `IDistrictRepository.findAll(): DistrictRef[]` where `DistrictRef = { id: string; name: string; countyId: string }` — consumed by Task 10.

- [ ] **Step 1: Write the failing test (SQLite adapter)**

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteDistrictRepository } from './SqliteDistrictRepository';

describe('SqliteDistrictRepository', () => {
  let test: TestContext;
  let repo: SqliteDistrictRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteDistrictRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('returns an empty array when no districts have been synced', () => {
    expect(repo.findAll()).toEqual([]);
  });

  it('findAll returns every district', () => {
    test.context.connection
      .prepare(`INSERT INTO districts (id, name, countyId) VALUES (?, ?, ?)`)
      .run('district-1', 'Sinkor District', 'county-1');
    expect(repo.findAll()).toEqual([{ id: 'district-1', name: 'Sinkor District', countyId: 'county-1' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictRepository.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Create the application-layer interface**

```typescript
export interface DistrictRef {
  readonly id: string;
  readonly name: string;
  readonly countyId: string;
}

export interface IDistrictRepository {
  /** Every district present in this device's local database — read-only
   * reference data, synced alongside institutions (see
   * Nemis/apps/Server desktop-provisioning.service.ts). */
  findAll(): DistrictRef[];
}
```

Add `export * from './district-repository';` to `packages/application/src/interfaces/institution/index.ts`.

- [ ] **Step 4: Create the in-memory fake**

```typescript
import type { DistrictRef, IDistrictRepository } from '../../interfaces/institution/district-repository';

export class InMemoryDistrictRepository implements IDistrictRepository {
  readonly store = new Map<string, DistrictRef>();
  findAll(): DistrictRef[] {
    return [...this.store.values()];
  }
}
```

Add `export * from './in-memory-district-repository';` to `packages/application/src/testing/institution/index.ts`.

- [ ] **Step 5: Create the SQLite adapter**

```typescript
import type { DistrictRef, IDistrictRepository } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

/** Read-only SQLite adapter for IDistrictRepository. */
export class SqliteDistrictRepository implements IDistrictRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findAll(): DistrictRef[] {
    return guarded('SqliteDistrictRepository.findAll', () => {
      return this.#statements
        .get(`SELECT id, name, countyId FROM ${TableNames.districts} ORDER BY name ASC`)
        .all() as DistrictRef[];
    });
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictRepository.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/interfaces/institution/district-repository.ts packages/application/src/interfaces/institution/index.ts packages/application/src/testing/institution/in-memory-district-repository.ts packages/application/src/testing/institution/index.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteDistrictRepository.test.ts
git commit -m "feat(application): add IDistrictRepository port + SQLite adapter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Application — `IStudentRepository.countByInstitution()`

**Repo:** `desktop-client-nemis`

**Files:**
- Modify: `packages/application/src/interfaces/students/student-repository.ts`
- Modify: `packages/application/src/testing/students/in-memory-student-repository.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts`
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`

**Interfaces:**
- Produces: `IStudentRepository.countByInstitution(): { institutionId: string; studentCount: number }[]` — consumed by Task 10. **This is the method the plan's regression test (Task 17) depends on to prove multi-institution rows stay separated.**

- [ ] **Step 1: Write the failing test (SQLite adapter)**

In `SqliteStudentRepository.test.ts`, find the existing seed helper for students (or write inline inserts following the same column list as `findPage`'s tests) and add:

```typescript
  it('countByInstitution groups active students by institution, ignoring inactive ones', () => {
    insertStudent(test.context.connection, { id: 's1', institutionId: 'inst-1', isActive: 1 });
    insertStudent(test.context.connection, { id: 's2', institutionId: 'inst-1', isActive: 1 });
    insertStudent(test.context.connection, { id: 's3', institutionId: 'inst-2', isActive: 1 });
    insertStudent(test.context.connection, { id: 's4', institutionId: 'inst-2', isActive: 0 });
    const counts = repo.countByInstitution();
    expect(counts).toContainEqual({ institutionId: 'inst-1', studentCount: 2 });
    expect(counts).toContainEqual({ institutionId: 'inst-2', studentCount: 1 });
  });
```

(Use whatever this test file's existing insert helper is named/shaped — mirror the pattern already used by the neighboring `countByGradeLevel`/`countByGender` tests in the same file exactly, including default column values for the required NOT NULL columns like `admissionNumber`, `dateOfBirth`, `gender`, `firstName`, `lastName`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
Expected: FAIL — `repo.countByInstitution is not a function`.

- [ ] **Step 3: Update the interface**

In `student-repository.ts`, add next to `countByGender`:

```typescript
  /** Active-student counts grouped by institution — the query that would
   * have silently mixed institutions together under the old "one device =
   * one institution" assumption. */
  countByInstitution(): { institutionId: string; studentCount: number }[];
```

- [ ] **Step 4: Implement in the SQLite adapter**

In `SqliteStudentRepository.ts`, add next to `countByGender`:

```typescript
  countByInstitution(): { institutionId: string; studentCount: number }[] {
    return guarded('SqliteStudentRepository.countByInstitution', () => this.#statements.get(`SELECT institutionId, COUNT(*) AS studentCount FROM ${TableNames.students} WHERE isActive = 1 GROUP BY institutionId`).all() as { institutionId: string; studentCount: number }[]);
  }
```

- [ ] **Step 5: Implement in the in-memory fake**

In `in-memory-student-repository.ts`, add:

```typescript
  countByInstitution(): { institutionId: string; studentCount: number }[] {
    const counts = new Map<string, number>();
    for (const s of this.store.values()) {
      if (!s.isActive) continue;
      counts.set(s.institutionId, (counts.get(s.institutionId) ?? 0) + 1);
    }
    return [...counts].map(([institutionId, studentCount]) => ({ institutionId, studentCount }));
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/interfaces/students/student-repository.ts packages/application/src/testing/students/in-memory-student-repository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts
git commit -m "feat(application): add IStudentRepository.countByInstitution()

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Application — `ListInstitutionsUseCase`

**Repo:** `desktop-client-nemis`

**Files:**
- Modify: `packages/application/src/dto/institution/institution-dto.ts`
- Modify: `packages/application/src/mappers/institution/institution-mapper.ts`
- Create: `packages/application/src/use-cases/institution/list-institutions.ts`
- Create: `packages/application/src/use-cases/institution/list-institutions.test.ts`
- Modify: `packages/application/src/services/institution-application-service.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**
- Consumes: `IInstitutionRepository.findAll()` (Task 7), `IDistrictRepository.findAll()` (Task 8), `IStudentRepository.countByInstitution()` (Task 9).
- Produces: `InstitutionSummaryOutput`; `ListInstitutionsUseCase`; `InstitutionApplicationService.listInstitutions()`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { ListInstitutionsUseCase } from './list-institutions';
import { InMemoryInstitutionRepository } from '../../testing/institution/in-memory-institution-repository';
import { InMemoryDistrictRepository } from '../../testing/institution/in-memory-district-repository';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { RecordingLogger } from '../../testing';

function institution(id: string, name: string, districtId?: string) {
  return Institution.reconstitute({
    id, code: id.toUpperCase(), name,
    type: InstitutionType.SCHOOL, ownership: OwnershipType.GOVERNMENT,
    countyId: 'county-1', districtId,
    approvalStatus: ApprovalStatus.APPROVED,
    version: 1, updatedAt: '2026-08-07T00:00:00.000Z',
  });
}

describe('ListInstitutionsUseCase', () => {
  it('joins institutions with district names and student counts', async () => {
    const institutions = new InMemoryInstitutionRepository();
    institutions.store.set('inst-1', institution('inst-1', 'Monrovia Central', 'district-1'));
    institutions.store.set('inst-2', institution('inst-2', 'Zorzor Elementary'));
    const districts = new InMemoryDistrictRepository();
    districts.store.set('district-1', { id: 'district-1', name: 'Sinkor District', countyId: 'county-1' });
    const students = new InMemoryStudentRepository();
    // countByInstitution is derived from seeded Student aggregates elsewhere;
    // here we exercise the use case's join logic directly against a stubbed
    // repository method instead of constructing full Student aggregates.
    students.countByInstitution = () => [{ institutionId: 'inst-1', studentCount: 42 }];

    const useCase = new ListInstitutionsUseCase({ institutions, districts, students, logger: new RecordingLogger() });
    const res = await useCase.execute({});

    expect(res.data).toHaveLength(2);
    const monrovia = res.data!.find((i) => i.id === 'inst-1');
    expect(monrovia).toMatchObject({
      name: 'Monrovia Central', districtId: 'district-1', districtName: 'Sinkor District', studentCount: 42,
    });
    const zorzor = res.data!.find((i) => i.id === 'inst-2');
    expect(zorzor).toMatchObject({ name: 'Zorzor Elementary', districtId: undefined, districtName: undefined, studentCount: 0 });
  });

  it('returns an empty list when no institutions have synced yet', async () => {
    const useCase = new ListInstitutionsUseCase({
      institutions: new InMemoryInstitutionRepository(),
      districts: new InMemoryDistrictRepository(),
      students: new InMemoryStudentRepository(),
      logger: new RecordingLogger(),
    });
    expect((await useCase.execute({})).data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/application && npx vitest run use-cases/institution/list-institutions.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Add the output DTO**

In `institution-dto.ts`, add next to `InstitutionProfileOutput`:

```typescript
export interface InstitutionSummaryOutput {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  districtId?: string;
  districtName?: string;
  approvalStatus: ApprovalStatus;
  studentCount: number;
}
```

- [ ] **Step 4: Add the mapper**

In `institution-mapper.ts`, add:

```typescript
export function toInstitutionSummaryOutput(
  institution: Institution,
  districtName: string | undefined,
  studentCount: number,
): InstitutionSummaryOutput {
  return {
    id: institution.id,
    code: institution.code.value,
    name: institution.name,
    type: institution.type,
    ownership: institution.ownership,
    districtId: institution.districtId,
    districtName,
    approvalStatus: institution.approvalStatus,
    studentCount,
  };
}
```

Note: `Institution` doesn't currently expose a `districtId` getter (only `countyId`/`districtId` live in its private state — check `packages/domain/src/institution/entities/institution.ts`). Add the getter there first if missing:

```typescript
  get districtId(): string | undefined {
    return this.#state.districtId;
  }
```

- [ ] **Step 5: Implement the use case**

```typescript
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { InstitutionSummaryOutput } from '../../dto/institution/institution-dto';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';
import type { IDistrictRepository } from '../../interfaces/institution/district-repository';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toInstitutionSummaryOutput } from '../../mappers/institution/institution-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface ListInstitutionsDeps {
  institutions: IInstitutionRepository;
  districts: IDistrictRepository;
  students: IStudentRepository;
  logger: IAppLogger;
}

export class ListInstitutionsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<InstitutionSummaryOutput[]>
> {
  constructor(private readonly deps: ListInstitutionsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<InstitutionSummaryOutput[]>> {
    return invokeUseCase('ListInstitutions', this.deps.logger, async () => {
      const institutions = this.deps.institutions.findAll();
      const districtNameById = new Map(this.deps.districts.findAll().map((d) => [d.id, d.name]));
      const countByInstitutionId = new Map(
        this.deps.students.countByInstitution().map((c) => [c.institutionId, c.studentCount]),
      );
      const rows = institutions.map((institution) =>
        toInstitutionSummaryOutput(
          institution,
          institution.districtId ? districtNameById.get(institution.districtId) : undefined,
          countByInstitutionId.get(institution.id) ?? 0,
        ),
      );
      return ok(rows);
    });
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/application && npx vitest run use-cases/institution/list-institutions.test.ts`
Expected: PASS

- [ ] **Step 7: Wire into `InstitutionApplicationService`**

In `institution-application-service.ts`:

```typescript
import type { ApplicationResponse } from '../core/response';
import type {
  GradingConfigOutput,
  InstitutionProfileOutput,
  InstitutionSummaryOutput,
  UpdateGradingConfigDto,
} from '../dto/institution/institution-dto';
import type { GetInstitutionProfileUseCase } from '../use-cases/institution/get-institution-profile';
import type { UpdateGradingConfigUseCase } from '../use-cases/institution/update-grading-config';
import type { GetCurrentSchoolUseCase } from '../use-cases/institution/get-current-school';
import type { ListInstitutionsUseCase } from '../use-cases/institution/list-institutions';

export interface InstitutionApplicationServiceDeps {
  getProfile: GetInstitutionProfileUseCase;
  updateGradingConfig: UpdateGradingConfigUseCase;
  getCurrentSchool: GetCurrentSchoolUseCase;
  listInstitutions: ListInstitutionsUseCase;
}

export class InstitutionApplicationService {
  constructor(private readonly deps: InstitutionApplicationServiceDeps) {}
  getProfile(query: {
    institutionId: string;
  }): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.deps.getProfile.execute(query);
  }
  updateGradingConfig(
    dto: UpdateGradingConfigDto,
  ): Promise<ApplicationResponse<GradingConfigOutput>> {
    return this.deps.updateGradingConfig.execute(dto);
  }
  getCurrentSchool(): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.deps.getCurrentSchool.execute({});
  }
  listInstitutions(): Promise<ApplicationResponse<InstitutionSummaryOutput[]>> {
    return this.deps.listInstitutions.execute({});
  }
}
```

- [ ] **Step 8: Add barrel exports**

In `packages/application/src/index.ts`, add next to the existing `export * from './use-cases/institution/get-current-school';` line:

```typescript
export * from './use-cases/institution/list-institutions';
```

(`InstitutionSummaryOutput` and `toInstitutionSummaryOutput` are already covered by the existing wildcard exports of `./dto/institution/institution-dto` and `./mappers/institution/institution-mapper`.)

- [ ] **Step 9: Run the full application package suite**

Run: `cd packages/application && npx vitest run`
Expected: FAIL at this point — `InstitutionApplicationServiceDeps` now requires `listInstitutions`, but nothing constructs it yet. This is expected; Task 11 wires the DI container. Confirm the *only* failures are compile/construction errors in `create-application-layer.ts`/`create-application-layer.test.ts`, not in `list-institutions.test.ts` or any other pre-existing test.

- [ ] **Step 10: Commit**

```bash
git add packages/application/src/dto/institution/institution-dto.ts packages/application/src/mappers/institution/institution-mapper.ts packages/application/src/use-cases/institution/list-institutions.ts packages/application/src/use-cases/institution/list-institutions.test.ts packages/application/src/services/institution-application-service.ts packages/application/src/index.ts packages/domain/src/institution/entities/institution.ts
git commit -m "feat(application): add ListInstitutionsUseCase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Application — wire `districts` and `ListInstitutionsUseCase` into the DI container

**Repo:** `desktop-client-nemis`

**Files:**
- Modify: `packages/application/src/factories/create-application-layer.ts`
- Modify: `packages/application/src/factories/create-application-layer.test.ts`
- Modify: `packages/presentation/src/testing/create-test-application.ts`
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts`
- Modify: `apps/desktop/electron/data/adapters/createApplicationComposition.ts`

**Interfaces:**
- Consumes: everything from Tasks 7–10.
- Produces: `ApplicationPorts.districts: IDistrictRepository` (new required port); `ApplicationLayer.institution.listInstitutions()` now callable end-to-end from both in-memory-fake and real-SQLite composition roots.

- [ ] **Step 1: Update `create-application-layer.ts`**

Add the import:

```typescript
import type { IDistrictRepository } from '../interfaces/institution/district-repository';
```

```typescript
import { ListInstitutionsUseCase } from '../use-cases/institution/list-institutions';
```

Add `districts: IDistrictRepository;` to `ApplicationPorts`, next to `institutions: IInstitutionRepository;`.

Update the `institution` construction:

```typescript
  const institution = new InstitutionApplicationService({
    getProfile: new GetInstitutionProfileUseCase({ institutions: ports.institutions, logger }),
    updateGradingConfig: new UpdateGradingConfigUseCase({
      configs: ports.gradingConfigs,
      unitOfWork,
      logger,
    }),
    getCurrentSchool: new GetCurrentSchoolUseCase({ institutions: ports.institutions, logger }),
    listInstitutions: new ListInstitutionsUseCase({
      institutions: ports.institutions,
      districts: ports.districts,
      students: ports.students,
      logger,
    }),
  });
```

- [ ] **Step 2: Update `create-application-layer.test.ts`**

Add `districts: new InMemoryDistrictRepository(),` next to the existing `institutions: new InMemoryInstitutionRepository(),` line, and add `InMemoryDistrictRepository` to that file's import from `@nemis-desktop/application`'s testing exports (or wherever it currently imports `InMemoryInstitutionRepository` from).

Run: `cd packages/application && npx vitest run factories/create-application-layer.test.ts`
Expected: PASS (this is a compile-fix, not new behavior — confirm it now compiles and passes).

- [ ] **Step 3: Update `create-test-application.ts` (presentation package)**

Add `InMemoryDistrictRepository` to the import list, add `districts: InMemoryDistrictRepository;` to `TestPorts`, and add `districts: new InMemoryDistrictRepository(),` to the constructed `ports` object.

Run: `cd packages/presentation && npx vitest run`
Expected: PASS (same reasoning — this unblocks every presentation-layer test that calls `createTestApplication()`, none of which touch `districts` behavior, so none should change outcome).

- [ ] **Step 4: Wire the real SQLite adapter into `createDataLayer.ts`**

Add the import:

```typescript
import { SqliteDistrictRepository } from '../repositories/sqlite/business/SqliteDistrictRepository';
```

Add `districts: IDistrictRepository;` to `DataLayer['repositories']` (add `IDistrictRepository` to the top-of-file type import from `@nemis-desktop/application`).

Add `const districts = new SqliteDistrictRepository(context);` next to `const institutions = new SqliteInstitutionRepository(context);`, and add `districts,` to the returned `repositories` object next to `institutions,`.

- [ ] **Step 5: Wire the port into `createApplicationComposition.ts`**

Add `IDistrictRepository` to the top-of-file type import from `@nemis-desktop/application`.

Add `districts: dataLayer.repositories.districts,` next to `institutions: dataLayer.repositories.institutions,` in the constructed `ports` object.

- [ ] **Step 6: Run the full desktop electron test suite**

Run: `npx vitest run apps/desktop/electron`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/application/src/factories/create-application-layer.ts packages/application/src/factories/create-application-layer.test.ts packages/presentation/src/testing/create-test-application.ts apps/desktop/electron/data/factories/createDataLayer.ts apps/desktop/electron/data/adapters/createApplicationComposition.ts
git commit -m "feat(application): wire IDistrictRepository and ListInstitutionsUseCase through DI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Electron IPC — `institution:list` handler

**Repo:** `desktop-client-nemis`

**Files:**
- Create: `apps/desktop/electron/ipc/handlers/shared/institutions.ts`
- Modify: `apps/desktop/electron/ipc/registrar.ts`
- Test: `apps/desktop/electron/ipc/handlers/dashboard-handlers.test.ts` pattern — create `apps/desktop/electron/ipc/handlers/shared/institutions.test.ts`

**Interfaces:**
- Consumes: `ApplicationLayer.institution.listInstitutions()` (Task 11), `IpcChannels.INSTITUTION_LIST` (Task 3).
- Produces: registered IPC handler for `'institution:list'`.

This handler lives in `shared/` (not `school-admin/` or `county/`) because — per the design spec — it needs no role branching: the local database is already scoped to whatever the backend authorized for this device's role, so the exact same handler is correct for School Admin, Teacher, County, DEO, and Ministry alike.

- [ ] **Step 1: Write the failing test**

Follow the exact structure of an existing handler test — read `apps/desktop/electron/ipc/handlers/school-admin/academic-foundation-handlers.test.ts` first for the harness pattern (mock `ApplicationLayer`, a recording `IpcHandle`, call the register function, invoke the registered handler, assert on the call and the returned value). Then write:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@nemis-desktop/types';
import { registerInstitutionHandlers } from './institutions';

describe('registerInstitutionHandlers', () => {
  it('registers institution:list backed by app.institution.listInstitutions', async () => {
    const calls = new Map<string, (...args: unknown[]) => unknown>();
    const handle = vi.fn((channel: string, _validate: unknown, handler: (...args: unknown[]) => unknown) => {
      calls.set(channel, handler);
    });
    const listInstitutions = vi.fn().mockResolvedValue({ data: [{ id: 'inst-1' }] });
    const app = { institution: { listInstitutions } } as never;

    registerInstitutionHandlers(handle as never, app);
    const result = await calls.get(IpcChannels.INSTITUTION_LIST)!();

    expect(listInstitutions).toHaveBeenCalledOnce();
    expect(result).toEqual([{ id: 'inst-1' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/electron/ipc/handlers/shared/institutions.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the handler**

```typescript
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerInstitutionHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.INSTITUTION_LIST, assertNoArgs, async () => {
    const res = await app.institution.listInstitutions();
    return res.data;
  });
}
```

- [ ] **Step 4: Register it in `registrar.ts`**

Add the import next to `registerSchoolHandlers`:

```typescript
import { registerInstitutionHandlers } from '@app/ipc/handlers/shared/institutions';
```

Add the call in the "shared across every portal" block (next to `registerAttendanceHandlers`):

```typescript
  registerInstitutionHandlers(securedHandle, app);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run apps/desktop/electron/ipc/handlers/shared/institutions.test.ts`
Expected: PASS

- [ ] **Step 6: No `authorizeChannel.ts` change needed — verify explicitly**

`INSTITUTION_LIST` is not a mutation and isn't institution-admin-exclusive data, so it correctly falls through to the "every other channel stays open to any authenticated role" default at the bottom of `authorizeChannel.ts`. Run the existing suite to confirm nothing needs updating there:

Run: `npx vitest run apps/desktop/electron/ipc/authorizeChannel.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/ipc/handlers/shared/institutions.ts apps/desktop/electron/ipc/handlers/shared/institutions.test.ts apps/desktop/electron/ipc/registrar.ts
git commit -m "feat(ipc): register institution:list handler (shared, role-agnostic)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Preload — expose `window.nemis.institution.list()`

**Repo:** `desktop-client-nemis`

**Files:**
- Create: `apps/desktop/electron/preload/shared/institution-api.ts`
- Modify: `apps/desktop/electron/preload/shared/index.ts`
- Modify: `apps/desktop/renderer/services/nemis-bridge/school-admin/institution-bridge.ts`
- Modify: `apps/desktop/renderer/lib/ipc/school-admin.ts`

**Interfaces:**
- Consumes: `IpcChannels.INSTITUTION_LIST` (Task 3), `institutionBridge` (renderer-side bridge object).
- Produces: `window.nemis.institution.list()`; `schoolAdminIpc.institution.listInstitutions`.

`InstitutionApi` is a new top-level `NemisApi` key with no existing preload file (`preload/school-admin/school-api.ts` only implements the older, narrower `SchoolApi`), so its contextBridge implementation goes in `preload/shared/` — matching where the IPC handler itself was registered in Task 12, for the same role-agnostic reason.

- [ ] **Step 1: Add the preload API (main-process-facing contextBridge side)**

Create `institution-api.ts` in `preload/shared/`:

```typescript
import { IpcChannels } from '@nemis-desktop/types';
import type { InstitutionApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const institutionApi: InstitutionApi = {
  list: () => invoke(IpcChannels.INSTITUTION_LIST),
};
```

In `preload/shared/index.ts`, add the export and include it in whatever object this file assembles for `sharedApi` (open the file to find the exact assembly — it follows the same `export * from './x-api'; import { xApi } from './x-api';` pattern as `preload/school-admin/index.ts`). Add:

```typescript
export * from './institution-api';
```

and add `institution: institutionApi,` to the exported shared API object, importing `institutionApi` alongside the file's other imports.

- [ ] **Step 2: Add the renderer-side bridge method**

In `institution-bridge.ts` (renderer `services/nemis-bridge/school-admin/`):

```typescript
import type { SchoolSummaryResult, InstitutionSummaryResult } from '@nemis-desktop/types';
import { api } from '../api';

export const institutionBridge = {
  getSchoolSummary: (): Promise<SchoolSummaryResult | null> => api().school.getSummary(),
  listInstitutions: (): Promise<InstitutionSummaryResult[]> => api().institution.list(),
};
```

- [ ] **Step 3: Wire it into the ApplicationLayer-shaped IPC facade**

In `lib/ipc/school-admin.ts`, add `listInstitutions` to the existing `institution` group:

```typescript
  institution: group('institution', {
    getCurrentSchool: () => query(() => schoolAdminBridge.getSchoolSummary()),
    listInstitutions: () => query(() => schoolAdminBridge.listInstitutions()),
  }),
```

- [ ] **Step 4: Verify the renderer package typechecks**

Run: `cd apps/desktop && npx tsc --noEmit -p renderer` (or the renderer's existing typecheck script — check `apps/desktop/package.json`'s `scripts` for the exact command name, e.g. `typecheck` or `check-types`, and use that instead if it differs)
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/preload/shared/institution-api.ts apps/desktop/electron/preload/shared/index.ts apps/desktop/renderer/services/nemis-bridge/school-admin/institution-bridge.ts apps/desktop/renderer/lib/ipc/school-admin.ts
git commit -m "feat(preload): expose window.nemis.institution.list()

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Presentation — `SchoolsViewModel`

**Repo:** `desktop-client-nemis`

**Files:**
- Create: `packages/presentation/src/queries/institution/list-institutions-ui-query.ts`
- Create: `packages/presentation/src/view-models/institution/schools-view-model.ts`
- Create: `packages/presentation/src/view-models/institution/schools-view-model.test.ts`
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`

**Interfaces:**
- Consumes: `ApplicationLayer.institution.listInstitutions()` (Task 11).
- Produces: `PresentationLayer.viewModels.schools: SchoolsViewModel`, with `store.getState().institutions: AsyncState<InstitutionSummaryOutput[]>` and `loadInstitutions(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { SchoolsViewModel } from './schools-view-model';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';

describe('SchoolsViewModel', () => {
  it('loads every institution in the local database', async () => {
    const { app, ports } = createTestApplication();
    ports.institutions.store.set(
      'inst-1',
      Institution.reconstitute({
        id: 'inst-1', code: 'sch-1', name: 'Monrovia Central',
        type: InstitutionType.SCHOOL, ownership: OwnershipType.GOVERNMENT,
        countyId: 'county-1', approvalStatus: ApprovalStatus.APPROVED,
        version: 1, updatedAt: '2026-08-07T00:00:00.000Z',
      }),
    );
    const vm = new SchoolsViewModel({ institution: app.institution });

    await vm.loadInstitutions();

    const state = vm.store.getState().institutions;
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.data).toHaveLength(1);
      expect(state.data[0]!.name).toBe('Monrovia Central');
    }
  });

  it('renders empty (not an error) when no institutions have synced yet', async () => {
    const { app } = createTestApplication();
    const vm = new SchoolsViewModel({ institution: app.institution });
    await vm.loadInstitutions();
    expect(vm.store.getState().institutions.status).toBe('empty');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/presentation && npx vitest run view-models/institution/schools-view-model.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the UI query**

```typescript
import type {
  ApplicationResponse,
  InstitutionApplicationService,
  InstitutionSummaryOutput,
} from '@nemis-desktop/application';

/** Read model for the County/DEO/Ministry Schools list. */
export class ListInstitutionsUiQuery {
  constructor(private readonly institution: InstitutionApplicationService) {}

  execute(): Promise<ApplicationResponse<InstitutionSummaryOutput[]>> {
    return this.institution.listInstitutions();
  }
}
```

- [ ] **Step 4: Implement the ViewModel**

```typescript
import type { InstitutionApplicationService, InstitutionSummaryOutput } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { ListInstitutionsUiQuery } from '../../queries/institution/list-institutions-ui-query';

export interface SchoolsState {
  readonly institutions: AsyncState<InstitutionSummaryOutput[]>;
}

export interface SchoolsViewModelDeps {
  readonly institution: InstitutionApplicationService;
}

export class SchoolsViewModel {
  readonly store = createStore<SchoolsState>(() => ({ institutions: idleState() }));

  private readonly query: ListInstitutionsUiQuery;

  constructor(deps: SchoolsViewModelDeps) {
    this.query = new ListInstitutionsUiQuery(deps.institution);
  }

  async loadInstitutions(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().institutions,
        set: (institutions) => this.store.setState({ institutions }),
      },
      fetch: () => this.query.execute(),
      map: (rows) => rows,
      isEmpty: (rows) => rows.length === 0,
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/presentation && npx vitest run view-models/institution/schools-view-model.test.ts`
Expected: PASS

- [ ] **Step 6: Wire into `create-presentation-layer.ts`**

Add the import: `import { SchoolsViewModel } from '../view-models/institution/schools-view-model';`

Add `readonly schools: SchoolsViewModel;` to `PresentationViewModels`.

Add `schools: new SchoolsViewModel({ institution: app.institution }),` to the constructed `viewModels` object (next to `settings`, which also depends on `app.institution`).

- [ ] **Step 7: Run the full presentation package suite**

Run: `cd packages/presentation && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/presentation/src/queries/institution/list-institutions-ui-query.ts packages/presentation/src/view-models/institution/schools-view-model.ts packages/presentation/src/view-models/institution/schools-view-model.test.ts packages/presentation/src/factories/create-presentation-layer.ts
git commit -m "feat(presentation): add SchoolsViewModel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Renderer — real County Schools list page

**Repo:** `desktop-client-nemis`

**Files:**
- Modify: `apps/desktop/renderer/lib/presentation/hooks/county.ts`
- Modify: `apps/desktop/renderer/app/government/county/schools/page.tsx`

**Interfaces:**
- Consumes: `PresentationLayer.viewModels.schools` (Task 14).

This replaces the generic `SchoolAdminCollectionPage` placeholder (a raw table dump over `schoolAdmin` generic-records channels) with the real feature the design spec calls for: a proper institutions list with district name and enrollment count, matching what portal-web's `county/schools` page shows (minus Active/Inactive filtering and the create/bulk-import/approval actions — both explicitly deferred, see the design spec's "Known v1 limitations").

- [ ] **Step 1: Add the hook**

Replace the placeholder content of `hooks/county.ts`:

```typescript
'use client';

import { usePresentation } from '../presentation-provider';

/** ViewModel selectors owned by the County (CEO) portal. */
export const useSchoolsViewModel = () => usePresentation().viewModels.schools;
```

- [ ] **Step 2: Replace the page**

```tsx
'use client';

import { useEffect } from 'react';
import { ErrorState } from '@nemis-desktop/ui';
import { useSchoolsViewModel } from '@/lib/presentation/hooks/county';
import { useViewModel } from '@/hooks/use-view-model';

export default function CountySchoolsPage() {
  const schools = useSchoolsViewModel();
  const institutions = useViewModel(schools.store, (s) => s.institutions);

  useEffect(() => {
    if (institutions.status === 'idle') void schools.loadInstitutions();
  }, [schools, institutions.status]);

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            County
          </p>
          <h1 className="text-xl font-bold text-slate-900">Schools</h1>
        </div>

        {institutions.status === 'error' ? (
          <ErrorState
            message={institutions.error.userMessage}
            onRetry={() => void schools.loadInstitutions()}
          />
        ) : institutions.status === 'loading' || institutions.status === 'idle' ? (
          <div className="bg-white border border-slate-300 rounded-card p-12 text-center text-sm text-slate-400">
            Loading schools…
          </div>
        ) : institutions.status === 'empty' ? (
          <div className="bg-white border border-slate-300 rounded-card p-12 text-center text-sm text-slate-400">
            No schools found matching your criteria.
          </div>
        ) : (
          <div className="bg-white border rounded-lg border-slate-300 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/20 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">School</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">District</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Enrolled</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {institutions.data.map((school) => (
                  <tr key={school.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">{school.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{school.code}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{school.districtName ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 text-right">{school.studentCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-slate-600 bg-slate-100">
                        {school.approvalStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write a smoke test**

Mirror `apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`'s harness exactly — mock `window.nemis` before render, build the real `createRendererPresentation()` layer, and render the page inside `PresentationProvider` (no `bootstrap.run()` call needed here since `schools` isn't one of the bootstrap steps — the page's own `useEffect` triggers the load):

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import CountySchoolsPage from './page';

function mockNemis(institutions: unknown[]) {
  (window as unknown as { nemis: unknown }).nemis = {
    institution: { list: vi.fn(async () => institutions) },
  };
}
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('County Schools page', () => {
  it('shows the empty state when no institutions have synced yet', async () => {
    mockNemis([]);
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <CountySchoolsPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('No schools found matching your criteria.')).toBeInTheDocument());
  });

  it('renders a synced institution with its district and enrollment', async () => {
    mockNemis([{
      id: 'inst-1', code: 'SCH-1', name: 'Monrovia Central', type: 'SECONDARY',
      ownership: 'PUBLIC', districtId: 'district-1', districtName: 'Sinkor District',
      approvalStatus: 'APPROVED', studentCount: 42,
    }]);
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <CountySchoolsPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Monrovia Central')).toBeInTheDocument());
    expect(screen.getByText('Sinkor District')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run apps/desktop/renderer/app/government/county/schools`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/lib/presentation/hooks/county.ts apps/desktop/renderer/app/government/county/schools/page.tsx apps/desktop/renderer/app/government/county/schools/page.test.tsx
git commit -m "feat(renderer): real County schools list page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: Regression — prove multi-institution data stays separated end-to-end

**Repo:** `desktop-client-nemis`

**Files:**
- Modify: `apps/desktop/electron/data/adapters/business-e2e.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4, 7, 8, 9 (real SQLite, not fakes).

This is the test the whole plan exists to make pass — it's the one that would have failed before Task 7/9 (when `findFirst()`/`countAll()` were the only ways to read institution/student data) and proves the "installation == institution" assumption is actually gone, not just extended alongside the old one.

- [ ] **Step 1: Write the failing test**

Open `business-e2e.test.ts` first to find its existing setup helper (it builds a real `DataLayer`/`ApplicationLayer` over a temp SQLite file — reuse that exact setup, following whatever pattern the file's other tests already use for seeding institutions/students). Add:

```typescript
  it('keeps institutions and student counts separated when a device holds more than one institution (County/DEO/Ministry scope)', () => {
    // Two institutions land in the same local database — exactly what a
    // COUNTY_ADMIN device's sync snapshot produces (see
    // Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts
    // authorizedInstitutionIds), which the old findFirst()-only
    // IInstitutionRepository could never represent.
    seedInstitution({ id: 'inst-1', name: 'Monrovia Central' });
    seedInstitution({ id: 'inst-2', name: 'Zorzor Elementary' });
    seedStudent({ id: 's1', institutionId: 'inst-1' });
    seedStudent({ id: 's2', institutionId: 'inst-1' });
    seedStudent({ id: 's3', institutionId: 'inst-2' });

    const institutions = dataLayer.repositories.institutions.findAll();
    expect(institutions.map((i) => i.id).sort()).toEqual(['inst-1', 'inst-2']);

    const counts = dataLayer.repositories.students.countByInstitution();
    expect(counts).toContainEqual({ institutionId: 'inst-1', studentCount: 2 });
    expect(counts).toContainEqual({ institutionId: 'inst-2', studentCount: 1 });
  });
```

(Adapt `seedInstitution`/`seedStudent` to whatever this file's actual seeding helpers are named — if none exist yet at the right granularity, insert directly via `dataLayer.repositories.institutions`/`.students` `save()`/equivalent construction methods, following the exact pattern the file's existing tests use to get a valid `Institution`/`Student` aggregate into the database.)

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run apps/desktop/electron/data/adapters/business-e2e.test.ts`
Expected: PASS — every method this test calls (`findAll`, `countByInstitution`) was already implemented and unit-tested in Tasks 7 and 9. This step is a regression/integration checkpoint confirming the real `DataLayer` composition (not just isolated repository unit tests) behaves correctly with two institutions physically present in one SQLite file — the exact scenario the old singleton assumption could never be tested against.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/data/adapters/business-e2e.test.ts
git commit -m "test(e2e): verify multi-institution separation in a single local database

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 17: Full suite verification

**Repo:** `desktop-client-nemis` and `Nemis`

- [ ] **Step 1: Run the full desktop-client-nemis test suite**

Run: `npx vitest run`
Expected: PASS, zero failures, zero skipped tests that were previously passing.

- [ ] **Step 2: Run the full Nemis/apps/Server test suite**

Run: `cd Nemis/apps/Server && npx jest`
Expected: PASS.

- [ ] **Step 3: Typecheck both repos**

Run whatever each repo's `package.json` defines as its typecheck script (check `desktop-client-nemis/package.json` and `Nemis/apps/Server/package.json` `scripts` sections for the exact command name — likely `typecheck` or `build`).
Expected: no errors.

- [ ] **Step 4: Manually verify with the `run` skill**

Launch the desktop app, sign in as a `COUNTY_ADMIN` test account (or whatever seeded test credentials exist per `docs/initial-device-provisioning.md`), navigate to `/government/county/schools`, and confirm the real institutions list renders with district names and student counts instead of the old generic collection dump.

- [ ] **Step 5: Request code review**

Use the `superpowers:requesting-code-review` skill before merging either repo's branch.
