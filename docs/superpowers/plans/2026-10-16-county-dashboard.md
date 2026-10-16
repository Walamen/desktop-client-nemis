# County Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop County dashboard placeholder with portal-web's County dashboard (same design and behaviour), computed offline from the County device's synced SQLite data.

**Architecture:** The Nemis server's desktop snapshot gains the county row, every county district with `isActive`, `institutions.isActive` and `students.createdAt`; desktop migration 031 stores them. A read-model port + `GetCountyDashboardUseCase` (application) ports the server's dashboard formulas; a SQLite adapter answers the port; a `CountyDashboardViewModel` (presentation) feeds the page over a new `county:get-dashboard` IPC channel restricted to COUNTY_ADMIN. The page and its 5 chart components are copied from portal-web with only import/data-source changes.

**Tech Stack:** NestJS + Prisma + Jest (Nemis server); Electron 42.7.0, better-sqlite3 (SQLCipher), TypeScript, Vitest, Next 15 static export, React 19, Zustand vanilla, Recharts 3, Tailwind (desktop).

**Spec:** `docs/superpowers/specs/2026-10-16-county-dashboard-design.md` (read it with this plan)

## Global Constraints

- Two repos: `C:\Users\Alvin Dogba Jr\Desktop\Walamen\Nemis` (server, Task 1) and `C:\Users\Alvin Dogba Jr\Desktop\Walamen\desktop-client-nemis` (Tasks 2–8). Branch `feat/county-dashboard` in each. Desktop branch already exists.
- **Never stage** the user's uncommitted `apps/desktop/package.json` version bump (`2.0.1` → `2.0.2`) or `pnpm-lock.yaml` hunk unrelated to this work. Stage files by explicit path, never `git add -A` / `git add .`. Task 7 must add deps to `apps/desktop/package.json` — stage only those hunks with `git add -p`.
- Commit message trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Desktop tests that touch SQLite must run under Electron's Node (better-sqlite3 is built for the Electron ABI): from the desktop repo root, `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>` (bash). Pure TS/React tests may use `pnpm exec vitest run <paths>`.
- Known pre-existing desktop failures, unrelated: `apps/desktop/renderer/app/page.test.tsx` and `apps/desktop/renderer/app/government/teacher/timetable.test.tsx`.
- `noUncheckedIndexedAccess` is on in the desktop repo: indexed reads are `T | undefined`.
- Parity rule: port portal-web/server behaviour as-is, quirks included (empty dropout trend, coverage counting all students, `font-['Sora']`, the `setMonth`-before-`setDate(1)` window). The only intended differences are listed in spec §3.
- Renderer components may import only `@nemis-desktop/presentation`, `@nemis-desktop/ui`, `@nemis-desktop/types` and renderer-local modules (ESLint `rendererImportGuard`); `@nemis-desktop/application` is allowed only under `renderer/lib/ipc/` and `renderer/lib/presentation/`.

## Review Focus

- **Reload with data on screen** (Refresh Data click, or a sync finishing): the page must keep the dashboard visible (`refreshing` state), not flash the full-page spinner. → Task 7 test "keeps the dashboard on screen while Refresh Data reloads".
- **County device that synced before this release** (every `students.createdAt` NULL): the trend must be flat at the student total, not empty or crashing. → Task 3 test "puts every student without a createdAt into the pre-window base".
- **Older server snapshot** (institution/district rows with no `isActive` key): import must store them as active, not fail on NOT NULL. → Task 2 test "stores a school or district with no isActive key as active".
- **Schools in an inactive district, or with no district**: their students still count in totals; inactive districts are not in the Districts card; district-less students are left out of Enrollment by District. → Task 4 tests.
- **An empty county** (no schools/students yet): page renders zeros and the web's placeholders without crashing. → Task 7 test "renders an empty county with zeros".

---

### Task 1: Server — ship the county row, county districts, `institutions.isActive`, `students.createdAt` (Nemis repo)

**Files:**
- Modify: `Nemis/packages/types/src/desktop-provisioning.ts` (interface `DesktopProvisioningData`, ~line 68)
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` (district query ~line 216; row mappings ~lines 601–790)
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`

**Interfaces:**
- Produces: snapshot `data.counties: { id, code, name, isActive }[]` (one row for COUNTY scope, `[]` otherwise); `data.districts[*].isActive: boolean`; `data.institutions[*].isActive: boolean`; `data.students[*].createdAt: string | null` (ISO).

- [ ] **Step 1: Branch**

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && git switch main && git switch -c feat/county-dashboard
```

- [ ] **Step 2: Write the failing tests**

In `desktop-provisioning.service.spec.ts`, test `"produces a versioned snapshot whose checksum covers the exact data payload"` (INSTITUTION scope), add after the existing `expect(snapshot.data).toHaveProperty("attendance");`:

```ts
    // Non-county scopes: no county row, and districts still come from the
    // institutions this device is authorized for.
    expect(snapshot.data.counties).toEqual([]);
    expect(tx.district.findMany).toHaveBeenCalledWith({
      where: { institutions: { some: { id: { in: ["school-1"] } } } },
      orderBy: { id: "asc" },
    });
```

Replace the whole test `"includes every district referenced by scoped institutions, deduplicated"` with:

```ts
  it("ships a county device its county row, every county district with isActive, and the school/student dashboard fields", async () => {
    const countyAdmin: UserContext = {
      userId: "user-county",
      email: "county-admin@nemis.gov",
      role: "COUNTY_ADMIN",
      countyId: "county-1",
      organizations: [
        {
          role: "COUNTY_ADMIN",
          countyId: "county-1",
        } as UserContext["organizations"][number],
      ],
    };
    const institutionRow = (id: string) => ({
      id,
      code: id,
      name: `Institution ${id}`,
      type: "PRIMARY",
      ownership: "PUBLIC",
      countyId: "county-1",
      districtId: "district-1",
      approvalStatus: "APPROVED",
      address: null,
      communityTown: null,
      gpsCoordinates: null,
      rejectionReason: null,
      metadata: null,
      isActive: id === "school-1",
      levels: [],
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const emptyFind = { findMany: jest.fn().mockResolvedValue([]) };
    const tx = {
      county: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "county-1",
            code: "GB",
            name: "Grand Bassa",
            isActive: true,
            createdAt: new Date("2020-01-01T00:00:00.000Z"),
            updatedAt: new Date("2020-01-01T00:00:00.000Z"),
          },
        ]),
      },
      institution: {
        findMany: jest
          .fn()
          .mockResolvedValue([institutionRow("school-1"), institutionRow("school-2")]),
      },
      district: {
        findMany: jest.fn().mockResolvedValue([
          { id: "district-1", code: "D1", name: "Sinkor District", countyId: "county-1", isActive: true },
          { id: "district-2", code: "D2", name: "Old District", countyId: "county-1", isActive: false },
        ]),
      },
      userOrganization: emptyFind,
      academicYear: emptyFind,
      term: emptyFind,
      class: emptyFind,
      subject: emptyFind,
      classSubject: emptyFind,
      assessmentTemplate: emptyFind,
      assessment: emptyFind,
      student: { findMany: jest.fn().mockResolvedValue([studentRow("s-1", "school-1")]) },
      guardian: emptyFind,
      studentGuardian: emptyFind,
      enrollment: emptyFind,
      attendance: emptyFind,
      staff: emptyFind,
      staffDirectory: emptyFind,
      subjectTeacher: emptyFind,
      classTeacher: emptyFind,
      classSubjectTeacher: emptyFind,
      timetableEntry: emptyFind,
      studentTransfer: emptyFind,
      institutionGradingConfig: emptyFind,
      gradingPeriod: emptyFind,
      gradeEntryWindow: emptyFind,
      gradeEntryWindowClass: emptyFind,
      grade: emptyFind,
      feeRule: emptyFind,
      studentFeeObligation: emptyFind,
      feePayment: emptyFind,
      announcement: emptyFind,
      conversation: emptyFind,
      message: emptyFind,
      userNotification: emptyFind,
      report: emptyFind,
      alert: emptyFind,
      assignment: emptyFind,
      assignmentSubmission: emptyFind,
      classResource: emptyFind,
      gradeCompletion: emptyFind,
    };
    const countyDeviceRow = () => ({
      ...deviceRow(),
      role: "COUNTY_ADMIN" as const,
      scopeType: "COUNTY",
      scopeId: "county-1",
      institutionId: null,
    });
    const prisma = {
      desktopDevice: {
        findFirst: jest.fn().mockResolvedValue(countyDeviceRow()),
        update: jest.fn().mockResolvedValue(countyDeviceRow()),
      },
      // authorizedInstitutionIds() queries this directly on `prisma`, not `tx`.
      institution: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "school-1" }, { id: "school-2" }]),
      },
      $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    } as unknown as PrismaService;

    const snapshot = await new DesktopProvisioningService(prisma, configService).getSnapshot(
      "device-1",
      countyAdmin,
    );

    expect(tx.county.findMany).toHaveBeenCalledWith({
      where: { id: "county-1" },
      orderBy: { id: "asc" },
    });
    expect(snapshot.data.counties).toEqual([
      { id: "county-1", code: "GB", name: "Grand Bassa", isActive: true },
    ]);
    // Every district of the county, active or not — the desktop filters for
    // the Districts card but still needs an inactive district's name for
    // Enrollment by District.
    expect(tx.district.findMany).toHaveBeenCalledWith({
      where: { countyId: "county-1" },
      orderBy: { id: "asc" },
    });
    expect(snapshot.data.districts).toEqual([
      { id: "district-1", name: "Sinkor District", countyId: "county-1", isActive: true },
      { id: "district-2", name: "Old District", countyId: "county-1", isActive: false },
    ]);
    expect(
      (snapshot.data.institutions as { id: string; isActive: boolean }[]).map((row) => [row.id, row.isActive]),
    ).toEqual([
      ["school-1", true],
      ["school-2", false],
    ]);
    expect(snapshot.data.students[0]).toMatchObject({ id: "s-1", createdAt: "2018-09-01T00:00:00.000Z" });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/Server" && npx jest src/desktop-provisioning/desktop-provisioning.service.spec.ts`
Expected: FAIL — `snapshot.data.counties` is `undefined`; the county test fails on the `county.findMany` / district-query / `isActive` / `createdAt` expectations.

- [ ] **Step 4: Add `counties` to the shared contract type**

In `Nemis/packages/types/src/desktop-provisioning.ts`, replace the `districts` member's doc comment and add `counties` directly above it:

```ts
export interface DesktopProvisioningData {
  /** The county a COUNTY-scope device administers — exactly one row
   * `{ id, code, name, isActive }`; `[]` for every other scope. Read-only. */
  counties: Record<string, unknown>[];
  /** County-scoped reference data (id, name, countyId, isActive). COUNTY scope:
   * every district of the county, active or not. Other scopes: every district
   * that owns at least one institution in the snapshot. Read-only — the
   * desktop client never writes districts locally. */
  districts: Record<string, unknown>[];
```

Then rebuild the package the server compiles against:

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && pnpm --filter @nemis/types build
```

- [ ] **Step 5: Implement the server change**

In `desktop-provisioning.service.ts` inside `getSnapshot`'s transaction callback, immediately before `const [` (the big destructure, ~line 162), add:

```ts
        // The county row for a County device's dashboard header. Never
        // since-filtered: one tiny row, sent in full like districts.
        const counties =
          scope.scopeType === "COUNTY" && scope.countyId
            ? await tx.county.findMany({
                where: { id: scope.countyId },
                orderBy: { id: "asc" },
              })
            : [];
```

Replace the district query (the `tx.district.findMany({ where: { institutions: { some: { id: institutionWhere } } }, orderBy: { id: "asc" } })` entry, ~line 216) with:

```ts
          tx.district.findMany({
            // A County device gets every district of its county, active or
            // not, so its dashboard can count active districts (as the web's
            // GET /districts?countyId= does) and still name an inactive
            // district's schools in Enrollment by District.
            where:
              scope.scopeType === "COUNTY"
                ? { countyId: scope.countyId }
                : { institutions: { some: { id: institutionWhere } } },
            orderBy: { id: "asc" },
          }),
```

In the returned object (`return {` ~line 601), add `counties` first and `isActive` to districts:

```ts
        return {
          counties: counties.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            isActive: row.isActive,
          })),
          districts: districts.map((row) => ({
            id: row.id,
            name: row.name,
            countyId: row.countyId,
            isActive: row.isActive,
          })),
```

In the `institutions:` mapping, add after `rejectionReason: row.rejectionReason,`:

```ts
            isActive: row.isActive,
```

In the first `students:` spread (`...students.map((row) => ({`), add after `isActive: row.isActive,`:

```ts
              createdAt: row.createdAt.toISOString(),
```

In the departed-cohort spread (`...departedStudents.map((row) => ({`), add after its `isActive: row.isActive,`:

```ts
              // Not in the minimal departed projection; the County dashboard
              // never reads a departed child.
              createdAt: null,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/Server" && npx jest src/desktop-provisioning`
Expected: PASS for the whole `desktop-provisioning` folder. If another existing test fails because its student fixture has no `createdAt`, add `createdAt: new Date("2018-09-01T00:00:00.000Z")` to that fixture (Prisma's `createdAt` is never null; do not optional-chain the production code).

- [ ] **Step 7: Typecheck**

Run: `cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/Server" && pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && git add packages/types/src/desktop-provisioning.ts apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts && git commit -m "feat(desktop-provisioning): ship the county, county districts, school isActive and student createdAt

County devices compute the County dashboard locally and need the county
name, every district of the county with isActive, institutions.isActive
and students.createdAt (enrollment trend).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Desktop — `counties` collection, migration 031, importer columns and defaults

**Files:**
- Modify: `packages/types/src/provisioning.ts` (`PROVISIONING_COLLECTIONS`, ~line 80)
- Modify: `apps/desktop/electron/database/schema/tableNames.ts`
- Create: `apps/desktop/electron/database/migrations/031-add-county-dashboard-columns.ts`
- Modify: `apps/desktop/electron/database/migrations/registry.ts`
- Test: `apps/desktop/electron/database/migrations/031-add-county-dashboard-columns.test.ts`
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts` (`TableSpec` ~33, `SPECS` ~62, `spec()` ~263, `upsertRows` ~368)
- Test: `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`

**Interfaces:**
- Produces: table `counties (id TEXT PK, code TEXT, name TEXT NOT NULL)`; columns `students.createdAt TEXT NULL`, `institutions.isActive INTEGER NOT NULL DEFAULT 1`, `districts.isActive INTEGER NOT NULL DEFAULT 1`; `TableNames.counties = 'counties'`; collection key `'counties'`.

- [ ] **Step 1: Write the failing migration test**

Create `apps/desktop/electron/database/migrations/031-add-county-dashboard-columns.test.ts`:

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

const NOW = '2026-01-01T00:00:00.000Z';

type ColumnInfo = { name: string; notnull: number; dflt_value: string | null };

function migratedThrough(version: number): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations.filter((m) => m.version <= version)) migration.up(db);
  return db;
}

function column(db: Database.Database, table: string, name: string): ColumnInfo | undefined {
  return (db.pragma(`table_info(${table})`) as ColumnInfo[]).find((c) => c.name === name);
}

function seedSchool(db: Database.Database): void {
  db.prepare(
    `INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
     VALUES ('school-1','SCH','School','PRIMARY','PUBLIC','county-1','APPROVED',1,?)`,
  ).run(NOW);
}

describe('migration 031 add-county-dashboard-columns', () => {
  it('adds the counties table and the three dashboard columns with their defaults', () => {
    const db = migratedThrough(31);
    expect((db.pragma('table_info(counties)') as ColumnInfo[]).map((c) => c.name)).toEqual([
      'id',
      'code',
      'name',
    ]);
    expect(column(db, 'students', 'createdAt')).toMatchObject({ notnull: 0, dflt_value: null });
    expect(column(db, 'institutions', 'isActive')).toMatchObject({ notnull: 1, dflt_value: '1' });
    expect(column(db, 'districts', 'isActive')).toMatchObject({ notnull: 1, dflt_value: '1' });
  });

  it('keeps existing rows: schools and districts become active, students get a NULL createdAt', () => {
    const db = migratedThrough(30);
    seedSchool(db);
    db.prepare(`INSERT INTO districts (id,name,countyId) VALUES ('district-1','Sinkor','county-1')`).run();
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES ('s-1','school-1','Ada','Kollie','000000000018','2015-01-01','FEMALE',1,1,?)`,
    ).run(NOW);

    migrations.find((m) => m.version === 31)!.up(db);

    expect(db.prepare(`SELECT isActive FROM institutions`).get()).toEqual({ isActive: 1 });
    expect(db.prepare(`SELECT isActive FROM districts`).get()).toEqual({ isActive: 1 });
    expect(db.prepare(`SELECT firstName, createdAt FROM students`).get()).toEqual({
      firstName: 'Ada',
      createdAt: null,
    });
  });

  it('never puts the server-owned students.createdAt into a push payload', () => {
    const db = migratedThrough(31);
    seedSchool(db);
    db.prepare(`DELETE FROM sync_queue`).run();
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt,createdAt)
       VALUES ('s-1','school-1','Ada','Kollie','000000000018','2015-01-01','FEMALE',1,1,?,'2026-03-15T12:00:00.000Z')`,
    ).run(NOW);

    const row = db
      .prepare(`SELECT payload FROM sync_queue WHERE entityType = 'students'`)
      .get() as { payload: string };
    const record = (JSON.parse(row.payload) as { record: Record<string, unknown> }).record;
    expect(record).toHaveProperty('firstName', 'Ada');
    expect(record).not.toHaveProperty('createdAt');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (desktop repo root): `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/database/migrations/031-add-county-dashboard-columns.test.ts`
Expected: FAIL — no migration with version 31 (`migrations.find(...)` is undefined / `counties` has no columns).

- [ ] **Step 3: Write the migration and register it**

Create `apps/desktop/electron/database/migrations/031-add-county-dashboard-columns.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County dashboard (docs/superpowers/specs/2026-10-16-county-dashboard-design.md).
 * `counties` holds the one county a County device administers (header name);
 * read-only, so no outbox triggers, like `districts` (migration 021).
 * `students.createdAt` feeds the 12-month enrollment trend; `isActive` on
 * institutions and districts mirrors the server's active-only counts.
 * Existing rows get the values on the next full resync.
 *
 * Students' outbox triggers are deliberately NOT regenerated:
 * installOutboxTriggers snapshots each table's columns when it runs, so the
 * current triggers keep `createdAt` out of push payloads. It is server-owned
 * and must never be pushed — a future migration that regenerates every
 * trigger (as 026 did) must exclude `students.createdAt`. */
export const addCountyDashboardColumns: Migration = {
  version: 31,
  name: 'add-county-dashboard-columns',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE counties (
        id TEXT PRIMARY KEY,
        code TEXT,
        name TEXT NOT NULL
      );
      ALTER TABLE students ADD COLUMN createdAt TEXT;
      ALTER TABLE institutions ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE districts ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;
    `);
  },
};
```

In `registry.ts`, add the import after the 030 import and append to the array after `makeUserEmailNullable,`:

```ts
import { addCountyDashboardColumns } from './031-add-county-dashboard-columns';
```

```ts
  makeUserEmailNullable,
  addCountyDashboardColumns,
];
```

In `apps/desktop/electron/database/schema/tableNames.ts`, add after `districts: 'districts',`:

```ts
  counties: 'counties',
```

- [ ] **Step 4: Run the migration test to verify it passes**

Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/database/migrations/031-add-county-dashboard-columns.test.ts apps/desktop/electron/database/DatabaseManager.test.ts`
Expected: PASS (DatabaseManager's `migrations.length` check picks up 31 automatically).

- [ ] **Step 5: Write the failing importer tests**

In `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`, add inside `describe('ProvisioningImporter', …)` (e.g. after the `'tolerates a snapshot missing a collection entirely …'` test):

```ts
  it('imports the county row and the dashboard columns', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(
      snapshotOf({
        ...BASE_DATA,
        counties: [{ id: 'county-1', code: 'GB', name: 'Grand Bassa', isActive: true }],
        districts: [{ id: 'district-1', name: 'Sinkor', countyId: 'county-1', isActive: false }],
        institutions: [{ ...BASE_DATA.institutions![0]!, isActive: false }],
        students: [{ ...student('s1', 'Ada'), createdAt: '2026-03-15T12:00:00.000Z' }],
      }),
      CONTEXT,
    );
    const db = manager.connection;
    expect(db.prepare(`SELECT id, code, name FROM counties`).all()).toEqual([
      { id: 'county-1', code: 'GB', name: 'Grand Bassa' },
    ]);
    expect(db.prepare(`SELECT isActive FROM districts`).get()).toEqual({ isActive: 0 });
    expect(db.prepare(`SELECT isActive FROM institutions`).get()).toEqual({ isActive: 0 });
    expect(db.prepare(`SELECT createdAt FROM students`).get()).toEqual({
      createdAt: '2026-03-15T12:00:00.000Z',
    });
  });

  it('stores a school or district with no isActive key as active (older server)', () => {
    const importer = new ProvisioningImporter(manager);
    // BASE_DATA's institution row predates isActive, like a pre-031 server.
    expect(BASE_DATA.institutions![0]).not.toHaveProperty('isActive');
    importer.import(
      snapshotOf({
        ...BASE_DATA,
        districts: [{ id: 'district-1', name: 'Sinkor', countyId: 'county-1' }],
        students: [student('s1', 'Ada')],
      }),
      CONTEXT,
    );
    const db = manager.connection;
    expect(db.prepare(`SELECT isActive FROM institutions`).get()).toEqual({ isActive: 1 });
    expect(db.prepare(`SELECT isActive FROM districts`).get()).toEqual({ isActive: 1 });
    expect(db.prepare(`SELECT createdAt FROM students`).get()).toEqual({ createdAt: null });
  });
```

- [ ] **Step 6: Run them to verify they fail**

Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`
Expected: FAIL — TypeScript/vitest error that `counties` is not a `ProvisioningCollection`, then wrong values once that compiles.

- [ ] **Step 7: Add the collection and importer specs**

In `packages/types/src/provisioning.ts`, append `'counties'` as the last element of `PROVISIONING_COLLECTIONS`:

```ts
  'assignments', 'assignmentSubmissions', 'classResources',
  'counties',
] as const;
```

In `ProvisioningImporter.ts`:

1. Add to `interface TableSpec` (after `naturalKey?`):

```ts
  /** Values for columns the incoming row leaves out (or sends null), e.g.
   * `isActive` from a server that predates migration 031 — binding NULL
   * would violate the column's NOT NULL. */
  defaults?: Readonly<Record<string, string | number>>;
```

2. Replace `spec()`:

```ts
function spec(
  table: string,
  columns: readonly string[],
  naturalKey?: readonly string[],
  defaults?: Readonly<Record<string, string | number>>,
): TableSpec {
  return { table, columns, naturalKey, defaults };
}
```

3. In `SPECS`, change the `districts`, `institutions` and `students` entries and add `counties` as the last entry:

```ts
  districts: spec('districts', ['id', 'name', 'countyId', 'isActive'], undefined, { isActive: 1 }),
  institutions: spec('institutions', ['id','code','name','type','ownership','countyId','districtId','approvalStatus','street','communityTown','latitude','longitude','rejectionReason','profile','version','updatedAt','lastModifiedBy','isActive'], undefined, { isActive: 1 }),
```

```ts
  students: spec('students', ['id','institutionId','firstName','middleName','lastName','nemisId','dateOfBirth','gender','gradeLevel','isActive','admissionDate','phoneNumber','email','address','version','updatedAt','lastModifiedBy','createdAt']),
```

(Keep the existing students column list exactly, only appending `'createdAt'` — compare with the current line before editing.)

```ts
  counties: spec('counties', ['id', 'code', 'name']),
```

4. In `upsertRows`, replace the `statement.run(...)` line:

```ts
    statement.run(
      ...table.columns.map((column) => sqliteValue(row[column] ?? table.defaults?.[column], column)),
    );
```

- [ ] **Step 8: Run the importer and gateway tests to verify they pass**

Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/provisioning apps/desktop/electron/database`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/desktop-client-nemis" && git add packages/types/src/provisioning.ts apps/desktop/electron/database/schema/tableNames.ts apps/desktop/electron/database/migrations/031-add-county-dashboard-columns.ts apps/desktop/electron/database/migrations/031-add-county-dashboard-columns.test.ts apps/desktop/electron/database/migrations/registry.ts apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/provisioning/ProvisioningImporter.test.ts && git commit -m "feat(sync): store the county, school/district isActive and student createdAt

Migration 031 + importer specs for the County dashboard. A row with no
isActive (older server) imports as active instead of failing NOT NULL.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Application layer — wire types, read-model port, `GetCountyDashboardUseCase`, `CountyApplicationService`

**Files:**
- Create: `packages/types/src/county-dashboard.ts`; Modify: `packages/types/src/index.ts`
- Create: `packages/application/src/interfaces/county/county-analytics-read-model.ts`, `packages/application/src/interfaces/county/index.ts`; Modify: `packages/application/src/interfaces/index.ts`
- Create: `packages/application/src/dto/county/county-dashboard-dto.ts`
- Create: `packages/application/src/testing/county/in-memory-county-analytics-read-model.ts`, `packages/application/src/testing/county/index.ts`; Modify: `packages/application/src/testing/index.ts`
- Create: `packages/application/src/use-cases/county/get-county-dashboard.ts`
- Test: `packages/application/src/use-cases/county/get-county-dashboard.test.ts`
- Create: `packages/application/src/services/county-application-service.ts`
- Modify: `packages/application/src/factories/create-application-layer.ts` (`ApplicationPorts` ~134, `ApplicationLayer` ~164, body, return ~508)
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/factories/create-application-layer.test.ts` (`buildLayer`)
- Modify: `packages/presentation/src/testing/create-test-application.ts` (`TestPorts` + ports object)
- Modify: `apps/desktop/electron/data/adapters/createApplicationComposition.ts`

**Interfaces:**
- Produces (types): `EnrollmentByDistrictData`, `CountyEnrollmentTrendData`, `GenderDistributionData`, `AttendanceComplianceData`, `DropoutTrendData`, `CountyChartData`, `CountyDistrict`, `CountyDashboardStats`, `CountyDashboardResult` (shapes below).
- Produces (application): `ICountyAnalyticsReadModel`, `CountyRef`, `CountyDistrictRow`; `CountyDashboardOutput = CountyDashboardResult`; `GetCountyDashboardUseCase` (deps `{ readModel, clock, logger }`); `CountyApplicationService.getDashboard(): Promise<ApplicationResponse<CountyDashboardOutput>>`; `ApplicationPorts.countyAnalytics`; `ApplicationLayer.county`; `InMemoryCountyAnalyticsReadModel`.

- [ ] **Step 1: Add the wire types**

Create `packages/types/src/county-dashboard.ts`:

```ts
/** IPC wire shapes for the County (CEO) dashboard. Names and shapes mirror
 * Nemis `@nemis/types` (nemis.ts) so the components ported from portal-web
 * keep their bodies verbatim. Kept structurally identical to the
 * application-layer `CountyDashboardOutput` (which aliases this type). */
export interface EnrollmentByDistrictData {
  districtName: string;
  studentCount: number;
}

export interface CountyEnrollmentTrendData {
  period: string;
  enrollment: number;
  male: number;
  female: number;
}

export interface GenderDistributionData {
  male: number;
  female: number;
}

export interface AttendanceComplianceData {
  districtName: string;
  complianceRate: number;
}

export interface DropoutTrendData {
  period: string;
  dropouts: number;
}

export interface CountyChartData {
  enrollmentByDistrict: EnrollmentByDistrictData[];
  enrollmentTrend: CountyEnrollmentTrendData[];
  genderDistribution: GenderDistributionData;
  attendanceCompliance: AttendanceComplianceData[];
  dropoutTrend: DropoutTrendData[];
}

/** The fields of portal-web's `District` that DistrictScorecardCard reads. */
export interface CountyDistrict {
  id: string;
  name: string;
  _count?: { institutions?: number };
}

/** The fields of portal-web's `DashboardStats` the County dashboard reads. */
export interface CountyDashboardStats {
  totalSchools: number;
  totalStudents: number;
  totalTeachers: number;
}

export interface CountyDashboardResult {
  county: { id: string; name: string } | null;
  districts: { id: string; name: string; activeSchoolCount: number }[];
  stats: CountyDashboardStats;
  chartData: CountyChartData;
  byLevel: Record<string, number>;
}
```

In `packages/types/src/index.ts` append:

```ts
export * from './county-dashboard';
```

Run: `cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/desktop-client-nemis" && pnpm --filter @nemis-desktop/types typecheck`
Expected: exit 0 (no duplicate export names).

- [ ] **Step 2: Add the port, DTO and in-memory fake**

Create `packages/application/src/interfaces/county/county-analytics-read-model.ts`:

```ts
export interface CountyRef {
  readonly id: string;
  readonly name: string;
}

export interface CountyDistrictRow {
  readonly id: string;
  readonly name: string;
  readonly activeSchoolCount: number;
}

/** Raw county-wide aggregates for the County (CEO) dashboard, read from this
 * device's synced database (a County device holds exactly its county).
 * "Active student" = students.isActive in an institution with isActive;
 * "active teacher" = staff.isActive in an active institution — the same
 * filters as Nemis/apps/Server counties.service.ts. No business math here:
 * GetCountyDashboardUseCase owns it. */
export interface ICountyAnalyticsReadModel {
  getCounty(): CountyRef | null;
  /** Active districts, by name, each with its active-school count. */
  listActiveDistricts(): CountyDistrictRow[];
  countActiveSchools(): number;
  countActiveStudents(): number;
  countActiveTeachers(): number;
  countActiveStudentsByGender(): { gender: string; count: number }[];
  /** Non-null grade levels only. */
  countActiveStudentsByGradeLevel(): { gradeLevel: string; count: number }[];
  /** Grouped by district name, ordered by name; district-less students excluded. */
  countActiveStudentsByDistrict(): { districtName: string; count: number }[];
  /** Active students with createdAt >= sinceIso (NULL createdAt excluded). */
  listActiveStudentCreations(sinceIso: string): { createdAt: string; gender: string }[];
  /** One row per active institution; totalStudentCount counts ALL its
   * students (active or not), exactly as the server's coverage query does. */
  listActiveSchoolsForCoverage(): { districtName: string | null; totalStudentCount: number }[];
}
```

Create `packages/application/src/interfaces/county/index.ts`:

```ts
export * from './county-analytics-read-model';
```

In `packages/application/src/interfaces/index.ts` append `export * from './county';`.

Create `packages/application/src/dto/county/county-dashboard-dto.ts`:

```ts
import type { CountyDashboardResult } from '@nemis-desktop/types';

/** Defined once as the IPC wire type so the main-process handler returns the
 * DTO directly and the renderer passes it straight to the presentation layer. */
export type CountyDashboardOutput = CountyDashboardResult;
```

Create `packages/application/src/testing/county/in-memory-county-analytics-read-model.ts`:

```ts
import type {
  CountyDistrictRow,
  CountyRef,
  ICountyAnalyticsReadModel,
} from '../../interfaces/county/county-analytics-read-model';

/** Settable canned aggregates; only listActiveStudentCreations filters. */
export class InMemoryCountyAnalyticsReadModel implements ICountyAnalyticsReadModel {
  county: CountyRef | null = null;
  districts: CountyDistrictRow[] = [];
  activeSchools = 0;
  activeStudents = 0;
  activeTeachers = 0;
  studentsByGender: { gender: string; count: number }[] = [];
  studentsByGradeLevel: { gradeLevel: string; count: number }[] = [];
  studentsByDistrict: { districtName: string; count: number }[] = [];
  studentCreations: { createdAt: string; gender: string }[] = [];
  schoolsForCoverage: { districtName: string | null; totalStudentCount: number }[] = [];

  getCounty(): CountyRef | null {
    return this.county;
  }
  listActiveDistricts(): CountyDistrictRow[] {
    return this.districts;
  }
  countActiveSchools(): number {
    return this.activeSchools;
  }
  countActiveStudents(): number {
    return this.activeStudents;
  }
  countActiveTeachers(): number {
    return this.activeTeachers;
  }
  countActiveStudentsByGender(): { gender: string; count: number }[] {
    return this.studentsByGender;
  }
  countActiveStudentsByGradeLevel(): { gradeLevel: string; count: number }[] {
    return this.studentsByGradeLevel;
  }
  countActiveStudentsByDistrict(): { districtName: string; count: number }[] {
    return this.studentsByDistrict;
  }
  listActiveStudentCreations(sinceIso: string): { createdAt: string; gender: string }[] {
    return this.studentCreations.filter((row) => row.createdAt >= sinceIso);
  }
  listActiveSchoolsForCoverage(): { districtName: string | null; totalStudentCount: number }[] {
    return this.schoolsForCoverage;
  }
}
```

Create `packages/application/src/testing/county/index.ts`:

```ts
export * from './in-memory-county-analytics-read-model';
```

In `packages/application/src/testing/index.ts` append `export * from './county';`.

- [ ] **Step 3: Write the failing use-case tests**

Create `packages/application/src/use-cases/county/get-county-dashboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { GetCountyDashboardUseCase } from './get-county-dashboard';

// Mid-month, midday UTC: the same calendar day in every timezone within ±11h,
// so the server's local-time month arithmetic gives the same buckets in CI
// and on Alvin's machine.
const NOW = '2026-10-16T12:00:00.000Z';

function run(readModel: InMemoryCountyAnalyticsReadModel, now = NOW) {
  return new GetCountyDashboardUseCase({
    readModel,
    clock: new FixedClock(now),
    logger: new RecordingLogger(),
  }).execute({});
}

describe('GetCountyDashboardUseCase', () => {
  it('passes the county, districts and stats through', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.county = { id: 'county-1', name: 'Grand Bassa' };
    readModel.districts = [{ id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 }];
    readModel.activeSchools = 2;
    readModel.activeStudents = 7;
    readModel.activeTeachers = 3;
    const { data } = await run(readModel);
    expect(data.county).toEqual({ id: 'county-1', name: 'Grand Bassa' });
    expect(data.districts).toEqual([{ id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 }]);
    expect(data.stats).toEqual({ totalSchools: 2, totalStudents: 7, totalTeachers: 3 });
  });

  it('builds the cumulative 12-month trend exactly like the server', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.activeStudents = 6; // 2 before the window (one with NULL createdAt) + 4 inside it
    readModel.studentCreations = [
      { createdAt: '2025-06-15T12:00:00.000Z', gender: 'MALE' }, // before the window
      { createdAt: '2025-11-15T12:00:00.000Z', gender: 'MALE' },
      { createdAt: '2026-03-15T12:00:00.000Z', gender: 'FEMALE' },
      { createdAt: '2026-03-20T12:00:00.000Z', gender: 'MALE' },
      { createdAt: '2026-10-10T12:00:00.000Z', gender: 'FEMALE' },
    ];
    const { data } = await run(readModel);
    const trend = data.chartData.enrollmentTrend;
    expect(trend).toHaveLength(12);
    expect(trend.map((m) => m.period)).toEqual([
      'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026',
      'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026',
    ]);
    // enrollment carries the pre-window base (6 - 4 = 2); male/female count
    // only students created inside the window — the server's rule.
    expect(trend[0]).toEqual({ period: 'Nov 2025', enrollment: 3, male: 1, female: 0 });
    expect(trend[3]).toEqual({ period: 'Feb 2026', enrollment: 3, male: 1, female: 0 });
    expect(trend[4]).toEqual({ period: 'Mar 2026', enrollment: 5, male: 2, female: 1 });
    expect(trend[11]).toEqual({ period: 'Oct 2026', enrollment: 6, male: 2, female: 2 });
  });

  it('puts every student without a createdAt into the pre-window base', async () => {
    // A County device that synced before migration 031: no createdAt at all.
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.activeStudents = 40;
    const { data } = await run(readModel);
    expect(data.chartData.enrollmentTrend).toHaveLength(12);
    expect(data.chartData.enrollmentTrend.every((m) => m.enrollment === 40 && m.male === 0 && m.female === 0)).toBe(true);
  });

  it('computes coverage per district name, rounding, and skipping schools with no district', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.schoolsForCoverage = [
      { districtName: 'Buchanan', totalStudentCount: 10 },
      { districtName: 'Buchanan', totalStudentCount: 0 },
      { districtName: 'Buchanan', totalStudentCount: 3 },
      { districtName: 'Owensgrove', totalStudentCount: 0 },
      { districtName: null, totalStudentCount: 50 },
    ];
    const { data } = await run(readModel);
    expect(data.chartData.attendanceCompliance).toEqual([
      { districtName: 'Buchanan', complianceRate: 67 },
      { districtName: 'Owensgrove', complianceRate: 0 },
    ]);
  });

  it('maps grade levels to school levels and drops unmapped ones', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.studentsByGradeLevel = [
      { gradeLevel: 'KG', count: 2 },
      { gradeLevel: 'K2', count: 1 },
      { gradeLevel: 'GRADE_1', count: 5 },
      { gradeLevel: 'GRADE_9', count: 4 },
      { gradeLevel: 'GRADE_10', count: 3 },
      { gradeLevel: 'GRADE_12', count: 1 },
      { gradeLevel: 'UNKNOWN', count: 9 },
    ];
    const { data } = await run(readModel);
    expect(data.byLevel).toEqual({ PRE_PRIMARY: 3, PRIMARY: 9, SECONDARY: 4 });
  });

  it('builds gender distribution and enrollment by district, and an empty dropout trend', async () => {
    const readModel = new InMemoryCountyAnalyticsReadModel();
    readModel.studentsByGender = [
      { gender: 'MALE', count: 4 },
      { gender: 'FEMALE', count: 5 },
      { gender: 'OTHER', count: 1 },
    ];
    readModel.studentsByDistrict = [{ districtName: 'Buchanan', count: 9 }];
    const { data } = await run(readModel);
    expect(data.chartData.genderDistribution).toEqual({ male: 4, female: 5 });
    expect(data.chartData.enrollmentByDistrict).toEqual([{ districtName: 'Buchanan', studentCount: 9 }]);
    expect(data.chartData.dropoutTrend).toEqual([]);
  });

  it('returns a null county when none has synced', async () => {
    const { data } = await run(new InMemoryCountyAnalyticsReadModel());
    expect(data.county).toBeNull();
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `pnpm exec vitest run packages/application/src/use-cases/county/get-county-dashboard.test.ts`
Expected: FAIL — cannot resolve `./get-county-dashboard`.

- [ ] **Step 5: Implement the use case and service**

Create `packages/application/src/use-cases/county/get-county-dashboard.ts`:

```ts
import type {
  AttendanceComplianceData,
  CountyEnrollmentTrendData,
} from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountyDashboardOutput } from '../../dto/county/county-dashboard-dto';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Nemis/apps/Server counties.service.ts getStudentStats() GRADE_TO_LEVEL. */
const GRADE_TO_LEVEL: Readonly<Record<string, string>> = {
  KG: 'PRE_PRIMARY',
  K1: 'PRE_PRIMARY',
  K2: 'PRE_PRIMARY',
  GRADE_1: 'PRIMARY',
  GRADE_2: 'PRIMARY',
  GRADE_3: 'PRIMARY',
  GRADE_4: 'PRIMARY',
  GRADE_5: 'PRIMARY',
  GRADE_6: 'PRIMARY',
  GRADE_7: 'PRIMARY',
  GRADE_8: 'PRIMARY',
  GRADE_9: 'PRIMARY',
  GRADE_10: 'SECONDARY',
  GRADE_11: 'SECONDARY',
  GRADE_12: 'SECONDARY',
};

export interface GetCountyDashboardDeps {
  readModel: ICountyAnalyticsReadModel;
  clock: IClock;
  logger: IAppLogger;
}

/** The County (CEO) dashboard, computed locally with the formulas of
 * Nemis/apps/Server counties.service.ts (getStats, getChartData,
 * getStudentStats) and districts.service.ts findAll — quirks included, for
 * parity with portal-web (see the design spec's Background section). */
export class GetCountyDashboardUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountyDashboardOutput>
> {
  constructor(private readonly deps: GetCountyDashboardDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountyDashboardOutput>> {
    return invokeUseCase('GetCountyDashboard', this.deps.logger, async () => {
      const readModel = this.deps.readModel;
      const totalStudents = readModel.countActiveStudents();
      const byGender = readModel.countActiveStudentsByGender();
      return ok({
        county: readModel.getCounty(),
        districts: readModel.listActiveDistricts(),
        stats: {
          totalSchools: readModel.countActiveSchools(),
          totalStudents,
          totalTeachers: readModel.countActiveTeachers(),
        },
        chartData: {
          enrollmentByDistrict: readModel
            .countActiveStudentsByDistrict()
            .map(({ districtName, count }) => ({ districtName, studentCount: count })),
          enrollmentTrend: enrollmentTrend(new Date(this.deps.clock.now()), totalStudents, readModel),
          genderDistribution: {
            male: countFor(byGender, 'MALE'),
            female: countFor(byGender, 'FEMALE'),
          },
          attendanceCompliance: coverage(readModel.listActiveSchoolsForCoverage()),
          dropoutTrend: [],
        },
        byLevel: byLevel(readModel.countActiveStudentsByGradeLevel()),
      });
    });
  }
}

function countFor(rows: { gender: string; count: number }[], gender: string): number {
  return rows.find((row) => row.gender === gender)?.count ?? 0;
}

/** Same local-time Date arithmetic as the server, in the same order
 * (setMonth before setDate(1)) — see the spec's Out of scope note. */
function enrollmentTrend(
  now: Date,
  totalStudents: number,
  readModel: ICountyAnalyticsReadModel,
): CountyEnrollmentTrendData[] {
  const windowStart = new Date(now);
  windowStart.setMonth(now.getMonth() - 11);
  windowStart.setDate(1);
  windowStart.setHours(0, 0, 0, 0);

  const created = readModel
    .listActiveStudentCreations(windowStart.toISOString())
    .map((row) => ({ at: new Date(row.createdAt).getTime(), gender: row.gender }));

  // Students created before the window (or with no createdAt) start the count.
  let enrollment = totalStudents - created.length;
  let male = 0;
  let female = 0;
  const trend: CountyEnrollmentTrendData[] = [];
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(windowStart);
    date.setMonth(date.getMonth() + i);
    const monthStart = new Date(date);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(date);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    monthEnd.setHours(23, 59, 59, 999);

    const inMonth = created.filter(
      (row) => row.at >= monthStart.getTime() && row.at <= monthEnd.getTime(),
    );
    enrollment += inMonth.length;
    male += inMonth.filter((row) => row.gender === 'MALE').length;
    female += inMonth.filter((row) => row.gender === 'FEMALE').length;
    trend.push({
      period: `${MONTH_NAMES[date.getMonth()] ?? ''} ${date.getFullYear()}`,
      enrollment,
      male,
      female,
    });
  }
  return trend;
}

/** "Attendance compliance" on the web is enrollment coverage: % of active
 * schools per district with at least one student. */
function coverage(
  rows: { districtName: string | null; totalStudentCount: number }[],
): AttendanceComplianceData[] {
  const byDistrict = new Map<string, { total: number; withStudents: number }>();
  for (const row of rows) {
    if (!row.districtName) continue;
    const entry = byDistrict.get(row.districtName) ?? { total: 0, withStudents: 0 };
    entry.total += 1;
    if (row.totalStudentCount > 0) entry.withStudents += 1;
    byDistrict.set(row.districtName, entry);
  }
  return [...byDistrict].map(([districtName, entry]) => ({
    districtName,
    complianceRate: entry.total > 0 ? Math.round((entry.withStudents / entry.total) * 100) : 0,
  }));
}

function byLevel(rows: { gradeLevel: string; count: number }[]): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const { gradeLevel, count } of rows) {
    const level = GRADE_TO_LEVEL[gradeLevel];
    if (level) levels[level] = (levels[level] ?? 0) + count;
  }
  return levels;
}
```

Create `packages/application/src/services/county-application-service.ts`:

```ts
import type { ApplicationResponse } from '../core/response';
import type { CountyDashboardOutput } from '../dto/county/county-dashboard-dto';
import type { GetCountyDashboardUseCase } from '../use-cases/county/get-county-dashboard';

export interface CountyApplicationServiceDeps {
  getDashboard: GetCountyDashboardUseCase;
}

/** The County (CEO) portal's application service. */
export class CountyApplicationService {
  constructor(private readonly deps: CountyApplicationServiceDeps) {}
  getDashboard(): Promise<ApplicationResponse<CountyDashboardOutput>> {
    return this.deps.getDashboard.execute({});
  }
}
```

- [ ] **Step 6: Run the use-case tests to verify they pass**

Run: `pnpm exec vitest run packages/application/src/use-cases/county/get-county-dashboard.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Wire the port and service into the application layer**

In `packages/application/src/factories/create-application-layer.ts`:

```ts
import type { ICountyAnalyticsReadModel } from '../interfaces/county/county-analytics-read-model';
import { GetCountyDashboardUseCase } from '../use-cases/county/get-county-dashboard';
import { CountyApplicationService } from '../services/county-application-service';
```

Add to `ApplicationPorts` (after `districts: IDistrictRepository;`):

```ts
  /** County-wide aggregates for the County (CEO) dashboard. */
  countyAnalytics: ICountyAnalyticsReadModel;
```

Add to `ApplicationLayer` (after `reporting: ReportingApplicationService;`):

```ts
  county: CountyApplicationService;
```

After the `const reporting = new ReportingApplicationService({ … });` block add:

```ts
  const county = new CountyApplicationService({
    getDashboard: new GetCountyDashboardUseCase({
      readModel: ports.countyAnalytics,
      clock,
      logger,
    }),
  });
```

Change the final return to:

```ts
  return {
    students, academics, attendance, assessments, identity, institution, infra, reporting, county,
    teachers, timetables, assignments,
  };
```

In `packages/application/src/index.ts`, add next to the reporting exports:

```ts
export * from './dto/county/county-dashboard-dto';
export * from './use-cases/county/get-county-dashboard';
export * from './services/county-application-service';
```

(The port and the fake reach the package root through the existing `export * from './interfaces';` and `export * from './testing';` lines in `index.ts`.)

Add `countyAnalytics: new InMemoryCountyAnalyticsReadModel(),` to:
- `buildLayer()` in `packages/application/src/factories/create-application-layer.test.ts` (import from `'../testing/county/in-memory-county-analytics-read-model'`);
- `TestPorts` (`countyAnalytics: InMemoryCountyAnalyticsReadModel;`) and the `ports` object in `packages/presentation/src/testing/create-test-application.ts` (add `InMemoryCountyAnalyticsReadModel` to its `@nemis-desktop/application` import).

In `apps/desktop/electron/data/adapters/createApplicationComposition.ts`, under `// Not built yet — throw if used.` add (Task 4 replaces it with the SQLite adapter):

```ts
    countyAnalytics: new Proxy({} as never, { get: () => () => notBuilt('CountyAnalytics') }),
```

- [ ] **Step 8: Verify**

Run: `pnpm typecheck`
Expected: exit 0.
Run: `pnpm exec vitest run packages/application packages/presentation`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/types/src/county-dashboard.ts packages/types/src/index.ts packages/application/src/interfaces/county packages/application/src/interfaces/index.ts packages/application/src/dto/county packages/application/src/testing/county packages/application/src/testing/index.ts packages/application/src/use-cases/county packages/application/src/services/county-application-service.ts packages/application/src/factories/create-application-layer.ts packages/application/src/factories/create-application-layer.test.ts packages/application/src/index.ts packages/presentation/src/testing/create-test-application.ts apps/desktop/electron/data/adapters/createApplicationComposition.ts && git commit -m "feat(application): county dashboard use case over a read-model port

Ports the server's county stats, chart-data and student-stats formulas
(trend, coverage, GRADE_TO_LEVEL, empty dropout) into GetCountyDashboard.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: SQLite adapter — `SqliteCountyAnalyticsReadModel`

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyAnalyticsReadModel.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyAnalyticsReadModel.test.ts`
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts` (`DataLayer.repositories`, construction, return)
- Modify: `apps/desktop/electron/data/adapters/createApplicationComposition.ts`

**Interfaces:**
- Consumes: `ICountyAnalyticsReadModel`, `CountyRef`, `CountyDistrictRow` (Task 3); tables/columns from Task 2.
- Produces: `DataLayer.repositories.countyAnalytics: ICountyAnalyticsReadModel`.

- [ ] **Step 1: Write the failing adapter tests**

Create `SqliteCountyAnalyticsReadModel.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyAnalyticsReadModel } from './SqliteCountyAnalyticsReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyAnalyticsReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyAnalyticsReadModel;
  let nemisSeq = 0;

  function district(id: string, name: string, isActive = 1) {
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive) VALUES (?,?,'county-1',?)`).run(id, name, isActive);
  }
  function school(id: string, districtId: string | null, isActive = 1) {
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'PRIMARY','PUBLIC','county-1',?,'APPROVED',1,?,?)`,
    ).run(id, id, `School ${id}`, districtId, NOW, isActive);
  }
  function student(
    id: string,
    institutionId: string,
    opts: { gender?: string; gradeLevel?: string | null; isActive?: number; createdAt?: string | null } = {},
  ) {
    nemisSeq += 1;
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,gradeLevel,isActive,version,updatedAt,createdAt)
       VALUES (?,?,'First','Last',?,'2015-01-01',?,?,?,1,?,?)`,
    ).run(
      id,
      institutionId,
      String(nemisSeq).padStart(12, '0'),
      opts.gender ?? 'MALE',
      opts.gradeLevel ?? null,
      opts.isActive ?? 1,
      NOW,
      opts.createdAt ?? null,
    );
  }
  function teacher(id: string, institutionId: string, isActive = 1) {
    db.prepare(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
       VALUES (?,?,'Tee','Cher','1990-01-01','FEMALE','0770000000',?,'TEACHER','FULL_TIME','2020-01-01',?,?,?)`,
    ).run(id, institutionId, id, isActive, NOW, NOW);
  }

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyAnalyticsReadModel(test.context);
    nemisSeq = 0;
  });
  afterEach(() => test.cleanup());

  it('reads nothing from an empty device', () => {
    expect(readModel.getCounty()).toBeNull();
    expect(readModel.listActiveDistricts()).toEqual([]);
    expect(readModel.countActiveSchools()).toBe(0);
    expect(readModel.countActiveStudents()).toBe(0);
    expect(readModel.countActiveTeachers()).toBe(0);
    expect(readModel.countActiveStudentsByGender()).toEqual([]);
    expect(readModel.listActiveSchoolsForCoverage()).toEqual([]);
  });

  it('returns the synced county', () => {
    db.prepare(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`).run();
    expect(readModel.getCounty()).toEqual({ id: 'county-1', name: 'Grand Bassa' });
  });

  it('lists only active districts, by name, with their active-school counts', () => {
    district('d-2', 'Owensgrove');
    district('d-1', 'Buchanan');
    district('d-3', 'Old District', 0);
    school('a', 'd-1');
    school('b', 'd-1');
    school('c', 'd-1', 0);
    school('d', 'd-3');
    expect(readModel.listActiveDistricts()).toEqual([
      { id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 },
      { id: 'd-2', name: 'Owensgrove', activeSchoolCount: 0 },
    ]);
  });

  it('counts only active students and teachers in active schools', () => {
    district('d-1', 'Buchanan');
    school('open', 'd-1');
    school('closed', 'd-1', 0);
    student('s1', 'open');
    student('s2', 'open', { isActive: 0 });
    student('s3', 'closed');
    teacher('t1', 'open');
    teacher('t2', 'open', 0);
    teacher('t3', 'closed');
    expect(readModel.countActiveSchools()).toBe(1);
    expect(readModel.countActiveStudents()).toBe(1);
    expect(readModel.countActiveTeachers()).toBe(1);
  });

  it('groups active students by gender, grade level and district name', () => {
    district('d-1', 'Buchanan');
    district('d-2', 'Old District', 0);
    school('a', 'd-1');
    school('b', 'd-2'); // inactive district, active school: still counted under its name
    school('c', null); // no district: counted in totals, not in by-district
    student('s1', 'a', { gender: 'MALE', gradeLevel: 'GRADE_1' });
    student('s2', 'a', { gender: 'FEMALE', gradeLevel: 'GRADE_1' });
    student('s3', 'b', { gender: 'FEMALE', gradeLevel: 'GRADE_10' });
    student('s4', 'c', { gender: 'FEMALE', gradeLevel: null });
    expect(readModel.countActiveStudents()).toBe(4);
    expect(readModel.countActiveStudentsByGender()).toEqual(
      expect.arrayContaining([
        { gender: 'MALE', count: 1 },
        { gender: 'FEMALE', count: 3 },
      ]),
    );
    expect(readModel.countActiveStudentsByGradeLevel()).toEqual(
      expect.arrayContaining([
        { gradeLevel: 'GRADE_1', count: 2 },
        { gradeLevel: 'GRADE_10', count: 1 },
      ]),
    );
    expect(readModel.countActiveStudentsByGradeLevel()).toHaveLength(2);
    expect(readModel.countActiveStudentsByDistrict()).toEqual([
      { districtName: 'Buchanan', count: 2 },
      { districtName: 'Old District', count: 1 },
    ]);
  });

  it('lists active students created on or after a date, skipping NULL createdAt', () => {
    school('a', null);
    student('old', 'a', { createdAt: '2025-06-15T12:00:00.000Z' });
    student('new', 'a', { createdAt: '2026-03-15T12:00:00.000Z', gender: 'FEMALE' });
    student('unknown', 'a', { createdAt: null });
    student('gone', 'a', { createdAt: '2026-04-01T12:00:00.000Z', isActive: 0 });
    expect(readModel.listActiveStudentCreations('2025-11-01T00:00:00.000Z')).toEqual([
      { createdAt: '2026-03-15T12:00:00.000Z', gender: 'FEMALE' },
    ]);
  });

  it('lists active schools for coverage, counting all of their students', () => {
    district('d-1', 'Buchanan');
    school('a', 'd-1');
    school('b', 'd-1');
    school('closed', 'd-1', 0);
    student('s1', 'a', { isActive: 0 }); // inactive still counts, as on the server
    expect(readModel.listActiveSchoolsForCoverage()).toEqual([
      { districtName: 'Buchanan', totalStudentCount: 1 },
      { districtName: 'Buchanan', totalStudentCount: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyAnalyticsReadModel.test.ts`
Expected: FAIL — cannot resolve `./SqliteCountyAnalyticsReadModel`.

- [ ] **Step 3: Implement the adapter**

Create `SqliteCountyAnalyticsReadModel.ts`:

```ts
import type {
  CountyDistrictRow,
  CountyRef,
  ICountyAnalyticsReadModel,
} from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { students, institutions, districts, staff, counties } = TableNames;

/** Active students in active institutions — the server's dashboard filter. */
const ACTIVE_STUDENTS = `FROM ${students} s
  JOIN ${institutions} i ON i.id = s.institutionId
  WHERE s.isActive = 1 AND i.isActive = 1`;

/** Read-only SQLite adapter for ICountyAnalyticsReadModel. */
export class SqliteCountyAnalyticsReadModel implements ICountyAnalyticsReadModel {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  getCounty(): CountyRef | null {
    return guarded('SqliteCountyAnalyticsReadModel.getCounty', () => {
      const row = this.#statements
        .get(`SELECT id, name FROM ${counties} ORDER BY id LIMIT 1`)
        .get() as CountyRef | undefined;
      return row ?? null;
    });
  }

  listActiveDistricts(): CountyDistrictRow[] {
    return guarded('SqliteCountyAnalyticsReadModel.listActiveDistricts', () => {
      return this.#statements
        .get(
          `SELECT d.id, d.name,
             (SELECT COUNT(*) FROM ${institutions} i WHERE i.districtId = d.id AND i.isActive = 1) AS activeSchoolCount
           FROM ${districts} d
           WHERE d.isActive = 1
           ORDER BY d.name ASC`,
        )
        .all() as CountyDistrictRow[];
    });
  }

  countActiveSchools(): number {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveSchools', () => {
      return (this.#statements
        .get(`SELECT COUNT(*) AS count FROM ${institutions} WHERE isActive = 1`)
        .get() as { count: number }).count;
    });
  }

  countActiveStudents(): number {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveStudents', () => {
      return (this.#statements.get(`SELECT COUNT(*) AS count ${ACTIVE_STUDENTS}`).get() as { count: number }).count;
    });
  }

  countActiveTeachers(): number {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveTeachers', () => {
      return (this.#statements
        .get(
          `SELECT COUNT(*) AS count FROM ${staff} t
           JOIN ${institutions} i ON i.id = t.institutionId
           WHERE t.isActive = 1 AND i.isActive = 1`,
        )
        .get() as { count: number }).count;
    });
  }

  countActiveStudentsByGender(): { gender: string; count: number }[] {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveStudentsByGender', () => {
      return this.#statements
        .get(`SELECT s.gender AS gender, COUNT(*) AS count ${ACTIVE_STUDENTS} GROUP BY s.gender`)
        .all() as { gender: string; count: number }[];
    });
  }

  countActiveStudentsByGradeLevel(): { gradeLevel: string; count: number }[] {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveStudentsByGradeLevel', () => {
      return this.#statements
        .get(
          `SELECT s.gradeLevel AS gradeLevel, COUNT(*) AS count ${ACTIVE_STUDENTS}
             AND s.gradeLevel IS NOT NULL
           GROUP BY s.gradeLevel`,
        )
        .all() as { gradeLevel: string; count: number }[];
    });
  }

  countActiveStudentsByDistrict(): { districtName: string; count: number }[] {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveStudentsByDistrict', () => {
      return this.#statements
        .get(
          `SELECT d.name AS districtName, COUNT(*) AS count
           FROM ${students} s
           JOIN ${institutions} i ON i.id = s.institutionId
           JOIN ${districts} d ON d.id = i.districtId
           WHERE s.isActive = 1 AND i.isActive = 1
           GROUP BY d.name
           ORDER BY d.name ASC`,
        )
        .all() as { districtName: string; count: number }[];
    });
  }

  listActiveStudentCreations(sinceIso: string): { createdAt: string; gender: string }[] {
    return guarded('SqliteCountyAnalyticsReadModel.listActiveStudentCreations', () => {
      return this.#statements
        .get(
          `SELECT s.createdAt AS createdAt, s.gender AS gender ${ACTIVE_STUDENTS}
             AND s.createdAt >= ?
           ORDER BY s.createdAt ASC`,
        )
        .all(sinceIso) as { createdAt: string; gender: string }[];
    });
  }

  listActiveSchoolsForCoverage(): { districtName: string | null; totalStudentCount: number }[] {
    return guarded('SqliteCountyAnalyticsReadModel.listActiveSchoolsForCoverage', () => {
      return this.#statements
        .get(
          `SELECT d.name AS districtName,
             (SELECT COUNT(*) FROM ${students} s WHERE s.institutionId = i.id) AS totalStudentCount
           FROM ${institutions} i
           LEFT JOIN ${districts} d ON d.id = i.districtId
           WHERE i.isActive = 1
           ORDER BY d.name ASC, i.id ASC`,
        )
        .all() as { districtName: string | null; totalStudentCount: number }[];
    });
  }
}
```

- [ ] **Step 4: Run the adapter tests to verify they pass**

Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyAnalyticsReadModel.test.ts`
Expected: PASS (7 tests). The coverage test's second row is school `b` (ordered by `i.id` within the same district name: `a`, `b`).

- [ ] **Step 5: Wire it into the data layer and the application composition**

In `createDataLayer.ts`:
- import: `import { SqliteCountyAnalyticsReadModel } from '../repositories/sqlite/business/SqliteCountyAnalyticsReadModel';` and add `ICountyAnalyticsReadModel` to the existing `import type { … } from '@nemis-desktop/application'` block at the top;
- `DataLayer.repositories`: add `countyAnalytics: ICountyAnalyticsReadModel;` after `districts`;
- construction: `const countyAnalytics = new SqliteCountyAnalyticsReadModel(context);` after `const districts = …`;
- return `repositories`: add `countyAnalytics,` after `districts,`.

In `createApplicationComposition.ts`, delete the Task 3 `countyAnalytics: new Proxy(…)` line and add under `districts: dataLayer.repositories.districts,`:

```ts
    countyAnalytics: dataLayer.repositories.countyAnalytics,
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck` → exit 0.
Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/data` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyAnalyticsReadModel.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyAnalyticsReadModel.test.ts apps/desktop/electron/data/factories/createDataLayer.ts apps/desktop/electron/data/adapters/createApplicationComposition.ts && git commit -m "feat(data): SQLite county analytics read model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Presentation — `CountyDashboardViewModel`

**Files:**
- Create: `packages/presentation/src/queries/county/get-county-dashboard-ui-query.ts`
- Create: `packages/presentation/src/view-models/county/county-dashboard-views.ts`
- Create: `packages/presentation/src/mappers/county/county-dashboard-view-mapper.ts`
- Create: `packages/presentation/src/view-models/county/county-dashboard-view-model.ts`
- Test: `packages/presentation/src/view-models/county/county-dashboard-view-model.test.ts`
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`
- Modify: `packages/presentation/src/index.ts`

**Interfaces:**
- Consumes: `CountyApplicationService`, `CountyDashboardOutput` (Task 3); `CountyChartData`, `CountyDashboardStats`, `CountyDistrict` (types).
- Produces: `CountyDashboardView { county; districts: CountyDistrict[]; stats; chartData; byLevel }`; `CountyDashboardViewModel` with `store` (`{ summary: AsyncState<CountyDashboardView> }`) and `loadDashboard(): Promise<void>`; `PresentationViewModels.countyDashboard`.

- [ ] **Step 1: Write the failing ViewModel tests**

Create `county-dashboard-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CountyApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { CountyDashboardViewModel } from './county-dashboard-view-model';

describe('CountyDashboardViewModel', () => {
  it('loads the dashboard and shapes districts for the ported scorecard', async () => {
    const { app, ports } = createTestApplication();
    ports.countyAnalytics.county = { id: 'county-1', name: 'Grand Bassa' };
    ports.countyAnalytics.districts = [{ id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 }];
    ports.countyAnalytics.activeSchools = 2;
    ports.countyAnalytics.activeStudents = 9;
    const vm = new CountyDashboardViewModel({ county: app.county });

    await vm.loadDashboard();

    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status !== 'success') return;
    expect(summary.data.county).toEqual({ id: 'county-1', name: 'Grand Bassa' });
    expect(summary.data.districts).toEqual([{ id: 'd-1', name: 'Buchanan', _count: { institutions: 2 } }]);
    expect(summary.data.stats).toEqual({ totalSchools: 2, totalStudents: 9, totalTeachers: 0 });
    expect(summary.data.chartData.enrollmentTrend).toHaveLength(12);
  });

  it('renders real zeros (success, not empty) for an empty county', async () => {
    const { app } = createTestApplication();
    const vm = new CountyDashboardViewModel({ county: app.county });
    await vm.loadDashboard();
    expect(vm.store.getState().summary.status).toBe('success');
  });

  it('keeps the previous data while reloading', async () => {
    const { app } = createTestApplication();
    const vm = new CountyDashboardViewModel({ county: app.county });
    await vm.loadDashboard();
    const reload = vm.loadDashboard();
    expect(vm.store.getState().summary.status).toBe('refreshing');
    await reload;
    expect(vm.store.getState().summary.status).toBe('success');
  });

  it('moves to error when the service fails', async () => {
    const failing = {
      getDashboard: async () => {
        throw new Error('database locked');
      },
    } as unknown as CountyApplicationService;
    const vm = new CountyDashboardViewModel({ county: failing });
    await vm.loadDashboard();
    expect(vm.store.getState().summary.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run packages/presentation/src/view-models/county`
Expected: FAIL — cannot resolve `./county-dashboard-view-model`.

- [ ] **Step 3: Implement query, view, mapper, ViewModel**

`packages/presentation/src/queries/county/get-county-dashboard-ui-query.ts`:

```ts
import type {
  ApplicationResponse,
  CountyApplicationService,
  CountyDashboardOutput,
} from '@nemis-desktop/application';

export class GetCountyDashboardUiQuery {
  constructor(private readonly county: CountyApplicationService) {}

  execute(): Promise<ApplicationResponse<CountyDashboardOutput>> {
    return this.county.getDashboard();
  }
}
```

`packages/presentation/src/view-models/county/county-dashboard-views.ts`:

```ts
import type { CountyChartData, CountyDashboardStats, CountyDistrict } from '@nemis-desktop/types';

/** What the County dashboard renders — shaped to the props of the chart
 * components ported from portal-web (DistrictScorecardCard reads
 * `district._count.institutions`). */
export interface CountyDashboardView {
  readonly county: { readonly id: string; readonly name: string } | null;
  readonly districts: CountyDistrict[];
  readonly stats: CountyDashboardStats;
  readonly chartData: CountyChartData;
  readonly byLevel: Record<string, number>;
}
```

`packages/presentation/src/mappers/county/county-dashboard-view-mapper.ts`:

```ts
import type { CountyDashboardOutput } from '@nemis-desktop/application';
import type { CountyDashboardView } from '../../view-models/county/county-dashboard-views';

export function toCountyDashboardView(dto: CountyDashboardOutput): CountyDashboardView {
  return {
    county: dto.county,
    districts: dto.districts.map(({ id, name, activeSchoolCount }) => ({
      id,
      name,
      _count: { institutions: activeSchoolCount },
    })),
    stats: dto.stats,
    chartData: dto.chartData,
    byLevel: dto.byLevel,
  };
}
```

`packages/presentation/src/view-models/county/county-dashboard-view-model.ts`:

```ts
import type { CountyApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toCountyDashboardView } from '../../mappers/county/county-dashboard-view-mapper';
import { GetCountyDashboardUiQuery } from '../../queries/county/get-county-dashboard-ui-query';
import type { CountyDashboardView } from './county-dashboard-views';

export interface CountyDashboardState {
  readonly summary: AsyncState<CountyDashboardView>;
}

export interface CountyDashboardViewModelDeps {
  readonly county: CountyApplicationService;
}

/** The County (CEO) dashboard. No isEmpty: an all-zero county still renders
 * the full page, as on the web. */
export class CountyDashboardViewModel {
  readonly store = createStore<CountyDashboardState>(() => ({ summary: idleState() }));

  private readonly dashboardQuery: GetCountyDashboardUiQuery;

  constructor(deps: CountyDashboardViewModelDeps) {
    this.dashboardQuery = new GetCountyDashboardUiQuery(deps.county);
  }

  async loadDashboard(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.dashboardQuery.execute(),
      map: toCountyDashboardView,
    });
  }
}
```

In `create-presentation-layer.ts`: import `CountyDashboardViewModel` from `'../view-models/county/county-dashboard-view-model'`; add `readonly countyDashboard: CountyDashboardViewModel;` to `PresentationViewModels` (after `schools`); add `countyDashboard: new CountyDashboardViewModel({ county: app.county }),` to the `viewModels` object (after `schools: …`).

In `packages/presentation/src/index.ts`, next to the dashboard exports:

```ts
export * from './queries/county/get-county-dashboard-ui-query';
export * from './mappers/county/county-dashboard-view-mapper';
export * from './view-models/county/county-dashboard-view-model';
export * from './view-models/county/county-dashboard-views';
```

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run packages/presentation` → PASS (including any test that enumerates ViewModels).
Run: `pnpm typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/presentation/src/queries/county packages/presentation/src/view-models/county packages/presentation/src/mappers/county packages/presentation/src/factories/create-presentation-layer.ts packages/presentation/src/index.ts && git commit -m "feat(presentation): county dashboard view model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: IPC end to end — `county:get-dashboard`, COUNTY_ADMIN-only

**Files:**
- Modify: `packages/types/src/ipc.ts` (import ~50, `IpcContract` ~151, `IpcChannels` ~336)
- Modify: `packages/types/src/api.ts` (import, `CountyApi`, `NemisApi`)
- Create: `apps/desktop/electron/ipc/handlers/county/dashboard.ts`; Replace: `apps/desktop/electron/ipc/handlers/county/index.ts`
- Test: `apps/desktop/electron/ipc/handlers/county/dashboard.test.ts`
- Modify: `apps/desktop/electron/ipc/registrar.ts`
- Modify: `apps/desktop/electron/ipc/authorizeChannel.ts`; Test: `apps/desktop/electron/ipc/authorizeChannel.test.ts`
- Create: `apps/desktop/electron/preload/county/dashboard-api.ts`; Replace: `apps/desktop/electron/preload/county/index.ts`; Modify: `apps/desktop/electron/preload/preload.ts`
- Create: `apps/desktop/renderer/services/nemis-bridge/county/dashboard-bridge.ts`; Replace: `apps/desktop/renderer/services/nemis-bridge/county/index.ts`; Modify: `apps/desktop/renderer/services/nemis-bridge/index.ts` (doc comment)
- Replace: `apps/desktop/renderer/lib/ipc/county.ts`; Modify: `apps/desktop/renderer/lib/ipc/index.ts`; Test: `apps/desktop/renderer/lib/ipc/index.test.ts`
- Modify: `apps/desktop/renderer/lib/presentation/hooks/county.ts`

**Interfaces:**
- Consumes: `ApplicationLayer.county.getDashboard()` (Task 3), `viewModels.countyDashboard` (Task 5), `CountyDashboardResult` (types).
- Produces: `IpcChannels.COUNTY_GET_DASHBOARD = 'county:get-dashboard'`; `window.nemis.county.getDashboard(): Promise<CountyDashboardResult>`; `countyBridge.getDashboard()`; renderer facade `app.county.getDashboard()`; hook `useCountyDashboardViewModel()`.

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/electron/ipc/handlers/county/dashboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyDashboardHandlers } from './dashboard';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function makeHarness() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

const dashboard = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  districts: [],
  stats: { totalSchools: 1, totalStudents: 2, totalTeachers: 3 },
  chartData: {
    enrollmentByDistrict: [],
    enrollmentTrend: [],
    genderDistribution: { male: 1, female: 1 },
    attendanceCompliance: [],
    dropoutTrend: [],
  },
  byLevel: {},
};

describe('county IPC handlers', () => {
  it('county:get-dashboard returns the use case data and rejects extra args', async () => {
    const { calls, handle } = makeHarness();
    const app = { county: { getDashboard: async () => ({ data: dashboard }) } } as unknown as ApplicationLayer;
    registerCountyDashboardHandlers(handle, app);
    const call = calls.get('county:get-dashboard');
    expect(call).toBeDefined();
    expect(await call!.handler()).toEqual(dashboard);
    expect(() => call!.validate(['unexpected'])).toThrow(IPCError);
  });
});
```

In `apps/desktop/electron/ipc/authorizeChannel.test.ts`, add inside the `describe`:

```ts
  it('allows the county dashboard only for a county administrator', () => {
    expect(() =>
      authorizeChannel(IpcChannels.COUNTY_GET_DASHBOARD, workspace(SystemRole.COUNTY_ADMIN)),
    ).not.toThrow();
    for (const role of [
      SystemRole.INSTITUTION_ADMIN,
      SystemRole.TEACHER,
      SystemRole.DEO,
      SystemRole.MINISTRY_ADMIN,
    ]) {
      expect(() => authorizeChannel(IpcChannels.COUNTY_GET_DASHBOARD, workspace(role))).toThrow(
        /county administrator/,
      );
    }
  });
```

In `apps/desktop/renderer/lib/ipc/index.test.ts`, add inside the `describe`:

```ts
  it('county.getDashboard returns the bridged data as an ApplicationResponse', async () => {
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      county: { getDashboard: vi.fn(async () => ({ county: { id: 'county-1', name: 'Grand Bassa' } })) },
    });
    const app = createIpcApplicationLayer();
    const res = await app.county.getDashboard();
    expect(res.data.county).toEqual({ id: 'county-1', name: 'Grand Bassa' });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/ipc/handlers/county apps/desktop/electron/ipc/authorizeChannel.test.ts apps/desktop/renderer/lib/ipc/index.test.ts`
Expected: FAIL — missing `./dashboard`, `COUNTY_GET_DASHBOARD` undefined, `app.county` unwired.

- [ ] **Step 3: Contract types**

`packages/types/src/ipc.ts`: add `CountyDashboardResult` to the type imports (a new line `import type { CountyDashboardResult } from './county-dashboard';` next to the `./dashboard` import); in `IpcContract` after `'dashboard:get-overview': …`:

```ts
  'county:get-dashboard': { args: []; result: CountyDashboardResult };
```

In `IpcChannels` after `DASHBOARD_GET_OVERVIEW: 'dashboard:get-overview',`:

```ts
  COUNTY_GET_DASHBOARD: 'county:get-dashboard',
```

`packages/types/src/api.ts`: add `import type { CountyDashboardResult } from './county-dashboard';`; after `DashboardApi` add:

```ts
/** County (CEO) portal reads. */
export interface CountyApi {
  getDashboard(): Promise<CountyDashboardResult>;
}
```

and in `NemisApi` after `dashboard: DashboardApi;`:

```ts
  county: CountyApi;
```

- [ ] **Step 4: Main process — handler, registrar, authorization**

`apps/desktop/electron/ipc/handlers/county/dashboard.ts`:

```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerCountyDashboardHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_GET_DASHBOARD, assertNoArgs, async () => {
    const res = await app.county.getDashboard();
    return res.data;
  });
}
```

Replace `apps/desktop/electron/ipc/handlers/county/index.ts` with:

```ts
/** County (CEO) portal IPC handlers, one file per area, organized the same
 * way as school-admin/ and teacher/. */
export { registerCountyDashboardHandlers } from './dashboard';
```

`registrar.ts`: add after the teacher-portal imports:

```ts
// County (CEO) portal — see electron/ipc/handlers/county/.
import { registerCountyDashboardHandlers } from '@app/ipc/handlers/county';
```

and in `registerIpcHandlers` after `registerDashboardHandlers(securedHandle, app);`:

```ts
  registerCountyDashboardHandlers(securedHandle, app);
```

`authorizeChannel.ts`: after the `TEACHER_ONLY_CHANNELS` set add:

```ts
// County (CEO) portal reads — county-wide aggregates that no other role's
// screens use.
const COUNTY_ADMIN_CHANNELS = new Set<IpcChannel>([IpcChannels.COUNTY_GET_DASHBOARD]);
```

and in `authorizeChannel` after the `TEACHER_ONLY_CHANNELS` check:

```ts
  if (COUNTY_ADMIN_CHANNELS.has(channel) && role !== SystemRole.COUNTY_ADMIN) {
    throw new ForbiddenError('This view requires a county administrator workspace.');
  }
```

- [ ] **Step 5: Preload**

`apps/desktop/electron/preload/county/dashboard-api.ts`:

```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyDashboardApi: CountyApi = {
  getDashboard: () => invoke(IpcChannels.COUNTY_GET_DASHBOARD),
};
```

Replace `apps/desktop/electron/preload/county/index.ts` with:

```ts
import { countyDashboardApi } from './dashboard-api';

export * from './dashboard-api';

/** The NemisApi slice the County (CEO) portal owns. */
export const countyApi = {
  county: countyDashboardApi,
};
```

`preload.ts`: replace `import './county';` with `import { countyApi } from './county';`, change the doc-comment line `*   county/, deo/, ministry-portal/ — placeholders, no channels yet` to:

```ts
 *   county/       — the County (CEO) dashboard
 *   deo/, ministry-portal/ — placeholders, no channels yet
```

and add `...countyApi,` after `...schoolAdminApi,` in `nemisApi`.

- [ ] **Step 6: Renderer bridge, facade, hook**

`apps/desktop/renderer/services/nemis-bridge/county/dashboard-bridge.ts`:

```ts
import type { CountyDashboardResult } from '@nemis-desktop/types';
import { api } from '../api';

export const dashboardBridge = {
  getDashboard: (): Promise<CountyDashboardResult> => api().county.getDashboard(),
};
```

Replace `apps/desktop/renderer/services/nemis-bridge/county/index.ts` with:

```ts
import { dashboardBridge } from './dashboard-bridge';

/** County (CEO) portal callers of window.nemis, one file per area, the same
 * way school-admin/ and teacher/ are organized. */
export const countyBridge = {
  ...dashboardBridge,
};
```

In `services/nemis-bridge/index.ts` change the comment line `*   countyBridge / deoBridge / ministryPortalBridge — placeholders, no live endpoints yet` to:

```ts
 *   countyBridge      — the County (CEO) dashboard
 *   deoBridge / ministryPortalBridge — placeholders, no live endpoints yet
```

Replace `apps/desktop/renderer/lib/ipc/county.ts` with:

```ts
import type { CountyApplicationService } from '@nemis-desktop/application';
import { countyBridge } from '@/services/nemis-bridge/county';
import { group, query } from './core';

/** ApplicationLayer groups the County (CEO) portal owns. */
export const countyIpc = {
  county: group<CountyApplicationService>('county', {
    getDashboard: () => query(() => countyBridge.getDashboard()),
  }),
};
```

In `lib/ipc/index.ts`: replace `import './county';` with `import { countyIpc } from './county';`; add `county: countyIpc.county,` after `reporting: schoolAdminIpc.reporting,`; change the doc-comment lines

```ts
 *   lib/ipc/county.ts, deo.ts, ministry-portal.ts — placeholders, no
 *                             ApplicationLayer keys of their own yet
```

to

```ts
 *   lib/ipc/county.ts       — county (the County dashboard)
 *   lib/ipc/deo.ts, ministry-portal.ts — placeholders, no
 *                             ApplicationLayer keys of their own yet
```

In `lib/presentation/hooks/county.ts` append:

```ts
export const useCountyDashboardViewModel = () => usePresentation().viewModels.countyDashboard;
```

- [ ] **Step 7: Verify**

Run: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run apps/desktop/electron/ipc apps/desktop/renderer/lib` → PASS.
Run: `pnpm typecheck` → exit 0 (`NemisApi.county` is now required, so the preload object must include it).
Run: `pnpm lint` → 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/types/src/ipc.ts packages/types/src/api.ts apps/desktop/electron/ipc/handlers/county apps/desktop/electron/ipc/registrar.ts apps/desktop/electron/ipc/authorizeChannel.ts apps/desktop/electron/ipc/authorizeChannel.test.ts apps/desktop/electron/preload/county apps/desktop/electron/preload/preload.ts apps/desktop/renderer/services/nemis-bridge/county apps/desktop/renderer/services/nemis-bridge/index.ts apps/desktop/renderer/lib/ipc/county.ts apps/desktop/renderer/lib/ipc/index.ts apps/desktop/renderer/lib/ipc/index.test.ts apps/desktop/renderer/lib/presentation/hooks/county.ts && git commit -m "feat(ipc): county:get-dashboard channel, county administrators only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: UI — port the chart components and the dashboard page

**Files:**
- Modify: `apps/desktop/package.json` (deps — stage hunk-by-hunk)
- Create: `apps/desktop/renderer/lib/utils.ts`
- Create (copied): `apps/desktop/renderer/components/ui/chart.tsx`
- Create (copied): `apps/desktop/renderer/components/county/charts/{DistrictScorecardCard,EnrollmentBySchoolTypeCard,EnrollmentByDistrictChart,EnrollmentTrendChart,DropoutTrendChart}.tsx`
- Replace: `apps/desktop/renderer/app/government/county/page.tsx`
- Create: `apps/desktop/renderer/app/government/county/schools/create/page.tsx`, `apps/desktop/renderer/app/government/county/reports/generate/page.tsx`
- Test: `apps/desktop/renderer/app/government/county/page.test.tsx`, `apps/desktop/renderer/app/government/county/quick-action-routes.test.tsx`

**Interfaces:**
- Consumes: `useCountyDashboardViewModel()` (Task 6), `useCurrentUserViewModel()` (`@/lib/presentation/hooks/shared`, view `{ fullName }`), `CountyDashboardView` (Task 5), types from Task 3.

- [ ] **Step 1: Add the class-merge deps**

First record the user's pre-existing uncommitted diff, so Step 8 can tell their hunks from yours:

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/desktop-client-nemis" && git diff apps/desktop/package.json pnpm-lock.yaml > "$TMPDIR/county-dashboard-user-diff-before.patch"; wc -l "$TMPDIR/county-dashboard-user-diff-before.patch"
```

(Use the session scratchpad directory if `$TMPDIR` is unset.) Then:

```bash
pnpm --filter @nemis-desktop/app add clsx@^2.1.1 tailwind-merge@^3.6.0
```

Expected: both appear under `dependencies` in `apps/desktop/package.json`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing page tests**

Create `apps/desktop/renderer/app/government/county/page.test.tsx`:

```tsx
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import CountyDashboard from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const DASHBOARD = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  districts: [
    { id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 },
    { id: 'd-2', name: 'Owensgrove', activeSchoolCount: 1 },
  ],
  stats: { totalSchools: 3, totalStudents: 1250, totalTeachers: 48 },
  chartData: {
    enrollmentByDistrict: [
      { districtName: 'Buchanan', studentCount: 1000 },
      { districtName: 'Owensgrove', studentCount: 250 },
    ],
    enrollmentTrend: [{ period: 'Oct 2026', enrollment: 1250, male: 600, female: 650 }],
    genderDistribution: { male: 600, female: 650 },
    attendanceCompliance: [
      { districtName: 'Buchanan', complianceRate: 100 },
      { districtName: 'Owensgrove', complianceRate: 50 },
    ],
    dropoutTrend: [],
  },
  byLevel: { PRIMARY: 1000, SECONDARY: 250 },
};

const EMPTY = {
  county: null,
  districts: [],
  stats: { totalSchools: 0, totalStudents: 0, totalTeachers: 0 },
  chartData: {
    enrollmentByDistrict: [],
    enrollmentTrend: [],
    genderDistribution: { male: 0, female: 0 },
    attendanceCompliance: [],
    dropoutTrend: [],
  },
  byLevel: {},
};

function mockNemis(getDashboard: () => Promise<unknown>) {
  const nemis = {
    county: { getDashboard: vi.fn(getDashboard) },
    identity: {
      getCurrentUser: vi.fn(async () => ({
        id: 'u1', fullName: 'Musu Kollie', email: 'musu@moe.gov.lr', isActive: true, roles: [],
      })),
    },
  };
  (window as unknown as { nemis: unknown }).nemis = nemis;
  return nemis;
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <CountyDashboard />
    </PresentationProvider>,
  );
}

function statCard(label: string): HTMLElement {
  return screen.getByText(label).closest('a') as HTMLElement;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
});

describe('County dashboard page', () => {
  it('shows the greeting band with the user and county', async () => {
    mockNemis(async () => DASHBOARD);
    renderPage();
    await waitFor(() => expect(screen.getByText('Musu Kollie')).toBeInTheDocument());
    expect(screen.getByText(/County Education Officer — Grand Bassa •/)).toBeInTheDocument();
  });

  it('omits the county name when none has synced, with no placeholder county', async () => {
    mockNemis(async () => ({ ...DASHBOARD, county: null }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/County Education Officer •/)).toBeInTheDocument());
    expect(screen.queryByText(/Grand Bassa/)).not.toBeInTheDocument();
  });

  it('renders the four stat cards with values and links', async () => {
    mockNemis(async () => DASHBOARD);
    renderPage();
    await waitFor(() => expect(screen.getByText('Total Schools')).toBeInTheDocument());
    expect(within(statCard('Total Schools')).getByText('3')).toBeInTheDocument();
    expect(within(statCard('Total Schools')).getByText('Across 2 districts')).toBeInTheDocument();
    expect(statCard('Total Schools')).toHaveAttribute('href', '/government/county/schools');
    expect(within(statCard('Total Students')).getByText('1,250')).toBeInTheDocument();
    expect(statCard('Total Students')).toHaveAttribute('href', '/government/county/students');
    expect(within(statCard('Total Teachers')).getByText('48')).toBeInTheDocument();
    expect(statCard('Total Teachers')).toHaveAttribute('href', '/government/county/teachers');
    expect(within(statCard('Districts')).getByText('2')).toBeInTheDocument();
    expect(statCard('Districts')).toHaveAttribute('href', '/government/county/districts');
    expect(screen.getByText('District Education Scorecard')).toBeInTheDocument();
    expect(screen.getByText('Enrollment by School Type')).toBeInTheDocument();
  });

  it('renders an empty county with zeros and the web placeholders', async () => {
    mockNemis(async () => EMPTY);
    renderPage();
    await waitFor(() => expect(screen.getByText('Total Schools')).toBeInTheDocument());
    expect(within(statCard('Total Schools')).getByText('0')).toBeInTheDocument();
    expect(screen.getByText('No enrollment data available')).toBeInTheDocument();
  });

  it('shows the error alert and retries', async () => {
    const nemis = mockNemis(async () => {
      throw new Error('[INTERNAL] boom');
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Failed to load county data/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(nemis.county.getDashboard).toHaveBeenCalledTimes(2));
  });

  it('keeps the dashboard on screen while Refresh Data reloads', async () => {
    let calls = 0;
    const nemis = mockNemis(() => {
      calls += 1;
      return calls === 1 ? Promise.resolve(DASHBOARD) : new Promise(() => {});
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Total Schools')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Refresh Data'));
    await waitFor(() => expect(nemis.county.getDashboard).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Total Schools')).toBeInTheDocument();
  });

  it('routes Add New School and Generate Report to their pages', async () => {
    mockNemis(async () => DASHBOARD);
    renderPage();
    await waitFor(() => expect(screen.getByText('Add New School')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add New School'));
    expect(push).toHaveBeenCalledWith('/government/county/schools/create');
    fireEvent.click(screen.getByText('Generate Report'));
    expect(push).toHaveBeenCalledWith('/government/county/reports/generate');
  });
});
```

Create `apps/desktop/renderer/app/government/county/quick-action-routes.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AddSchoolPage from './schools/create/page';
import GenerateReportPage from './reports/generate/page';

describe('County quick-action placeholder routes', () => {
  it('Add New School is a ComingSoon page', () => {
    render(<AddSchoolPage />);
    expect(screen.getByText('Add New School')).toBeInTheDocument();
    expect(screen.getByText(/has not been migrated to the desktop client yet/)).toBeInTheDocument();
  });

  it('Generate Report is a ComingSoon page', () => {
    render(<GenerateReportPage />);
    expect(screen.getByText('Generate Report')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm exec vitest run apps/desktop/renderer/app/government/county/page.test.tsx apps/desktop/renderer/app/government/county/quick-action-routes.test.tsx`
Expected: FAIL — placeholder page has none of the texts; the two route modules do not exist.

- [ ] **Step 4: Port `cn`, the chart wrapper and the five chart components**

Create `apps/desktop/renderer/lib/utils.ts` (identical to portal-web's `src/lib/utils.ts`):

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Copy the files verbatim (the `@/components/ui/chart` and `@/lib/utils` imports resolve unchanged under the renderer's `@/*` alias):

```bash
SRC="/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/portal-web/src/components"
DST="/c/Users/Alvin Dogba Jr/Desktop/Walamen/desktop-client-nemis/apps/desktop/renderer/components"
mkdir -p "$DST/ui" "$DST/county/charts"
cp "$SRC/ui/chart.tsx" "$DST/ui/chart.tsx"
for f in DistrictScorecardCard EnrollmentBySchoolTypeCard EnrollmentByDistrictChart EnrollmentTrendChart DropoutTrendChart; do
  cp "$SRC/county/charts/$f.tsx" "$DST/county/charts/$f.tsx"
done
```

Then change only these import lines (bodies stay untouched):

- `DistrictScorecardCard.tsx` — replace

  ```ts
  import type {
    AttendanceComplianceData,
    EnrollmentByDistrictData,
    District,
    DashboardStats,
  } from "@nemis/types";
  ```

  with

  ```ts
  import type {
    AttendanceComplianceData,
    EnrollmentByDistrictData,
    CountyDistrict as District,
    CountyDashboardStats as DashboardStats,
  } from "@nemis-desktop/types";
  ```

- `EnrollmentBySchoolTypeCard.tsx` — `from "@nemis/types"` → `from "@nemis-desktop/types"` on both import lines.
- `EnrollmentByDistrictChart.tsx`, `EnrollmentTrendChart.tsx`, `DropoutTrendChart.tsx` — `from "@nemis/types"` → `from "@nemis-desktop/types"`.

Verify nothing else references portal-web-only modules:

Run: `grep -rn "@nemis/\|@/store\|@/hooks/use" apps/desktop/renderer/components/ui/chart.tsx apps/desktop/renderer/components/county/charts`
Expected: no output.

- [ ] **Step 5: Write the page and the two placeholder routes**

Replace `apps/desktop/renderer/app/government/county/page.tsx` with (portal-web's `CountyDashboard`, data from the ViewModel; differences are the five listed in spec §3):

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Spinner, Alert, Card, Avatar } from '@nemis-desktop/ui';
import { School, FileText, Users, RefreshCw } from 'lucide-react';
import { useCountyDashboardViewModel } from '@/lib/presentation/hooks/county';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import EnrollmentByDistrictChart from '@/components/county/charts/EnrollmentByDistrictChart';
import EnrollmentTrendChart from '@/components/county/charts/EnrollmentTrendChart';
import DropoutTrendChart from '@/components/county/charts/DropoutTrendChart';
import DistrictScorecardCard from '@/components/county/charts/DistrictScorecardCard';
import EnrollmentBySchoolTypeCard from '@/components/county/charts/EnrollmentBySchoolTypeCard';

export default function CountyDashboard() {
  const router = useRouter();
  const dashboard = useCountyDashboardViewModel();
  const currentUser = useCurrentUserViewModel();
  const summary = useViewModel(dashboard.store, (s) => s.summary);
  const userState = useViewModel(currentUser.store, (s) => s.user);

  useRevalidateOnSync(() => {
    void currentUser.loadCurrentUser();
    void dashboard.loadDashboard();
  }, [currentUser, dashboard]);

  const today = new Date();
  const hour = today.getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Desktop has the user's full name only (no photo): the avatar shows the
  // initials of its first and last words, as the Header does.
  const fullName =
    userState.status === 'success' || userState.status === 'refreshing' ? userState.data.fullName : '';
  const nameParts = fullName.split(' ').filter(Boolean);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;

  // `refreshing` keeps the dashboard on screen during a reload, like RTK
  // Query's isFetching on the web.
  const data = summary.status === 'success' || summary.status === 'refreshing' ? summary.data : null;
  const county = data?.county ?? null;
  const districts = data?.districts ?? [];
  const stats = data?.stats;
  const chartData = data?.chartData;
  const studentStats = data ? { byLevel: data.byLevel } : undefined;
  const error = summary.status === 'error' ? 'Failed to load county data' : null;

  const refreshData = () => {
    void dashboard.loadDashboard();
  };

  if (summary.status === 'idle' || summary.status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      {/* Header Band */}
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center gap-4">
        <Avatar
          src={null}
          firstName={firstName}
          lastName={lastName}
          role="generic"
          size={64}
          className="border-2 border-slate-600"
          alt="Profile"
        />
        <div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">
            {greeting},
          </p>
          <h1 className="text-2xl font-bold text-white">{fullName}</h1>
          <p className="text-xs text-slate-400 font-semibold">
            County Education Officer
            {county?.name ? <> &mdash; {county.name}</> : null}{' '}
            &bull; {formattedDate}
          </p>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        {error && (
          <Alert variant="error">
            {error}{' '}
            <button onClick={refreshData} className="ml-2 underline text-sm">
              Retry
            </button>
          </Alert>
        )}

        {/* Primary stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/government/county/schools">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Schools
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {stats?.totalSchools ?? 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Across {districts.length} districts
              </p>
            </Card>
          </Link>

          <Link href="/government/county/students">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Students
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {(stats?.totalStudents ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Enrolled county-wide
              </p>
            </Card>
          </Link>

          <Link href="/government/county/teachers">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Teachers
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {(stats?.totalTeachers ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                All {districts.length} districts
              </p>
            </Card>
          </Link>

          <Link href="/government/county/districts">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Districts
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {districts.length}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Administrative units
              </p>
            </Card>
          </Link>
        </div>

        {/* District Scorecard + Enrollment by School Type */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {chartData && stats ? (
            <>
              <DistrictScorecardCard
                compliance={chartData.attendanceCompliance}
                districts={districts}
                enrollmentByDistrict={chartData.enrollmentByDistrict}
                stats={stats}
                countyName={county?.name ?? ''}
              />
              <EnrollmentBySchoolTypeCard
                byLevel={studentStats?.byLevel ?? {}}
                genderDistribution={chartData.genderDistribution}
              />
            </>
          ) : (
            <>
              <div className="bg-white border border-slate-300 p-5 h-48 flex items-center justify-center">
                <p className="text-sm text-slate-400">
                  No scorecard data available
                </p>
              </div>
              <div className="bg-white border border-slate-300 p-5 h-48 flex items-center justify-center">
                <p className="text-sm text-slate-400">
                  No enrollment data available
                </p>
              </div>
            </>
          )}
        </div>

        {/* Analytics Charts */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Analytics Overview
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg border-slate-300 p-5 lg:col-span-2">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                Enrollment by District
              </p>
              {chartData ? (
                <EnrollmentByDistrictChart
                  data={chartData.enrollmentByDistrict}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-300 p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                Enrollment Trend
              </p>
              {chartData ? (
                <EnrollmentTrendChart data={chartData.enrollmentTrend} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>

            <div className="bg-white border rounded-lg border-slate-300 p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                Dropout Trend
              </p>
              {chartData ? (
                <DropoutTrendChart data={chartData.dropoutTrend} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Schools table + Quick Actions */}
        <div className=" gap-4">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg border border-slate-300 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
              Quick Actions
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                onClick={() => router.push('/government/county/schools/create')}
                className="w-full px-4 py-3  border border-slate-200 hover:border-slate-400 hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-200  flex items-center justify-center shrink-0">
                  <School className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Add New School
                  </p>
                  <p className="text-xs text-slate-400">Register a school</p>
                </div>
              </button>

              <button
                onClick={() =>
                  router.push('/government/county/reports/generate')
                }
                className="w-full px-4 py-3  border border-slate-200 hover:border-slate-400 hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-200  flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Generate Report
                  </p>
                  <p className="text-xs text-slate-400">County statistics</p>
                </div>
              </button>

              <button
                onClick={() => router.push('/government/county/users')}
                className="w-full px-4 py-3  border border-slate-200 hover:border-slate-400 hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-200  flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Manage Users
                  </p>
                  <p className="text-xs text-slate-400">Staff & admins</p>
                </div>
              </button>

              <button
                onClick={refreshData}
                className="w-full px-4 py-3  border border-slate-200 hover:border-slate-400 hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-200  flex items-center justify-center shrink-0">
                  <RefreshCw className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Refresh Data
                  </p>
                  <p className="text-xs text-slate-400">Update statistics</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Note for the reviewer: compared with portal-web, the per-card `chartDataLoading || statsLoading` spinner branches are dropped — they are unreachable on the web too (its page-level `loading` returns the full-page spinner first). Every other class name, string and element order is unchanged.

Create `apps/desktop/renderer/app/government/county/schools/create/page.tsx`:

```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';

export default function Page() {
  return <ComingSoon title="Add New School" />;
}
```

Create `apps/desktop/renderer/app/government/county/reports/generate/page.tsx`:

```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';

export default function Page() {
  return <ComingSoon title="Generate Report" />;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/desktop/renderer/app/government/county`
Expected: PASS (page tests, route tests, and the existing `schools/page.test.tsx`).

- [ ] **Step 7: Lint and typecheck**

Run: `pnpm lint` → 0 errors. Run: `pnpm typecheck` → exit 0.
If ESLint flags the verbatim-copied chart files, fix only what it reports and note each change in the commit message.

- [ ] **Step 8: Commit (deps hunks only)**

```bash
git add -p apps/desktop/package.json pnpm-lock.yaml
```

Stage only the `clsx` / `tailwind-merge` hunks; answer `n` to the `"version": "2.0.2"` hunk and to every lockfile hunk that already appears in the Step 1 `…-before.patch`. Then:

```bash
git add apps/desktop/renderer/lib/utils.ts apps/desktop/renderer/components/ui/chart.tsx apps/desktop/renderer/components/county apps/desktop/renderer/app/government/county/page.tsx apps/desktop/renderer/app/government/county/page.test.tsx apps/desktop/renderer/app/government/county/quick-action-routes.test.tsx apps/desktop/renderer/app/government/county/schools/create/page.tsx apps/desktop/renderer/app/government/county/reports/generate/page.tsx && git diff --cached --stat && git commit -m "feat(county): port the County dashboard from portal-web

Same design and behaviour as portal-web's county dashboard, fed by the
local CountyDashboardViewModel. Adds the two quick-action placeholder routes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Confirm `git diff --cached --stat` does not list a `version` change before committing (`git diff --cached apps/desktop/package.json` must show only the two dependency lines).

---

### Task 8: Full gate

**Files:** none new (fixes only if the gate finds something).

- [ ] **Step 1: Desktop gate**

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/desktop-client-nemis" && pnpm lint && pnpm typecheck && ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run
```

Expected: lint 0 errors; typecheck exit 0; every test passes except the two known pre-existing renderer failures (`app/page.test.tsx`, `app/government/teacher/timetable.test.tsx`). Any other failure is this branch's to fix.

- [ ] **Step 2: Server gate**

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis/apps/Server" && pnpm typecheck && npx jest src/desktop-provisioning src/counties src/districts
```

Expected: exit 0, all pass.

- [ ] **Step 3: Confirm the user's files are untouched**

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/desktop-client-nemis" && git status --short && git diff apps/desktop/package.json | grep version
```

Expected: `apps/desktop/package.json` still shows the uncommitted `2.0.2` version line (unstaged), nothing else uncommitted from this work.

- [ ] **Step 4: Hand off**

Report the gate output. Merging (server first, then desktop, both to local `main`, not pushed) goes through superpowers:finishing-a-development-branch. The manual GUI pass (signed in as a County Admin, after a full resync) is Alvin's.
