# County Districts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port portal-web's County District Management page (with its Manage DEO drawer) and District Details page to the desktop app — reads offline from synced SQLite, DEO assign/remove as online-only commands.

**Architecture:** The Nemis County snapshot gains DEO assignments + DEO users and a few contact fields; desktop migration 032 stores them. A read-model port + two use cases + two ViewModels serve the pages over two COUNTY_ADMIN-only IPC reads; Assign/Remove DEO go renderer → bridge → IPC → `runOnline(gateway call, forced pull)` exactly like the transfer commands. Pages are copied from portal-web with only data-source edits.

**Tech Stack:** NestJS + Prisma + Jest (Nemis); Electron 42.7.0, better-sqlite3, TypeScript, Vitest, Next 15 static export, React 19, Zustand vanilla (desktop).

**Spec:** `docs/superpowers/specs/2026-10-16-county-districts-design.md` (read it with this plan)

## Global Constraints

- Repos: `C:\Users\Alvin Dogba Jr\Desktop\Walamen\Nemis` (Task 1) and `C:\Users\Alvin Dogba Jr\Desktop\Walamen\desktop-client-nemis` (Tasks 2–9). Branch `feat/county-districts` from `main` in each (desktop branch exists).
- Stage files by explicit path; never `git add -A`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- SQLite-touching desktop tests run under Electron: from the desktop repo root, `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>`. Pure TS/React tests may use `pnpm exec vitest run <paths>`.
- Known pre-existing desktop failures: `apps/desktop/renderer/app/page.test.tsx`, `apps/desktop/renderer/app/government/teacher/timetable/timetable.test.tsx`.
- `noUncheckedIndexedAccess` is on in the desktop repo.
- Parity rule: copy portal-web markup/behaviour verbatim; the only intended differences are spec §3 items 1–6 and Decision 7.
- Every new `ApplicationLayer` key must also be forwarded in `apps/desktop/electron/main/main.ts` `deferredApplication` (this plan only extends the existing `county` service, so no new key there).
- Renderer components may import `@nemis-desktop/presentation`, `@nemis-desktop/ui`, `@nemis-desktop/types`, renderer-local modules and `services/nemis-bridge/*`; `@nemis-desktop/application` only under `renderer/lib/ipc/` and `renderer/lib/presentation/`.

## Review Focus

- **Remove a DEO, then pull** → the district must flip to "No DEO assigned" (the deactivated org row must arrive and overwrite the local active one). → Task 2 importer test "a merge flips a removed DEO to inactive".
- **Assign while offline** → buttons disabled, the amber note shows, no IPC call made. → Task 7 test "offline disables every DEO action".
- **Server refuses (409 already assigned)** → the server's message shows in the drawer's red box, the drawer stays open. → Task 7 test "shows the server's refusal in the drawer".
- **Command succeeds but the forced pull fails** → no error shown; page reloads local data. → Task 6 handler test "reports refreshed:false without throwing".
- **Detail page opened with an unknown or other-county id** → the web's "Failed to load district details" view with Back to Districts. → Task 3 use-case test and Task 8 page test.

---

### Task 1: Server — DEO assignments, DEO users and contact fields in the County snapshot (Nemis)

**Files:**
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` (userOrganization query ~L255; `institutions`, `users`, `districts` mappings ~L620–675)
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`

**Interfaces:**
- Produces (snapshot): COUNTY scope `userOrganizations` also contain this county's DEO rows (any `isActive`) and the active unassigned pool (`role DEO, countyId null, districtId null`); `users[*]` gain `phoneNumber`, `lastLoginAt` (ISO|null), `photoUrl` (from `imageUrl`), `createdAt` (ISO); `districts[*].code`; `institutions[*]` gain `contactPhone`, `contactPersonPhone`, `emisCode`, `officialSchoolCode`.

- [ ] **Step 1: Branch**

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && git switch main && git switch -c feat/county-districts
```

- [ ] **Step 2: Write the failing tests**

Add this test right after the existing `"ships a county device its county row, …"` test:

```ts
  it("gives a county device its DEO assignments (active and inactive) and the unassigned DEO pool", async () => {
    const countyAdmin: UserContext = {
      userId: "user-county",
      email: "county-admin@nemis.gov",
      role: "COUNTY_ADMIN",
      countyId: "county-1",
      organizations: [
        { role: "COUNTY_ADMIN", countyId: "county-1" } as UserContext["organizations"][number],
      ],
    };
    const deoUser = {
      id: "deo-1",
      firstName: "Musu",
      lastName: "Kollie",
      email: "musu@moe.gov.lr",
      isActive: true,
      phoneNumber: "0770000001",
      lastLoginAt: new Date("2026-10-01T08:00:00.000Z"),
      imageUrl: "https://img.example/deo-1.png",
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
      updatedAt: new Date("2026-10-01T08:00:00.000Z"),
    };
    const orgRows = [
      { id: "org-1", userId: "deo-1", role: "DEO", institutionId: null, countyId: "county-1", districtId: "district-1", isActive: false, user: deoUser },
      { id: "org-2", userId: "deo-1", role: "DEO", institutionId: null, countyId: null, districtId: null, isActive: true, user: deoUser },
    ];
    const userOrganization = { findMany: jest.fn().mockResolvedValue(orgRows) };
    const emptyFind = { findMany: jest.fn().mockResolvedValue([]) };
    const tx = new Proxy(
      {},
      { get: (_target, key) => (key === "userOrganization" ? userOrganization : emptyFind) },
    );
    const device = {
      ...deviceRow(),
      role: "COUNTY_ADMIN" as const,
      scopeType: "COUNTY",
      scopeId: "county-1",
      institutionId: null,
    };
    const prisma = {
      desktopDevice: {
        findFirst: jest.fn().mockResolvedValue(device),
        update: jest.fn().mockResolvedValue(device),
      },
      institution: { findMany: jest.fn().mockResolvedValue([{ id: "school-1" }]) },
      $transaction: jest.fn(async (operation: (client: unknown) => unknown) => operation(tx)),
    } as unknown as PrismaService;

    const snapshot = await new DesktopProvisioningService(prisma, configService).getSnapshot(
      "device-1",
      countyAdmin,
    );

    expect(userOrganization.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            institutionId: { in: ["school-1"] },
            isActive: true,
            role: { in: ["MINISTRY_ADMIN", "COUNTY_ADMIN", "DEO", "INSTITUTION_ADMIN", "TEACHER"] },
          },
          // Active AND inactive, so a removed DEO reaches the device.
          { role: "DEO", countyId: "county-1" },
          { role: "DEO", countyId: null, districtId: null, isActive: true },
        ],
      },
      include: { user: true },
      orderBy: { id: "asc" },
    });
    expect(snapshot.data.userOrganizations).toEqual([
      { id: "org-1", userId: "deo-1", role: "DEO", institutionId: null, countyId: "county-1", districtId: "district-1", isActive: false },
      { id: "org-2", userId: "deo-1", role: "DEO", institutionId: null, countyId: null, districtId: null, isActive: true },
    ]);
    expect(snapshot.data.users).toEqual([
      {
        id: "deo-1",
        firstName: "Musu",
        middleName: null,
        lastName: "Kollie",
        email: "musu@moe.gov.lr",
        isActive: true,
        phoneNumber: "0770000001",
        lastLoginAt: "2026-10-01T08:00:00.000Z",
        photoUrl: "https://img.example/deo-1.png",
        createdAt: "2026-01-05T00:00:00.000Z",
        version: 1,
        updatedAt: "2026-10-01T08:00:00.000Z",
        lastModifiedBy: null,
      },
    ]);
  });
```

In the existing `"ships a county device its county row, …"` test:
- add to `institutionRow`: `contactPhone: "0771111111", contactPersonPhone: null, emisCode: "EMIS-1", officialSchoolCode: null,`
- change the `snapshot.data.districts` expectation to include `code: "D1"` / `code: "D2"`:

```ts
    expect(snapshot.data.districts).toEqual([
      { id: "district-1", name: "Sinkor District", code: "D1", countyId: "county-1", isActive: true },
      { id: "district-2", name: "Old District", code: "D2", countyId: "county-1", isActive: false },
    ]);
```

- add after the institutions `isActive` expectation:

```ts
    expect(snapshot.data.institutions[0]).toMatchObject({
      contactPhone: "0771111111",
      contactPersonPhone: null,
      emisCode: "EMIS-1",
      officialSchoolCode: null,
    });
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/Server" && npx jest src/desktop-provisioning/desktop-provisioning.service.spec.ts`
Expected: FAIL — the new test (query shape / users fields) and the county test (`code`, contact fields).

- [ ] **Step 4: Implement**

Replace the `tx.userOrganization.findMany({ … })` call (keep the comment above it) with:

```ts
          tx.userOrganization.findMany({
            // A County device also needs its county's DEO assignments —
            // active AND inactive, so a removed or transferred-away DEO
            // reaches the device (merge never deletes) — plus the unassigned
            // DEO pool the web's getUsersByCounty lists for every county.
            where:
              scope.scopeType === "COUNTY"
                ? {
                    OR: [
                      desktopRoleMemberships,
                      { role: SystemRole.DEO, countyId: scope.countyId },
                      { role: SystemRole.DEO, countyId: null, districtId: null, isActive: true },
                    ],
                  }
                : desktopRoleMemberships,
            include: { user: true },
            orderBy: { id: "asc" },
          }),
```

and define, next to the `counties` const added by the dashboard work (before `const [`):

```ts
        const desktopRoleMemberships = {
          institutionId: institutionWhere,
          isActive: true,
          role: { in: [...DESKTOP_ROLES] },
        };
```

`users` mapping — add after `isActive: row.isActive,`:

```ts
              phoneNumber: row.phoneNumber,
              lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
              photoUrl: row.imageUrl ?? null,
              createdAt: row.createdAt.toISOString(),
```

`districts` mapping — add after `name: row.name,`: `code: row.code,`

`institutions` mapping — add after `isActive: row.isActive,`:

```ts
            contactPhone: row.contactPhone,
            contactPersonPhone: row.contactPersonPhone,
            emisCode: row.emisCode,
            officialSchoolCode: row.officialSchoolCode,
```

- [ ] **Step 5: Verify**

Run: `npx jest src/desktop-provisioning` → PASS (if another existing test pins the exact `users` or `districts` row shape, extend its expectation with the new keys — the contract changes on purpose; ledger it). Run: `pnpm typecheck` → exit 0. Run: `pnpm lint` → 0 errors.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && git add apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts && git commit -m "feat(desktop-provisioning): ship county DEO assignments, DEO users and contact fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Desktop — migration 032 and importer columns

**Files:**
- Create: `apps/desktop/electron/database/migrations/032-add-county-districts-columns.ts` (+ `.test.ts`)
- Modify: `apps/desktop/electron/database/migrations/registry.ts`
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts` (`SPECS.districts`, `SPECS.institutions`, `SPECS.users`)
- Test: `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`

**Interfaces:**
- Produces: columns `districts.code`; `users.phoneNumber`, `users.lastLoginAt`, `users.photoUrl`, `users.createdAt`; `institutions.contactPhone`, `institutions.contactPersonPhone`, `institutions.emisCode`, `institutions.officialSchoolCode` (all TEXT NULL).

- [ ] **Step 1: Write the failing migration test**

`032-add-county-districts-columns.test.ts`:

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string; notnull: number };

function migratedThrough(version: number): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations.filter((m) => m.version <= version)) migration.up(db);
  return db;
}

function nullableColumn(db: Database.Database, table: string, name: string): boolean {
  const column = (db.pragma(`table_info(${table})`) as ColumnInfo[]).find((c) => c.name === name);
  return column !== undefined && column.notnull === 0;
}

describe('migration 032 add-county-districts-columns', () => {
  it('adds the nullable district, user and school columns', () => {
    const db = migratedThrough(32);
    expect(nullableColumn(db, 'districts', 'code')).toBe(true);
    for (const name of ['phoneNumber', 'lastLoginAt', 'photoUrl', 'createdAt']) {
      expect(nullableColumn(db, 'users', name)).toBe(true);
    }
    for (const name of ['contactPhone', 'contactPersonPhone', 'emisCode', 'officialSchoolCode']) {
      expect(nullableColumn(db, 'institutions', name)).toBe(true);
    }
  });

  it('keeps existing rows', () => {
    const db = migratedThrough(31);
    db.prepare(`INSERT INTO districts (id,name,countyId) VALUES ('d-1','Buchanan','county-1')`).run();
    migrations.find((m) => m.version === 32)!.up(db);
    expect(db.prepare(`SELECT name, code FROM districts`).get()).toEqual({ name: 'Buchanan', code: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/database/migrations/032-add-county-districts-columns.test.ts`
Expected: FAIL (`code` column missing; migration 32 undefined).

- [ ] **Step 3: Implement migration + register**

`032-add-county-districts-columns.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County Districts pages (docs/superpowers/specs/2026-10-16-county-districts-design.md):
 * district code, DEO contact/photo/created fields on users, and school contact
 * and EMIS/official codes. None of these tables has outbox triggers. */
export const addCountyDistrictsColumns: Migration = {
  version: 32,
  name: 'add-county-districts-columns',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE districts ADD COLUMN code TEXT;
      ALTER TABLE users ADD COLUMN phoneNumber TEXT;
      ALTER TABLE users ADD COLUMN lastLoginAt TEXT;
      ALTER TABLE users ADD COLUMN photoUrl TEXT;
      ALTER TABLE users ADD COLUMN createdAt TEXT;
      ALTER TABLE institutions ADD COLUMN contactPhone TEXT;
      ALTER TABLE institutions ADD COLUMN contactPersonPhone TEXT;
      ALTER TABLE institutions ADD COLUMN emisCode TEXT;
      ALTER TABLE institutions ADD COLUMN officialSchoolCode TEXT;
    `);
  },
};
```

`registry.ts`: import after the 031 import and append `addCountyDistrictsColumns,` after `addCountyDashboardColumns,`.

- [ ] **Step 4: Run migration + DatabaseManager tests** → PASS.

- [ ] **Step 5: Write the failing importer tests**

Add to `ProvisioningImporter.test.ts` (after the dashboard tests):

```ts
  it('imports DEO memberships, DEO users and the district/school/user contact columns', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(
      snapshotOf({
        ...BASE_DATA,
        districts: [{ id: 'district-1', name: 'Sinkor', code: 'D1', countyId: 'county-1', isActive: true }],
        institutions: [{ ...BASE_DATA.institutions![0]!, contactPhone: '0771111111', contactPersonPhone: null, emisCode: 'EMIS-1', officialSchoolCode: null }],
        users: [
          ...(BASE_DATA.users ?? []),
          {
            id: 'deo-1', firstName: 'Musu', middleName: null, lastName: 'Kollie', email: 'musu@moe.gov.lr',
            isActive: true, phoneNumber: '0770000001', lastLoginAt: '2026-10-01T08:00:00.000Z',
            photoUrl: 'https://img.example/deo-1.png', createdAt: '2026-01-05T00:00:00.000Z',
            version: 1, updatedAt: '2026-10-01T08:00:00.000Z', lastModifiedBy: null,
          },
        ],
        userOrganizations: [
          ...(BASE_DATA.userOrganizations ?? []),
          { id: 'org-deo-1', userId: 'deo-1', role: 'DEO', institutionId: null, countyId: 'county-1', districtId: 'district-1', isActive: true },
        ],
      }),
      CONTEXT,
    );
    const db = manager.connection;
    expect(db.prepare(`SELECT code FROM districts`).get()).toEqual({ code: 'D1' });
    expect(db.prepare(`SELECT contactPhone, emisCode FROM institutions`).get()).toEqual({ contactPhone: '0771111111', emisCode: 'EMIS-1' });
    expect(db.prepare(`SELECT phoneNumber, lastLoginAt, photoUrl, createdAt FROM users WHERE id='deo-1'`).get()).toEqual({
      phoneNumber: '0770000001',
      lastLoginAt: '2026-10-01T08:00:00.000Z',
      photoUrl: 'https://img.example/deo-1.png',
      createdAt: '2026-01-05T00:00:00.000Z',
    });
    expect(db.prepare(`SELECT role, districtId, isActive FROM user_organizations WHERE id='org-deo-1'`).get()).toEqual({
      role: 'DEO', districtId: 'district-1', isActive: 1,
    });
  });

  it('a merge flips a removed DEO to inactive', () => {
    const importer = new ProvisioningImporter(manager);
    const deo = {
      id: 'deo-1', firstName: 'Musu', middleName: null, lastName: 'Kollie', email: 'musu@moe.gov.lr',
      isActive: true, version: 1, updatedAt: '2026-10-01T08:00:00.000Z', lastModifiedBy: null,
    };
    const org = { id: 'org-deo-1', userId: 'deo-1', role: 'DEO', institutionId: null, countyId: 'county-1', districtId: 'district-1' };
    importer.import(
      snapshotOf({ ...BASE_DATA, users: [...(BASE_DATA.users ?? []), deo], userOrganizations: [...(BASE_DATA.userOrganizations ?? []), { ...org, isActive: true }] }),
      CONTEXT,
    );
    importer.import(snapshotOf({ users: [deo], userOrganizations: [{ ...org, isActive: false }] }), CONTEXT, { merge: true });
    expect(manager.connection.prepare(`SELECT isActive FROM user_organizations WHERE id='org-deo-1'`).get()).toEqual({ isActive: 0 });
  });
```

- [ ] **Step 6: Run to verify they fail**

Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`
Expected: the first test FAILS (columns not imported). The merge-flip test may already pass (it exercises existing upsert behaviour) — that is fine and expected; it pins the Review-Focus behaviour.

- [ ] **Step 7: Extend the importer specs**

In `SPECS`, append columns (keep existing lists exactly, appending):
- `districts`: `…, 'isActive', 'code']` (keep `{ isActive: 1 }` defaults)
- `institutions`: `…, 'isActive', 'contactPhone', 'contactPersonPhone', 'emisCode', 'officialSchoolCode']` (keep defaults)
- `users`: `…, 'lastModifiedBy', 'phoneNumber', 'lastLoginAt', 'photoUrl', 'createdAt']`

- [ ] **Step 8: Verify** — `ELECTRON_RUN_AS_NODE=1 … run apps/desktop/electron/provisioning apps/desktop/electron/database` → PASS; `pnpm typecheck` → 0.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/electron/database/migrations/032-add-county-districts-columns.ts apps/desktop/electron/database/migrations/032-add-county-districts-columns.test.ts apps/desktop/electron/database/migrations/registry.ts apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/provisioning/ProvisioningImporter.test.ts && git commit -m "feat(sync): store district code, DEO user details and school contact columns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Application — wire types, `ICountyDistrictsReadModel`, use cases, service methods

**Files:**
- Create: `packages/types/src/county-districts.ts`; Modify: `packages/types/src/index.ts`
- Create: `packages/application/src/interfaces/county/county-districts-read-model.ts`; Modify: `packages/application/src/interfaces/county/index.ts`
- Create: `packages/application/src/dto/county/county-districts-dto.ts`
- Create: `packages/application/src/testing/county/in-memory-county-districts-read-model.ts`; Modify: `packages/application/src/testing/county/index.ts`
- Create: `packages/application/src/use-cases/county/get-county-districts.ts`, `get-county-district-detail.ts`
- Test: `packages/application/src/use-cases/county/county-districts.test.ts`
- Modify: `packages/application/src/services/county-application-service.ts`, `packages/application/src/factories/create-application-layer.ts`, `packages/application/src/index.ts`, `packages/application/src/factories/create-application-layer.test.ts`, `packages/presentation/src/testing/create-test-application.ts`, `apps/desktop/electron/data/adapters/createApplicationComposition.ts`

**Interfaces:**
- Produces (types, `county-districts.ts`):

```ts
export interface CountyDeoSummary { userId: string; firstName: string; lastName: string; email: string | null; photoUrl: string | null }
export interface CountyDistrictListItem {
  id: string; name: string; code: string | null; isActive: boolean;
  activeSchoolCount: number; activeDeoCount: number; firstDeo: CountyDeoSummary | null;
}
export interface CountyDeoUser {
  id: string; firstName: string; lastName: string; email: string | null; phoneNumber: string | null;
  isActive: boolean; lastLoginAt: string | null; photoUrl: string | null; districtId: string | null;
}
export interface CountyDistrictOfficer {
  userId: string; name: string; email: string | null; phoneNumber: string | null;
  isActive: boolean; lastLoginAt: string | null; photoUrl: string | null;
}
export interface CountyDistrictsResult {
  county: { id: string; name: string } | null;
  districts: CountyDistrictListItem[];
  deoUsers: CountyDeoUser[];
  officersByDistrict: Record<string, CountyDistrictOfficer[]>;
}
export interface CountyDistrictInstitution {
  id: string; name: string; code: string; type: string; emisCode: string | null; officialSchoolCode: string | null;
  street: string | null; communityTown: string | null; ownership: string;
  contactPhone: string | null; contactPersonPhone: string | null;
  metadata: Record<string, unknown> | null; isActive: boolean;
}
export interface CountyDistrictStats {
  totalSchools: number; totalStudents: number; totalTeachers: number; deoCount: number; studentTeacherRatio: number;
}
export interface CountyDistrictDetailResult {
  county: { id: string; name: string } | null;
  district: { id: string; name: string; code: string | null; isActive: boolean };
  officers: CountyDistrictOfficer[];
  institutions: CountyDistrictInstitution[]; // active, any type, by name
  stats: CountyDistrictStats;
}
export interface CountyAssignDeoRequest { districtId: string; userId: string; replaceExisting: boolean }
export interface CountyRemoveDeoRequest { districtId: string; userId: string }
```

- Produces (application): `ICountyDistrictsReadModel` (below); `CountyDistrictsOutput = CountyDistrictsResult`; `CountyDistrictDetailOutput = CountyDistrictDetailResult | null`; `GetCountyDistrictsUseCase` / `GetCountyDistrictDetailUseCase` (deps `{ readModel, countyReadModel, logger }` — `countyReadModel` is the dashboard's `ICountyAnalyticsReadModel`, used only for `getCounty()`); `CountyApplicationService.listDistricts(): Promise<ApplicationResponse<CountyDistrictsOutput>>`, `.getDistrict(districtId: string): Promise<ApplicationResponse<CountyDistrictDetailOutput>>`; `ApplicationPorts.countyDistricts`; `InMemoryCountyDistrictsReadModel`.

```ts
// packages/application/src/interfaces/county/county-districts-read-model.ts
export interface ICountyDistrictsReadModel {
  /** Active districts of this county (own county only), by name. */
  listActiveDistricts(): CountyDistrictListItem[];
  /** Own-county district (active or not), or null. */
  getDistrict(id: string): { id: string; name: string; code: string | null; isActive: boolean } | null;
  /** Active institutions of the district (any type), by name; metadata = profile minus `levels`. */
  listDistrictInstitutions(districtId: string): CountyDistrictInstitution[];
  getDistrictCounts(districtId: string): { schools: number; students: number; teachers: number; deos: number };
  /** Active DEO assignments of the district, oldest assignment row first. */
  listDistrictOfficers(districtId: string): CountyDistrictOfficer[];
  /** users.service getUsersByCounty(role DEO, includeInactive): newest first. */
  listCountyDeoUsers(): CountyDeoUser[];
}
```

- [ ] **Step 1: Add the wire types** (file above) and `export * from './county-districts';` to `packages/types/src/index.ts`. Run `pnpm --filter @nemis-desktop/types typecheck` → 0.

- [ ] **Step 2: Add port, DTO, fake.** Port file as above (import the row types from `@nemis-desktop/types`); add `export * from './county-districts-read-model';` to `interfaces/county/index.ts`.

`dto/county/county-districts-dto.ts`:

```ts
import type { CountyDistrictDetailResult, CountyDistrictsResult } from '@nemis-desktop/types';

export type CountyDistrictsOutput = CountyDistrictsResult;
export type CountyDistrictDetailOutput = CountyDistrictDetailResult | null;
```

`testing/county/in-memory-county-districts-read-model.ts`:

```ts
import type {
  CountyDeoUser,
  CountyDistrictInstitution,
  CountyDistrictListItem,
  CountyDistrictOfficer,
} from '@nemis-desktop/types';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';

/** Settable canned rows keyed by district id. */
export class InMemoryCountyDistrictsReadModel implements ICountyDistrictsReadModel {
  districts: CountyDistrictListItem[] = [];
  districtById = new Map<string, { id: string; name: string; code: string | null; isActive: boolean }>();
  institutionsByDistrict = new Map<string, CountyDistrictInstitution[]>();
  countsByDistrict = new Map<string, { schools: number; students: number; teachers: number; deos: number }>();
  officersByDistrict = new Map<string, CountyDistrictOfficer[]>();
  deoUsers: CountyDeoUser[] = [];

  listActiveDistricts(): CountyDistrictListItem[] {
    return this.districts;
  }
  getDistrict(id: string) {
    return this.districtById.get(id) ?? null;
  }
  listDistrictInstitutions(districtId: string): CountyDistrictInstitution[] {
    return this.institutionsByDistrict.get(districtId) ?? [];
  }
  getDistrictCounts(districtId: string) {
    return this.countsByDistrict.get(districtId) ?? { schools: 0, students: 0, teachers: 0, deos: 0 };
  }
  listDistrictOfficers(districtId: string): CountyDistrictOfficer[] {
    return this.officersByDistrict.get(districtId) ?? [];
  }
  listCountyDeoUsers(): CountyDeoUser[] {
    return this.deoUsers;
  }
}
```

Add `export * from './in-memory-county-districts-read-model';` to `testing/county/index.ts`.

- [ ] **Step 3: Write the failing use-case tests** — `use-cases/county/county-districts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyDistrictsReadModel } from '../../testing/county/in-memory-county-districts-read-model';
import { GetCountyDistrictsUseCase } from './get-county-districts';
import { GetCountyDistrictDetailUseCase } from './get-county-district-detail';

const officer = {
  userId: 'deo-1', name: 'Musu Kollie', email: 'musu@moe.gov.lr', phoneNumber: null,
  isActive: true, lastLoginAt: null, photoUrl: null,
};

function deps() {
  const readModel = new InMemoryCountyDistrictsReadModel();
  const countyReadModel = new InMemoryCountyAnalyticsReadModel();
  countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };
  return { readModel, countyReadModel, logger: new RecordingLogger() };
}

describe('GetCountyDistrictsUseCase', () => {
  it('returns the county, districts, DEO users and each district\'s officers', async () => {
    const d = deps();
    d.readModel.districts = [
      { id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true, activeSchoolCount: 2, activeDeoCount: 1, firstDeo: null },
      { id: 'd-2', name: 'Owensgrove', code: 'D2', isActive: true, activeSchoolCount: 0, activeDeoCount: 0, firstDeo: null },
    ];
    d.readModel.officersByDistrict.set('d-1', [officer]);
    d.readModel.deoUsers = [{ id: 'deo-1', firstName: 'Musu', lastName: 'Kollie', email: null, phoneNumber: null, isActive: true, lastLoginAt: null, photoUrl: null, districtId: 'd-1' }];
    const { data } = await new GetCountyDistrictsUseCase(d).execute({});
    expect(data.county).toEqual({ id: 'county-1', name: 'Grand Bassa' });
    expect(data.districts.map((x) => x.id)).toEqual(['d-1', 'd-2']);
    expect(data.officersByDistrict).toEqual({ 'd-1': [officer], 'd-2': [] });
    expect(data.deoUsers).toHaveLength(1);
  });
});

describe('GetCountyDistrictDetailUseCase', () => {
  it('computes the stats like getDistrictStats, rounding the ratio', async () => {
    const d = deps();
    d.readModel.districtById.set('d-1', { id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true });
    d.readModel.countsByDistrict.set('d-1', { schools: 3, students: 250, teachers: 7, deos: 1 });
    d.readModel.officersByDistrict.set('d-1', [officer]);
    const { data } = await new GetCountyDistrictDetailUseCase(d).execute({ districtId: 'd-1' });
    expect(data?.stats).toEqual({ totalSchools: 3, totalStudents: 250, totalTeachers: 7, deoCount: 1, studentTeacherRatio: 36 });
    expect(data?.officers).toEqual([officer]);
    expect(data?.district.name).toBe('Buchanan');
  });

  it('reports a zero ratio when the district has no teachers', async () => {
    const d = deps();
    d.readModel.districtById.set('d-1', { id: 'd-1', name: 'Buchanan', code: null, isActive: true });
    d.readModel.countsByDistrict.set('d-1', { schools: 1, students: 40, teachers: 0, deos: 0 });
    const { data } = await new GetCountyDistrictDetailUseCase(d).execute({ districtId: 'd-1' });
    expect(data?.stats.studentTeacherRatio).toBe(0);
  });

  it('returns null for an unknown or other-county district', async () => {
    const { data } = await new GetCountyDistrictDetailUseCase(deps()).execute({ districtId: 'nope' });
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 4: Run** `pnpm exec vitest run packages/application/src/use-cases/county/county-districts.test.ts` → FAIL (modules missing).

- [ ] **Step 5: Implement the use cases**

`get-county-districts.ts`:

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountyDistrictsOutput } from '../../dto/county/county-districts-dto';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyDistrictsDeps {
  readModel: ICountyDistrictsReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** District Management page + Manage DEO drawer data (portal-web's
 * getDistrictsByCounty, getCountyUsers(role DEO) and getDistrictOfficers). */
export class GetCountyDistrictsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountyDistrictsOutput>
> {
  constructor(private readonly deps: GetCountyDistrictsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountyDistrictsOutput>> {
    return invokeUseCase('GetCountyDistricts', this.deps.logger, async () => {
      const districts = this.deps.readModel.listActiveDistricts();
      return ok({
        county: this.deps.countyReadModel.getCounty(),
        districts,
        deoUsers: this.deps.readModel.listCountyDeoUsers(),
        officersByDistrict: Object.fromEntries(
          districts.map((district) => [district.id, this.deps.readModel.listDistrictOfficers(district.id)]),
        ),
      });
    });
  }
}
```

`get-county-district-detail.ts`:

```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountyDistrictDetailOutput } from '../../dto/county/county-districts-dto';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyDistrictDetailDeps {
  readModel: ICountyDistrictsReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** District Details page data; stats follow districts.service getDistrictStats. */
export class GetCountyDistrictDetailUseCase implements QueryHandler<
  { districtId: string },
  ApplicationResponse<CountyDistrictDetailOutput>
> {
  constructor(private readonly deps: GetCountyDistrictDetailDeps) {}

  execute(query: { districtId: string }): Promise<ApplicationResponse<CountyDistrictDetailOutput>> {
    return invokeUseCase('GetCountyDistrictDetail', this.deps.logger, async () => {
      const readModel = this.deps.readModel;
      const district = readModel.getDistrict(query.districtId);
      if (!district) return ok(null);
      const counts = readModel.getDistrictCounts(district.id);
      return ok({
        county: this.deps.countyReadModel.getCounty(),
        district,
        officers: readModel.listDistrictOfficers(district.id),
        institutions: readModel.listDistrictInstitutions(district.id),
        stats: {
          totalSchools: counts.schools,
          totalStudents: counts.students,
          totalTeachers: counts.teachers,
          deoCount: counts.deos,
          studentTeacherRatio: counts.teachers > 0 ? Math.round(counts.students / counts.teachers) : 0,
        },
      });
    });
  }
}
```

- [ ] **Step 6: Run the use-case tests** → PASS (4).

- [ ] **Step 7: Service + factory + ports**

`county-application-service.ts` — extend deps and class:

```ts
import type { CountyDistrictDetailOutput, CountyDistrictsOutput } from '../dto/county/county-districts-dto';
import type { GetCountyDistrictsUseCase } from '../use-cases/county/get-county-districts';
import type { GetCountyDistrictDetailUseCase } from '../use-cases/county/get-county-district-detail';

export interface CountyApplicationServiceDeps {
  getDashboard: GetCountyDashboardUseCase;
  listDistricts: GetCountyDistrictsUseCase;
  getDistrict: GetCountyDistrictDetailUseCase;
}
// in the class:
  listDistricts(): Promise<ApplicationResponse<CountyDistrictsOutput>> {
    return this.deps.listDistricts.execute({});
  }
  getDistrict(districtId: string): Promise<ApplicationResponse<CountyDistrictDetailOutput>> {
    return this.deps.getDistrict.execute({ districtId });
  }
```

`create-application-layer.ts`: import the port type and both use cases; add `countyDistricts: ICountyDistrictsReadModel;` to `ApplicationPorts` after `countyAnalytics`; in the `county` service construction add:

```ts
    listDistricts: new GetCountyDistrictsUseCase({
      readModel: ports.countyDistricts,
      countyReadModel: ports.countyAnalytics,
      logger,
    }),
    getDistrict: new GetCountyDistrictDetailUseCase({
      readModel: ports.countyDistricts,
      countyReadModel: ports.countyAnalytics,
      logger,
    }),
```

`packages/application/src/index.ts`: add next to the county exports:

```ts
export * from './dto/county/county-districts-dto';
export * from './use-cases/county/get-county-districts';
export * from './use-cases/county/get-county-district-detail';
```

Port builders — add `countyDistricts: new InMemoryCountyDistrictsReadModel(),` to `create-application-layer.test.ts` `buildLayer()` and to the presentation `createTestApplication` (plus `countyDistricts: InMemoryCountyDistrictsReadModel;` in `TestPorts`, and the import); in `createApplicationComposition.ts` add under the not-built proxies (Task 4 replaces it):

```ts
    countyDistricts: new Proxy({} as never, { get: () => () => notBuilt('CountyDistricts') }),
```

- [ ] **Step 8: Verify** — `pnpm typecheck` → 0; `pnpm exec vitest run packages/application packages/presentation` → PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/types/src/county-districts.ts packages/types/src/index.ts packages/application/src/interfaces/county packages/application/src/dto/county/county-districts-dto.ts packages/application/src/testing/county packages/application/src/use-cases/county/get-county-districts.ts packages/application/src/use-cases/county/get-county-district-detail.ts packages/application/src/use-cases/county/county-districts.test.ts packages/application/src/services/county-application-service.ts packages/application/src/factories/create-application-layer.ts packages/application/src/factories/create-application-layer.test.ts packages/application/src/index.ts packages/presentation/src/testing/create-test-application.ts apps/desktop/electron/data/adapters/createApplicationComposition.ts && git commit -m "feat(application): county districts and district detail use cases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: SQLite adapter — `SqliteCountyDistrictsReadModel`

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyDistrictsReadModel.ts` (+ `.test.ts`)
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts`, `apps/desktop/electron/data/adapters/createApplicationComposition.ts`

**Interfaces:**
- Consumes: `ICountyDistrictsReadModel` and the row types (Task 3); columns from Task 2.
- Produces: `DataLayer.repositories.countyDistricts`.

- [ ] **Step 1: Write the failing adapter tests** — `SqliteCountyDistrictsReadModel.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyDistrictsReadModel } from './SqliteCountyDistrictsReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyDistrictsReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyDistrictsReadModel;
  let seq = 0;

  const county = () => db.prepare(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`).run();
  const district = (id: string, name: string, opts: { isActive?: number; countyId?: string; code?: string } = {}) =>
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive,code) VALUES (?,?,?,?,?)`).run(id, name, opts.countyId ?? 'county-1', opts.isActive ?? 1, opts.code ?? null);
  const school = (id: string, districtId: string, opts: { isActive?: number; type?: string; profile?: string | null; contactPhone?: string | null } = {}) =>
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive,profile,contactPhone)
       VALUES (?,?,?,?, 'PUBLIC','county-1',?,'APPROVED',1,?,?,?,?)`,
    ).run(id, id.toUpperCase(), `School ${id}`, opts.type ?? 'SCHOOL', districtId, NOW, opts.isActive ?? 1, opts.profile ?? null, opts.contactPhone ?? null);
  const student = (id: string, institutionId: string, isActive = 1) => {
    seq += 1;
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES (?,?,'F','L',?,'2015-01-01','MALE',?,1,?)`,
    ).run(id, institutionId, String(seq).padStart(12, '0'), isActive, NOW);
  };
  const staff = (id: string, institutionId: string, position: string, isActive = 1) =>
    db.prepare(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
       VALUES (?,?,'T','C','1990-01-01','FEMALE','0770000000',?,?,'FULL_TIME','2020-01-01',?,?,?)`,
    ).run(id, institutionId, id, position, isActive, NOW, NOW);
  const user = (id: string, first: string, opts: { createdAt?: string; isActive?: number; photoUrl?: string | null } = {}) =>
    db.prepare(
      `INSERT INTO users (id,firstName,lastName,email,isActive,version,updatedAt,phoneNumber,lastLoginAt,photoUrl,createdAt)
       VALUES (?,?, 'Kollie', ?, ?, 1, ?, '0770000001', NULL, ?, ?)`,
    ).run(id, first, `${id}@moe.gov.lr`, opts.isActive ?? 1, NOW, opts.photoUrl ?? null, opts.createdAt ?? NOW);
  const org = (id: string, userId: string, opts: { districtId?: string | null; countyId?: string | null; isActive?: number; role?: string } = {}) =>
    db.prepare(`INSERT INTO user_organizations (id,userId,role,institutionId,countyId,districtId,isActive) VALUES (?,?,?,NULL,?,?,?)`).run(
      id, userId, opts.role ?? 'DEO', opts.countyId === undefined ? 'county-1' : opts.countyId, opts.districtId ?? null, opts.isActive ?? 1,
    );

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyDistrictsReadModel(test.context);
    seq = 0;
  });
  afterEach(() => test.cleanup());

  it('lists only active, own-county districts by name with school and DEO counts and the first DEO', () => {
    county();
    district('d-2', 'Owensgrove', { code: 'D2' });
    district('d-1', 'Buchanan', { code: 'D1' });
    district('d-off', 'Closed', { isActive: 0 });
    district('d-x', 'Elsewhere', { countyId: 'county-2' });
    school('a', 'd-1');
    school('b', 'd-1', { isActive: 0 });
    user('deo-b', 'Bendu', { photoUrl: 'https://img.example/b.png' });
    user('deo-a', 'Abu');
    org('org-2', 'deo-b', { districtId: 'd-1' });
    org('org-1', 'deo-a', { districtId: 'd-1', isActive: 0 });
    expect(readModel.listActiveDistricts()).toEqual([
      {
        id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true, activeSchoolCount: 1, activeDeoCount: 1,
        firstDeo: { userId: 'deo-b', firstName: 'Bendu', lastName: 'Kollie', email: 'deo-b@moe.gov.lr', photoUrl: 'https://img.example/b.png' },
      },
      { id: 'd-2', name: 'Owensgrove', code: 'D2', isActive: true, activeSchoolCount: 0, activeDeoCount: 0, firstDeo: null },
    ]);
  });

  it('gets an own-county district and returns null for another county\'s or an unknown id', () => {
    county();
    district('d-1', 'Buchanan', { code: 'D1' });
    district('d-x', 'Elsewhere', { countyId: 'county-2' });
    expect(readModel.getDistrict('d-1')).toEqual({ id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true });
    expect(readModel.getDistrict('d-x')).toBeNull();
    expect(readModel.getDistrict('nope')).toBeNull();
  });

  it('lists the district\'s active institutions by name with parsed metadata minus levels', () => {
    district('d-1', 'Buchanan');
    school('zeta', 'd-1', { profile: JSON.stringify({ principalName: 'Mr. Doe', statistics: { studentCount: 40 }, levels: ['PRIMARY'] }), contactPhone: '0771' });
    school('alpha', 'd-1', { type: 'TVET' });
    school('closed', 'd-1', { isActive: 0 });
    const rows = readModel.listDistrictInstitutions('d-1');
    expect(rows.map((r) => r.id)).toEqual(['alpha', 'zeta']);
    expect(rows[1]).toMatchObject({
      type: 'SCHOOL', contactPhone: '0771', isActive: true,
      metadata: { principalName: 'Mr. Doe', statistics: { studentCount: 40 } },
    });
    expect(rows[1]!.metadata).not.toHaveProperty('levels');
    expect(rows[0]!.metadata).toBeNull();
  });

  it('counts active schools, active students in them, teaching staff only, and active DEOs', () => {
    district('d-1', 'Buchanan');
    school('a', 'd-1');
    school('closed', 'd-1', { isActive: 0 });
    student('s1', 'a');
    student('s2', 'a', 0);
    student('s3', 'closed');
    staff('t1', 'a', 'TEACHER');
    staff('t2', 'a', 'ASSISTANT_TEACHER');
    staff('t3', 'a', 'PRINCIPAL');
    staff('t4', 'a', 'TEACHER', 0);
    user('deo-1', 'Musu');
    org('org-1', 'deo-1', { districtId: 'd-1' });
    expect(readModel.getDistrictCounts('d-1')).toEqual({ schools: 1, students: 1, teachers: 2, deos: 1 });
  });

  it('lists the district\'s active officers with full names', () => {
    district('d-1', 'Buchanan');
    user('deo-1', 'Musu');
    user('deo-2', 'Old');
    org('org-1', 'deo-1', { districtId: 'd-1' });
    org('org-0', 'deo-2', { districtId: 'd-1', isActive: 0 });
    expect(readModel.listDistrictOfficers('d-1')).toEqual([
      { userId: 'deo-1', name: 'Musu Kollie', email: 'deo-1@moe.gov.lr', phoneNumber: '0770000001', isActive: true, lastLoginAt: null, photoUrl: null },
    ]);
  });

  it('lists county DEOs and the unassigned pool newest first, each with its active district', () => {
    county();
    district('d-1', 'Buchanan');
    user('deo-old', 'Old', { createdAt: '2025-01-01T00:00:00.000Z' });
    user('deo-pool', 'Pool', { createdAt: '2026-05-01T00:00:00.000Z', isActive: 0 });
    user('deo-other', 'Other', { createdAt: '2026-06-01T00:00:00.000Z' });
    user('admin', 'Admin');
    org('org-1', 'deo-old', { districtId: 'd-1' });
    org('org-2', 'deo-pool', { countyId: null, districtId: null });
    org('org-3', 'deo-other', { countyId: 'county-2', districtId: 'd-z' });
    org('org-4', 'admin', { role: 'INSTITUTION_ADMIN' });
    expect(readModel.listCountyDeoUsers().map((u) => [u.id, u.districtId, u.isActive])).toEqual([
      ['deo-pool', null, false],
      ['deo-old', 'd-1', true],
    ]);
  });
});
```

- [ ] **Step 2: Run** (Electron runner) → FAIL (module missing).

- [ ] **Step 3: Implement** `SqliteCountyDistrictsReadModel.ts`:

```ts
import type {
  CountyDeoUser,
  CountyDistrictInstitution,
  CountyDistrictListItem,
  CountyDistrictOfficer,
} from '@nemis-desktop/types';
import type { ICountyDistrictsReadModel } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { districts, institutions, students, staff, users, userOrganizations, counties } = TableNames;

/** This county's own districts; with no county row synced (older server), all. */
const OWN_COUNTY = (alias: string) =>
  `(NOT EXISTS (SELECT 1 FROM ${counties}) OR ${alias}.countyId IN (SELECT id FROM ${counties}))`;
const ACTIVE_DEO = (alias: string) => `${alias}.role = 'DEO' AND ${alias}.isActive = 1`;

type DistrictRow = {
  id: string; name: string; code: string | null; isActive: number;
  activeSchoolCount: number; activeDeoCount: number;
  deoUserId: string | null; deoFirstName: string | null; deoLastName: string | null;
  deoEmail: string | null; deoPhotoUrl: string | null;
};
type UserRow = {
  id: string; firstName: string; lastName: string; email: string | null; phoneNumber: string | null;
  isActive: number; lastLoginAt: string | null; photoUrl: string | null;
};

function parseMetadata(profile: string | null): Record<string, unknown> | null {
  if (!profile) return null;
  const { levels: _levels, ...metadata } = JSON.parse(profile) as Record<string, unknown>;
  return metadata;
}

/** Read-only SQLite adapter for ICountyDistrictsReadModel. */
export class SqliteCountyDistrictsReadModel implements ICountyDistrictsReadModel {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  listActiveDistricts(): CountyDistrictListItem[] {
    return guarded('SqliteCountyDistrictsReadModel.listActiveDistricts', () => {
      const rows = this.#statements
        .get(
          `SELECT d.id, d.name, d.code, d.isActive,
             (SELECT COUNT(*) FROM ${institutions} i WHERE i.districtId = d.id AND i.isActive = 1) AS activeSchoolCount,
             (SELECT COUNT(*) FROM ${userOrganizations} o WHERE o.districtId = d.id AND ${ACTIVE_DEO('o')}) AS activeDeoCount,
             u.id AS deoUserId, u.firstName AS deoFirstName, u.lastName AS deoLastName,
             u.email AS deoEmail, u.photoUrl AS deoPhotoUrl
           FROM ${districts} d
           LEFT JOIN ${users} u ON u.id = (
             SELECT o.userId FROM ${userOrganizations} o
             WHERE o.districtId = d.id AND ${ACTIVE_DEO('o')}
             ORDER BY o.id LIMIT 1)
           WHERE d.isActive = 1 AND ${OWN_COUNTY('d')}
           ORDER BY d.name ASC`,
        )
        .all() as DistrictRow[];
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.isActive === 1,
        activeSchoolCount: row.activeSchoolCount,
        activeDeoCount: row.activeDeoCount,
        firstDeo: row.deoUserId
          ? {
              userId: row.deoUserId,
              firstName: row.deoFirstName ?? '',
              lastName: row.deoLastName ?? '',
              email: row.deoEmail,
              photoUrl: row.deoPhotoUrl,
            }
          : null,
      }));
    });
  }

  getDistrict(id: string) {
    return guarded('SqliteCountyDistrictsReadModel.getDistrict', () => {
      const row = this.#statements
        .get(`SELECT d.id, d.name, d.code, d.isActive FROM ${districts} d WHERE d.id = ? AND ${OWN_COUNTY('d')}`)
        .get(id) as { id: string; name: string; code: string | null; isActive: number } | undefined;
      return row ? { ...row, isActive: row.isActive === 1 } : null;
    });
  }

  listDistrictInstitutions(districtId: string): CountyDistrictInstitution[] {
    return guarded('SqliteCountyDistrictsReadModel.listDistrictInstitutions', () => {
      const rows = this.#statements
        .get(
          `SELECT id, name, code, type, emisCode, officialSchoolCode, street, communityTown, ownership,
                  contactPhone, contactPersonPhone, profile, isActive
           FROM ${institutions}
           WHERE districtId = ? AND isActive = 1
           ORDER BY name ASC`,
        )
        .all(districtId) as (Omit<CountyDistrictInstitution, 'metadata' | 'isActive'> & { profile: string | null; isActive: number })[];
      return rows.map(({ profile, isActive, ...row }) => ({
        ...row,
        metadata: parseMetadata(profile),
        isActive: isActive === 1,
      }));
    });
  }

  getDistrictCounts(districtId: string) {
    return guarded('SqliteCountyDistrictsReadModel.getDistrictCounts', () => {
      return this.#statements
        .get(
          `SELECT
             (SELECT COUNT(*) FROM ${institutions} WHERE districtId = @d AND isActive = 1) AS schools,
             (SELECT COUNT(*) FROM ${students} s JOIN ${institutions} i ON i.id = s.institutionId
                WHERE i.districtId = @d AND i.isActive = 1 AND s.isActive = 1) AS students,
             (SELECT COUNT(*) FROM ${staff} t JOIN ${institutions} i ON i.id = t.institutionId
                WHERE i.districtId = @d AND i.isActive = 1 AND t.isActive = 1
                  AND t.position IN ('TEACHER', 'ASSISTANT_TEACHER')) AS teachers,
             (SELECT COUNT(*) FROM ${userOrganizations} o WHERE o.districtId = @d AND ${ACTIVE_DEO('o')}) AS deos`,
        )
        .get({ d: districtId }) as { schools: number; students: number; teachers: number; deos: number };
    });
  }

  listDistrictOfficers(districtId: string): CountyDistrictOfficer[] {
    return guarded('SqliteCountyDistrictsReadModel.listDistrictOfficers', () => {
      const rows = this.#statements
        .get(
          `SELECT u.id, u.firstName, u.lastName, u.email, u.phoneNumber, u.isActive, u.lastLoginAt, u.photoUrl
           FROM ${userOrganizations} o JOIN ${users} u ON u.id = o.userId
           WHERE o.districtId = ? AND ${ACTIVE_DEO('o')}
           ORDER BY o.id ASC`,
        )
        .all(districtId) as UserRow[];
      return rows.map((row) => ({
        userId: row.id,
        name: `${row.firstName} ${row.lastName}`,
        email: row.email,
        phoneNumber: row.phoneNumber,
        isActive: row.isActive === 1,
        lastLoginAt: row.lastLoginAt,
        photoUrl: row.photoUrl,
      }));
    });
  }

  listCountyDeoUsers(): CountyDeoUser[] {
    return guarded('SqliteCountyDistrictsReadModel.listCountyDeoUsers', () => {
      const rows = this.#statements
        .get(
          `SELECT u.id, u.firstName, u.lastName, u.email, u.phoneNumber, u.isActive, u.lastLoginAt, u.photoUrl,
             (SELECT o2.districtId FROM ${userOrganizations} o2
              WHERE o2.userId = u.id AND ${ACTIVE_DEO('o2')} AND o2.districtId IS NOT NULL AND ${OWN_COUNTY('o2')}
              ORDER BY o2.id LIMIT 1) AS districtId
           FROM ${users} u
           WHERE EXISTS (
             SELECT 1 FROM ${userOrganizations} o
             WHERE o.userId = u.id AND ${ACTIVE_DEO('o')}
               AND ((o.countyId IS NOT NULL AND ${OWN_COUNTY('o')})
                    OR (o.countyId IS NULL AND o.districtId IS NULL)))
           ORDER BY u.createdAt DESC, u.id ASC`,
        )
        .all() as (UserRow & { districtId: string | null })[];
      return rows.map((row) => ({ ...row, isActive: row.isActive === 1 }));
    });
  }
}
```


- [ ] **Step 4: Run** → PASS (6).

- [ ] **Step 5: Wire** — `createDataLayer.ts`: import, `countyDistricts: ICountyDistrictsReadModel;` in `DataLayer.repositories` (add the type to the `@nemis-desktop/application` import block), `const countyDistricts = new SqliteCountyDistrictsReadModel(context);`, and `countyDistricts,` in the returned repositories. `createApplicationComposition.ts`: delete the Task 3 `countyDistricts` Proxy; add `countyDistricts: dataLayer.repositories.countyDistricts,` under `countyAnalytics`.

- [ ] **Step 6: Verify** — `pnpm typecheck` → 0; Electron runner on `apps/desktop/electron/data` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyDistrictsReadModel.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyDistrictsReadModel.test.ts apps/desktop/electron/data/factories/createDataLayer.ts apps/desktop/electron/data/adapters/createApplicationComposition.ts && git commit -m "feat(data): SQLite county districts read model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Presentation — `CountyDistrictsViewModel`, `CountyDistrictDetailViewModel`

**Files:**
- Create: `packages/presentation/src/queries/county/get-county-districts-ui-query.ts`, `get-county-district-detail-ui-query.ts`
- Create: `packages/presentation/src/view-models/county/county-districts-views.ts`
- Create: `packages/presentation/src/mappers/county/county-districts-view-mapper.ts`
- Create: `packages/presentation/src/view-models/county/county-districts-view-model.ts`, `county-district-detail-view-model.ts`
- Test: `packages/presentation/src/view-models/county/county-districts-view-models.test.ts`
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`, `packages/presentation/src/index.ts`

**Interfaces:**
- Produces: the views below; `viewModels.countyDistricts` (`store` → `{ summary }`, `load()`), `viewModels.countyDistrictDetail` (`store` → `{ detail }`, `load(districtId)`).

`county-districts-views.ts` (shapes the ported pages read verbatim):

```ts
/** portal-web District (findAll with includeDeo) as the list page reads it. */
export interface DistrictCardView {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  _count: { institutions: number; users: number };
  users: { user: { id: string; firstName: string; lastName: string; email: string | null; imageUrl: string | null } }[];
}
/** portal-web ManagementUser fields the drawer reads. */
export interface DeoUserView {
  id: string; firstName: string; lastName: string; email: string | null; phoneNumber: string | null;
  isActive: boolean; lastLoginAt: string | null; imageUrl: string | null; districtId: string | null;
}
export interface DistrictOfficerView { userId: string; name: string; email: string | null }
export interface CountyDistrictsView {
  county: { id: string; name: string } | null;
  districts: DistrictCardView[];
  deoUsers: DeoUserView[];
  officersByDistrict: Record<string, DistrictOfficerView[]>;
}
/** portal-web Institution fields the detail table reads; `level` and
 * `principalName` are not Institution fields on the web either (always undefined). */
export interface DistrictSchoolView {
  id: string; name: string; code: string; emisCode: string | null; officialSchoolCode: string | null;
  address: string | null; communityTown: string | null; ownership: string;
  contactPhone: string | null; contactPersonPhone: string | null;
  metadata: Record<string, unknown> | null; isActive: boolean;
  level?: string; principalName?: string;
}
export interface CountyDistrictDetailView {
  county: { id: string; name: string } | null;
  district: { id: string; name: string; code: string | null; isActive: boolean; institutions: DistrictSchoolView[] };
  officers: DistrictOfficerView[];
  schools: DistrictSchoolView[]; // the web's /institutions?type=SCHOOL list
  stats: { totalSchools: number; totalStudents: number; totalTeachers: number; deoCount: number; studentTeacherRatio: number };
}
```

- [ ] **Step 1: Write the failing tests** — `county-districts-view-models.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyDistrictsViewModel } from './county-districts-view-model';
import { CountyDistrictDetailViewModel } from './county-district-detail-view-model';

describe('CountyDistrictsViewModel', () => {
  it('shapes districts like portal-web findAll(includeDeo)', async () => {
    const { app, ports } = createTestApplication();
    ports.countyDistricts.districts = [{
      id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true, activeSchoolCount: 2, activeDeoCount: 1,
      firstDeo: { userId: 'deo-1', firstName: 'Musu', lastName: 'Kollie', email: 'm@x', photoUrl: null },
    }];
    ports.countyDistricts.officersByDistrict.set('d-1', [{ userId: 'deo-1', name: 'Musu Kollie', email: 'm@x', phoneNumber: null, isActive: true, lastLoginAt: null, photoUrl: null }]);
    const vm = new CountyDistrictsViewModel({ county: app.county });
    await vm.load();
    const s = vm.store.getState().summary;
    expect(s.status).toBe('success');
    if (s.status !== 'success') return;
    expect(s.data.districts[0]).toEqual({
      id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true,
      _count: { institutions: 2, users: 1 },
      users: [{ user: { id: 'deo-1', firstName: 'Musu', lastName: 'Kollie', email: 'm@x', imageUrl: null } }],
    });
    expect(s.data.officersByDistrict['d-1']).toEqual([{ userId: 'deo-1', name: 'Musu Kollie', email: 'm@x' }]);
  });

  it('keeps the data on screen while reloading', async () => {
    const { app } = createTestApplication();
    const vm = new CountyDistrictsViewModel({ county: app.county });
    await vm.load();
    const reload = vm.load();
    expect(vm.store.getState().summary.status).toBe('refreshing');
    await reload;
  });
});

describe('CountyDistrictDetailViewModel', () => {
  it('splits SCHOOL-type rows from the district fallback list and maps street to address', async () => {
    const { app, ports } = createTestApplication();
    ports.countyDistricts.districtById.set('d-1', { id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true });
    const base = { code: 'A', emisCode: null, officialSchoolCode: null, communityTown: null, ownership: 'PUBLIC', contactPhone: null, contactPersonPhone: null, metadata: null, isActive: true };
    ports.countyDistricts.institutionsByDistrict.set('d-1', [
      { ...base, id: 'a', name: 'Alpha', type: 'TVET', street: '1 Road' },
      { ...base, id: 'b', name: 'Beta', type: 'SCHOOL', street: null },
    ]);
    const vm = new CountyDistrictDetailViewModel({ county: app.county });
    await vm.load('d-1');
    const s = vm.store.getState().detail;
    expect(s.status).toBe('success');
    if (s.status !== 'success') return;
    expect(s.data.schools.map((x) => x.id)).toEqual(['b']);
    expect(s.data.district.institutions.map((x) => [x.id, x.address])).toEqual([['a', '1 Road'], ['b', null]]);
  });

  it('is empty for an unknown district', async () => {
    const { app } = createTestApplication();
    const vm = new CountyDistrictDetailViewModel({ county: app.county });
    await vm.load('nope');
    expect(vm.store.getState().detail.status).toBe('empty');
  });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run packages/presentation/src/view-models/county` → FAIL.

- [ ] **Step 3: Implement**

UI queries (one each, wrapping `county.listDistricts()` / `county.getDistrict(id)` like `GetCountyDashboardUiQuery`).

`county-districts-view-mapper.ts`:

```ts
import type { CountyDistrictDetailResult, CountyDistrictsResult, CountyDistrictInstitution, CountyDistrictOfficer } from '@nemis-desktop/types';
import type { CountyDistrictDetailView, CountyDistrictsView, DistrictOfficerView, DistrictSchoolView } from '../../view-models/county/county-districts-views';

const officerView = (o: CountyDistrictOfficer): DistrictOfficerView => ({ userId: o.userId, name: o.name, email: o.email });

const schoolView = ({ street, type: _type, ...row }: CountyDistrictInstitution): DistrictSchoolView => ({ ...row, address: street });

export function toCountyDistrictsView(dto: CountyDistrictsResult): CountyDistrictsView {
  return {
    county: dto.county,
    districts: dto.districts.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      isActive: d.isActive,
      _count: { institutions: d.activeSchoolCount, users: d.activeDeoCount },
      users: d.firstDeo
        ? [{ user: { id: d.firstDeo.userId, firstName: d.firstDeo.firstName, lastName: d.firstDeo.lastName, email: d.firstDeo.email, imageUrl: d.firstDeo.photoUrl } }]
        : [],
    })),
    deoUsers: dto.deoUsers.map(({ photoUrl, ...u }) => ({ ...u, imageUrl: photoUrl })),
    officersByDistrict: Object.fromEntries(
      Object.entries(dto.officersByDistrict).map(([id, officers]) => [id, officers.map(officerView)]),
    ),
  };
}

export function toCountyDistrictDetailView(dto: CountyDistrictDetailResult): CountyDistrictDetailView {
  return {
    county: dto.county,
    district: { ...dto.district, institutions: dto.institutions.map(schoolView) },
    officers: dto.officers.map(officerView),
    schools: dto.institutions.filter((i) => i.type === 'SCHOOL').map(schoolView),
    stats: dto.stats,
  };
}
```

`county-districts-view-model.ts`:

```ts
import type { CountyApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toCountyDistrictsView } from '../../mappers/county/county-districts-view-mapper';
import { GetCountyDistrictsUiQuery } from '../../queries/county/get-county-districts-ui-query';
import type { CountyDistrictsView } from './county-districts-views';

export interface CountyDistrictsState {
  readonly summary: AsyncState<CountyDistrictsView>;
}

/** District Management page + Manage DEO drawer. Reloaded after every DEO command. */
export class CountyDistrictsViewModel {
  readonly store = createStore<CountyDistrictsState>(() => ({ summary: idleState() }));
  private readonly query: GetCountyDistrictsUiQuery;

  constructor(deps: { readonly county: CountyApplicationService }) {
    this.query = new GetCountyDistrictsUiQuery(deps.county);
  }

  async load(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().summary, set: (summary) => this.store.setState({ summary }) },
      fetch: () => this.query.execute(),
      map: toCountyDistrictsView,
    });
  }
}
```

`county-district-detail-view-model.ts` — same shape with `detail` state, `load(districtId: string)` calling `this.query.execute(districtId)` and `map: toCountyDistrictDetailView` (a `null` DTO becomes `empty` via `trackQuery`).

Register both in `create-presentation-layer.ts` (`countyDistricts`, `countyDistrictDetail`, constructed with `{ county: app.county }`) and export the six new modules from `packages/presentation/src/index.ts`.

- [ ] **Step 4: Verify** — `pnpm exec vitest run packages/presentation` → PASS; `pnpm typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/presentation/src/queries/county packages/presentation/src/view-models/county packages/presentation/src/mappers/county packages/presentation/src/factories/create-presentation-layer.ts packages/presentation/src/index.ts && git commit -m "feat(presentation): county districts and district detail view models

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: IPC — reads, online DEO commands, gateway, wiring

**Files:**
- Modify: `packages/types/src/ipc.ts`, `packages/types/src/api.ts`
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts` (+ test)
- Modify: `apps/desktop/electron/security/validateIpc.ts`
- Create: `apps/desktop/electron/ipc/handlers/county/districts.ts`, `deo.ts` (+ `districts.test.ts`); Modify: `ipc/handlers/county/index.ts`, `ipc/registrar.ts`, `ipc/authorizeChannel.ts` (+ test)
- Create: `apps/desktop/electron/preload/county/districts-api.ts`; Modify: `preload/county/index.ts`
- Create: `apps/desktop/renderer/services/nemis-bridge/county/districts-bridge.ts`; Modify: `county/index.ts`
- Modify: `apps/desktop/renderer/lib/ipc/county.ts` (+ `index.test.ts`), `apps/desktop/renderer/lib/presentation/hooks/county.ts`

**Interfaces:**
- Channels: `COUNTY_LIST_DISTRICTS: 'county:list-districts'` (args `[]`, result `CountyDistrictsResult`), `COUNTY_GET_DISTRICT: 'county:get-district'` (args `[districtId: string]`, result `CountyDistrictDetailResult | null`), `COUNTY_ASSIGN_DEO: 'county:assign-deo'` (args `[CountyAssignDeoRequest]`, result `OnlineCommandResult<null>`), `COUNTY_REMOVE_DEO: 'county:remove-deo'` (args `[CountyRemoveDeoRequest]`, result `OnlineCommandResult<null>`).
- `CountyApi` gains `listDistricts()`, `getDistrict(id)`, `assignDeo(req)`, `removeDeo(req)`.
- Gateway: `assignDistrictOfficer(req: CountyAssignDeoRequest): Promise<null>`, `removeDistrictOfficer(req: CountyRemoveDeoRequest): Promise<null>`.
- Renderer: `countyBridge.listDistricts/getDistrict/assignDeo/removeDeo`; facade `county.listDistricts()`, `county.getDistrict(id)`; hooks `useCountyDistrictsViewModel`, `useCountyDistrictDetailViewModel`.

- [ ] **Step 1: Write the failing tests**

Gateway (`BackendProvisioningGateway.test.ts`, inside `describe('online commands', …)`):

```ts
    it('assignDistrictOfficer POSTs replaceExisting to the district officers endpoint', async () => {
      const fetchMock = vi.fn(async () => response({ id: 'org-1' }));
      vi.stubGlobal('fetch', fetchMock);
      expect(await buildGateway().assignDistrictOfficer({ districtId: 'd 1', userId: 'deo-1', replaceExisting: true })).toBeNull();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url).toEqual(new URL('https://nemis.example/districts/d%201/officers/deo-1'));
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ replaceExisting: true });
    });

    it('removeDistrictOfficer DELETEs the assignment', async () => {
      const fetchMock = vi.fn(async () => response({ id: 'org-1', isActive: false }));
      vi.stubGlobal('fetch', fetchMock);
      expect(await buildGateway().removeDistrictOfficer({ districtId: 'd-1', userId: 'deo-1' })).toBeNull();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url).toEqual(new URL('https://nemis.example/districts/d-1/officers/deo-1'));
      expect(init.method).toBe('DELETE');
    });

    it('assignDistrictOfficer surfaces the server refusal message', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => errorResponse(409, { message: 'This district already has an assigned DEO (A B). Confirm replacement to assign a new DEO.' })));
      await expect(buildGateway().assignDistrictOfficer({ districtId: 'd-1', userId: 'deo-2', replaceExisting: false }))
        .rejects.toMatchObject({ message: expect.stringContaining('already has an assigned DEO') });
    });
```

Handlers (`ipc/handlers/county/districts.test.ts`):

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyDistrictHandlers } from './districts';
import { registerCountyDeoHandlers } from './deo';

interface Captured { validate: IpcValidator; handler: (...args: readonly unknown[]) => unknown }

function capture() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

describe('county district reads', () => {
  it('list-districts takes no args; get-district takes one id and passes it through', async () => {
    const { calls, handle } = capture();
    const getDistrict = vi.fn(async () => ({ data: null }));
    const app = { county: { listDistricts: async () => ({ data: { districts: [] } }), getDistrict } } as unknown as ApplicationLayer;
    registerCountyDistrictHandlers(handle, app);
    expect(await calls.get('county:list-districts')!.handler()).toEqual({ districts: [] });
    expect(() => calls.get('county:list-districts')!.validate(['x'])).toThrow(IPCError);
    expect(await calls.get('county:get-district')!.handler('d-1')).toBeNull();
    expect(getDistrict).toHaveBeenCalledWith('d-1');
    expect(() => calls.get('county:get-district')!.validate([])).toThrow(IPCError);
    expect(() => calls.get('county:get-district')!.validate([5])).toThrow(IPCError);
  });
});

describe('county DEO commands', () => {
  const gateway = () => ({
    assignDistrictOfficer: vi.fn(async () => null),
    removeDistrictOfficer: vi.fn(async () => null),
  });

  it('assign runs the command then the forced pull', async () => {
    const { calls, handle } = capture();
    const g = gateway();
    const refresh = vi.fn(async () => true);
    registerCountyDeoHandlers(handle, g, refresh);
    const request = { districtId: 'd-1', userId: 'deo-1', replaceExisting: false };
    expect(await calls.get('county:assign-deo')!.handler(request)).toEqual({ data: null, refreshed: true });
    expect(g.assignDistrictOfficer).toHaveBeenCalledWith(request);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reports refreshed:false without throwing when the pull fails', async () => {
    const { calls, handle } = capture();
    registerCountyDeoHandlers(handle, gateway(), vi.fn(async () => { throw new Error('offline'); }));
    expect(await calls.get('county:remove-deo')!.handler({ districtId: 'd-1', userId: 'deo-1' })).toEqual({ data: null, refreshed: false });
  });

  it('validates the request shapes', () => {
    const { calls, handle } = capture();
    registerCountyDeoHandlers(handle, gateway(), vi.fn(async () => true));
    const assign = calls.get('county:assign-deo')!;
    expect(() => assign.validate([{ districtId: 'd-1', userId: 'u-1', replaceExisting: true }])).not.toThrow();
    expect(() => assign.validate([{ districtId: 'd-1', userId: 'u-1' }])).toThrow(IPCError);
    expect(() => assign.validate([{ districtId: 'd-1', userId: 'u-1', replaceExisting: 'yes' }])).toThrow(IPCError);
    expect(() => assign.validate([{ districtId: '', userId: 'u-1', replaceExisting: true }])).toThrow(IPCError);
    expect(() => calls.get('county:remove-deo')!.validate([{ districtId: 'd-1', userId: 'u-1', extra: 1 }])).toThrow(IPCError);
  });
});
```

`authorizeChannel.test.ts` — extend the dashboard test into a loop over all five county channels:

```ts
  it('allows every county channel only for a county administrator', () => {
    const channels = [
      IpcChannels.COUNTY_GET_DASHBOARD,
      IpcChannels.COUNTY_LIST_DISTRICTS,
      IpcChannels.COUNTY_GET_DISTRICT,
      IpcChannels.COUNTY_ASSIGN_DEO,
      IpcChannels.COUNTY_REMOVE_DEO,
    ];
    for (const channel of channels) {
      expect(() => authorizeChannel(channel, workspace(SystemRole.COUNTY_ADMIN))).not.toThrow();
      for (const role of [SystemRole.INSTITUTION_ADMIN, SystemRole.TEACHER, SystemRole.DEO, SystemRole.MINISTRY_ADMIN]) {
        expect(() => authorizeChannel(channel, workspace(role))).toThrow(/county administrator/);
      }
    }
  });
```

`renderer/lib/ipc/index.test.ts`:

```ts
  it('county.listDistricts and county.getDistrict return bridged data', async () => {
    const getDistrict = vi.fn(async () => null);
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      county: { listDistricts: vi.fn(async () => ({ districts: [] })), getDistrict },
    });
    const app = createIpcApplicationLayer();
    expect((await app.county.listDistricts()).data).toEqual({ districts: [] });
    expect((await app.county.getDistrict('d-1')).data).toBeNull();
    expect(getDistrict).toHaveBeenCalledWith('d-1');
  });
```

- [ ] **Step 2: Run** (Electron runner) on `apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts apps/desktop/electron/ipc apps/desktop/renderer/lib/ipc/index.test.ts` → FAIL.

- [ ] **Step 3: Contract** — `ipc.ts`: import the four new types from `./county-districts` (and `OnlineCommandResult` from where `ipc.ts` already imports it); add after `'county:get-dashboard'`:

```ts
  'county:list-districts': { args: []; result: CountyDistrictsResult };
  'county:get-district': { args: [districtId: string]; result: CountyDistrictDetailResult | null };
  'county:assign-deo': { args: [request: CountyAssignDeoRequest]; result: OnlineCommandResult<null> };
  'county:remove-deo': { args: [request: CountyRemoveDeoRequest]; result: OnlineCommandResult<null> };
```

and after `COUNTY_GET_DASHBOARD`:

```ts
  COUNTY_LIST_DISTRICTS: 'county:list-districts',
  COUNTY_GET_DISTRICT: 'county:get-district',
  COUNTY_ASSIGN_DEO: 'county:assign-deo',
  COUNTY_REMOVE_DEO: 'county:remove-deo',
```

`api.ts` — `CountyApi` gains:

```ts
  listDistricts(): Promise<CountyDistrictsResult>;
  getDistrict(districtId: string): Promise<CountyDistrictDetailResult | null>;
  assignDeo(request: CountyAssignDeoRequest): Promise<OnlineCommandResult<null>>;
  removeDeo(request: CountyRemoveDeoRequest): Promise<OnlineCommandResult<null>>;
```

- [ ] **Step 4: Gateway** — in `BackendProvisioningGateway`, next to the transfer commands:

```ts
  async assignDistrictOfficer(request: CountyAssignDeoRequest): Promise<null> {
    await this.authorized(
      `/districts/${encodeURIComponent(request.districtId)}/officers/${encodeURIComponent(request.userId)}`,
      { method: 'POST', body: JSON.stringify({ replaceExisting: request.replaceExisting }) },
      () => undefined,
      ONLINE_COMMAND,
    );
    return null;
  }

  async removeDistrictOfficer(request: CountyRemoveDeoRequest): Promise<null> {
    await this.authorized(
      `/districts/${encodeURIComponent(request.districtId)}/officers/${encodeURIComponent(request.userId)}`,
      { method: 'DELETE' },
      () => undefined,
      ONLINE_COMMAND,
    );
    return null;
  }
```

- [ ] **Step 5: Validators** — `validateIpc.ts`, after the transfer validators:

```ts
// --- County (CEO) DEO commands ---------------------------------------------
export function assertCountyAssignDeoArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['districtId', 'userId', 'replaceExisting']);
  assertString(request.districtId, 'districtId', ID_MAX_LENGTH);
  assertString(request.userId, 'userId', ID_MAX_LENGTH);
  assertBoolean(request.replaceExisting, 'replaceExisting');
}

export function assertCountyRemoveDeoArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['districtId', 'userId']);
  assertString(request.districtId, 'districtId', ID_MAX_LENGTH);
  assertString(request.userId, 'userId', ID_MAX_LENGTH);
}
```


- [ ] **Step 6: Handlers + registrar + auth**

`ipc/handlers/county/districts.ts`:

```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs, assertSingleIdArg } from '@app/security/validateIpc';

export function registerCountyDistrictHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_LIST_DISTRICTS, assertNoArgs, async () => (await app.county.listDistricts()).data);
  handle(IpcChannels.COUNTY_GET_DISTRICT, assertSingleIdArg, async (districtId: string) =>
    (await app.county.getDistrict(districtId)).data,
  );
}
```

`ipc/handlers/county/deo.ts`:

```ts
import { IpcChannels, type CountyAssignDeoRequest, type CountyRemoveDeoRequest } from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertCountyAssignDeoArgs, assertCountyRemoveDeoArgs } from '@app/security/validateIpc';
import { runOnline } from '../school-admin/online';

export type CountyDeoGateway = Pick<BackendProvisioningGateway, 'assignDistrictOfficer' | 'removeDistrictOfficer'>;

/** DEO assignments are server-owned (multi-step, notifying); every change goes
 * through districts.service here, then a forced pull writes local truth. */
export function registerCountyDeoHandlers(
  handle: IpcHandle,
  gateway: CountyDeoGateway,
  refresh: () => Promise<boolean>,
): void {
  handle(IpcChannels.COUNTY_ASSIGN_DEO, assertCountyAssignDeoArgs, (request: CountyAssignDeoRequest) =>
    runOnline(() => gateway.assignDistrictOfficer(request), refresh),
  );
  handle(IpcChannels.COUNTY_REMOVE_DEO, assertCountyRemoveDeoArgs, (request: CountyRemoveDeoRequest) =>
    runOnline(() => gateway.removeDistrictOfficer(request), refresh),
  );
}
```

`ipc/handlers/county/index.ts`: also export both register functions. `registrar.ts`: import them from `@app/ipc/handlers/county`; call `registerCountyDistrictHandlers(securedHandle, app);` after `registerCountyDashboardHandlers(...)`, and `registerCountyDeoHandlers(securedHandle, gateway, refresh);` right after `registerTransferHandlers(securedHandle, gateway, refresh);`. `authorizeChannel.ts`: add the four channels to `COUNTY_ADMIN_CHANNELS`.

- [ ] **Step 7: Preload, bridge, facade, hooks**

`preload/county/districts-api.ts`:

```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyDistrictsApi: Pick<CountyApi, 'listDistricts' | 'getDistrict' | 'assignDeo' | 'removeDeo'> = {
  listDistricts: () => invoke(IpcChannels.COUNTY_LIST_DISTRICTS),
  getDistrict: (districtId) => invoke(IpcChannels.COUNTY_GET_DISTRICT, districtId),
  assignDeo: (request) => invoke(IpcChannels.COUNTY_ASSIGN_DEO, request),
  removeDeo: (request) => invoke(IpcChannels.COUNTY_REMOVE_DEO, request),
};
```

`preload/county/index.ts`: `county: { ...countyDashboardApi, ...countyDistrictsApi }` and `export * from './districts-api';`.

`renderer/services/nemis-bridge/county/districts-bridge.ts`:

```ts
import type {
  CountyAssignDeoRequest,
  CountyDistrictDetailResult,
  CountyDistrictsResult,
  CountyRemoveDeoRequest,
  OnlineCommandResult,
} from '@nemis-desktop/types';
import { api } from '../api';

export const districtsBridge = {
  listDistricts: (): Promise<CountyDistrictsResult> => api().county.listDistricts(),
  getDistrict: (districtId: string): Promise<CountyDistrictDetailResult | null> => api().county.getDistrict(districtId),
  assignDeo: (request: CountyAssignDeoRequest): Promise<OnlineCommandResult<null>> => api().county.assignDeo(request),
  removeDeo: (request: CountyRemoveDeoRequest): Promise<OnlineCommandResult<null>> => api().county.removeDeo(request),
};
```

`county/index.ts`: `countyBridge = { ...dashboardBridge, ...districtsBridge }`.

`lib/ipc/county.ts` group gains:

```ts
    listDistricts: () => query(() => countyBridge.listDistricts()),
    getDistrict: (districtId) => query(() => countyBridge.getDistrict(districtId)),
```

`lib/presentation/hooks/county.ts` append:

```ts
export const useCountyDistrictsViewModel = () => usePresentation().viewModels.countyDistricts;
export const useCountyDistrictDetailViewModel = () => usePresentation().viewModels.countyDistrictDetail;
```

- [ ] **Step 8: Verify** — Electron runner on `apps/desktop/electron/ipc apps/desktop/electron/provisioning apps/desktop/renderer/lib` → PASS; `pnpm typecheck` → 0; `pnpm lint` → 0.

- [ ] **Step 9: Commit**

```bash
git add packages/types/src/ipc.ts packages/types/src/api.ts apps/desktop/electron/provisioning/BackendProvisioningGateway.ts apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts apps/desktop/electron/security/validateIpc.ts apps/desktop/electron/ipc/handlers/county apps/desktop/electron/ipc/registrar.ts apps/desktop/electron/ipc/authorizeChannel.ts apps/desktop/electron/ipc/authorizeChannel.test.ts apps/desktop/electron/preload/county apps/desktop/renderer/services/nemis-bridge/county apps/desktop/renderer/lib/ipc/county.ts apps/desktop/renderer/lib/ipc/index.test.ts apps/desktop/renderer/lib/presentation/hooks/county.ts && git commit -m "feat(ipc): county district reads and online DEO assign/remove commands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: UI — District Management page + Manage DEO drawer

**Files:**
- Replace: `apps/desktop/renderer/app/government/county/districts/page.tsx`
- Create: `apps/desktop/renderer/app/government/county/users/create/page.tsx`
- Test: `apps/desktop/renderer/app/government/county/districts/page.test.tsx`

- [ ] **Step 1: Write the failing tests** — `districts/page.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DistrictsManagementPage from './page';

const push = vi.fn();
const confirm = vi.fn(async () => true);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@nemis-desktop/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nemis-desktop/ui')>()),
  showConfirm: (...args: unknown[]) => confirm(...args),
}));

const deo = (id: string, first: string, districtId: string | null) => ({
  id, firstName: first, lastName: 'Kollie', email: `${id}@moe.gov.lr`, phoneNumber: null,
  isActive: true, lastLoginAt: null, photoUrl: null, districtId,
});

const DATA = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  districts: [
    { id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true, activeSchoolCount: 4, activeDeoCount: 1,
      firstDeo: { userId: 'deo-1', firstName: 'Musu', lastName: 'Kollie', email: 'deo-1@moe.gov.lr', photoUrl: null } },
    { id: 'd-2', name: 'Owensgrove', code: 'D2', isActive: true, activeSchoolCount: 2, activeDeoCount: 0, firstDeo: null },
  ],
  deoUsers: [deo('deo-1', 'Musu', 'd-1'), deo('deo-2', 'Bendu', null)],
  officersByDistrict: {
    'd-1': [{ userId: 'deo-1', name: 'Musu Kollie', email: 'deo-1@moe.gov.lr', phoneNumber: null, isActive: true, lastLoginAt: null, photoUrl: null }],
    'd-2': [],
  },
};

function mockNemis(overrides: Record<string, unknown> = {}) {
  const nemis = {
    county: {
      listDistricts: vi.fn(async () => DATA),
      assignDeo: vi.fn(async () => ({ data: null, refreshed: true })),
      removeDeo: vi.fn(async () => ({ data: null, refreshed: true })),
      ...overrides,
    },
  };
  (window as unknown as { nemis: unknown }).nemis = nemis;
  return nemis;
}

/** The Drawer has no dialog role; its title h2 sits inside the fixed panel. */
function drawer(): HTMLElement {
  return screen.getByRole('heading', { name: /Manage DEO/ }).closest('.fixed') as HTMLElement;
}

function renderPage(online = true) {
  const layer = createRendererPresentation();
  layer.stores.connectivity.setOnline(online);
  render(<PresentationProvider layer={layer}><DistrictsManagementPage /></PresentationProvider>);
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
  confirm.mockClear();
});

describe('County District Management page', () => {
  it('renders the header, stat cards and district cards', async () => {
    mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByText('District Management')).toBeInTheDocument());
    expect(screen.getByText('Grand Bassa')).toBeInTheDocument();
    expect(screen.getByText('Musu Kollie')).toBeInTheDocument();
    expect(screen.getByText('No DEO assigned')).toBeInTheDocument();
    expect(screen.getByText('Total Schools').parentElement!.textContent).toContain('6');
  });

  it('toggles to the table view', async () => {
    mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Table view')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Table view'));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('View Details routes to the detail page with the id in the query', async () => {
    mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getAllByText('View Details').length).toBe(2));
    fireEvent.click(screen.getAllByText('View Details')[0]!);
    expect(push).toHaveBeenCalledWith('/government/county/districts/details?id=d-1');
  });

  it('assigns a DEO to a district with none, without asking to replace', async () => {
    const nemis = mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByText('Assign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Assign DEO'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deo-2' } });
    fireEvent.click(within(drawer()).getAllByText('Assign DEO').at(-1)!);
    await waitFor(() => expect(nemis.county.assignDeo).toHaveBeenCalledWith({ districtId: 'd-2', userId: 'deo-2', replaceExisting: false }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before replacing the current DEO', async () => {
    const nemis = mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByText('Reassign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reassign DEO'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deo-2' } });
    fireEvent.click(within(drawer()).getAllByText('Reassign DEO').at(-1)!);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    await waitFor(() => expect(nemis.county.assignDeo).toHaveBeenCalledWith({ districtId: 'd-1', userId: 'deo-2', replaceExisting: true }));
  });

  it('removes the current DEO after confirmation', async () => {
    const nemis = mockNemis();
    renderPage();
    await waitFor(() => expect(screen.getByText('Reassign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reassign DEO'));
    fireEvent.click(screen.getByText('Remove from District'));
    await waitFor(() => expect(nemis.county.removeDeo).toHaveBeenCalledWith({ districtId: 'd-1', userId: 'deo-1' }));
  });

  it("shows the server's refusal in the drawer", async () => {
    mockNemis({ assignDeo: vi.fn(async () => { throw new Error('[REMOTE_REJECTED] This district already has an assigned DEO (Musu Kollie).'); }) });
    renderPage();
    await waitFor(() => expect(screen.getByText('Assign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Assign DEO'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deo-2' } });
    fireEvent.click(within(drawer()).getAllByText('Assign DEO').at(-1)!);
    await waitFor(() => expect(screen.getByText('This district already has an assigned DEO (Musu Kollie).')).toBeInTheDocument());
  });

  it('offline disables every DEO action', async () => {
    const nemis = mockNemis();
    renderPage(false);
    await waitFor(() => expect(screen.getByText('Reassign DEO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reassign DEO'));
    const dialog = drawer();
    expect(within(dialog).getByText('DEO changes need an internet connection.')).toBeInTheDocument();
    expect(within(dialog).getByText('Remove from District').closest('button')).toBeDisabled();
    expect(within(dialog).getAllByText('Reassign DEO').at(-1)!.closest('button')).toBeDisabled();
    expect(nemis.county.assignDeo).not.toHaveBeenCalled();
  });
});
```


Also add `apps/desktop/renderer/app/government/county/users/create/page.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

describe('County Create User placeholder', () => {
  it('is a ComingSoon page', () => {
    render(<Page />);
    expect(screen.getByText('Create User')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run apps/desktop/renderer/app/government/county/districts apps/desktop/renderer/app/government/county/users` → FAIL.

- [ ] **Step 3: Port the page.** Copy portal-web's file, then edit:

```bash
cp "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/portal-web/src/app/government/county/districts/page.tsx" apps/desktop/renderer/app/government/county/districts/page.tsx
```

Edit 1 — replace everything from the first line through the `const loading = countyLoading || districtsLoading;` line (portal-web L1–94) with:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Spinner, Drawer, showConfirm, Avatar, Card, ErrorState } from "@nemis-desktop/ui";
import { LayoutGrid, List, Building2, AlertTriangle } from "lucide-react";
import { useCountyDistrictsViewModel } from "@/lib/presentation/hooks/county";
import { useConnectivityStore } from "@/lib/presentation/hooks/shared";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { parseIpcError } from "@/lib/errors/parseIpcError";
import { countyBridge } from "@/services/nemis-bridge/county";

// Desktop: online-command failures arrive as `[CODE] message` IPC errors.
function getErrorMessage(error: unknown, fallback: string) {
  return parseIpcError(error)?.message || fallback;
}

export default function DistrictsManagementPage() {
  const router = useRouter();
  const vm = useCountyDistrictsViewModel();
  const summary = useViewModel(vm.store, (s) => s.summary);
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const [selectedDistrict, setSelectedDistrict] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedDeoUserId, setSelectedDeoUserId] = useState<string>("");
  const [deoError, setDeoError] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [assigningDeo, setAssigningDeo] = useState(false);
  const [removingDeo, setRemovingDeo] = useState(false);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  // `refreshing` keeps the page on screen during a reload.
  const data =
    summary.status === "success" || summary.status === "refreshing" ? summary.data : null;
  const county = data?.county ?? null;
  const districts = data?.districts ?? [];
  const deoUsers = data?.deoUsers ?? [];
  const districtOfficersData = selectedDistrict
    ? { officers: data?.officersByDistrict[selectedDistrict.id] ?? [] }
    : undefined;
  const districtsLoading = summary.status === "loading";
  const deoUsersLoading = districtsLoading;
  const refetchDeoUsers = () => void vm.load();
```

Then keep portal-web's `availableDeoOptions` `useMemo` … `maxSchools` block unchanged, and replace its `if (loading) {` with:

```tsx
  if (summary.status === "idle" || summary.status === "loading") {
```

and right after that block's closing `}` insert:

```tsx
  if (summary.status === "error") {
    return (
      <div className="p-8">
        <ErrorState message={summary.error.userMessage} onRetry={() => void vm.load()} />
      </div>
    );
  }
```

Edit 2 — `<CountyAuthGuard>` → `<>` and `</CountyAuthGuard>` → `</>`.

Edit 3 — both `` `/government/county/districts/${district.id}` `` → `` `/government/county/districts/details?id=${district.id}` ``.

Edit 4 — the Quick Actions Refresh button's `onClick={async () => { … }}` body becomes:

```tsx
                onClick={async () => {
                  setIsRefreshing(true);
                  await vm.load();
                  setIsRefreshing(false);
                }}
```

Edit 5 — drawer footer Assign button: `disabled={` gains `!online ||` as its first term; inside its `onClick`, replace the `try { await assignDeo({ … }).unwrap(); await refetchOfficers(); await refetchDistricts(); await refetchDeoUsers(); setSelectedDeoUserId(""); } catch (e) { … }` with:

```tsx
                  setAssigningDeo(true);
                  try {
                    await countyBridge.assignDeo({
                      districtId: selectedDistrict!.id,
                      userId: selectedDeoUserId,
                      replaceExisting: replacingExisting,
                    });
                    await vm.load();
                    setSelectedDeoUserId("");
                  } catch (e) {
                    setDeoError(
                      getErrorMessage(
                        e,
                        "Failed to assign DEO. Please try again.",
                      ),
                    );
                  } finally {
                    setAssigningDeo(false);
                  }
```

Edit 6 — after the `{deoError && ( … )}` block insert:

```tsx
            {!online && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  DEO changes need an internet connection.
                </p>
              </div>
            )}
```

Edit 7 — drawer "All County DEOs" Refresh button: `onClick={async () => { await refetchDeoUsers(); await refetchDistricts(); }}` → `onClick={() => void vm.load()}` and `disabled={deoUsersLoading}` → `disabled={deoUsersLoading || !online}`.

Edit 8 — "Remove from District" button: add `disabled={!online}`; replace its `try { await removeDeo({ … }).unwrap(); await refetchDeoUsers(); await refetchDistricts(); } catch (e) { … }` with:

```tsx
                                  setRemovingDeo(true);
                                  try {
                                    await countyBridge.removeDeo({
                                      districtId: selectedDistrict!.id,
                                      userId: deoUser.id,
                                    });
                                    await vm.load();
                                  } catch (e) {
                                    setDeoError(
                                      getErrorMessage(
                                        e,
                                        "Failed to remove DEO. Please try again.",
                                      ),
                                    );
                                  } finally {
                                    setRemovingDeo(false);
                                  }
```

Edit 9 — the `<select>`: `disabled={deoUsersLoading}` → `disabled={deoUsersLoading || !online}`.

After the edits, `grep -n "useAppSelector\|useAppDispatch\|countyApi\|CountyAuthGuard\|refetchDistricts\|refetchOfficers\|unwrap\|console.log\|@nemis/" apps/desktop/renderer/app/government/county/districts/page.tsx` must print nothing.

`users/create/page.tsx`:

```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';

export default function Page() {
  return <ComingSoon title="Create User" />;
}
```

- [ ] **Step 4: Verify** — the Step 2 command → PASS; `pnpm lint` → 0; `pnpm typecheck` → 0. Diff the port against portal-web ignoring CR (`diff --strip-trailing-cr`) and confirm every hunk is one of Edits 1–9.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/app/government/county/districts/page.tsx apps/desktop/renderer/app/government/county/districts/page.test.tsx apps/desktop/renderer/app/government/county/users/create && git commit -m "feat(county): port District Management and the Manage DEO drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: UI — District Details page

**Files:**
- Create: `apps/desktop/renderer/lib/institutionMetadata.ts` (verbatim copy)
- Create: `apps/desktop/renderer/components/county/districts/DistrictDetailsPage.tsx`
- Create: `apps/desktop/renderer/app/government/county/districts/details/page.tsx`
- Test: `apps/desktop/renderer/components/county/districts/DistrictDetailsPage.test.tsx`

- [ ] **Step 1: Write the failing tests** — `DistrictDetailsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { DistrictDetailsPage } from './DistrictDetailsPage';

let searchId: string | null = 'd-1';
vi.mock('next/navigation', () => ({ useSearchParams: () => ({ get: () => searchId }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const school = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) => ({
  id, name, code: id.toUpperCase(), type, emisCode: null, officialSchoolCode: null, street: '1 Road',
  communityTown: 'Buchanan City', ownership: 'PUBLIC', contactPhone: '0771', contactPersonPhone: null,
  metadata: { contact: { principal: 'Mr. Doe' }, statistics: { studentCount: 120, teacherCount: 6 } },
  isActive: true, ...extra,
});

const DETAIL = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  district: { id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true },
  officers: [{ userId: 'deo-1', name: 'Musu Kollie', email: 'musu@moe.gov.lr', phoneNumber: null, isActive: true, lastLoginAt: null, photoUrl: null }],
  institutions: [school('a', 'Alpha High', 'SCHOOL'), school('t', 'Tech Institute', 'TVET')],
  stats: { totalSchools: 2, totalStudents: 250, totalTeachers: 7, deoCount: 1, studentTeacherRatio: 36 },
};

function renderWith(getDistrict: () => Promise<unknown>) {
  (window as unknown as { nemis: unknown }).nemis = { county: { getDistrict: vi.fn(getDistrict) } };
  render(<PresentationProvider layer={createRendererPresentation()}><DistrictDetailsPage /></PresentationProvider>);
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  searchId = 'd-1';
});

describe('County District Details page', () => {
  it('shows the header, DEO and stat cards, analytics and the SCHOOL-type table', async () => {
    renderWith(async () => DETAIL);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Buchanan' })).toBeInTheDocument());
    expect(screen.getByText(/Grand Bassa County · D1/)).toBeInTheDocument();
    expect(screen.getByText('Musu Kollie')).toBeInTheDocument();
    expect(screen.getByText('36')).toBeInTheDocument();
    expect(screen.getByText('Alpha High')).toBeInTheDocument();
    expect(screen.queryByText('Tech Institute')).not.toBeInTheDocument();
    expect(screen.getByText('Mr. Doe')).toBeInTheDocument();
    expect(screen.getByText('Back to Districts').closest('a')).toHaveAttribute('href', '/government/county/districts');
  });

  it('shows the web error view for an unknown district', async () => {
    renderWith(async () => null);
    await waitFor(() => expect(screen.getByText('Failed to load district details. Please try again.')).toBeInTheDocument());
  });

  it('shows the web error view when no id is given', async () => {
    searchId = null;
    renderWith(async () => DETAIL);
    await waitFor(() => expect(screen.getByText('Failed to load district details. Please try again.')).toBeInTheDocument());
  });
});
```


- [ ] **Step 2: Run** `pnpm exec vitest run apps/desktop/renderer/components/county/districts` → FAIL.

- [ ] **Step 3: Implement**

```bash
cp "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/portal-web/src/lib/institutionMetadata.ts" apps/desktop/renderer/lib/institutionMetadata.ts
mkdir -p apps/desktop/renderer/components/county/districts
cp "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/portal-web/src/app/government/county/districts/[id]/page.tsx" apps/desktop/renderer/components/county/districts/DistrictDetailsPage.tsx
```

Edits to `DistrictDetailsPage.tsx`:

Edit 1 — replace portal-web L1–102 (imports through `const districtSchools = …;`) with:

```tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, Button, Spinner, EmptyState, Alert } from "@nemis-desktop/ui";
import { useCountyDistrictDetailViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import {
  getInstitutionPrincipalName,
  getInstitutionStatistics,
} from "@/lib/institutionMetadata";

function formatLabel(value?: string | null) {
  if (!value) return "N/A";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayValue(value: unknown, fallback = "N/A") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export function DistrictDetailsPage() {
  const districtId = useSearchParams().get("id") ?? "";
  const vm = useCountyDistrictDetailViewModel();
  const detail = useViewModel(vm.store, (s) => s.detail);

  useRevalidateOnSync(() => {
    if (districtId) void vm.load(districtId);
  }, [vm, districtId]);

  const data =
    detail.status === "success" || detail.status === "refreshing" ? detail.data : null;
  const county = data?.county ?? null;
  const district = data?.district ?? null;
  const stats = data?.stats;
  const officersData = data ? { officers: data.officers } : undefined;
  const schools = data?.schools ?? [];
  const districtError = !districtId || detail.status === "error" || detail.status === "empty";
  const loading = !!districtId && (detail.status === "idle" || detail.status === "loading");

  const deoUser = officersData?.officers?.[0];
  const districtSchools =
    schools.length > 0 ? schools : district?.institutions || [];
```

Edit 2 — `<CountyAuthGuard>` → `<>`, `</CountyAuthGuard>` → `</>` (three pairs).

Edit 3 — delete the `const errors = [ … ].filter(Boolean).length;` statement and the `{errors > 0 && ( <Alert variant="warning"> … </Alert> )}` block.

Edit 4 — replace `students.length` → `0` and `teachers.length` → `0` (every occurrence; `stats` is always present once the district loads).

`app/government/county/districts/details/page.tsx`:

```tsx
import { Suspense } from 'react';
import { DistrictDetailsPage } from '@/components/county/districts/DistrictDetailsPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <DistrictDetailsPage />
    </Suspense>
  );
}
```

After the edits, `grep -n "useAppSelector\|CountyAuthGuard\|useGet\|@nemis/\|students\.length\|teachers\.length" apps/desktop/renderer/components/county/districts/DistrictDetailsPage.tsx` prints nothing.

- [ ] **Step 4: Verify** — Step 2 command → PASS; `pnpm lint` → 0; `pnpm typecheck` → 0; `diff --strip-trailing-cr` of the helper vs portal-web → identical.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/lib/institutionMetadata.ts apps/desktop/renderer/components/county/districts apps/desktop/renderer/app/government/county/districts/details && git commit -m "feat(county): port the District Details page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Full gate

- [ ] **Step 1: Desktop** — `pnpm lint && pnpm typecheck && ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run` (run in background; it takes several minutes). Expected: lint 0, typecheck 0, all tests pass except the two known pre-existing renderer failures.
- [ ] **Step 2: Server** — `cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/Server" && pnpm typecheck && npx jest src/desktop-provisioning src/districts src/users` → exit 0.
- [ ] **Step 3: Static build check** — `pnpm --filter @nemis-desktop/app build:renderer` → succeeds (proves the Suspense-wrapped `details` route exports). If the build needs network or is too slow on this machine, ledger that and rely on the Suspense pattern already proven by `academic-grading`.
- [ ] **Step 4: Hand off** — report; merging (server first) via superpowers:finishing-a-development-branch; GUI pass (County Admin, online and offline) is Alvin's.
