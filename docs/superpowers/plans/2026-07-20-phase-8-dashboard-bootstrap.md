# Phase 8 — Dashboard Bootstrap & Real Data Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every mock value on the School-Admin Dashboard with real data read from local SQLite through the full architecture (repository → application query → IPC → presentation ViewModel → React), driven by a fault-tolerant renderer BootstrapService.

**Architecture:** A new migration adds business tables (empty except a first-run local user). New SQLite repository adapters implement the existing application ports and replace the throwing `Proxy` stubs in the main-process composition. New read-only application queries (dashboard overview, current school, current academic year, current user, device info) are exposed over new typed IPC channels. The renderer's composition root swaps the in-memory fake `ApplicationLayer` for an IPC-backed structural equivalent; a BootstrapService loads the five essential entities in parallel and records progress in a store. The DashboardViewModel graduates to explicit Loading/Loaded/Empty/Error/Offline/DatabaseUnavailable states with honest empty states instead of placeholder numbers.

**Tech Stack:** TypeScript (strict), Electron, better-sqlite3 (SQLCipher), Next.js static export renderer, React, Zustand (vanilla), Vitest, pnpm workspaces.

## Global Constraints

- **Node/tooling:** pnpm workspace. Tests run under Vitest with two projects: `node` (`packages/**/src/**/*.test.ts`, `apps/desktop/electron/**/*.test.ts`) and `renderer` (`apps/desktop/renderer/**/*.test.{ts,tsx}`, jsdom). Run a single file with `pnpm vitest run <path>`.
- **better-sqlite3 ABI:** SQLite-touching node tests require the module compiled for Node: run `pnpm rebuild:node` before `pnpm test`; `pnpm start`/`pnpm make` rebuild it for Electron again (`pnpm rebuild:electron`). A test failing with an ABI error means the wrong build is active.
- **TypeScript:** `strict: true` and `noUncheckedIndexedAccess: true` are on repo-wide (`tsconfig.base.json`). Indexed access (`arr[0]`, `record[key]`, `.get(sql).get()` casts) yields `T | undefined` — always narrow before use.
- **Timestamps:** every `createdAt`/`updatedAt` is ISO-8601 UTC (`nowIso()` / `new Date().toISOString()`). Store as TEXT.
- **Primary keys:** TEXT UUIDs via `newId()` (`node:crypto.randomUUID`). Never auto-increment.
- **Migrations are append-only:** never edit or reorder a shipped migration. Add migration `002` to the registry after `001`.
- **Renderer import boundary (ESLint, enforced):** files under `apps/desktop/renderer/**` may NOT import `@nemis-desktop/application`, `@nemis-desktop/domain`, or `@nemis-desktop/presentation/testing`, EXCEPT files under `apps/desktop/renderer/lib/presentation/**`. Literal `window.nemis` member access is banned everywhere EXCEPT `apps/desktop/renderer/services/**`. Any new facade code that constructs an `ApplicationLayer` lives under `lib/presentation/`; any new code that touches `window.nemis` lives under `services/`.
- **IPC contract discipline:** add a channel to `IpcContract` (`packages/types/src/ipc.ts`) FIRST, add it to `IpcChannels`, add the matching method group to `NemisApi` (`packages/types/src/api.ts`), then wire the main handler and the preload bridge. The `IPC_CHANNELS_EXHAUSTIVE` const enforces that every `IpcContract` key is listed in `IpcChannels`.
- **No mock/placeholder data:** the Dashboard renders a real number or an explicit empty state — never a fabricated `0` presented as real, and never a `placeholder: true` sample tile.
- **DO NOT (out of scope, enforced):** no synchronization, no REST calls, no Student/Teacher/Attendance CRUD UI, no authentication, no conflict resolution. Business tables (institutions, academic_years, classes, students, attendance) are created but seeded with NOTHING except one local user. Guardians/enrollments/assessments/grades/grading-config repository ports stay `Proxy` stubs.
- **Error masking:** raw SQLite/driver errors never cross IPC. `wrapSqliteError` → `DatabaseError` taxonomy; `errorMapping.toIpcError` maps `ConnectionError`→`DATABASE_UNAVAILABLE`, `MigrationError`→`MIGRATION_REQUIRED`, everything unknown→`UNEXPECTED_ERROR`.
- **Commit discipline:** one commit per task (or per step where the task says so). End every commit message body with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## File Structure

**New files — schema & seed (`apps/desktop/electron/database/`):**
- `migrations/002-create-business-tables.ts` — business-table migration.
- `migrations/002-create-business-tables.test.ts` — migration test.
- `seed/initializeLocalUser.ts` — idempotent first-run local-admin user seed.
- `seed/initializeLocalUser.test.ts` — seed test.

**New files — DAL adapters (`apps/desktop/electron/data/`):**
- `repositories/sqlite/business/SqliteStudentRepository.ts` (+ `.test.ts`)
- `repositories/sqlite/business/SqliteInstitutionRepository.ts` (+ `.test.ts`)
- `repositories/sqlite/business/SqliteUserRepository.ts` (+ `.test.ts`)
- `repositories/sqlite/business/SqliteAcademicYearRepository.ts` (+ `.test.ts`)
- `repositories/sqlite/business/SqliteClassRepository.ts` (+ `.test.ts`)
- `repositories/sqlite/business/SqliteAttendanceRepository.ts` (+ `.test.ts`)
- `data/adapters/business-e2e.test.ts` — real-SQLite E2E across the new adapters + application layer.

**New files — application layer (`packages/application/src/`):**
- `interfaces/academics/academic-year-repository.ts` — new `IAcademicYearRepository` port.
- `dto/academics/academic-year-dto.ts` — `AcademicYearOutput`.
- `mappers/academics/academic-year-mapper.ts` — `toAcademicYearOutput`.
- `dto/reporting/reporting-dto.ts` — `DashboardOverviewOutput`.
- `use-cases/reporting/get-dashboard-overview.ts` + `services/reporting-application-service.ts`.
- `use-cases/academics/get-current-academic-year.ts`
- `use-cases/identity/get-current-user.ts`
- `use-cases/institution/get-current-school.ts`
- `use-cases/infra/get-device-information.ts`
- `testing/academics/in-memory-academic-year-repository.ts`

**New files — types & IPC (`packages/types/src/`, `apps/desktop/electron/ipc/`):**
- `ipc/handlers/dashboard.ts`, `ipc/handlers/school.ts`, `ipc/handlers/academicYear.ts`, `ipc/handlers/identity.ts`, `ipc/handlers/device.ts` (+ one combined `.test.ts` per new handler group as noted).

**New files — presentation (`packages/presentation/src/`):**
- `stores/bootstrap-store.ts`
- `services/bootstrap-service.ts` (+ `.test.ts`)
- `queries/reporting/get-dashboard-overview-ui-query.ts`
- `queries/academics/get-current-academic-year-ui-query.ts`
- `queries/identity/get-current-user-ui-query.ts`
- `queries/settings/get-current-school-ui-query.ts`
- `queries/device/get-device-info-ui-query.ts`
- `mappers/reporting/dashboard-view-mapper.ts`
- `mappers/academics/academic-year-view-mapper.ts`
- `view-models/academic-year/academic-year-view-model.ts` + `academic-year-views.ts`

**New files — renderer (`apps/desktop/renderer/`):**
- `services/nemis-bridge.ts` — the ONLY new module allowed to call `window.nemis.*` for the new channels.
- `lib/presentation/create-ipc-application-layer.ts` — builds the `ApplicationLayer`-shaped facade.
- `lib/presentation/create-ipc-application-layer.test.ts`
- `lib/bootstrap/run-bootstrap.ts` — renderer glue calling the presentation BootstrapService.
- `components/dashboard/DashboardStatCard.tsx`, `components/dashboard/InfoTile.tsx`, `components/dashboard/DatabaseUnavailablePanel.tsx`.

**New files — docs (`docs/`):**
- `dashboard-bootstrap.md` (new), plus edits to `data-access.md`, `application-layer.md`, `presentation-layer.md`, `conventions.md`.

**Modified files (major):**
- `apps/desktop/electron/database/schema/tableNames.ts` — add business table names.
- `apps/desktop/electron/database/migrations/registry.ts` — register `002`.
- `apps/desktop/electron/database/DatabaseManager.ts` — call `initializeLocalUser` after `initializeMetadata`.
- `apps/desktop/electron/data/factories/createDataLayer.ts` — build & expose the 6 business repos.
- `apps/desktop/electron/data/adapters/createApplicationComposition.ts` — replace 5 `Proxy` stubs with real adapters + wire `academicYears`.
- `apps/desktop/electron/data/adapters/DeviceGatewayAdapter.ts` — add `getCurrent()`.
- `apps/desktop/electron/main/main.ts` — build composition, pass `ApplicationLayer` to `registerIpcHandlers`.
- `apps/desktop/electron/ipc/registrar.ts` — accept `ApplicationLayer`, register 5 new handler groups.
- `apps/desktop/electron/preload/preload.ts` — expose 5 new bridge methods.
- `packages/types/src/ipc.ts`, `packages/types/src/api.ts` — 5 new channels + API groups.
- `packages/application/src/interfaces/*` — add port methods (`countAll`, `countByDate`, `findFirst`, `getCurrent`) + new academic-year port; update `ApplicationPorts`, `createApplicationLayer`, `ApplicationLayer`.
- `packages/application/src/services/{identity,institution,academics,infra}-application-service.ts` — add new query methods.
- `packages/application/src/testing/create-*`/in-memory fakes — implement new port methods.
- `packages/presentation/src/view-models/dashboard/*` — graduate DashboardViewModel; drop placeholder tiles.
- `packages/presentation/src/view-models/{current-user,settings,device}/*` — add no-arg `loadCurrent*` methods.
- `packages/presentation/src/errors/presentation-error.ts` + `to-presentation-error.ts` — add `DatabaseUnavailableError`, map new codes.
- `packages/presentation/src/factories/create-presentation-layer.ts` — wire BootstrapService + BootstrapStore + AcademicYearViewModel + reporting-backed dashboard.
- `packages/presentation/src/index.ts` — export new modules.
- `apps/desktop/renderer/lib/presentation/create-renderer-presentation.ts` — swap fakes → IPC facade.
- `apps/desktop/renderer/app/providers.tsx` — run BootstrapService, observe BootstrapStore.
- `apps/desktop/renderer/app/government/school-admin/layout.tsx` — drop DEMO ids, use no-arg loads.
- `apps/desktop/renderer/app/government/school-admin/page.tsx` — real overview + empty states + DB-unavailable panel.
- `apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx` — assert empty states (fresh DB), not seeded `5`.

---

### Task 1: Business-tables migration (002) + table-name constants

**Files:**
- Modify: `apps/desktop/electron/database/schema/tableNames.ts`
- Create: `apps/desktop/electron/database/migrations/002-create-business-tables.ts`
- Modify: `apps/desktop/electron/database/migrations/registry.ts`
- Test: `apps/desktop/electron/database/migrations/002-create-business-tables.test.ts`

**Interfaces:**
- Consumes: `Migration` from `./types` (`{ version, name, up(db), down?(db) }`), `MigrationService` (`migrateToLatest()`, `rollbackLast()`), `createTestDatabase()` (`{ db, cleanup }`), `migrations` registry.
- Produces: `TableNames.{institutions,users,userOrganizations,academicYears,classes,students,attendance}` string constants; `createBusinessTables: Migration` (version `2`); tables + indexes listed below. Column names are the canonical row shape every DAL adapter (Tasks 7–13) maps to/from.

- [ ] **Step 1: Add business table names.** In `apps/desktop/electron/database/schema/tableNames.ts`, extend the `TableNames` object (keep `as const`):

```ts
/** Canonical platform table names — single source of truth for services/tests. */
export const TableNames = {
  schemaMigrations: 'schema_migrations',
  devices: 'devices',
  appSettings: 'app_settings',
  syncMetadata: 'sync_metadata',
  syncQueue: 'sync_queue',
  syncErrors: 'sync_errors',
  auditLog: 'audit_log',
  // Business tables (Phase 8). Created empty; populated by sync/import in later phases.
  institutions: 'institutions',
  users: 'users',
  userOrganizations: 'user_organizations',
  academicYears: 'academic_years',
  classes: 'classes',
  students: 'students',
  attendance: 'attendance',
} as const;

export type TableName = (typeof TableNames)[keyof typeof TableNames];
```

- [ ] **Step 2: Write the failing migration test.** Create `apps/desktop/electron/database/migrations/002-create-business-tables.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { TableNames } from '../schema/tableNames';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { migrations } from './registry';

describe('002-create-business-tables', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('creates every business table', () => {
    const names = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    for (const table of [
      TableNames.institutions,
      TableNames.users,
      TableNames.userOrganizations,
      TableNames.academicYears,
      TableNames.classes,
      TableNames.students,
      TableNames.attendance,
    ]) {
      expect(names).toContain(table);
    }
  });

  it('creates the documented business indexes', () => {
    const indexes = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    for (const idx of [
      'idx_students_institutionId',
      'idx_students_admission',
      'idx_classes_institutionId',
      'idx_classes_academicYearId',
      'idx_academic_years_institutionId',
      'idx_academic_years_isCurrent',
      'idx_user_organizations_userId',
      'idx_attendance_date',
      'idx_attendance_class_date',
    ]) {
      expect(indexes).toContain(idx);
    }
  });

  it('enforces the unique admission-number-per-institution index', () => {
    const now = '2026-01-01T00:00:00Z';
    const insert = test.db.raw.prepare(
      `INSERT INTO ${TableNames.students}
       (id, institutionId, firstName, lastName, admissionNumber, dateOfBirth, gender, isActive, version, updatedAt)
       VALUES (?, 'inst-1', 'A', 'B', 'ADM-1', '2015-01-01', 'MALE', 1, 1, ?)`,
    );
    expect(() => insert.run('s1', now)).not.toThrow();
    expect(() => insert.run('s2', now)).toThrow();
  });

  it('down() removes every business table (rollback of 002 only)', () => {
    const service = new MigrationService(test.db.raw, migrations);
    service.rollbackLast();
    const names = (
      test.db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(names).not.toContain(TableNames.students);
    expect(names).not.toContain(TableNames.institutions);
    // Platform tables from 001 survive.
    expect(names).toContain(TableNames.devices);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.** Run: `pnpm rebuild:node && pnpm vitest run apps/desktop/electron/database/migrations/002-create-business-tables.test.ts`
  Expected: FAIL — `createBusinessTables` / migration 002 does not exist yet (import error or missing tables).

- [ ] **Step 4: Write the migration.** Create `apps/desktop/electron/database/migrations/002-create-business-tables.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/**
 * Business tables. Created empty — no rows are seeded except one local user
 * (see seed/initializeLocalUser). Populated by import/sync in later phases.
 *
 * Conventions (same as 001): TEXT UUID PKs, ISO-8601 UTC TEXT timestamps,
 * booleans stored as INTEGER 0/1. Every row carries sync/conflict metadata
 * (version, updatedAt, lastModifiedBy, deviceId) so the sync phase never has
 * to alter these tables; those columns are unused by any logic this phase.
 *
 * Indexes:
 * - idx_students_institutionId       — students filtered/counted by school.
 * - idx_students_admission           — UNIQUE (institutionId, admissionNumber): dedup + existsByAdmissionNumber.
 * - idx_classes_institutionId        — classes filtered/counted by school.
 * - idx_classes_academicYearId       — classes filtered by academic year.
 * - idx_academic_years_institutionId — academic years filtered by school.
 * - idx_academic_years_isCurrent     — "the current year" lookup.
 * - idx_user_organizations_userId    — a user's roles.
 * - idx_attendance_date              — "today's attendance" summary.
 * - idx_attendance_class_date        — attendance by class and date.
 */
export const createBusinessTables: Migration = {
  version: 2,
  name: 'create-business-tables',

  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE institutions (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        ownership TEXT NOT NULL,
        countyId TEXT NOT NULL,
        districtId TEXT,
        approvalStatus TEXT NOT NULL,
        street TEXT,
        communityTown TEXT,
        latitude REAL,
        longitude REAL,
        rejectionReason TEXT,
        profile TEXT,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        middleName TEXT,
        lastName TEXT NOT NULL,
        email TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );

      CREATE TABLE user_organizations (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        institutionId TEXT,
        countyId TEXT,
        districtId TEXT,
        isActive INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX idx_user_organizations_userId ON user_organizations (userId);

      CREATE TABLE academic_years (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL,
        code TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        isCurrent INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_academic_years_institutionId ON academic_years (institutionId);
      CREATE INDEX idx_academic_years_isCurrent ON academic_years (isCurrent);

      CREATE TABLE classes (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL,
        academicYearId TEXT NOT NULL,
        name TEXT NOT NULL,
        gradeLevel TEXT NOT NULL,
        capacity INTEGER,
        isActive INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_classes_institutionId ON classes (institutionId);
      CREATE INDEX idx_classes_academicYearId ON classes (academicYearId);

      CREATE TABLE students (
        id TEXT PRIMARY KEY,
        institutionId TEXT NOT NULL,
        firstName TEXT NOT NULL,
        middleName TEXT,
        lastName TEXT NOT NULL,
        admissionNumber TEXT NOT NULL,
        dateOfBirth TEXT NOT NULL,
        gender TEXT NOT NULL,
        gradeLevel TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_students_institutionId ON students (institutionId);
      CREATE UNIQUE INDEX idx_students_admission ON students (institutionId, admissionNumber);

      CREATE TABLE attendance (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL,
        classId TEXT NOT NULL,
        subjectId TEXT,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        recordedBy TEXT,
        version INTEGER NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModifiedBy TEXT,
        deviceId TEXT
      );
      CREATE INDEX idx_attendance_date ON attendance (date);
      CREATE INDEX idx_attendance_class_date ON attendance (classId, date);
    `);
  },

  down(db: SqliteDatabase): void {
    db.exec(`
      DROP TABLE attendance;
      DROP TABLE students;
      DROP TABLE classes;
      DROP TABLE academic_years;
      DROP TABLE user_organizations;
      DROP TABLE users;
      DROP TABLE institutions;
    `);
  },
};
```

- [ ] **Step 5: Register the migration.** Replace `apps/desktop/electron/database/migrations/registry.ts`:

```ts
import type { Migration } from './types';
import { createPlatformTables } from './001-create-platform-tables';
import { createBusinessTables } from './002-create-business-tables';

/**
 * Every migration, ascending by version. Append only — never edit or reorder
 * a shipped migration; MigrationService rejects drift at startup.
 */
export const migrations: readonly Migration[] = [createPlatformTables, createBusinessTables];
```

- [ ] **Step 6: Run the test to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/database/migrations/002-create-business-tables.test.ts`
  Expected: PASS (4 tests).

- [ ] **Step 7: Commit.**

```bash
git add apps/desktop/electron/database/schema/tableNames.ts apps/desktop/electron/database/migrations/002-create-business-tables.ts apps/desktop/electron/database/migrations/002-create-business-tables.test.ts apps/desktop/electron/database/migrations/registry.ts
git commit -m "feat(db): add business-tables migration 002"
```

---

### Task 2: First-run local-user seed

**Files:**
- Create: `apps/desktop/electron/database/seed/initializeLocalUser.ts`
- Modify: `apps/desktop/electron/database/DatabaseManager.ts`
- Test: `apps/desktop/electron/database/seed/initializeLocalUser.test.ts`

**Interfaces:**
- Consumes: `newId()`, `nowIso()`, `TableNames`, `wrapSqliteError()`, `SystemRole` from `@nemis-desktop/types`.
- Produces: `initializeLocalUser(db): LocalUserInitResult` where `LocalUserInitResult = { userId: string; userCreated: boolean }`. Idempotent: inserts exactly one `users` row + one `user_organizations` row on first run, no-op afterward. The seeded user is what `SqliteUserRepository.findFirst()` (Task 9) returns.

- [ ] **Step 1: Write the failing seed test.** Create `apps/desktop/electron/database/seed/initializeLocalUser.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationService } from '../services/MigrationService';
import { migrations } from '../migrations/registry';
import { TableNames } from '../schema/tableNames';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { initializeLocalUser } from './initializeLocalUser';

describe('initializeLocalUser', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
    new MigrationService(test.db.raw, migrations).migrateToLatest();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('creates exactly one user and one organization on first run', () => {
    const result = initializeLocalUser(test.db.raw);
    expect(result.userCreated).toBe(true);
    const users = test.db.raw.prepare(`SELECT COUNT(*) AS n FROM ${TableNames.users}`).get() as {
      n: number;
    };
    const orgs = test.db.raw
      .prepare(`SELECT COUNT(*) AS n FROM ${TableNames.userOrganizations}`)
      .get() as { n: number };
    expect(users.n).toBe(1);
    expect(orgs.n).toBe(1);
  });

  it('is idempotent — a second run creates nothing new', () => {
    const first = initializeLocalUser(test.db.raw);
    const second = initializeLocalUser(test.db.raw);
    expect(second.userCreated).toBe(false);
    expect(second.userId).toBe(first.userId);
    const users = test.db.raw.prepare(`SELECT COUNT(*) AS n FROM ${TableNames.users}`).get() as {
      n: number;
    };
    expect(users.n).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm vitest run apps/desktop/electron/database/seed/initializeLocalUser.test.ts`
  Expected: FAIL — `initializeLocalUser` does not exist.

- [ ] **Step 3: Write the seed.** Create `apps/desktop/electron/database/seed/initializeLocalUser.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { SystemRole } from '@nemis-desktop/types';
import { wrapSqliteError } from '../errors/wrapSqliteError';
import { newId } from '../helpers/ids';
import { nowIso } from '../helpers/time';
import { TableNames } from '../schema/tableNames';

export interface LocalUserInitResult {
  userId: string;
  userCreated: boolean;
}

/** The single local operator this desktop install runs as until authentication
 * exists. A real row (not a hardcoded object) so the identity read path is
 * exercised end-to-end. No school is attached yet (institutionId NULL). */
const LOCAL_USER = {
  firstName: 'Local',
  lastName: 'Admin',
  email: 'admin@local.nemis',
  role: SystemRole.INSTITUTION_ADMIN,
} as const;

/**
 * Idempotent first-run seed, run on every startup after migrations and
 * metadata init: ensures exactly one local user + its organization role.
 * No other business table is ever seeded.
 */
export function initializeLocalUser(db: SqliteDatabase): LocalUserInitResult {
  try {
    return db.transaction((): LocalUserInitResult => {
      const existing = db.prepare(`SELECT id FROM ${TableNames.users} LIMIT 1`).get() as
        | { id: string }
        | undefined;
      if (existing) {
        return { userId: existing.id, userCreated: false };
      }

      const now = nowIso();
      const userId = newId();
      db.prepare(
        `INSERT INTO ${TableNames.users}
         (id, firstName, middleName, lastName, email, isActive, version, updatedAt, lastModifiedBy, deviceId)
         VALUES (?, ?, NULL, ?, ?, 1, 1, ?, NULL, NULL)`,
      ).run(userId, LOCAL_USER.firstName, LOCAL_USER.lastName, LOCAL_USER.email, now);

      db.prepare(
        `INSERT INTO ${TableNames.userOrganizations}
         (id, userId, role, institutionId, countyId, districtId, isActive)
         VALUES (?, ?, ?, NULL, NULL, NULL, 1)`,
      ).run(newId(), userId, LOCAL_USER.role);

      return { userId, userCreated: true };
    })();
  } catch (error) {
    throw wrapSqliteError(error, 'local user initialization');
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/database/seed/initializeLocalUser.test.ts`
  Expected: PASS (2 tests).

- [ ] **Step 5: Call the seed at startup.** In `apps/desktop/electron/database/DatabaseManager.ts`, add the import and call it in `initialize()` right after the `initializeMetadata(...)` block (after `this.#deviceId = seeded.deviceId;`). Add import near the other seed import:

```ts
import { initializeLocalUser } from './seed/initializeLocalUser';
```

Then inside `initialize()`, immediately after the existing `const seeded = initializeMetadata(...)` / `this.#deviceId = seeded.deviceId;` lines and before `this.#transactions = new TransactionManager(this.#db.raw);`:

```ts
      const localUser = initializeLocalUser(this.#db.raw);
```

And extend the existing `this.#writeAudit('database.started', {...})` details object to include `localUserCreated: localUser.userCreated,` alongside the existing fields.

- [ ] **Step 6: Verify the app package still type-checks and existing DB tests pass.** Run: `pnpm --filter @nemis-desktop/app typecheck && pnpm vitest run apps/desktop/electron/database`
  Expected: PASS (all database tests green, including the new seed + migration).

- [ ] **Step 7: Commit.**

```bash
git add apps/desktop/electron/database/seed/initializeLocalUser.ts apps/desktop/electron/database/seed/initializeLocalUser.test.ts apps/desktop/electron/database/DatabaseManager.ts
git commit -m "feat(db): seed one local admin user on first run"
```

---

### Task 3: Application ports — new read methods, academic-year port, fakes

**Files:**
- Modify: `packages/application/src/interfaces/students/student-repository.ts`
- Modify: `packages/application/src/interfaces/academics/class-repository.ts`
- Modify: `packages/application/src/interfaces/attendance/attendance-repository.ts`
- Modify: `packages/application/src/interfaces/institution/institution-repository.ts`
- Modify: `packages/application/src/interfaces/identity/user-repository.ts`
- Modify: `packages/application/src/interfaces/infra/device-gateway.ts`
- Create: `packages/application/src/interfaces/academics/academic-year-repository.ts`
- Modify: `packages/application/src/interfaces/academics/index.ts`
- Modify: `packages/application/src/factories/create-application-layer.ts` (add `academicYears` to `ApplicationPorts` only)
- Create: `packages/application/src/testing/academics/in-memory-academic-year-repository.ts`
- Modify: `packages/application/src/testing/academics/index.ts`
- Modify: `packages/application/src/testing/students/in-memory-student-repository.ts`
- Modify: `packages/application/src/testing/academics/in-memory-class-repository.ts`
- Modify: `packages/application/src/testing/attendance/in-memory-attendance-repository.ts`
- Modify: `packages/application/src/testing/institution/in-memory-institution-repository.ts`
- Modify: `packages/application/src/testing/identity/in-memory-user-repository.ts`
- Modify: `packages/application/src/testing/infra/in-memory-device-gateway.ts`
- Modify: `packages/presentation/src/testing/create-test-application.ts` (add `academicYears` to `TestPorts` + ports)
- Modify: `apps/desktop/electron/data/adapters/createApplicationComposition.ts` (add `academicYears` stub — keeps the app package compiling)
- Test: `packages/application/src/testing/business-fakes.test.ts`

**Interfaces:**
- Produces: `IStudentRepository.countAll(): number`, `IClassRepository.countAll(): number`, `IAttendanceRepository.countByDate(date: string): { present: number; total: number }`, `IInstitutionRepository.findFirst(): Institution | null`, `IUserRepository.findFirst(): User | null`, `IDeviceGateway.getCurrent(): DeviceOutput | null`, and new `IAcademicYearRepository.findCurrent(): AcademicYear | null`. `ApplicationPorts` gains `academicYears: IAcademicYearRepository`. New fake `InMemoryAcademicYearRepository`. These are consumed by the use cases in Task 5 and implemented by the SQLite adapters in Tasks 7–13.

- [ ] **Step 1: Write the failing fakes test.** Create `packages/application/src/testing/business-fakes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AcademicYear, Attendance, Institution, User, UserOrganization } from '@nemis-desktop/domain';
import { ApprovalStatus, AttendanceStatus, InstitutionType, OwnershipType, SystemRole } from '@nemis-desktop/types';
import { InMemoryAttendanceRepository } from './attendance/in-memory-attendance-repository';
import { InMemoryInstitutionRepository } from './institution/in-memory-institution-repository';
import { InMemoryUserRepository } from './identity/in-memory-user-repository';
import { InMemoryAcademicYearRepository } from './academics/in-memory-academic-year-repository';
import { InMemoryDeviceGateway } from './infra/in-memory-device-gateway';

describe('business fakes new read methods', () => {
  it('InMemoryInstitutionRepository.findFirst returns the only institution or null', () => {
    const repo = new InMemoryInstitutionRepository();
    expect(repo.findFirst()).toBeNull();
    repo.store.set(
      'inst-1',
      Institution.reconstitute({
        id: 'inst-1',
        code: 'lib-001',
        name: 'Test',
        type: InstitutionType.SCHOOL,
        ownership: OwnershipType.GOVERNMENT,
        countyId: 'c-1',
        approvalStatus: ApprovalStatus.APPROVED,
        version: 1,
        updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    expect(repo.findFirst()?.id).toBe('inst-1');
  });

  it('InMemoryUserRepository.findFirst returns the only user or null', () => {
    const repo = new InMemoryUserRepository();
    expect(repo.findFirst()).toBeNull();
    repo.store.set(
      'usr-1',
      User.reconstitute({
        id: 'usr-1',
        firstName: 'Local',
        lastName: 'Admin',
        email: 'admin@local.nemis',
        isActive: true,
        organizations: [
          UserOrganization.reconstitute({ id: 'o-1', role: SystemRole.INSTITUTION_ADMIN, isActive: true }),
        ],
        version: 1,
        updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    expect(repo.findFirst()?.id).toBe('usr-1');
  });

  it('InMemoryAcademicYearRepository.findCurrent returns the current year or null', () => {
    const repo = new InMemoryAcademicYearRepository();
    expect(repo.findCurrent()).toBeNull();
    repo.store.set(
      'ay-1',
      AcademicYear.reconstitute({
        id: 'ay-1',
        institutionId: 'inst-1',
        code: '2025/2026',
        start: '2025-09-01',
        end: '2026-07-31',
        isCurrent: true,
        version: 1,
        updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    expect(repo.findCurrent()?.id).toBe('ay-1');
  });

  it('InMemoryAttendanceRepository.countByDate counts present and total on a date', () => {
    const repo = new InMemoryAttendanceRepository();
    expect(repo.countByDate('2026-07-20')).toEqual({ present: 0, total: 0 });
    repo.save(
      Attendance.record({
        id: 'a-1', studentId: 's-1', classId: 'c-1', date: '2026-07-20',
        status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    repo.save(
      Attendance.record({
        id: 'a-2', studentId: 's-2', classId: 'c-1', date: '2026-07-20',
        status: AttendanceStatus.ABSENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    expect(repo.countByDate('2026-07-20')).toEqual({ present: 1, total: 2 });
  });

  it('InMemoryDeviceGateway.getCurrent returns the most recent registration or null', () => {
    const gw = new InMemoryDeviceGateway();
    expect(gw.getCurrent()).toBeNull();
    const d = gw.register({ deviceName: 'lab', platform: 'win32', osVersion: '10', appVersion: '1.0.0' });
    expect(gw.getCurrent()?.id).toBe(d.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm vitest run packages/application/src/testing/business-fakes.test.ts`
  Expected: FAIL — new methods / `InMemoryAcademicYearRepository` do not exist.

- [ ] **Step 3: Add the port methods and the new port.** Edit each interface file to add the method(s):

`interfaces/students/student-repository.ts` — add to `IStudentRepository`:
```ts
  /** Real COUNT(*) — total students in this installation. */
  countAll(): number;
```
`interfaces/academics/class-repository.ts` — add to `IClassRepository`:
```ts
  /** Real COUNT(*) — total classes in this installation. */
  countAll(): number;
```
`interfaces/attendance/attendance-repository.ts` — add to `IAttendanceRepository`:
```ts
  /** Present-vs-total attendance rows recorded on an ISO date. */
  countByDate(date: string): { present: number; total: number };
```
`interfaces/institution/institution-repository.ts` — add to `IInstitutionRepository`:
```ts
  /** The single institution this install manages, or null before one exists. */
  findFirst(): Institution | null;
```
`interfaces/identity/user-repository.ts` — add to `IUserRepository`:
```ts
  /** The single local user, or null before the first-run seed. */
  findFirst(): User | null;
```
`interfaces/infra/device-gateway.ts` — add to `IDeviceGateway`:
```ts
  /** This installation's device identity, or null if not registered. */
  getCurrent(): DeviceOutput | null;
```

Create `interfaces/academics/academic-year-repository.ts`:
```ts
import type { AcademicYear } from '@nemis-desktop/domain';

export interface IAcademicYearRepository {
  /** The institution's current academic year, or null when none is configured. */
  findCurrent(): AcademicYear | null;
}
```

Add to `interfaces/academics/index.ts`:
```ts
export * from './academic-year-repository';
```

- [ ] **Step 4: Add `academicYears` to `ApplicationPorts`.** In `factories/create-application-layer.ts`, add the import and the port field (do NOT wire a use case yet — that is Task 5):

Add near the other academics port import (line ~4):
```ts
import type { IAcademicYearRepository } from '../interfaces/academics/academic-year-repository';
```
Add to the `ApplicationPorts` interface, next to `classes`:
```ts
  academicYears: IAcademicYearRepository;
```

- [ ] **Step 5: Implement the fake methods and the new fake.** 

`testing/students/in-memory-student-repository.ts` — add method:
```ts
  countAll(): number {
    return this.store.size;
  }
```
`testing/academics/in-memory-class-repository.ts` — add method:
```ts
  countAll(): number {
    return this.store.size;
  }
```
`testing/attendance/in-memory-attendance-repository.ts` — add the import and method:
```ts
import { AttendanceStatus } from '@nemis-desktop/types';
```
```ts
  countByDate(date: string): { present: number; total: number } {
    const onDate = [...this.store.values()].filter((a) => a.date === date);
    const present = onDate.filter((a) => a.status === AttendanceStatus.PRESENT).length;
    return { present, total: onDate.length };
  }
```
`testing/institution/in-memory-institution-repository.ts` — add method:
```ts
  findFirst(): Institution | null {
    for (const institution of this.store.values()) return institution;
    return null;
  }
```
`testing/identity/in-memory-user-repository.ts` — add method:
```ts
  findFirst(): User | null {
    for (const user of this.store.values()) return user;
    return null;
  }
```
`testing/infra/in-memory-device-gateway.ts` — add method:
```ts
  getCurrent(): DeviceOutput | null {
    return this.registered[this.registered.length - 1] ?? null;
  }
```
Create `testing/academics/in-memory-academic-year-repository.ts`:
```ts
import type { AcademicYear } from '@nemis-desktop/domain';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';

export class InMemoryAcademicYearRepository implements IAcademicYearRepository {
  readonly store = new Map<string, AcademicYear>();
  findCurrent(): AcademicYear | null {
    for (const year of this.store.values()) {
      if (year.isCurrent) return year;
    }
    return null;
  }
}
```
Add to `testing/academics/index.ts`:
```ts
export * from './in-memory-academic-year-repository';
```

- [ ] **Step 6: Provide `academicYears` to every `ApplicationPorts` constructor.** 

In `packages/presentation/src/testing/create-test-application.ts`: add `InMemoryAcademicYearRepository` to the import list from `@nemis-desktop/application`, add `academicYears: InMemoryAcademicYearRepository;` to the `TestPorts` interface (next to `classes`), and add `academicYears: new InMemoryAcademicYearRepository(),` to the `ports` object.

In `apps/desktop/electron/data/adapters/createApplicationComposition.ts`: add a stub entry to the `ports` object (next to `classes`), so the app package keeps compiling until Task 14 replaces it:
```ts
    academicYears: new Proxy({} as never, { get: () => () => notBuilt('AcademicYear') }),
```

- [ ] **Step 7: Run the fakes test + application typecheck.** Run: `pnpm vitest run packages/application/src/testing/business-fakes.test.ts && pnpm --filter @nemis-desktop/application typecheck`
  Expected: PASS (5 tests) and clean typecheck.

- [ ] **Step 8: Commit.**

```bash
git add packages/application/src/interfaces packages/application/src/testing packages/application/src/factories/create-application-layer.ts packages/presentation/src/testing/create-test-application.ts apps/desktop/electron/data/adapters/createApplicationComposition.ts
git commit -m "feat(application): add dashboard read ports + academic-year port and fakes"
```

---

### Task 4: Application DTOs & mappers (academic year + dashboard overview)

**Files:**
- Create: `packages/application/src/dto/academics/academic-year-dto.ts`
- Create: `packages/application/src/mappers/academics/academic-year-mapper.ts`
- Create: `packages/application/src/dto/reporting/reporting-dto.ts`
- Modify: `packages/application/src/index.ts` (export the new dto + mapper)
- Test: `packages/application/src/mappers/academics/academic-year-mapper.test.ts`

**Interfaces:**
- Consumes: `AcademicYear` domain entity (`id`, `institutionId`, `code.value`, `period.start`, `period.end`, `isCurrent`).
- Produces: `AcademicYearOutput { id; institutionId; code; startDate; endDate; isCurrent }`; `toAcademicYearOutput(year: AcademicYear): AcademicYearOutput`; `DashboardOverviewOutput { totalStudents: number; totalClasses: number; attendanceToday: { present: number; total: number } }`. Consumed by the use cases in Task 5.

- [ ] **Step 1: Write the failing mapper test.** Create `packages/application/src/mappers/academics/academic-year-mapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AcademicYear } from '@nemis-desktop/domain';
import { toAcademicYearOutput } from './academic-year-mapper';

describe('toAcademicYearOutput', () => {
  it('maps a domain academic year to the output DTO', () => {
    const year = AcademicYear.reconstitute({
      id: 'ay-1',
      institutionId: 'inst-1',
      code: '2025/2026',
      start: '2025-09-01',
      end: '2026-07-31',
      isCurrent: true,
      version: 1,
      updatedAt: '2026-07-20T00:00:00.000Z',
    });
    expect(toAcademicYearOutput(year)).toEqual({
      id: 'ay-1',
      institutionId: 'inst-1',
      code: '2025/2026',
      startDate: '2025-09-01',
      endDate: '2026-07-31',
      isCurrent: true,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm vitest run packages/application/src/mappers/academics/academic-year-mapper.test.ts`
  Expected: FAIL — mapper/dto do not exist.

- [ ] **Step 3: Write the DTOs and mapper.** 

Create `packages/application/src/dto/academics/academic-year-dto.ts`:
```ts
export interface AcademicYearOutput {
  id: string;
  institutionId: string;
  code: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}
```
Create `packages/application/src/mappers/academics/academic-year-mapper.ts`:
```ts
import type { AcademicYear } from '@nemis-desktop/domain';
import type { AcademicYearOutput } from '../../dto/academics/academic-year-dto';

export function toAcademicYearOutput(year: AcademicYear): AcademicYearOutput {
  return {
    id: year.id,
    institutionId: year.institutionId,
    code: year.code.value,
    startDate: year.period.start,
    endDate: year.period.end,
    isCurrent: year.isCurrent,
  };
}
```
Create `packages/application/src/dto/reporting/reporting-dto.ts`:
```ts
export interface DashboardOverviewOutput {
  totalStudents: number;
  totalClasses: number;
  attendanceToday: { present: number; total: number };
}
```

- [ ] **Step 4: Export from the application index.** In `packages/application/src/index.ts`, add (after the existing academics dto/mapper exports):
```ts
export * from './dto/academics/academic-year-dto';
export * from './mappers/academics/academic-year-mapper';
export * from './dto/reporting/reporting-dto';
```

- [ ] **Step 5: Run the test to verify it passes.** Run: `pnpm vitest run packages/application/src/mappers/academics/academic-year-mapper.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/application/src/dto packages/application/src/mappers/academics/academic-year-mapper.ts packages/application/src/mappers/academics/academic-year-mapper.test.ts packages/application/src/index.ts
git commit -m "feat(application): add academic-year and dashboard-overview DTOs"
```

---

### Task 5: Dashboard query use cases + service wiring

**Files:**
- Create: `packages/application/src/use-cases/reporting/get-dashboard-overview.ts`
- Create: `packages/application/src/services/reporting-application-service.ts`
- Create: `packages/application/src/use-cases/academics/get-current-academic-year.ts`
- Create: `packages/application/src/use-cases/identity/get-current-user.ts`
- Create: `packages/application/src/use-cases/institution/get-current-school.ts`
- Create: `packages/application/src/use-cases/infra/get-device-information.ts`
- Modify: `packages/application/src/services/identity-application-service.ts`
- Modify: `packages/application/src/services/institution-application-service.ts`
- Modify: `packages/application/src/services/academics-application-service.ts`
- Modify: `packages/application/src/services/infra-application-service.ts`
- Modify: `packages/application/src/factories/create-application-layer.ts` (wire use cases + add `reporting` to `ApplicationLayer`)
- Modify: `packages/application/src/index.ts`
- Test: `packages/application/src/use-cases/dashboard-queries.test.ts`

**Interfaces:**
- Consumes: the ports from Task 3, DTOs/mappers from Task 4, existing `toUserOutput`/`toInstitutionProfileOutput`, `IClock`, `invokeUseCase`.
- Produces: `GetDashboardOverviewUseCase`, `GetCurrentAcademicYearUseCase`, `GetCurrentUserUseCase`, `GetCurrentSchoolUseCase`, `GetDeviceInformationUseCase`; `ReportingApplicationService.getDashboardOverview()`; new service methods `IdentityApplicationService.getCurrentUser()`, `InstitutionApplicationService.getCurrentSchool()`, `AcademicsApplicationService.getCurrentAcademicYear()`, `InfraApplicationService.getDeviceInfo()`; `ApplicationLayer.reporting: ReportingApplicationService`. All are no-arg queries (single-install, pre-auth). Consumed by the IPC handlers (Task 17) and presentation queries (Task 20).

- [ ] **Step 1: Write the failing use-case test.** Create `packages/application/src/use-cases/dashboard-queries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AcademicYear, Attendance, Institution, User, UserOrganization } from '@nemis-desktop/domain';
import { ApprovalStatus, AttendanceStatus, InstitutionType, OwnershipType, SystemRole } from '@nemis-desktop/types';
import { FixedClock } from '../testing/fixed-clock';
import { RecordingLogger } from '../testing/recording-logger';
import { InMemoryStudentRepository } from '../testing/students/in-memory-student-repository';
import { InMemoryClassRepository } from '../testing/academics/in-memory-class-repository';
import { InMemoryAttendanceRepository } from '../testing/attendance/in-memory-attendance-repository';
import { InMemoryAcademicYearRepository } from '../testing/academics/in-memory-academic-year-repository';
import { InMemoryInstitutionRepository } from '../testing/institution/in-memory-institution-repository';
import { InMemoryUserRepository } from '../testing/identity/in-memory-user-repository';
import { InMemoryDeviceGateway } from '../testing/infra/in-memory-device-gateway';
import { GetDashboardOverviewUseCase } from './reporting/get-dashboard-overview';
import { GetCurrentAcademicYearUseCase } from './academics/get-current-academic-year';
import { GetCurrentUserUseCase } from './identity/get-current-user';
import { GetCurrentSchoolUseCase } from './institution/get-current-school';
import { GetDeviceInformationUseCase } from './infra/get-device-information';

const logger = new RecordingLogger();

describe('dashboard query use cases', () => {
  it('GetDashboardOverview composes real counts and today attendance', async () => {
    const students = new InMemoryStudentRepository();
    const classes = new InMemoryClassRepository();
    const attendance = new InMemoryAttendanceRepository();
    // Seed via reconstitute-free create paths is overkill; use direct fakes.
    students.save(
      // minimal: reconstitute a student is heavy; instead assert countAll on empty + seeded below
      // (see note) — here we just push into the map through save with a real Student.
      // Build one real student:
      (await import('@nemis-desktop/domain')).Student.create({
        id: 's-1', institutionId: 'inst-1', firstName: 'A', lastName: 'B',
        admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: 'MALE',
        occurredAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    classes.store.set(
      'c-1',
      (await import('@nemis-desktop/domain')).Class.reconstitute({
        id: 'c-1', institutionId: 'inst-1', academicYearId: 'ay-1', name: 'Grade 1 A',
        gradeLevel: 'GRADE_1', isActive: true, version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    attendance.save(
      Attendance.record({
        id: 'a-1', studentId: 's-1', classId: 'c-1', date: '2026-07-20',
        status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    const useCase = new GetDashboardOverviewUseCase({
      students, classes, attendance, clock: new FixedClock('2026-07-20T09:00:00.000Z'), logger,
    });
    const res = await useCase.execute({});
    expect(res.data).toEqual({
      totalStudents: 1,
      totalClasses: 1,
      attendanceToday: { present: 1, total: 1 },
    });
  });

  it('GetDashboardOverview returns zeros on an empty installation', async () => {
    const useCase = new GetDashboardOverviewUseCase({
      students: new InMemoryStudentRepository(),
      classes: new InMemoryClassRepository(),
      attendance: new InMemoryAttendanceRepository(),
      clock: new FixedClock('2026-07-20T09:00:00.000Z'),
      logger,
    });
    const res = await useCase.execute({});
    expect(res.data).toEqual({ totalStudents: 0, totalClasses: 0, attendanceToday: { present: 0, total: 0 } });
  });

  it('GetCurrentAcademicYear returns null when none configured, DTO when current', async () => {
    const years = new InMemoryAcademicYearRepository();
    const useCase = new GetCurrentAcademicYearUseCase({ academicYears: years, logger });
    expect((await useCase.execute({})).data).toBeNull();
    years.store.set(
      'ay-1',
      AcademicYear.reconstitute({
        id: 'ay-1', institutionId: 'inst-1', code: '2025/2026', start: '2025-09-01',
        end: '2026-07-31', isCurrent: true, version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    expect((await useCase.execute({})).data?.code).toBe('2025/2026');
  });

  it('GetCurrentUser returns the seeded user or null', async () => {
    const users = new InMemoryUserRepository();
    const useCase = new GetCurrentUserUseCase({ users, logger });
    expect((await useCase.execute({})).data).toBeNull();
    users.store.set(
      'usr-1',
      User.reconstitute({
        id: 'usr-1', firstName: 'Local', lastName: 'Admin', email: 'admin@local.nemis',
        isActive: true,
        organizations: [UserOrganization.reconstitute({ id: 'o-1', role: SystemRole.INSTITUTION_ADMIN, isActive: true })],
        version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    expect((await useCase.execute({})).data?.fullName).toBe('Local Admin');
  });

  it('GetCurrentSchool returns null when no institution exists', async () => {
    const useCase = new GetCurrentSchoolUseCase({ institutions: new InMemoryInstitutionRepository(), logger });
    expect((await useCase.execute({})).data).toBeNull();
  });

  it('GetDeviceInformation returns the current device or null', async () => {
    const deviceGateway = new InMemoryDeviceGateway();
    const useCase = new GetDeviceInformationUseCase({ deviceGateway, logger });
    expect((await useCase.execute({})).data).toBeNull();
    deviceGateway.register({ deviceName: 'lab', platform: 'win32', osVersion: '10', appVersion: '1.0.0' });
    expect((await useCase.execute({})).data?.deviceName).toBe('lab');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm vitest run packages/application/src/use-cases/dashboard-queries.test.ts`
  Expected: FAIL — use cases do not exist.

- [ ] **Step 3: Write the use cases.**

Create `use-cases/reporting/get-dashboard-overview.ts`:
```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { DashboardOverviewOutput } from '../../dto/reporting/reporting-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IAttendanceRepository } from '../../interfaces/attendance/attendance-repository';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetDashboardOverviewDeps {
  students: IStudentRepository;
  classes: IClassRepository;
  attendance: IAttendanceRepository;
  clock: IClock;
  logger: IAppLogger;
}

export class GetDashboardOverviewUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DashboardOverviewOutput>
> {
  constructor(private readonly deps: GetDashboardOverviewDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DashboardOverviewOutput>> {
    return invokeUseCase('GetDashboardOverview', this.deps.logger, async () => {
      const today = this.deps.clock.now().slice(0, 10);
      return ok({
        totalStudents: this.deps.students.countAll(),
        totalClasses: this.deps.classes.countAll(),
        attendanceToday: this.deps.attendance.countByDate(today),
      });
    });
  }
}
```

Create `use-cases/academics/get-current-academic-year.ts`:
```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { AcademicYearOutput } from '../../dto/academics/academic-year-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAcademicYearOutput } from '../../mappers/academics/academic-year-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCurrentAcademicYearDeps {
  academicYears: IAcademicYearRepository;
  logger: IAppLogger;
}

export class GetCurrentAcademicYearUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<AcademicYearOutput | null>
> {
  constructor(private readonly deps: GetCurrentAcademicYearDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<AcademicYearOutput | null>> {
    return invokeUseCase('GetCurrentAcademicYear', this.deps.logger, async () => {
      const year = this.deps.academicYears.findCurrent();
      return ok(year ? toAcademicYearOutput(year) : null);
    });
  }
}
```

Create `use-cases/identity/get-current-user.ts`:
```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { UserOutput } from '../../dto/identity/identity-dto';
import type { IUserRepository } from '../../interfaces/identity/user-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toUserOutput } from '../../mappers/identity/user-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCurrentUserDeps {
  users: IUserRepository;
  logger: IAppLogger;
}

export class GetCurrentUserUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<UserOutput | null>
> {
  constructor(private readonly deps: GetCurrentUserDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<UserOutput | null>> {
    return invokeUseCase('GetCurrentUser', this.deps.logger, async () => {
      const user = this.deps.users.findFirst();
      return ok(user ? toUserOutput(user) : null);
    });
  }
}
```

Create `use-cases/institution/get-current-school.ts`:
```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { InstitutionProfileOutput } from '../../dto/institution/institution-dto';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toInstitutionProfileOutput } from '../../mappers/institution/institution-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCurrentSchoolDeps {
  institutions: IInstitutionRepository;
  logger: IAppLogger;
}

export class GetCurrentSchoolUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<InstitutionProfileOutput | null>
> {
  constructor(private readonly deps: GetCurrentSchoolDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return invokeUseCase('GetCurrentSchool', this.deps.logger, async () => {
      const institution = this.deps.institutions.findFirst();
      return ok(institution ? toInstitutionProfileOutput(institution) : null);
    });
  }
}
```

Create `use-cases/infra/get-device-information.ts`:
```ts
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { DeviceOutput } from '../../dto/infra/infra-dto';
import type { IDeviceGateway } from '../../interfaces/infra/device-gateway';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetDeviceInformationDeps {
  deviceGateway: IDeviceGateway;
  logger: IAppLogger;
}

export class GetDeviceInformationUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeviceOutput | null>
> {
  constructor(private readonly deps: GetDeviceInformationDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeviceOutput | null>> {
    return invokeUseCase('GetDeviceInformation', this.deps.logger, async () => {
      return ok(this.deps.deviceGateway.getCurrent());
    });
  }
}
```

- [ ] **Step 4: Run the use-case test to verify it passes.** Run: `pnpm vitest run packages/application/src/use-cases/dashboard-queries.test.ts`
  Expected: PASS (6 tests).

- [ ] **Step 5: Create the reporting service and extend the four existing services.**

Create `services/reporting-application-service.ts`:
```ts
import type { ApplicationResponse } from '../core/response';
import type { DashboardOverviewOutput } from '../dto/reporting/reporting-dto';
import type { GetDashboardOverviewUseCase } from '../use-cases/reporting/get-dashboard-overview';

export interface ReportingApplicationServiceDeps {
  getDashboardOverview: GetDashboardOverviewUseCase;
}

export class ReportingApplicationService {
  constructor(private readonly deps: ReportingApplicationServiceDeps) {}
  getDashboardOverview(): Promise<ApplicationResponse<DashboardOverviewOutput>> {
    return this.deps.getDashboardOverview.execute({});
  }
}
```

`services/identity-application-service.ts` — add import, dep, method:
```ts
import type { GetCurrentUserUseCase } from '../use-cases/identity/get-current-user';
```
Add to `IdentityApplicationServiceDeps`: `getCurrentUser: GetCurrentUserUseCase;`
Add method:
```ts
  getCurrentUser(): Promise<ApplicationResponse<UserOutput | null>> {
    return this.deps.getCurrentUser.execute({});
  }
```

`services/institution-application-service.ts` — add import, dep, method:
```ts
import type { GetCurrentSchoolUseCase } from '../use-cases/institution/get-current-school';
```
Add to `InstitutionApplicationServiceDeps`: `getCurrentSchool: GetCurrentSchoolUseCase;`
Add method:
```ts
  getCurrentSchool(): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.deps.getCurrentSchool.execute({});
  }
```

`services/academics-application-service.ts` — add imports, dep, method:
```ts
import type { AcademicYearOutput } from '../dto/academics/academic-year-dto';
import type { GetCurrentAcademicYearUseCase } from '../use-cases/academics/get-current-academic-year';
```
Add to `AcademicsApplicationServiceDeps`: `getCurrentAcademicYear: GetCurrentAcademicYearUseCase;`
Add method:
```ts
  getCurrentAcademicYear(): Promise<ApplicationResponse<AcademicYearOutput | null>> {
    return this.deps.getCurrentAcademicYear.execute({});
  }
```

`services/infra-application-service.ts` — add import, dep, method:
```ts
import type { GetDeviceInformationUseCase } from '../use-cases/infra/get-device-information';
```
Add to `InfraApplicationServiceDeps`: `getDeviceInfo: GetDeviceInformationUseCase;`
Add method:
```ts
  getDeviceInfo(): Promise<ApplicationResponse<DeviceOutput | null>> {
    return this.deps.getDeviceInfo.execute({});
  }
```

- [ ] **Step 6: Wire everything in `createApplicationLayer`.** In `factories/create-application-layer.ts`:

Add imports (near the corresponding domain groups):
```ts
import { GetCurrentUserUseCase } from '../use-cases/identity/get-current-user';
import { GetCurrentSchoolUseCase } from '../use-cases/institution/get-current-school';
import { GetCurrentAcademicYearUseCase } from '../use-cases/academics/get-current-academic-year';
import { GetDeviceInformationUseCase } from '../use-cases/infra/get-device-information';
import { GetDashboardOverviewUseCase } from '../use-cases/reporting/get-dashboard-overview';
import { ReportingApplicationService } from '../services/reporting-application-service';
```

Add `reporting: ReportingApplicationService;` to the `ApplicationLayer` interface.

Extend the `academics` service construction to pass:
```ts
    getCurrentAcademicYear: new GetCurrentAcademicYearUseCase({ academicYears: ports.academicYears, logger }),
```
Extend the `identity` service construction to pass:
```ts
    getCurrentUser: new GetCurrentUserUseCase({ users: ports.users, logger }),
```
Extend the `institution` service construction to pass:
```ts
    getCurrentSchool: new GetCurrentSchoolUseCase({ institutions: ports.institutions, logger }),
```
Extend the `infra` service construction to pass:
```ts
    getDeviceInfo: new GetDeviceInformationUseCase({ deviceGateway: ports.deviceGateway, logger }),
```
Add a `reporting` service before the return:
```ts
  const reporting = new ReportingApplicationService({
    getDashboardOverview: new GetDashboardOverviewUseCase({
      students: ports.students,
      classes: ports.classes,
      attendance: ports.attendance,
      clock,
      logger,
    }),
  });
```
Change the return to include it:
```ts
  return { students, academics, attendance, assessments, identity, institution, infra, reporting };
```

- [ ] **Step 7: Export the new modules.** In `packages/application/src/index.ts`, add:
```ts
export * from './use-cases/reporting/get-dashboard-overview';
export * from './services/reporting-application-service';
export * from './use-cases/academics/get-current-academic-year';
export * from './use-cases/identity/get-current-user';
export * from './use-cases/institution/get-current-school';
export * from './use-cases/infra/get-device-information';
```

- [ ] **Step 8: Run the full application package tests + typecheck.** Run: `pnpm vitest run packages/application && pnpm --filter @nemis-desktop/application typecheck`
  Expected: PASS (existing + new tests) and clean typecheck.

- [ ] **Step 9: Commit.**

```bash
git add packages/application/src
git commit -m "feat(application): dashboard/current-entity query use cases + reporting service"
```

---

### Task 6: SqliteStudentRepository adapter

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/support.ts`
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`

**Interfaces:**
- Consumes: `RepositoryContext` (`{ connection, transactions, log }`), `StatementCache`, `wrapSqliteError`, `TableNames`, `Student` domain aggregate, `IStudentRepository` port (incl. `countAll` from Task 3), `createTestContext()`.
- Produces: `guarded<T>(context, fn)` support helper (reused by Tasks 7–11); `SqliteStudentRepository implements IStudentRepository`. Row shape ↔ domain mapping for the `students` table (migration 002). Consumed by `createDataLayer` (Task 13).

- [ ] **Step 1: Write the failing adapter test.** Create `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Student } from '@nemis-desktop/domain';
import { Gender } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteStudentRepository } from './SqliteStudentRepository';

function newStudent(id: string, admission: string): Student {
  return Student.create({
    id,
    institutionId: 'inst-1',
    firstName: 'Grace',
    lastName: 'Toe',
    admissionNumber: admission,
    dateOfBirth: '2015-01-01',
    gender: Gender.FEMALE,
    occurredAt: '2026-07-20T00:00:00.000Z',
  });
}

describe('SqliteStudentRepository', () => {
  let test: TestContext;
  let repo: SqliteStudentRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteStudentRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('countAll is 0 on an empty table', () => {
    expect(repo.countAll()).toBe(0);
  });

  it('save persists a student that round-trips through findById', () => {
    repo.save(newStudent('s-1', 'ADM-1'));
    const found = repo.findById('s-1');
    expect(found?.name.full).toBe('Grace Toe');
    expect(found?.admissionNumber.value).toBe('ADM-1');
    expect(found?.gender).toBe(Gender.FEMALE);
    expect(repo.countAll()).toBe(1);
  });

  it('existsByAdmissionNumber is scoped to the institution', () => {
    repo.save(newStudent('s-1', 'ADM-1'));
    expect(repo.existsByAdmissionNumber('inst-1', 'ADM-1')).toBe(true);
    expect(repo.existsByAdmissionNumber('inst-2', 'ADM-1')).toBe(false);
    expect(repo.existsByAdmissionNumber('inst-1', 'ADM-9')).toBe(false);
  });

  it('findPage returns items and total', () => {
    repo.save(newStudent('s-1', 'ADM-1'));
    repo.save(newStudent('s-2', 'ADM-2'));
    const page = repo.findPage({ limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
  });

  it('save updates an existing row (upsert on id)', () => {
    const s = newStudent('s-1', 'ADM-1');
    repo.save(s);
    repo.save(s); // same id — must not throw or duplicate
    expect(repo.countAll()).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm rebuild:node && pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
  Expected: FAIL — adapter does not exist.

- [ ] **Step 3: Write the support helper.** Create `apps/desktop/electron/data/repositories/sqlite/business/support.ts`:

```ts
import { wrapSqliteError } from '../../../../database/errors/wrapSqliteError';

/** Runs a synchronous SQLite read/write, translating any driver failure into
 * the DatabaseError taxonomy (context prefixes the message; the raw error is
 * kept on `cause`). Business adapters call every statement through this so a
 * locked/corrupt database surfaces as ConnectionError/IntegrityError, which
 * errorMapping turns into DATABASE_UNAVAILABLE for the renderer. */
export function guarded<T>(context: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw wrapSqliteError(error, context);
  }
}
```

- [ ] **Step 4: Write the adapter.** Create `apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts`:

```ts
import { Student } from '@nemis-desktop/domain';
import type { IStudentRepository, PageRequest } from '@nemis-desktop/application';
import type { Gender, GradeLevel } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface StudentRow {
  id: string;
  institutionId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: string;
  gradeLevel: string | null;
  isActive: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toStudent(row: StudentRow): Student {
  return Student.reconstitute({
    id: row.id,
    institutionId: row.institutionId,
    firstName: row.firstName,
    middleName: row.middleName ?? undefined,
    lastName: row.lastName,
    admissionNumber: row.admissionNumber,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender as Gender,
    gradeLevel: (row.gradeLevel ?? undefined) as GradeLevel | undefined,
    isActive: row.isActive === 1,
    guardians: [],
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, firstName, middleName, lastName, admissionNumber, dateOfBirth, gender, gradeLevel, isActive, version, updatedAt, lastModifiedBy';

/** SQLite adapter for IStudentRepository. Guardians are not persisted this
 * phase (no guardian tables yet); students reconstitute with an empty guardian
 * list, which is all the dashboard read path needs. */
export class SqliteStudentRepository implements IStudentRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): Student | null {
    return guarded('SqliteStudentRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.students} WHERE id = ? LIMIT 1`)
        .get(id) as StudentRow | undefined;
      return row ? toStudent(row) : null;
    });
  }

  save(student: Student): void {
    guarded('SqliteStudentRepository.save', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.students}
           (id, institutionId, firstName, middleName, lastName, admissionNumber, dateOfBirth, gender, gradeLevel, isActive, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             institutionId = excluded.institutionId,
             firstName = excluded.firstName,
             middleName = excluded.middleName,
             lastName = excluded.lastName,
             admissionNumber = excluded.admissionNumber,
             dateOfBirth = excluded.dateOfBirth,
             gender = excluded.gender,
             gradeLevel = excluded.gradeLevel,
             isActive = excluded.isActive,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          student.id,
          student.institutionId,
          student.name.firstName,
          student.name.middleName ?? null,
          student.name.lastName,
          student.admissionNumber.value,
          student.dateOfBirth.value,
          student.gender,
          student.gradeLevel ?? null,
          student.isActive ? 1 : 0,
          student.version,
          student.updatedAt,
          student.lastModifiedBy ?? null,
        );
    });
  }

  exists(id: string): boolean {
    return guarded('SqliteStudentRepository.exists', () => {
      const row = this.#statements
        .get(`SELECT id FROM ${TableNames.students} WHERE id = ? LIMIT 1`)
        .get(id);
      return row !== undefined;
    });
  }

  existsByAdmissionNumber(institutionId: string, admissionNumber: string): boolean {
    return guarded('SqliteStudentRepository.existsByAdmissionNumber', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.students} WHERE institutionId = ? AND admissionNumber = ? LIMIT 1`,
        )
        .get(institutionId, admissionNumber);
      return row !== undefined;
    });
  }

  findPage(request: PageRequest): { items: Student[]; total: number } {
    return guarded('SqliteStudentRepository.findPage', () => {
      const rows = this.#statements
        .get(
          `SELECT ${COLUMNS} FROM ${TableNames.students} ORDER BY updatedAt DESC, id ASC LIMIT ? OFFSET ?`,
        )
        .all(request.limit, request.offset) as StudentRow[];
      const total = this.countAll();
      return { items: rows.map(toStudent), total };
    });
  }

  findByClassId(_classId: string): Student[] {
    // No class↔student link table exists this phase; enrollment arrives later.
    return [];
  }

  countAll(): number {
    return guarded('SqliteStudentRepository.countAll', () => {
      const row = this.#statements
        .get(`SELECT COUNT(*) AS n FROM ${TableNames.students}`)
        .get() as { n: number };
      return row.n;
    });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts`
  Expected: PASS (5 tests).

- [ ] **Step 6: Commit.**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/support.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteStudentRepository.test.ts
git commit -m "feat(data): SqliteStudentRepository adapter"
```

---

### Task 7: SqliteInstitutionRepository adapter

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.test.ts`

**Interfaces:**
- Consumes: `guarded` (Task 6), `Institution` aggregate, `IInstitutionRepository` (with `findFirst` from Task 3), `InstitutionType`/`OwnershipType`/`ApprovalStatus` types.
- Produces: `SqliteInstitutionRepository implements IInstitutionRepository` (`findById`, `findFirst`). Read-only this phase — no `save` in the port. Consumed by Task 13.

- [ ] **Step 1: Write the failing test.** Create `.../SqliteInstitutionRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteInstitutionRepository } from './SqliteInstitutionRepository';

function seedInstitution(raw: TestContext['context']['connection'], id: string): void {
  raw
    .prepare(
      `INSERT INTO ${TableNames.institutions}
       (id, code, name, type, ownership, countyId, approvalStatus, communityTown, version, updatedAt)
       VALUES (?, 'LIB-001', 'Monrovia Central', 'SCHOOL', 'GOVERNMENT', 'county-1', 'APPROVED', 'Sinkor', 1, '2026-07-20T00:00:00.000Z')`,
    )
    .run(id);
}

describe('SqliteInstitutionRepository', () => {
  let test: TestContext;
  let repo: SqliteInstitutionRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteInstitutionRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('findFirst returns null on an empty table', () => {
    expect(repo.findFirst()).toBeNull();
  });

  it('findById and findFirst return a reconstituted institution', () => {
    seedInstitution(test.context.connection, 'inst-1');
    expect(repo.findById('inst-1')?.name).toBe('Monrovia Central');
    expect(repo.findFirst()?.code.value).toBe('LIB-001');
    expect(repo.findFirst()?.address.communityTown).toBe('Sinkor');
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.test.ts`
  Expected: FAIL — adapter does not exist.

- [ ] **Step 3: Write the adapter.** Create `.../SqliteInstitutionRepository.ts`:

```ts
import { Institution } from '@nemis-desktop/domain';
import type { IInstitutionRepository } from '@nemis-desktop/application';
import type { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface InstitutionRow {
  id: string;
  code: string;
  name: string;
  type: string;
  ownership: string;
  countyId: string;
  districtId: string | null;
  approvalStatus: string;
  street: string | null;
  communityTown: string | null;
  latitude: number | null;
  longitude: number | null;
  rejectionReason: string | null;
  profile: string | null;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toInstitution(row: InstitutionRow): Institution {
  return Institution.reconstitute({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type as InstitutionType,
    ownership: row.ownership as OwnershipType,
    countyId: row.countyId,
    districtId: row.districtId ?? undefined,
    approvalStatus: row.approvalStatus as ApprovalStatus,
    address: { street: row.street ?? undefined, communityTown: row.communityTown ?? undefined },
    location:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    profile: row.profile ? (JSON.parse(row.profile) as Record<string, unknown>) : undefined,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, code, name, type, ownership, countyId, districtId, approvalStatus, street, communityTown, latitude, longitude, rejectionReason, profile, version, updatedAt, lastModifiedBy';

/** Read-only SQLite adapter for IInstitutionRepository. */
export class SqliteInstitutionRepository implements IInstitutionRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): Institution | null {
    return guarded('SqliteInstitutionRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.institutions} WHERE id = ? LIMIT 1`)
        .get(id) as InstitutionRow | undefined;
      return row ? toInstitution(row) : null;
    });
  }

  findFirst(): Institution | null {
    return guarded('SqliteInstitutionRepository.findFirst', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.institutions} ORDER BY updatedAt ASC, id ASC LIMIT 1`)
        .get() as InstitutionRow | undefined;
      return row ? toInstitution(row) : null;
    });
  }
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.test.ts`
  Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteInstitutionRepository.test.ts
git commit -m "feat(data): SqliteInstitutionRepository adapter"
```

---

### Task 8: SqliteUserRepository adapter

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteUserRepository.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteUserRepository.test.ts`

**Interfaces:**
- Consumes: `guarded`, `User`/`UserOrganization` aggregates, `IUserRepository` (with `findFirst` from Task 3), `SystemRole`, the `initializeLocalUser` seed shape (Task 2).
- Produces: `SqliteUserRepository implements IUserRepository` (`findById`, `findFirst`), reading the user + joined `user_organizations` rows. Consumed by Task 13; its `findFirst` backs `identity:get-current-user`.

- [ ] **Step 1: Write the failing test.** Create `.../SqliteUserRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';
import { migrations } from '../../../../database/migrations/registry';
import { MigrationService } from '../../../../database/services/MigrationService';
import { initializeLocalUser } from '../../../../database/seed/initializeLocalUser';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteUserRepository } from './SqliteUserRepository';

describe('SqliteUserRepository', () => {
  let test: TestContext;
  let repo: SqliteUserRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteUserRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('findFirst returns null before the seed', () => {
    expect(repo.findFirst()).toBeNull();
  });

  it('findFirst returns the seeded local user with its role', () => {
    initializeLocalUser(test.context.connection);
    const user = repo.findFirst();
    expect(user?.name.full).toBe('Local Admin');
    expect(user?.email.value).toBe('admin@local.nemis');
    expect(user?.hasRole(SystemRole.INSTITUTION_ADMIN)).toBe(true);
  });
});
```

Note: `createTestContext` already applies every migration; `initializeLocalUser` seeds through the raw connection exposed at `test.context.connection`.

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteUserRepository.test.ts`
  Expected: FAIL — adapter does not exist.

- [ ] **Step 3: Write the adapter.** Create `.../SqliteUserRepository.ts`:

```ts
import { User, UserOrganization } from '@nemis-desktop/domain';
import type { IUserRepository } from '@nemis-desktop/application';
import type { SystemRole } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface UserRow {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  isActive: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

interface OrgRow {
  id: string;
  role: string;
  institutionId: string | null;
  countyId: string | null;
  districtId: string | null;
  isActive: number;
}

const USER_COLUMNS =
  'id, firstName, middleName, lastName, email, isActive, version, updatedAt, lastModifiedBy';

/** Read-only SQLite adapter for IUserRepository. Loads the user plus its
 * user_organizations rows and reconstitutes the aggregate. */
export class SqliteUserRepository implements IUserRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): User | null {
    return guarded('SqliteUserRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${USER_COLUMNS} FROM ${TableNames.users} WHERE id = ? LIMIT 1`)
        .get(id) as UserRow | undefined;
      return row ? this.#toUser(row) : null;
    });
  }

  findFirst(): User | null {
    return guarded('SqliteUserRepository.findFirst', () => {
      const row = this.#statements
        .get(`SELECT ${USER_COLUMNS} FROM ${TableNames.users} ORDER BY updatedAt ASC, id ASC LIMIT 1`)
        .get() as UserRow | undefined;
      return row ? this.#toUser(row) : null;
    });
  }

  #toUser(row: UserRow): User {
    const orgRows = this.#statements
      .get(
        `SELECT id, role, institutionId, countyId, districtId, isActive
         FROM ${TableNames.userOrganizations} WHERE userId = ?`,
      )
      .all(row.id) as OrgRow[];
    const organizations = orgRows.map((o) =>
      UserOrganization.reconstitute({
        id: o.id,
        role: o.role as SystemRole,
        institutionId: o.institutionId ?? undefined,
        countyId: o.countyId ?? undefined,
        districtId: o.districtId ?? undefined,
        isActive: o.isActive === 1,
      }),
    );
    return User.reconstitute({
      id: row.id,
      firstName: row.firstName,
      middleName: row.middleName ?? undefined,
      lastName: row.lastName,
      email: row.email,
      isActive: row.isActive === 1,
      organizations,
      version: row.version,
      updatedAt: row.updatedAt,
      lastModifiedBy: row.lastModifiedBy ?? undefined,
    });
  }
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteUserRepository.test.ts`
  Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/SqliteUserRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteUserRepository.test.ts
git commit -m "feat(data): SqliteUserRepository adapter"
```

---

### Task 9: SqliteAcademicYearRepository adapter

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteAcademicYearRepository.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteAcademicYearRepository.test.ts`

**Interfaces:**
- Consumes: `guarded`, `AcademicYear` aggregate, `IAcademicYearRepository` (Task 3).
- Produces: `SqliteAcademicYearRepository implements IAcademicYearRepository` (`findCurrent`). Consumed by Task 13; backs `academic-year:get-current`.

- [ ] **Step 1: Write the failing test.** Create `.../SqliteAcademicYearRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteAcademicYearRepository } from './SqliteAcademicYearRepository';

describe('SqliteAcademicYearRepository', () => {
  let test: TestContext;
  let repo: SqliteAcademicYearRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteAcademicYearRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('findCurrent returns null when none is configured', () => {
    expect(repo.findCurrent()).toBeNull();
  });

  it('findCurrent returns the year flagged isCurrent', () => {
    const insert = test.context.connection.prepare(
      `INSERT INTO ${TableNames.academicYears}
       (id, institutionId, code, startDate, endDate, isCurrent, version, updatedAt)
       VALUES (?, 'inst-1', ?, '2025-09-01', '2026-07-31', ?, 1, '2026-07-20T00:00:00.000Z')`,
    );
    insert.run('ay-old', '2024/2025', 0);
    insert.run('ay-cur', '2025/2026', 1);
    const year = repo.findCurrent();
    expect(year?.id).toBe('ay-cur');
    expect(year?.code.value).toBe('2025/2026');
    expect(year?.isCurrent).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteAcademicYearRepository.test.ts`
  Expected: FAIL — adapter does not exist.

- [ ] **Step 3: Write the adapter.** Create `.../SqliteAcademicYearRepository.ts`:

```ts
import { AcademicYear } from '@nemis-desktop/domain';
import type { IAcademicYearRepository } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface AcademicYearRow {
  id: string;
  institutionId: string;
  code: string;
  startDate: string;
  endDate: string;
  isCurrent: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toAcademicYear(row: AcademicYearRow): AcademicYear {
  return AcademicYear.reconstitute({
    id: row.id,
    institutionId: row.institutionId,
    code: row.code,
    start: row.startDate,
    end: row.endDate,
    isCurrent: row.isCurrent === 1,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, code, startDate, endDate, isCurrent, version, updatedAt, lastModifiedBy';

/** Read-only SQLite adapter for IAcademicYearRepository. */
export class SqliteAcademicYearRepository implements IAcademicYearRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findCurrent(): AcademicYear | null {
    return guarded('SqliteAcademicYearRepository.findCurrent', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.academicYears} WHERE isCurrent = 1 LIMIT 1`)
        .get() as AcademicYearRow | undefined;
      return row ? toAcademicYear(row) : null;
    });
  }
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteAcademicYearRepository.test.ts`
  Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/SqliteAcademicYearRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteAcademicYearRepository.test.ts
git commit -m "feat(data): SqliteAcademicYearRepository adapter"
```

---

### Task 10: SqliteClassRepository adapter

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteClassRepository.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteClassRepository.test.ts`

**Interfaces:**
- Consumes: `guarded`, `Class` aggregate, `IClassRepository` (with `countAll` from Task 3), `GradeLevel`.
- Produces: `SqliteClassRepository implements IClassRepository` (`findById`, `exists`, `countAll`). Consumed by Task 13; `countAll` feeds `GetDashboardOverview`.

- [ ] **Step 1: Write the failing test.** Create `.../SqliteClassRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteClassRepository } from './SqliteClassRepository';

describe('SqliteClassRepository', () => {
  let test: TestContext;
  let repo: SqliteClassRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteClassRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('countAll is 0 on an empty table', () => {
    expect(repo.countAll()).toBe(0);
  });

  it('findById reconstitutes a class and countAll reflects inserts', () => {
    test.context.connection
      .prepare(
        `INSERT INTO ${TableNames.classes}
         (id, institutionId, academicYearId, name, gradeLevel, isActive, version, updatedAt)
         VALUES ('c-1', 'inst-1', 'ay-1', 'Grade 1 A', 'GRADE_1', 1, 1, '2026-07-20T00:00:00.000Z')`,
      )
      .run();
    expect(repo.findById('c-1')?.name).toBe('Grade 1 A');
    expect(repo.exists('c-1')).toBe(true);
    expect(repo.exists('nope')).toBe(false);
    expect(repo.countAll()).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteClassRepository.test.ts`
  Expected: FAIL — adapter does not exist.

- [ ] **Step 3: Write the adapter.** Create `.../SqliteClassRepository.ts`:

```ts
import { Class } from '@nemis-desktop/domain';
import type { IClassRepository } from '@nemis-desktop/application';
import type { GradeLevel } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface ClassRow {
  id: string;
  institutionId: string;
  academicYearId: string;
  name: string;
  gradeLevel: string;
  capacity: number | null;
  isActive: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toClass(row: ClassRow): Class {
  return Class.reconstitute({
    id: row.id,
    institutionId: row.institutionId,
    academicYearId: row.academicYearId,
    name: row.name,
    gradeLevel: row.gradeLevel as GradeLevel,
    capacity: row.capacity ?? undefined,
    isActive: row.isActive === 1,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, academicYearId, name, gradeLevel, capacity, isActive, version, updatedAt, lastModifiedBy';

/** Read-only SQLite adapter for IClassRepository. Write paths (create/update)
 * are not built this phase; the dashboard only needs findById/exists/countAll. */
export class SqliteClassRepository implements IClassRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): Class | null {
    return guarded('SqliteClassRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.classes} WHERE id = ? LIMIT 1`)
        .get(id) as ClassRow | undefined;
      return row ? toClass(row) : null;
    });
  }

  exists(id: string): boolean {
    return guarded('SqliteClassRepository.exists', () => {
      return this.#statements.get(`SELECT id FROM ${TableNames.classes} WHERE id = ? LIMIT 1`).get(id) !== undefined;
    });
  }

  countAll(): number {
    return guarded('SqliteClassRepository.countAll', () => {
      const row = this.#statements.get(`SELECT COUNT(*) AS n FROM ${TableNames.classes}`).get() as { n: number };
      return row.n;
    });
  }
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteClassRepository.test.ts`
  Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/SqliteClassRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteClassRepository.test.ts
git commit -m "feat(data): SqliteClassRepository adapter"
```

---

### Task 11: SqliteAttendanceRepository adapter

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.test.ts`

**Interfaces:**
- Consumes: `guarded`, `Attendance` aggregate (`record` factory + `studentId`/`classId`/`date`/`status`/`updatedAt`/`version`/`lastModifiedBy` getters), `IAttendanceRepository` (with `countByDate` from Task 3), `AttendanceStatus`.
- Produces: `SqliteAttendanceRepository implements IAttendanceRepository` (`save`, `findByClassAndDate`, `countByDate`). NOTE: the `Attendance` domain entity exposes no getter for `subjectId`/`recordedBy` and has no `reconstitute` — so `save` persists only the entity's readable columns (subjectId/recordedBy stored NULL) and `findByClassAndDate` rebuilds via `Attendance.record` (lossy on version/subjectId/recordedBy). This is acceptable: the dashboard only calls `countByDate`, which is pure SQL and exact. Consumed by Task 13; `countByDate` feeds `GetDashboardOverview`.

- [ ] **Step 1: Write the failing test.** Create `.../SqliteAttendanceRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Attendance } from '@nemis-desktop/domain';
import { AttendanceStatus } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteAttendanceRepository } from './SqliteAttendanceRepository';

function record(id: string, status: AttendanceStatus, date = '2026-07-20'): Attendance {
  return Attendance.record({
    id, studentId: `stu-${id}`, classId: 'c-1', date, status,
    occurredAt: `${date}T08:00:00.000Z`,
  });
}

describe('SqliteAttendanceRepository', () => {
  let test: TestContext;
  let repo: SqliteAttendanceRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteAttendanceRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('countByDate is present:0,total:0 on an empty table', () => {
    expect(repo.countByDate('2026-07-20')).toEqual({ present: 0, total: 0 });
  });

  it('save persists rows and countByDate counts present vs total for the date', () => {
    repo.save(record('1', AttendanceStatus.PRESENT));
    repo.save(record('2', AttendanceStatus.ABSENT));
    repo.save(record('3', AttendanceStatus.PRESENT, '2026-07-19'));
    expect(repo.countByDate('2026-07-20')).toEqual({ present: 1, total: 2 });
    expect(repo.countByDate('2026-07-19')).toEqual({ present: 1, total: 1 });
  });

  it('findByClassAndDate returns the rows for that class and date', () => {
    repo.save(record('1', AttendanceStatus.PRESENT));
    repo.save(record('2', AttendanceStatus.LATE));
    const rows = repo.findByClassAndDate('c-1', '2026-07-20');
    expect(rows).toHaveLength(2);
    expect(rows.every((a) => a.classId === 'c-1' && a.date === '2026-07-20')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.test.ts`
  Expected: FAIL — adapter does not exist.

- [ ] **Step 3: Write the adapter.** Create `.../SqliteAttendanceRepository.ts`:

```ts
import { Attendance } from '@nemis-desktop/domain';
import type { IAttendanceRepository } from '@nemis-desktop/application';
import { AttendanceStatus } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface AttendanceRow {
  id: string;
  studentId: string;
  classId: string;
  subjectId: string | null;
  date: string;
  status: string;
  recordedBy: string | null;
  updatedAt: string;
}

/** Rebuilds an Attendance aggregate from a row. Lossy by necessity: the domain
 * entity has no reconstitute and exposes no subjectId/recordedBy getters, so
 * those round-trip as stored (may be NULL) and version resets to 1. The
 * dashboard never reads these; it uses countByDate (exact SQL). */
function toAttendance(row: AttendanceRow): Attendance {
  return Attendance.record({
    id: row.id,
    studentId: row.studentId,
    classId: row.classId,
    subjectId: row.subjectId ?? undefined,
    date: row.date,
    status: row.status as AttendanceStatus,
    recordedBy: row.recordedBy ?? undefined,
    occurredAt: row.updatedAt,
  });
}

/** SQLite adapter for IAttendanceRepository. Only countByDate is on the
 * dashboard path; save/findByClassAndDate are implemented for port completeness
 * (no attendance CRUD UI this phase). */
export class SqliteAttendanceRepository implements IAttendanceRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  save(attendance: Attendance): void {
    guarded('SqliteAttendanceRepository.save', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.attendance}
           (id, studentId, classId, subjectId, date, status, recordedBy, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             date = excluded.date,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          attendance.id,
          attendance.studentId,
          attendance.classId,
          attendance.date,
          attendance.status,
          attendance.version,
          attendance.updatedAt,
          attendance.lastModifiedBy ?? null,
        );
    });
  }

  findByClassAndDate(classId: string, date: string): Attendance[] {
    return guarded('SqliteAttendanceRepository.findByClassAndDate', () => {
      const rows = this.#statements
        .get(
          `SELECT id, studentId, classId, subjectId, date, status, recordedBy, updatedAt
           FROM ${TableNames.attendance} WHERE classId = ? AND date = ?`,
        )
        .all(classId, date) as AttendanceRow[];
      return rows.map(toAttendance);
    });
  }

  countByDate(date: string): { present: number; total: number } {
    return guarded('SqliteAttendanceRepository.countByDate', () => {
      const row = this.#statements
        .get(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS present
           FROM ${TableNames.attendance} WHERE date = ?`,
        )
        .get(AttendanceStatus.PRESENT, date) as { total: number; present: number | null };
      return { present: row.present ?? 0, total: row.total };
    });
  }
}
```

Note: `SUM(...)` over zero rows returns `NULL` in SQLite, hence `row.present ?? 0`.

- [ ] **Step 4: Run to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.test.ts`
  Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteAttendanceRepository.test.ts
git commit -m "feat(data): SqliteAttendanceRepository adapter"
```

---

### Task 12: DeviceGatewayAdapter.getCurrent()

**Files:**
- Modify: `apps/desktop/electron/data/adapters/DeviceGatewayAdapter.ts`
- Test: `apps/desktop/electron/data/adapters/DeviceGatewayAdapter.test.ts`

**Interfaces:**
- Consumes: `IDeviceRepository.findAll()`, `DeviceOutput`.
- Produces: `DeviceGatewayAdapter.getCurrent(): DeviceOutput | null` (implements the `IDeviceGateway.getCurrent` added in Task 3). Backs `device:get-info`.

- [ ] **Step 1: Write the failing test.** Create `apps/desktop/electron/data/adapters/DeviceGatewayAdapter.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../testing/createTestContext';
import { SqliteDeviceRepository } from '../repositories/sqlite/SqliteDeviceRepository';
import { DeviceGatewayAdapter } from './DeviceGatewayAdapter';

describe('DeviceGatewayAdapter.getCurrent', () => {
  let test: TestContext;

  beforeEach(() => {
    test = createTestContext();
  });
  afterEach(() => test.cleanup());

  it('returns null when no device is registered', () => {
    const adapter = new DeviceGatewayAdapter(new SqliteDeviceRepository(test.context));
    expect(adapter.getCurrent()).toBeNull();
  });

  it('returns the registered device', () => {
    const devices = new SqliteDeviceRepository(test.context);
    const adapter = new DeviceGatewayAdapter(devices);
    const registered = adapter.register({
      deviceName: 'lab-01', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0',
    });
    const current = adapter.getCurrent();
    expect(current?.id).toBe(registered.id);
    expect(current?.deviceName).toBe('lab-01');
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run apps/desktop/electron/data/adapters/DeviceGatewayAdapter.test.ts`
  Expected: FAIL — `getCurrent` does not exist.

- [ ] **Step 3: Add the method.** In `apps/desktop/electron/data/adapters/DeviceGatewayAdapter.ts`, add a `getCurrent()` method to the class (after `register`):

```ts
  getCurrent(): DeviceOutput | null {
    const devices = this.devices.findAll();
    const device = devices[0];
    if (!device) return null;
    return {
      id: device.id,
      deviceName: device.deviceName,
      platform: device.platform,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }
```

- [ ] **Step 4: Run to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/data/adapters/DeviceGatewayAdapter.test.ts`
  Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/desktop/electron/data/adapters/DeviceGatewayAdapter.ts apps/desktop/electron/data/adapters/DeviceGatewayAdapter.test.ts
git commit -m "feat(data): DeviceGatewayAdapter.getCurrent"
```

---

### Task 13: Wire business repos into the data layer and composition

**Files:**
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts`
- Modify: `apps/desktop/electron/data/adapters/createApplicationComposition.ts`
- Test: `apps/desktop/electron/data/adapters/business-e2e.test.ts`

**Interfaces:**
- Consumes: the six SQLite adapters (Tasks 6–11), `DeviceGatewayAdapter` (Task 12), `RepositoryContext`, the application ports.
- Produces: `DataLayer.repositories.{students,institutions,users,academicYears,classes,attendance}` and `DataLayer.transactions: TransactionRunner`; a live `createApplicationComposition(dataLayer, logger?)` that returns a real `ApplicationLayer` (business ports real for students/institutions/users/academicYears/classes/attendance; the other five remain `Proxy` stubs). Consumed by `main.ts` (Task 14).

- [ ] **Step 1: Write the failing E2E test.** Create `apps/desktop/electron/data/adapters/business-e2e.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { DatabaseManager } from '../../database/DatabaseManager';
import { createDataLayer, type DataLayer } from '../factories/createDataLayer';
import { createApplicationComposition } from './createApplicationComposition';

const TEST_DEVICE = { deviceName: 'business-e2e', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0' };
const silent = { info: () => {}, warn: () => {}, error: () => {} };

describe('business application layer end-to-end against real SQLite', () => {
  let directory: string;
  let manager: DatabaseManager;
  let dataLayer: DataLayer;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-business-e2e-'));
    manager = new DatabaseManager({ userDataDir: directory, device: TEST_DEVICE });
    manager.initialize();
    dataLayer = createDataLayer(manager, silent);
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('dashboard overview is all zeros on a fresh install', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    const res = await app.reporting.getDashboardOverview();
    expect(res.data).toEqual({ totalStudents: 0, totalClasses: 0, attendanceToday: { present: 0, total: 0 } });
  });

  it('current user is the seeded Local Admin; school and academic year are null', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    expect((await app.identity.getCurrentUser()).data?.fullName).toBe('Local Admin');
    expect((await app.institution.getCurrentSchool()).data).toBeNull();
    expect((await app.academics.getCurrentAcademicYear()).data).toBeNull();
  });

  it('device info reflects the seeded device', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    expect((await app.infra.getDeviceInfo()).data?.deviceName).toBe('business-e2e');
  });

  it('creating a student through the use case increments the overview count', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    await app.students.create({
      institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe',
      admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: Gender.FEMALE,
    });
    expect((await app.reporting.getDashboardOverview()).data.totalStudents).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm rebuild:node && pnpm vitest run apps/desktop/electron/data/adapters/business-e2e.test.ts`
  Expected: FAIL — `dataLayer.repositories.students` undefined / composition still stubs students.

- [ ] **Step 3: Build the business repos in `createDataLayer`.** In `apps/desktop/electron/data/factories/createDataLayer.ts`:

Add imports:
```ts
import type {
  IStudentRepository,
  IInstitutionRepository,
  IUserRepository,
  IAcademicYearRepository,
  IClassRepository,
  IAttendanceRepository,
} from '@nemis-desktop/application';
import { SqliteStudentRepository } from '../repositories/sqlite/business/SqliteStudentRepository';
import { SqliteInstitutionRepository } from '../repositories/sqlite/business/SqliteInstitutionRepository';
import { SqliteUserRepository } from '../repositories/sqlite/business/SqliteUserRepository';
import { SqliteAcademicYearRepository } from '../repositories/sqlite/business/SqliteAcademicYearRepository';
import { SqliteClassRepository } from '../repositories/sqlite/business/SqliteClassRepository';
import { SqliteAttendanceRepository } from '../repositories/sqlite/business/SqliteAttendanceRepository';
```

Extend the `DataLayer` interface: add to `repositories` (after `auditLog`):
```ts
    students: IStudentRepository;
    institutions: IInstitutionRepository;
    users: IUserRepository;
    academicYears: IAcademicYearRepository;
    classes: IClassRepository;
    attendance: IAttendanceRepository;
```
and add a top-level field to `DataLayer`:
```ts
  transactions: TransactionRunner;
```

Inside `createDataLayer`, after the existing platform-repo constructions, build the business repos from the same `context`:
```ts
  const students = new SqliteStudentRepository(context);
  const institutions = new SqliteInstitutionRepository(context);
  const users = new SqliteUserRepository(context);
  const academicYears = new SqliteAcademicYearRepository(context);
  const classes = new SqliteClassRepository(context);
  const attendanceRepo = new SqliteAttendanceRepository(context);
```

Extend the returned object: add the business repos to `repositories` and expose `transactions`:
```ts
  return {
    repositories: {
      devices,
      appSettings,
      syncMetadata,
      syncQueue,
      auditLog,
      students,
      institutions,
      users,
      academicYears,
      classes,
      attendance: attendanceRepo,
    },
    services: {
      device: new DeviceService({ devices }),
      appSettings: new AppSettingsService({ appSettings, auditLog, transactions }),
      syncMetadata: new SyncMetadataService({ syncMetadata }),
      syncQueue: new SyncQueueService({ syncQueue, transactions }),
      auditLog: new AuditLogService({ auditLog }),
    },
    transactions,
  };
```

- [ ] **Step 4: Make the composition live.** Replace `apps/desktop/electron/data/adapters/createApplicationComposition.ts` body: change the signature to drop the separate `transactions` param (read it from `dataLayer`), wire the six real business repos, and keep the remaining five as `Proxy` stubs:

```ts
import {
  createApplicationLayer,
  type ApplicationLayer,
  type ApplicationPorts,
} from '@nemis-desktop/application';
import {
  ConsoleLogger,
  CryptoIdGenerator,
  NoopEventPublisher,
  SystemClock,
} from '@nemis-desktop/application';
import type { IAppLogger } from '@nemis-desktop/application';
import type { DataLayer } from '../factories/createDataLayer';
import { UnitOfWorkAdapter } from './UnitOfWorkAdapter';
import { DeviceGatewayAdapter } from './DeviceGatewayAdapter';
import { SettingsGatewayAdapter } from './SettingsGatewayAdapter';

function notBuilt(name: string): never {
  throw new Error(`${name} repository is not built yet.`);
}

/** Wires the application layer to the real DAL. Dashboard-path business ports
 * are real SQLite adapters; the remaining ports (guardians, enrollments,
 * assessments, grades, grading configs) throw until their phase lands. */
export function createApplicationComposition(
  dataLayer: DataLayer,
  logger: IAppLogger = new ConsoleLogger(),
): ApplicationLayer {
  const ports: ApplicationPorts = {
    // Infra — real SQLite.
    deviceGateway: new DeviceGatewayAdapter(dataLayer.repositories.devices),
    settingsGateway: new SettingsGatewayAdapter(
      dataLayer.repositories.appSettings,
      dataLayer.repositories.auditLog,
      dataLayer.transactions,
    ),
    unitOfWork: new UnitOfWorkAdapter(dataLayer.transactions),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    events: new NoopEventPublisher(),
    logger,
    // Business — real SQLite (Phase 8 dashboard path).
    students: dataLayer.repositories.students,
    institutions: dataLayer.repositories.institutions,
    users: dataLayer.repositories.users,
    academicYears: dataLayer.repositories.academicYears,
    classes: dataLayer.repositories.classes,
    attendance: dataLayer.repositories.attendance,
    // Not built yet — throw if used.
    guardians: new Proxy({} as never, { get: () => () => notBuilt('Guardian') }),
    enrollments: new Proxy({} as never, { get: () => () => notBuilt('Enrollment') }),
    assessments: new Proxy({} as never, { get: () => () => notBuilt('Assessment') }),
    grades: new Proxy({} as never, { get: () => () => notBuilt('Grade') }),
    gradingConfigs: new Proxy({} as never, { get: () => () => notBuilt('GradingConfig') }),
  };
  return createApplicationLayer(ports);
}
```

- [ ] **Step 5: Run the E2E test to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/data/adapters/business-e2e.test.ts`
  Expected: PASS (4 tests).

- [ ] **Step 6: Run the whole electron data + database suite + app typecheck.** Run: `pnpm vitest run apps/desktop/electron && pnpm --filter @nemis-desktop/app typecheck`
  Expected: PASS (all electron tests including the existing `createDataLayer.test.ts`) and clean typecheck.

- [ ] **Step 7: Commit.**

```bash
git add apps/desktop/electron/data/factories/createDataLayer.ts apps/desktop/electron/data/adapters/createApplicationComposition.ts apps/desktop/electron/data/adapters/business-e2e.test.ts
git commit -m "feat(data): wire real business repos into data layer and composition"
```

---

### Task 14: IPC contract & API types (5 new channels)

**Files:**
- Create: `packages/types/src/dashboard.ts`
- Modify: `packages/types/src/ipc.ts`
- Modify: `packages/types/src/api.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: wire-result types `DashboardOverviewResult`, `SchoolSummaryResult`, `AcademicYearResult`, `CurrentUserResult`, `DeviceInfoResult` (structurally identical to the matching application DTOs, so handler returns are assignable and presentation consumers stay type-compatible); 5 new `IpcContract` channels + `IpcChannels` constants; 5 new `NemisApi` method groups (`dashboard`, `school`, `academicYear`, `identity`, `device`). The `IPC_CHANNELS_EXHAUSTIVE` compile-time guard enforces every channel is registered. Consumed by handlers (Task 15) and the renderer bridge (Task 21).

- [ ] **Step 1: Create the wire-result types.** Create `packages/types/src/dashboard.ts`:

```ts
import type { ApprovalStatus, InstitutionType, OwnershipType, SystemRole } from './enums';

/** IPC wire shapes for the dashboard/bootstrap reads. Kept structurally
 * identical to the application-layer output DTOs so main-process handlers can
 * return the DTO directly and the renderer can pass the result straight to the
 * presentation layer. */
export interface DashboardOverviewResult {
  totalStudents: number;
  totalClasses: number;
  attendanceToday: { present: number; total: number };
}

export interface SchoolSummaryResult {
  id: string;
  code: string;
  name: string;
  type: InstitutionType;
  ownership: OwnershipType;
  approvalStatus: ApprovalStatus;
  isApproved: boolean;
  street?: string;
  communityTown?: string;
}

export interface AcademicYearResult {
  id: string;
  institutionId: string;
  code: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface CurrentUserResult {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roles: SystemRole[];
}

export interface DeviceInfoResult {
  id: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add the channels to `IpcContract`/`IpcChannels`.** In `packages/types/src/ipc.ts`, add the import at the top:

```ts
import type {
  AcademicYearResult,
  CurrentUserResult,
  DashboardOverviewResult,
  DeviceInfoResult,
  SchoolSummaryResult,
} from './dashboard';
```

Extend the `IpcContract` interface (after `'settings:get'`):
```ts
  'dashboard:get-overview': { args: []; result: DashboardOverviewResult };
  'school:get-summary': { args: []; result: SchoolSummaryResult | null };
  'academic-year:get-current': { args: []; result: AcademicYearResult | null };
  'identity:get-current-user': { args: []; result: CurrentUserResult | null };
  'device:get-info': { args: []; result: DeviceInfoResult | null };
```

Extend the `IpcChannels` constant (after `SETTINGS_GET`):
```ts
  DASHBOARD_GET_OVERVIEW: 'dashboard:get-overview',
  SCHOOL_GET_SUMMARY: 'school:get-summary',
  ACADEMIC_YEAR_GET_CURRENT: 'academic-year:get-current',
  IDENTITY_GET_CURRENT_USER: 'identity:get-current-user',
  DEVICE_GET_INFO: 'device:get-info',
```

(The existing `IPC_CHANNELS_EXHAUSTIVE` const now type-checks only if all five are present in both maps — leave it as-is.)

- [ ] **Step 3: Add the API method groups.** In `packages/types/src/api.ts`, add the import and the new interfaces + `NemisApi` fields:

```ts
import type {
  AcademicYearResult,
  CurrentUserResult,
  DashboardOverviewResult,
  DeviceInfoResult,
  SchoolSummaryResult,
} from './dashboard';
```
```ts
export interface DashboardApi {
  getOverview(): Promise<DashboardOverviewResult>;
}
export interface SchoolApi {
  getSummary(): Promise<SchoolSummaryResult | null>;
}
export interface AcademicYearApi {
  getCurrent(): Promise<AcademicYearResult | null>;
}
export interface IdentityApi {
  getCurrentUser(): Promise<CurrentUserResult | null>;
}
export interface DeviceApi {
  getInfo(): Promise<DeviceInfoResult | null>;
}
```
Extend the `NemisApi` interface:
```ts
export interface NemisApi {
  system: SystemApi;
  settings: SettingsApi;
  dashboard: DashboardApi;
  school: SchoolApi;
  academicYear: AcademicYearApi;
  identity: IdentityApi;
  device: DeviceApi;
}
```

- [ ] **Step 4: Export the new module.** In `packages/types/src/index.ts`, add:
```ts
export * from './dashboard';
```

- [ ] **Step 5: Verify the types package type-checks.** Run: `pnpm --filter @nemis-desktop/types typecheck`
  Expected: PASS (in particular, `IPC_CHANNELS_EXHAUSTIVE` still resolves to `true`, proving every channel is registered).

- [ ] **Step 6: Commit.**

```bash
git add packages/types/src/dashboard.ts packages/types/src/ipc.ts packages/types/src/api.ts packages/types/src/index.ts
git commit -m "feat(types): add dashboard/bootstrap IPC channels and API"
```

---

### Task 15: IPC handlers, registrar, preload, main wiring

**Files:**
- Create: `apps/desktop/electron/ipc/handlers/dashboard.ts`
- Create: `apps/desktop/electron/ipc/handlers/school.ts`
- Create: `apps/desktop/electron/ipc/handlers/academicYear.ts`
- Create: `apps/desktop/electron/ipc/handlers/identity.ts`
- Create: `apps/desktop/electron/ipc/handlers/device.ts`
- Modify: `apps/desktop/electron/ipc/registrar.ts`
- Modify: `apps/desktop/electron/preload/preload.ts`
- Modify: `apps/desktop/electron/main/main.ts`
- Test: `apps/desktop/electron/ipc/handlers/dashboard-handlers.test.ts`

**Interfaces:**
- Consumes: `ApplicationLayer` (Task 5/13), `IpcChannels`, `assertNoArgs`, `IpcHandle`.
- Produces: `registerDashboardHandlers/registerSchoolHandlers/registerAcademicYearHandlers/registerIdentityHandlers/registerDeviceHandlers(handle, app)`; `registerIpcHandlers(services, app)` (new second param); preload `window.nemis.{dashboard,school,academicYear,identity,device}`; `main.ts` builds the composition and passes it to the registrar.

- [ ] **Step 1: Write the failing handler test.** Create `apps/desktop/electron/ipc/handlers/dashboard-handlers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel, IpcContract } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '../registrar';
import { registerDashboardHandlers } from './dashboard';
import { registerSchoolHandlers } from './school';
import { registerAcademicYearHandlers } from './academicYear';
import { registerIdentityHandlers } from './identity';
import { registerDeviceHandlers } from './device';

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

const app = {
  reporting: { getDashboardOverview: async () => ({ data: { totalStudents: 3, totalClasses: 2, attendanceToday: { present: 1, total: 3 } } }) },
  institution: { getCurrentSchool: async () => ({ data: null }) },
  academics: { getCurrentAcademicYear: async () => ({ data: null }) },
  identity: { getCurrentUser: async () => ({ data: { id: 'u1', fullName: 'Local Admin', email: 'a@b', isActive: true, roles: [] } }) },
  infra: { getDeviceInfo: async () => ({ data: null }) },
} as unknown as ApplicationLayer;

describe('dashboard/bootstrap IPC handlers', () => {
  it('dashboard:get-overview returns the overview data and rejects extra args', async () => {
    const { calls, handle } = makeHarness();
    registerDashboardHandlers(handle, app);
    const call = calls.get('dashboard:get-overview');
    expect(call).toBeDefined();
    const result = (await call!.handler()) as IpcContract['dashboard:get-overview']['result'];
    expect(result.totalStudents).toBe(3);
    expect(() => call!.validate(['unexpected'])).toThrow(IPCError);
  });

  it('registers the other four no-arg channels', () => {
    const { calls, handle } = makeHarness();
    registerSchoolHandlers(handle, app);
    registerAcademicYearHandlers(handle, app);
    registerIdentityHandlers(handle, app);
    registerDeviceHandlers(handle, app);
    for (const channel of ['school:get-summary', 'academic-year:get-current', 'identity:get-current-user', 'device:get-info']) {
      expect(calls.get(channel)).toBeDefined();
    }
  });

  it('identity:get-current-user returns the mapped user', async () => {
    const { calls, handle } = makeHarness();
    registerIdentityHandlers(handle, app);
    const result = await calls.get('identity:get-current-user')!.handler();
    expect(result).toEqual({ id: 'u1', fullName: 'Local Admin', email: 'a@b', isActive: true, roles: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run apps/desktop/electron/ipc/handlers/dashboard-handlers.test.ts`
  Expected: FAIL — handler modules do not exist.

- [ ] **Step 3: Write the five handler modules.**

`ipc/handlers/dashboard.ts`:
```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerDashboardHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DASHBOARD_GET_OVERVIEW, assertNoArgs, async () => {
    const res = await app.reporting.getDashboardOverview();
    return res.data;
  });
}
```
`ipc/handlers/school.ts`:
```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerSchoolHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.SCHOOL_GET_SUMMARY, assertNoArgs, async () => {
    const res = await app.institution.getCurrentSchool();
    return res.data;
  });
}
```
`ipc/handlers/academicYear.ts`:
```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerAcademicYearHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.ACADEMIC_YEAR_GET_CURRENT, assertNoArgs, async () => {
    const res = await app.academics.getCurrentAcademicYear();
    return res.data;
  });
}
```
`ipc/handlers/identity.ts`:
```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerIdentityHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.IDENTITY_GET_CURRENT_USER, assertNoArgs, async () => {
    const res = await app.identity.getCurrentUser();
    return res.data;
  });
}
```
`ipc/handlers/device.ts`:
```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerDeviceHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DEVICE_GET_INFO, assertNoArgs, async () => {
    const res = await app.infra.getDeviceInfo();
    return res.data;
  });
}
```

- [ ] **Step 4: Run the handler test to verify it passes.** Run: `pnpm vitest run apps/desktop/electron/ipc/handlers/dashboard-handlers.test.ts`
  Expected: PASS (3 tests).

- [ ] **Step 5: Wire the registrar.** In `apps/desktop/electron/ipc/registrar.ts`: add imports and extend the signature. Add:
```ts
import type { ApplicationLayer } from '@nemis-desktop/application';
import { registerDashboardHandlers } from '@app/ipc/handlers/dashboard';
import { registerSchoolHandlers } from '@app/ipc/handlers/school';
import { registerAcademicYearHandlers } from '@app/ipc/handlers/academicYear';
import { registerIdentityHandlers } from '@app/ipc/handlers/identity';
import { registerDeviceHandlers } from '@app/ipc/handlers/device';
```
Change `registerIpcHandlers`:
```ts
export function registerIpcHandlers(services: DataLayer['services'], app: ApplicationLayer): void {
  registerSystemHandlers(handle);
  registerSettingsHandlers(handle, services.appSettings);
  registerDashboardHandlers(handle, app);
  registerSchoolHandlers(handle, app);
  registerAcademicYearHandlers(handle, app);
  registerIdentityHandlers(handle, app);
  registerDeviceHandlers(handle, app);
}
```

- [ ] **Step 6: Expose the bridge in preload.** In `apps/desktop/electron/preload/preload.ts`, extend the `nemisApi` object with the five groups:
```ts
  dashboard: {
    getOverview: () => invoke(IpcChannels.DASHBOARD_GET_OVERVIEW),
  },
  school: {
    getSummary: () => invoke(IpcChannels.SCHOOL_GET_SUMMARY),
  },
  academicYear: {
    getCurrent: () => invoke(IpcChannels.ACADEMIC_YEAR_GET_CURRENT),
  },
  identity: {
    getCurrentUser: () => invoke(IpcChannels.IDENTITY_GET_CURRENT_USER),
  },
  device: {
    getInfo: () => invoke(IpcChannels.DEVICE_GET_INFO),
  },
```

- [ ] **Step 7: Build & pass the composition in `main.ts`.** In `apps/desktop/electron/main/main.ts`: add the import:
```ts
import { createApplicationComposition } from '@app/data/adapters/createApplicationComposition';
```
After `const dataLayer = createDataLayer(databaseManager, databaseLog);`, add:
```ts
      const application = createApplicationComposition(dataLayer);
```
Change the registrar call from `registerIpcHandlers(dataLayer.services);` to:
```ts
      registerIpcHandlers(dataLayer.services, application);
```

- [ ] **Step 8: Verify the app package type-checks and all electron tests pass.** Run: `pnpm --filter @nemis-desktop/app typecheck && pnpm vitest run apps/desktop/electron`
  Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add apps/desktop/electron/ipc apps/desktop/electron/preload/preload.ts apps/desktop/electron/main/main.ts
git commit -m "feat(ipc): dashboard/bootstrap IPC handlers wired through the application layer"
```

---

### Task 16: Presentation `DatabaseUnavailableError`

**Files:**
- Modify: `packages/presentation/src/errors/presentation-error.ts`
- Test: `packages/presentation/src/errors/presentation-error.test.ts` (create)

**Interfaces:**
- Produces: `PresentationErrorKind` gains `'database-unavailable'`; new `DatabaseUnavailableError extends PresentationError` (kind `'database-unavailable'`). `toPresentationError` already passes through any `PresentationError` instance unchanged, so the IPC facade (Task 21) throws this class directly. Consumed by the dashboard UI (Task 22), which branches on `error.kind`.

- [ ] **Step 1: Write the failing test.** Create `packages/presentation/src/errors/presentation-error.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DatabaseUnavailableError, NetworkUnavailableError, PresentationError } from './presentation-error';
import { toPresentationError } from './to-presentation-error';

describe('DatabaseUnavailableError', () => {
  it('has the database-unavailable kind and a user message', () => {
    const err = new DatabaseUnavailableError('The local database is unavailable.');
    expect(err).toBeInstanceOf(PresentationError);
    expect(err.kind).toBe('database-unavailable');
    expect(err.userMessage).toBe('The local database is unavailable.');
  });

  it('passes through toPresentationError unchanged', () => {
    const err = new DatabaseUnavailableError('down');
    expect(toPresentationError(err, 'query')).toBe(err);
    const net = new NetworkUnavailableError('offline');
    expect(toPresentationError(net, 'query')).toBe(net);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run packages/presentation/src/errors/presentation-error.test.ts`
  Expected: FAIL — `DatabaseUnavailableError` does not exist.

- [ ] **Step 3: Add the error class and kind.** In `packages/presentation/src/errors/presentation-error.ts`:

Add `'database-unavailable'` to the `PresentationErrorKind` union (after `'network-unavailable'`):
```ts
  | 'network-unavailable'
  | 'database-unavailable'
```
Add the class (after `NetworkUnavailableError`):
```ts
/** The local SQLite database could not be reached (locked, corrupt, or not
 * ready). Distinct from network-unavailable: this is the on-device store, not
 * a remote service. Produced by the IPC facade from DATABASE_UNAVAILABLE /
 * MIGRATION_REQUIRED IPC error codes. */
export class DatabaseUnavailableError extends PresentationError {
  constructor(userMessage: string, options?: { cause?: unknown }) {
    super('database-unavailable', userMessage, options);
  }
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `pnpm vitest run packages/presentation/src/errors/presentation-error.test.ts`
  Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/presentation/src/errors/presentation-error.ts packages/presentation/src/errors/presentation-error.test.ts
git commit -m "feat(presentation): add DatabaseUnavailableError"
```

---

### Task 17: Graduate DashboardViewModel to the reporting overview

**Files:**
- Modify: `packages/presentation/src/view-models/dashboard/dashboard-views.ts`
- Modify: `packages/presentation/src/view-models/dashboard/dashboard-view-model.ts`
- Create: `packages/presentation/src/queries/reporting/get-dashboard-overview-ui-query.ts`
- Create: `packages/presentation/src/mappers/reporting/dashboard-view-mapper.ts`
- Modify: `packages/presentation/src/view-models/dashboard/dashboard-view-model.test.ts`
- Modify: `packages/presentation/src/index.ts`

**Interfaces:**
- Consumes: `ReportingApplicationService.getDashboardOverview()` (Task 5), `DashboardOverviewOutput`, `trackQuery`.
- Produces: `DashboardStatView { key; label; value }` (NO `placeholder`); `DashboardSummaryView { stats: readonly DashboardStatView[]; attendanceToday: { present; total } }`; `GetDashboardOverviewUiQuery`; `toDashboardSummaryView`; `DashboardViewModel` now takes `{ reporting: ReportingApplicationService; notifications: NotificationStore }` and exposes `loadOverview()`. Consumed by the presentation factory (Task 20) and the dashboard page (Task 22).

- [ ] **Step 1: Replace the views.** Overwrite `packages/presentation/src/view-models/dashboard/dashboard-views.ts`:

```ts
/** A real dashboard statistic — every value is backed by a repository count.
 * There are no placeholder/sample tiles: unbacked facts (teachers) are their
 * own empty state in the UI, never a fabricated number here. */
export interface DashboardStatView {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

export interface DashboardSummaryView {
  readonly stats: readonly DashboardStatView[];
  readonly attendanceToday: { readonly present: number; readonly total: number };
}
```

- [ ] **Step 2: Write the UI query and mapper.**

Create `packages/presentation/src/queries/reporting/get-dashboard-overview-ui-query.ts`:
```ts
import type {
  ApplicationResponse,
  DashboardOverviewOutput,
  ReportingApplicationService,
} from '@nemis-desktop/application';

export class GetDashboardOverviewUiQuery {
  constructor(private readonly reporting: ReportingApplicationService) {}

  execute(): Promise<ApplicationResponse<DashboardOverviewOutput>> {
    return this.reporting.getDashboardOverview();
  }
}
```
Create `packages/presentation/src/mappers/reporting/dashboard-view-mapper.ts`:
```ts
import type { DashboardOverviewOutput } from '@nemis-desktop/application';
import type { DashboardSummaryView } from '../../view-models/dashboard/dashboard-views';

export function toDashboardSummaryView(dto: DashboardOverviewOutput): DashboardSummaryView {
  return {
    stats: [
      { key: 'total-students', label: 'Total Students', value: dto.totalStudents },
      { key: 'total-classes', label: 'Total Classes', value: dto.totalClasses },
    ],
    attendanceToday: dto.attendanceToday,
  };
}
```

- [ ] **Step 3: Rewrite the ViewModel.** Overwrite `packages/presentation/src/view-models/dashboard/dashboard-view-model.ts`:

```ts
import type { ReportingApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toDashboardSummaryView } from '../../mappers/reporting/dashboard-view-mapper';
import { GetDashboardOverviewUiQuery } from '../../queries/reporting/get-dashboard-overview-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { DashboardSummaryView } from './dashboard-views';

export interface DashboardState {
  readonly summary: AsyncState<DashboardSummaryView>;
}

export interface DashboardViewModelDeps {
  readonly reporting: ReportingApplicationService;
  readonly notifications: NotificationStore;
}

export class DashboardViewModel {
  readonly store = createStore<DashboardState>(() => ({ summary: idleState() }));

  private readonly overviewQuery: GetDashboardOverviewUiQuery;

  constructor(deps: DashboardViewModelDeps) {
    this.overviewQuery = new GetDashboardOverviewUiQuery(deps.reporting);
  }

  async loadOverview(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.overviewQuery.execute(),
      map: toDashboardSummaryView,
    });
  }
}
```

- [ ] **Step 4: Rewrite the ViewModel test.** Overwrite `packages/presentation/src/view-models/dashboard/dashboard-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { DashboardViewModel } from './dashboard-view-model';

async function seedStudents(count: number) {
  const { app, ports } = createTestApplication();
  for (let i = 0; i < count; i += 1) {
    await app.students.create({
      institutionId: 'inst-1', firstName: `Student${i}`, lastName: 'Test',
      admissionNumber: `ADM-${i}`, dateOfBirth: '2015-01-01', gender: Gender.MALE,
    });
  }
  return { app, ports };
}

describe('DashboardViewModel', () => {
  it('loads the real overview from the reporting service', async () => {
    const { app } = await seedStudents(3);
    const vm = new DashboardViewModel({ reporting: app.reporting, notifications: new NotificationStore() });
    await vm.loadOverview();
    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') {
      const students = summary.data.stats.find((s) => s.key === 'total-students');
      expect(students).toEqual({ key: 'total-students', label: 'Total Students', value: 3 });
      expect(summary.data.attendanceToday).toEqual({ present: 0, total: 0 });
    }
  });

  it('renders real zeros (success, not empty) on a fresh install', async () => {
    const { app } = await seedStudents(0);
    const vm = new DashboardViewModel({ reporting: app.reporting, notifications: new NotificationStore() });
    await vm.loadOverview();
    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') {
      expect(summary.data.stats.find((s) => s.key === 'total-students')?.value).toBe(0);
      expect(summary.data.stats.find((s) => s.key === 'total-classes')?.value).toBe(0);
    }
  });
});
```

- [ ] **Step 5: Update the package index.** In `packages/presentation/src/index.ts`, add:
```ts
export * from './queries/reporting/get-dashboard-overview-ui-query';
export * from './mappers/reporting/dashboard-view-mapper';
```
(The existing `dashboard-views`/`dashboard-view-model` exports stay.)

- [ ] **Step 6: Run the dashboard VM test (it fails to compile against the factory until Task 20).** Run: `pnpm vitest run packages/presentation/src/view-models/dashboard/dashboard-view-model.test.ts`
  Expected: PASS for this file (it constructs `DashboardViewModel` directly with `app.reporting`). NOTE: `pnpm --filter @nemis-desktop/presentation typecheck` will still FAIL here because `create-presentation-layer.ts` constructs `DashboardViewModel` with the old `{ students }` deps — that is fixed in Task 20. Do not run the package typecheck at this task boundary.

- [ ] **Step 7: Commit.**

```bash
git add packages/presentation/src/view-models/dashboard packages/presentation/src/queries/reporting packages/presentation/src/mappers/reporting packages/presentation/src/index.ts
git commit -m "feat(presentation): graduate DashboardViewModel to the reporting overview"
```

---

### Task 18: No-arg "current entity" loads on CurrentUser / Settings / Device + AcademicYearViewModel

**Files:**
- Create: `packages/presentation/src/queries/identity/get-current-user-ui-query.ts`
- Create: `packages/presentation/src/queries/settings/get-current-school-ui-query.ts`
- Create: `packages/presentation/src/queries/device/get-device-info-ui-query.ts`
- Create: `packages/presentation/src/queries/academics/get-current-academic-year-ui-query.ts`
- Create: `packages/presentation/src/mappers/academics/academic-year-view-mapper.ts`
- Create: `packages/presentation/src/view-models/academic-year/academic-year-views.ts`
- Create: `packages/presentation/src/view-models/academic-year/academic-year-view-model.ts`
- Modify: `packages/presentation/src/view-models/current-user/current-user-view-model.ts`
- Modify: `packages/presentation/src/view-models/settings/settings-view-model.ts`
- Modify: `packages/presentation/src/view-models/device/device-view-model.ts`
- Modify: `packages/presentation/src/index.ts`
- Test: `packages/presentation/src/view-models/academic-year/academic-year-view-model.test.ts`, `packages/presentation/src/view-models/current-user/current-user-current.test.ts`, `packages/presentation/src/view-models/settings/settings-current-school.test.ts`, `packages/presentation/src/view-models/device/device-info.test.ts`

**Interfaces:**
- Consumes: `identity.getCurrentUser()`, `institution.getCurrentSchool()`, `infra.getDeviceInfo()`, `academics.getCurrentAcademicYear()` (Task 5); existing `toUserView`, `toInstitutionProfileView`, `toDeviceView`.
- Produces: `CurrentUserViewModel.loadCurrentUser()`, `SettingsViewModel.loadCurrentSchool()`, `DeviceViewModel.loadDeviceInfo()`; new `AcademicYearViewModel` (`loadCurrent()`, `store` with `current: AsyncState<AcademicYearView>`), `AcademicYearView`, `toAcademicYearView`, four `*UiQuery` classes. Consumed by the presentation factory + BootstrapService (Tasks 19–20) and the school-admin layout/page (Task 22).

- [ ] **Step 1: Write the failing tests.**

Create `packages/presentation/src/view-models/academic-year/academic-year-view-model.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AcademicYear } from '@nemis-desktop/domain';
import { createTestApplication } from '../../testing/create-test-application';
import { AcademicYearViewModel } from './academic-year-view-model';

describe('AcademicYearViewModel', () => {
  it('is empty when no year is configured', async () => {
    const { app } = createTestApplication();
    const vm = new AcademicYearViewModel({ academics: app.academics });
    await vm.loadCurrent();
    expect(vm.store.getState().current.status).toBe('empty');
  });

  it('loads the current academic year view', async () => {
    const { app, ports } = createTestApplication();
    ports.academicYears.store.set(
      'ay-1',
      AcademicYear.reconstitute({
        id: 'ay-1', institutionId: 'inst-1', code: '2025/2026', start: '2025-09-01',
        end: '2026-07-31', isCurrent: true, version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    const vm = new AcademicYearViewModel({ academics: app.academics });
    await vm.loadCurrent();
    const current = vm.store.getState().current;
    expect(current.status).toBe('success');
    if (current.status === 'success') expect(current.data.code).toBe('2025/2026');
  });
});
```

Create `packages/presentation/src/view-models/current-user/current-user-current.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { User, UserOrganization } from '@nemis-desktop/domain';
import { SystemRole } from '@nemis-desktop/types';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { CurrentUserViewModel } from './current-user-view-model';

describe('CurrentUserViewModel.loadCurrentUser', () => {
  it('loads the single local user with no id argument', async () => {
    const { app, ports } = createTestApplication();
    ports.users.store.set(
      'usr-1',
      User.reconstitute({
        id: 'usr-1', firstName: 'Local', lastName: 'Admin', email: 'admin@local.nemis',
        isActive: true,
        organizations: [UserOrganization.reconstitute({ id: 'o-1', role: SystemRole.INSTITUTION_ADMIN, isActive: true })],
        version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    const session = new SessionStore();
    const vm = new CurrentUserViewModel({ identity: app.identity, session });
    await vm.loadCurrentUser();
    const user = vm.store.getState().user;
    expect(user.status).toBe('success');
    if (user.status === 'success') expect(user.data.fullName).toBe('Local Admin');
    expect(session.store.getState().currentUserId).toBe('usr-1');
  });
});
```

Create `packages/presentation/src/view-models/settings/settings-current-school.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { SettingsViewModel } from './settings-view-model';

describe('SettingsViewModel.loadCurrentSchool', () => {
  it('is empty when no institution exists', async () => {
    const { app } = createTestApplication();
    const vm = new SettingsViewModel({ institution: app.institution, infra: app.infra, notifications: new NotificationStore() });
    await vm.loadCurrentSchool();
    expect(vm.store.getState().profile.status).toBe('empty');
  });

  it('loads the current school with no id argument', async () => {
    const { app, ports } = createTestApplication();
    ports.institutions.store.set(
      'inst-1',
      Institution.reconstitute({
        id: 'inst-1', code: 'lib-001', name: 'Monrovia Central', type: InstitutionType.SCHOOL,
        ownership: OwnershipType.GOVERNMENT, countyId: 'county-1', approvalStatus: ApprovalStatus.APPROVED,
        address: { communityTown: 'Sinkor' }, version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    const vm = new SettingsViewModel({ institution: app.institution, infra: app.infra, notifications: new NotificationStore() });
    await vm.loadCurrentSchool();
    const profile = vm.store.getState().profile;
    expect(profile.status).toBe('success');
    if (profile.status === 'success') expect(profile.data.name).toBe('Monrovia Central');
  });
});
```

Create `packages/presentation/src/view-models/device/device-info.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { NotificationStore } from '../../stores/notification-store';
import { SessionStore } from '../../stores/session-store';
import { createTestApplication } from '../../testing/create-test-application';
import { DeviceViewModel } from './device-view-model';

describe('DeviceViewModel.loadDeviceInfo', () => {
  it('is empty when no device is registered', async () => {
    const { app } = createTestApplication();
    const vm = new DeviceViewModel({ infra: app.infra, notifications: new NotificationStore(), session: new SessionStore() });
    await vm.loadDeviceInfo();
    expect(vm.store.getState().device.status).toBe('empty');
  });

  it('loads the current device info', async () => {
    const { app, ports } = createTestApplication();
    ports.deviceGateway.register({ deviceName: 'Front-desk PC', platform: 'win32', osVersion: '10.0.19045', appVersion: '1.0.0' });
    const vm = new DeviceViewModel({ infra: app.infra, notifications: new NotificationStore(), session: new SessionStore() });
    await vm.loadDeviceInfo();
    const device = vm.store.getState().device;
    expect(device.status).toBe('success');
    if (device.status === 'success') expect(device.data.deviceName).toBe('Front-desk PC');
  });
});
```

- [ ] **Step 2: Run to verify they fail.** Run: `pnpm vitest run packages/presentation/src/view-models/academic-year packages/presentation/src/view-models/current-user/current-user-current.test.ts packages/presentation/src/view-models/settings/settings-current-school.test.ts packages/presentation/src/view-models/device/device-info.test.ts`
  Expected: FAIL — new query/VM code does not exist.

- [ ] **Step 3: Write the four UI queries.**

`queries/identity/get-current-user-ui-query.ts`:
```ts
import type { ApplicationResponse, IdentityApplicationService, UserOutput } from '@nemis-desktop/application';

export class GetCurrentUserUiQuery {
  constructor(private readonly identity: IdentityApplicationService) {}
  execute(): Promise<ApplicationResponse<UserOutput | null>> {
    return this.identity.getCurrentUser();
  }
}
```
`queries/settings/get-current-school-ui-query.ts`:
```ts
import type { ApplicationResponse, InstitutionApplicationService, InstitutionProfileOutput } from '@nemis-desktop/application';

export class GetCurrentSchoolUiQuery {
  constructor(private readonly institution: InstitutionApplicationService) {}
  execute(): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.institution.getCurrentSchool();
  }
}
```
`queries/device/get-device-info-ui-query.ts`:
```ts
import type { ApplicationResponse, DeviceOutput, InfraApplicationService } from '@nemis-desktop/application';

export class GetDeviceInfoUiQuery {
  constructor(private readonly infra: InfraApplicationService) {}
  execute(): Promise<ApplicationResponse<DeviceOutput | null>> {
    return this.infra.getDeviceInfo();
  }
}
```
`queries/academics/get-current-academic-year-ui-query.ts`:
```ts
import type { AcademicsApplicationService, AcademicYearOutput, ApplicationResponse } from '@nemis-desktop/application';

export class GetCurrentAcademicYearUiQuery {
  constructor(private readonly academics: AcademicsApplicationService) {}
  execute(): Promise<ApplicationResponse<AcademicYearOutput | null>> {
    return this.academics.getCurrentAcademicYear();
  }
}
```

- [ ] **Step 4: Write the AcademicYear view + mapper + ViewModel.**

`view-models/academic-year/academic-year-views.ts`:
```ts
export interface AcademicYearView {
  readonly id: string;
  readonly code: string;
  readonly startDate: string;
  readonly endDate: string;
}
```
`mappers/academics/academic-year-view-mapper.ts`:
```ts
import type { AcademicYearOutput } from '@nemis-desktop/application';
import type { AcademicYearView } from '../../view-models/academic-year/academic-year-views';

export function toAcademicYearView(dto: AcademicYearOutput): AcademicYearView {
  return { id: dto.id, code: dto.code, startDate: dto.startDate, endDate: dto.endDate };
}
```
`view-models/academic-year/academic-year-view-model.ts`:
```ts
import type { AcademicsApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toAcademicYearView } from '../../mappers/academics/academic-year-view-mapper';
import { GetCurrentAcademicYearUiQuery } from '../../queries/academics/get-current-academic-year-ui-query';
import type { AcademicYearView } from './academic-year-views';

export interface AcademicYearState {
  readonly current: AsyncState<AcademicYearView>;
}

export interface AcademicYearViewModelDeps {
  readonly academics: AcademicsApplicationService;
}

export class AcademicYearViewModel {
  readonly store = createStore<AcademicYearState>(() => ({ current: idleState() }));

  private readonly currentQuery: GetCurrentAcademicYearUiQuery;

  constructor(deps: AcademicYearViewModelDeps) {
    this.currentQuery = new GetCurrentAcademicYearUiQuery(deps.academics);
  }

  async loadCurrent(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().current,
        set: (current) => this.store.setState({ current }),
      },
      fetch: () => this.currentQuery.execute(),
      map: toAcademicYearView,
    });
  }
}
```

- [ ] **Step 5: Add `loadCurrentUser` to CurrentUserViewModel.** In `view-models/current-user/current-user-view-model.ts`, add the import and a second query field + method:

Add import:
```ts
import { GetCurrentUserUiQuery } from '../../queries/identity/get-current-user-ui-query';
```
Add a private field alongside `userQuery`:
```ts
  private readonly currentUserQuery: GetCurrentUserUiQuery;
```
In the constructor, after `this.userQuery = ...`:
```ts
    this.currentUserQuery = new GetCurrentUserUiQuery(deps.identity);
```
Add the method (mirrors `loadUser`, no id):
```ts
  async loadCurrentUser(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().user,
        set: (user) => this.store.setState({ user }),
      },
      fetch: () => this.currentUserQuery.execute(),
      onData: (dto) => this.deps.session.setCurrentUser(dto.id),
      map: toUserView,
    });
    if (this.store.getState().user.status === 'empty') {
      this.deps.session.setCurrentUser(null);
    }
  }
```

- [ ] **Step 6: Add `loadCurrentSchool` to SettingsViewModel.** In `view-models/settings/settings-view-model.ts`, add:

Import:
```ts
import { GetCurrentSchoolUiQuery } from '../../queries/settings/get-current-school-ui-query';
```
Private field + constructor init (next to `profileQuery`):
```ts
  private readonly currentSchoolQuery: GetCurrentSchoolUiQuery;
```
```ts
    this.currentSchoolQuery = new GetCurrentSchoolUiQuery(deps.institution);
```
Method (writes the same `profile` state as `loadProfile`):
```ts
  async loadCurrentSchool(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().profile,
        set: (profile) => this.store.setState({ profile }),
      },
      fetch: () => this.currentSchoolQuery.execute(),
      map: toInstitutionProfileView,
    });
  }
```

- [ ] **Step 7: Add `loadDeviceInfo` to DeviceViewModel.** In `view-models/device/device-view-model.ts`, add imports and method:

Imports:
```ts
import { trackQuery } from '../../core/async-runner';
import { toDeviceView } from '../../mappers/infra/infra-view-mapper';
import { GetDeviceInfoUiQuery } from '../../queries/device/get-device-info-ui-query';
```
(Note `device-view-model.ts` currently imports only `type CommandOutcome` from async-runner; change that line to also import the `trackQuery` value.)

Private field + constructor init:
```ts
  private readonly deviceInfoQuery: GetDeviceInfoUiQuery;
```
```ts
    this.deviceInfoQuery = new GetDeviceInfoUiQuery(deps.infra);
```
Method:
```ts
  async loadDeviceInfo(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().device,
        set: (device) => this.store.setState({ device }),
      },
      fetch: () => this.deviceInfoQuery.execute(),
      map: toDeviceView,
    });
  }
```

- [ ] **Step 8: Export the new modules.** In `packages/presentation/src/index.ts`, add:
```ts
export * from './queries/identity/get-current-user-ui-query';
export * from './queries/settings/get-current-school-ui-query';
export * from './queries/device/get-device-info-ui-query';
export * from './queries/academics/get-current-academic-year-ui-query';
export * from './mappers/academics/academic-year-view-mapper';
export * from './view-models/academic-year/academic-year-views';
export * from './view-models/academic-year/academic-year-view-model';
```

- [ ] **Step 9: Run the new tests.** Run: `pnpm vitest run packages/presentation/src/view-models/academic-year packages/presentation/src/view-models/current-user/current-user-current.test.ts packages/presentation/src/view-models/settings/settings-current-school.test.ts packages/presentation/src/view-models/device/device-info.test.ts`
  Expected: PASS (all). (Package typecheck still deferred to Task 20.)

- [ ] **Step 10: Commit.**

```bash
git add packages/presentation/src/queries packages/presentation/src/mappers/academics packages/presentation/src/view-models packages/presentation/src/index.ts
git commit -m "feat(presentation): no-arg current-entity loads + AcademicYearViewModel"
```

---

### Task 19: BootstrapStore + BootstrapService

**Files:**
- Create: `packages/presentation/src/stores/bootstrap-store.ts`
- Create: `packages/presentation/src/services/bootstrap-service.ts`
- Modify: `packages/presentation/src/index.ts`
- Test: `packages/presentation/src/services/bootstrap-service.test.ts`

**Interfaces:**
- Produces: `BootstrapStore` (`start`, `markDone`, `markFailed`, `finish`; state `{ phase: 'idle'|'loading'|'ready'|'error'; total; done; failed }`); `BootstrapService` (constructed with a `BootstrapStore` + a `readonly BootstrapTask[]`, `run()` loads all tasks via `Promise.allSettled`); `BootstrapTask { name; run(): Promise<void>; hasError(): boolean }`. Consumed by the presentation factory (Task 20) and observed by `RootProviders` (Task 22).

- [ ] **Step 1: Write the failing test.** Create `packages/presentation/src/services/bootstrap-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BootstrapStore } from '../stores/bootstrap-store';
import { BootstrapService, type BootstrapTask } from './bootstrap-service';

function task(name: string, opts: { error?: boolean; throws?: boolean } = {}): BootstrapTask {
  return {
    name,
    run: async () => {
      if (opts.throws) throw new Error('boom');
    },
    hasError: () => opts.error ?? false,
  };
}

describe('BootstrapService', () => {
  it('marks all tasks done and phase ready when none error', async () => {
    const store = new BootstrapStore();
    await new BootstrapService(store, [task('device'), task('user')]).run();
    const state = store.store.getState();
    expect(state.phase).toBe('ready');
    expect(state.done).toEqual(['device', 'user']);
    expect(state.failed).toEqual([]);
  });

  it('records failed tasks but still reaches ready when some succeed', async () => {
    const store = new BootstrapStore();
    await new BootstrapService(store, [task('device'), task('school', { error: true })]).run();
    const state = store.store.getState();
    expect(state.phase).toBe('ready');
    expect(state.done).toEqual(['device']);
    expect(state.failed).toEqual(['school']);
  });

  it('phase is error when every task fails (e.g. database unavailable)', async () => {
    const store = new BootstrapStore();
    await new BootstrapService(store, [task('a', { error: true }), task('b', { error: true })]).run();
    expect(store.store.getState().phase).toBe('error');
  });

  it('a throwing task does not prevent the others from settling', async () => {
    const store = new BootstrapStore();
    await new BootstrapService(store, [task('a', { throws: true, error: true }), task('b')]).run();
    const state = store.store.getState();
    expect(state.done).toEqual(['b']);
    expect(state.failed).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run packages/presentation/src/services/bootstrap-service.test.ts`
  Expected: FAIL — modules do not exist.

- [ ] **Step 3: Write the store.** Create `packages/presentation/src/stores/bootstrap-store.ts`:

```ts
import { createStore } from 'zustand/vanilla';

export type BootstrapPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface BootstrapState {
  readonly phase: BootstrapPhase;
  readonly total: number;
  readonly done: readonly string[];
  readonly failed: readonly string[];
}

/** Observable progress of the renderer's startup data-loading sequence.
 * Written only by BootstrapService; read by RootProviders to decide between
 * the loading splash, the app, and the database-unavailable panel. */
export class BootstrapStore {
  readonly store = createStore<BootstrapState>(() => ({
    phase: 'idle',
    total: 0,
    done: [],
    failed: [],
  }));

  start(names: readonly string[]): void {
    this.store.setState({ phase: 'loading', total: names.length, done: [], failed: [] });
  }
  markDone(name: string): void {
    this.store.setState((s) => ({ done: [...s.done, name] }));
  }
  markFailed(name: string): void {
    this.store.setState((s) => ({ failed: [...s.failed, name] }));
  }
  /** Total failure (nothing loaded) → error; otherwise ready, even if some
   * individual loads failed (their tiles show their own error/empty states). */
  finish(): void {
    this.store.setState((s) => ({ phase: s.total > 0 && s.done.length === 0 ? 'error' : 'ready' }));
  }
}
```

- [ ] **Step 4: Write the service.** Create `packages/presentation/src/services/bootstrap-service.ts`:

```ts
import type { BootstrapStore } from '../stores/bootstrap-store';

export interface BootstrapTask {
  readonly name: string;
  run(): Promise<void>;
  /** Whether the task's ViewModel ended in an error state after run(). */
  hasError(): boolean;
}

/** Drives the renderer's startup sequence. All tasks run in parallel via
 * Promise.allSettled, so one slow or failing load never blocks the others;
 * each task's ViewModel keeps its own independent async state. */
export class BootstrapService {
  constructor(
    private readonly store: BootstrapStore,
    private readonly tasks: readonly BootstrapTask[],
  ) {}

  async run(): Promise<void> {
    this.store.start(this.tasks.map((t) => t.name));
    await Promise.allSettled(this.tasks.map((t) => t.run()));
    for (const task of this.tasks) {
      if (task.hasError()) this.store.markFailed(task.name);
      else this.store.markDone(task.name);
    }
    this.store.finish();
  }
}
```

- [ ] **Step 5: Export from the index.** In `packages/presentation/src/index.ts`, add:
```ts
export * from './stores/bootstrap-store';
export * from './services/bootstrap-service';
```

- [ ] **Step 6: Run to verify it passes.** Run: `pnpm vitest run packages/presentation/src/services/bootstrap-service.test.ts`
  Expected: PASS (4 tests).

- [ ] **Step 7: Commit.**

```bash
git add packages/presentation/src/stores/bootstrap-store.ts packages/presentation/src/services/bootstrap-service.ts packages/presentation/src/services/bootstrap-service.test.ts packages/presentation/src/index.ts
git commit -m "feat(presentation): BootstrapStore + BootstrapService"
```

---

### Task 20: Wire bootstrap + academic-year + reporting into the presentation factory

**Files:**
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`
- Modify: `packages/presentation/src/factories/create-presentation-layer.test.ts`

**Interfaces:**
- Consumes: `DashboardViewModel` (reporting deps, Task 17), `AcademicYearViewModel` (Task 18), `BootstrapStore`/`BootstrapService` (Task 19).
- Produces: `PresentationViewModels.academicYear: AcademicYearViewModel`; `PresentationStores.bootstrap: BootstrapStore`; `PresentationLayer.bootstrap: BootstrapService`; the dashboard ViewModel now wired with `app.reporting`. This is the task where the whole presentation package type-checks again.

- [ ] **Step 1: Add the failing factory assertion.** In `packages/presentation/src/factories/create-presentation-layer.test.ts`, add a test inside the `describe`:

```ts
  it('exposes the bootstrap service and academic-year ViewModel and reaches ready', async () => {
    const { app } = createTestApplication();
    const presentation = createPresentationLayer(app);
    expect(presentation.viewModels.academicYear).toBeDefined();
    expect(presentation.bootstrap).toBeDefined();
    await presentation.bootstrap.run();
    expect(presentation.stores.bootstrap.store.getState().phase).toBe('ready');
  });
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run packages/presentation/src/factories/create-presentation-layer.test.ts`
  Expected: FAIL — `presentation.bootstrap` / `viewModels.academicYear` do not exist.

- [ ] **Step 3: Update the factory.** In `packages/presentation/src/factories/create-presentation-layer.ts`:

Add imports:
```ts
import { AcademicYearViewModel } from '../view-models/academic-year/academic-year-view-model';
import { BootstrapStore } from '../stores/bootstrap-store';
import { BootstrapService } from '../services/bootstrap-service';
```
Add to `PresentationStores`:
```ts
  readonly bootstrap: BootstrapStore;
```
Add to `PresentationViewModels`:
```ts
  readonly academicYear: AcademicYearViewModel;
```
Add to `PresentationLayer`:
```ts
  readonly bootstrap: BootstrapService;
```
In the function body, create the bootstrap store next to the others:
```ts
  const bootstrap = new BootstrapStore();
```
Change the `dashboard` ViewModel construction from `{ students: app.students, notifications }` to:
```ts
    dashboard: new DashboardViewModel({ reporting: app.reporting, notifications }),
```
Add the academic-year ViewModel to the `viewModels` object:
```ts
    academicYear: new AcademicYearViewModel({ academics: app.academics }),
```
After `viewModels` is built, create the bootstrap service:
```ts
  const bootstrapService = new BootstrapService(bootstrap, [
    {
      name: 'device',
      run: () => viewModels.device.loadDeviceInfo(),
      hasError: () => viewModels.device.store.getState().device.status === 'error',
    },
    {
      name: 'user',
      run: () => viewModels.currentUser.loadCurrentUser(),
      hasError: () => viewModels.currentUser.store.getState().user.status === 'error',
    },
    {
      name: 'school',
      run: () => viewModels.settings.loadCurrentSchool(),
      hasError: () => viewModels.settings.store.getState().profile.status === 'error',
    },
    {
      name: 'academic-year',
      run: () => viewModels.academicYear.loadCurrent(),
      hasError: () => viewModels.academicYear.store.getState().current.status === 'error',
    },
    {
      name: 'dashboard',
      run: () => viewModels.dashboard.loadOverview(),
      hasError: () => viewModels.dashboard.store.getState().summary.status === 'error',
    },
  ]);
```
Change the return to include the store and service:
```ts
  return {
    stores: { notifications, connectivity, session, dialogs, navigation, bootstrap },
    viewModels,
    bootstrap: bootstrapService,
  };
```

- [ ] **Step 4: Run the factory test + the full presentation package.** Run: `pnpm vitest run packages/presentation && pnpm --filter @nemis-desktop/presentation typecheck`
  Expected: PASS (every presentation test, including the graduated dashboard + new VMs) and clean typecheck.

- [ ] **Step 5: Commit.**

```bash
git add packages/presentation/src/factories
git commit -m "feat(presentation): wire bootstrap, academic-year, and reporting into the factory"
```

---

### Task 21: Renderer IPC bridge + ApplicationLayer facade

**Files:**
- Create: `apps/desktop/renderer/services/nemis-bridge.ts`
- Create: `apps/desktop/renderer/lib/presentation/create-ipc-application-layer.ts`
- Modify: `apps/desktop/renderer/lib/presentation/create-renderer-presentation.ts`
- Test: `apps/desktop/renderer/lib/presentation/create-ipc-application-layer.test.ts`

**Interfaces:**
- Consumes: `window.nemis` (Task 15 preload), wire-result types (Task 14), `ApplicationLayer` type (allowed in `lib/presentation/`), presentation error classes.
- Produces: `nemisBridge` (the only new `window.nemis` caller; lives in `services/` per the ESLint boundary); `createIpcApplicationLayer(): ApplicationLayer` — a structural facade where the five wired queries call the bridge and every other method throws `NotImplementedPresentationError`; transport/DB failures translate to `NetworkUnavailableError`/`DatabaseUnavailableError`. `createRendererPresentation()` now builds the real IPC-backed layer (no fakes, no seeding).

- [ ] **Step 1: Write the failing facade test.** Create `apps/desktop/renderer/lib/presentation/create-ipc-application-layer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseUnavailableError } from '@nemis-desktop/presentation';
import { createIpcApplicationLayer } from './create-ipc-application-layer';

function fakeNemis(overrides: Record<string, unknown> = {}) {
  return {
    system: { getVersion: vi.fn(async () => '1.0.0') },
    settings: { get: vi.fn(async () => null) },
    dashboard: {
      getOverview: vi.fn(async () => ({ totalStudents: 5, totalClasses: 2, attendanceToday: { present: 1, total: 5 } })),
    },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    identity: { getCurrentUser: vi.fn(async () => ({ id: 'u1', fullName: 'Local Admin', email: 'a@b', isActive: true, roles: [] })) },
    device: { getInfo: vi.fn(async () => null) },
    ...overrides,
  };
}

describe('createIpcApplicationLayer', () => {
  beforeEach(() => {
    (window as unknown as { nemis: unknown }).nemis = fakeNemis();
  });
  afterEach(() => {
    delete (window as unknown as { nemis?: unknown }).nemis;
  });

  it('reporting.getDashboardOverview returns the bridged data as an ApplicationResponse', async () => {
    const app = createIpcApplicationLayer();
    const res = await app.reporting.getDashboardOverview();
    expect(res.data.totalStudents).toBe(5);
  });

  it('identity.getCurrentUser maps null through to a null-data response', async () => {
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      identity: { getCurrentUser: vi.fn(async () => null) },
    });
    const app = createIpcApplicationLayer();
    expect((await app.identity.getCurrentUser()).data).toBeNull();
  });

  it('translates a DATABASE_UNAVAILABLE IPC error into DatabaseUnavailableError', async () => {
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      dashboard: {
        getOverview: vi.fn(async () => {
          throw new Error('[DATABASE_UNAVAILABLE] The local database is currently unavailable.');
        }),
      },
    });
    const app = createIpcApplicationLayer();
    await expect(app.reporting.getDashboardOverview()).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });

  it('an unwired method throws NotImplementedPresentationError', async () => {
    const app = createIpcApplicationLayer();
    await expect(
      (app.students as unknown as { list: () => Promise<unknown> }).list(),
    ).rejects.toThrow(/not available yet/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run apps/desktop/renderer/lib/presentation/create-ipc-application-layer.test.ts`
  Expected: FAIL — modules do not exist.

- [ ] **Step 3: Write the bridge.** Create `apps/desktop/renderer/services/nemis-bridge.ts`:

```ts
import type {
  AcademicYearResult,
  CurrentUserResult,
  DashboardOverviewResult,
  DeviceInfoResult,
  SchoolSummaryResult,
} from '@nemis-desktop/types';

function api() {
  if (typeof window === 'undefined' || !window.nemis) {
    throw new Error('Desktop bridge unavailable (running outside Electron).');
  }
  return window.nemis;
}

/** The single renderer-side caller of the dashboard/bootstrap IPC channels.
 * Lives in services/ (the only place allowed to touch window.nemis). Returns
 * raw wire results; error translation happens in the ApplicationLayer facade. */
export const nemisBridge = {
  getDashboardOverview: (): Promise<DashboardOverviewResult> => api().dashboard.getOverview(),
  getSchoolSummary: (): Promise<SchoolSummaryResult | null> => api().school.getSummary(),
  getCurrentAcademicYear: (): Promise<AcademicYearResult | null> => api().academicYear.getCurrent(),
  getCurrentUser: (): Promise<CurrentUserResult | null> => api().identity.getCurrentUser(),
  getDeviceInfo: (): Promise<DeviceInfoResult | null> => api().device.getInfo(),
};
```

- [ ] **Step 4: Write the facade.** Create `apps/desktop/renderer/lib/presentation/create-ipc-application-layer.ts`:

```ts
import type { ApplicationLayer, ApplicationResponse } from '@nemis-desktop/application';
import {
  DatabaseUnavailableError,
  NetworkUnavailableError,
  NotImplementedPresentationError,
} from '@nemis-desktop/presentation';
import { nemisBridge } from '@/services/nemis-bridge';

/** Parses the `[CODE] message` prefix the preload bridge throws on IpcResult
 * failure. Returns null when the error is not in that shape (e.g. the bridge
 * itself was unavailable, or a non-IPC throw). */
function ipcCodeOf(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const match = /^\[([A-Z_]+)\]/.exec(error.message);
  return match ? match[1]! : null;
}

/** Runs a bridge call and translates transport/DB failures into presentation
 * errors the ViewModels understand. Other coded errors flow through unchanged
 * (toPresentationError degrades them to LoadingError for queries). */
async function callBridge<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const code = ipcCodeOf(error);
    if (code === 'DATABASE_UNAVAILABLE' || code === 'MIGRATION_REQUIRED') {
      throw new DatabaseUnavailableError(
        'The local database is unavailable. Please restart the application.',
        { cause: error },
      );
    }
    if (code === null) {
      throw new NetworkUnavailableError(
        'Lost connection to the local service. Please restart the application.',
        { cause: error },
      );
    }
    throw error;
  }
}

function query<T>(fn: () => Promise<T>): Promise<ApplicationResponse<T>> {
  return callBridge(fn).then((data) => ({ data }));
}

/** Every method not wired to a channel this phase. ComingSoon screens
 * construct their ViewModels with these groups but never invoke them. */
function group<T extends object>(name: string, methods: Partial<T>): T {
  return new Proxy(methods as T, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];
      if (value !== undefined) return value;
      return () => {
        throw new NotImplementedPresentationError(`${name}.${String(prop)}`);
      };
    },
  });
}

/** THE Phase-8 SEAM (now live): an ApplicationLayer-shaped facade over the IPC
 * bridge. Only the five dashboard/bootstrap queries are wired; the rest throw
 * NotImplementedPresentationError until their feature phase. */
export function createIpcApplicationLayer(): ApplicationLayer {
  const facade = {
    reporting: group('reporting', {
      getDashboardOverview: () => query(() => nemisBridge.getDashboardOverview()),
    }),
    institution: group('institution', {
      getCurrentSchool: () => query(() => nemisBridge.getSchoolSummary()),
    }),
    identity: group('identity', {
      getCurrentUser: () => query(() => nemisBridge.getCurrentUser()),
    }),
    academics: group('academics', {
      getCurrentAcademicYear: () => query(() => nemisBridge.getCurrentAcademicYear()),
    }),
    infra: group('infra', {
      getDeviceInfo: () => query(() => nemisBridge.getDeviceInfo()),
    }),
    students: group('students', {}),
    attendance: group('attendance', {}),
    assessments: group('assessments', {}),
  };
  return facade as unknown as ApplicationLayer;
}
```

- [ ] **Step 5: Swap the composition root.** Overwrite `apps/desktop/renderer/lib/presentation/create-renderer-presentation.ts`:

```ts
import { createPresentationLayer, type PresentationLayer } from '@nemis-desktop/presentation';
import { createIpcApplicationLayer } from './create-ipc-application-layer';

/** THE Phase-8 SEAM (now live): the renderer's presentation layer is built over
 * an ApplicationLayer-shaped IPC facade to the main process — no in-memory
 * fakes, no seeded demo data. Every screen reads real local SQLite data. */
export function createRendererPresentation(): PresentationLayer {
  return createPresentationLayer(createIpcApplicationLayer());
}
```

- [ ] **Step 6: Run the facade test to verify it passes.** Run: `pnpm vitest run apps/desktop/renderer/lib/presentation/create-ipc-application-layer.test.ts`
  Expected: PASS (4 tests).

- [ ] **Step 7: Commit.**

```bash
git add apps/desktop/renderer/services/nemis-bridge.ts apps/desktop/renderer/lib/presentation/create-ipc-application-layer.ts apps/desktop/renderer/lib/presentation/create-ipc-application-layer.test.ts apps/desktop/renderer/lib/presentation/create-renderer-presentation.ts
git commit -m "feat(renderer): IPC-backed ApplicationLayer facade replaces the fake application"
```

---

### Task 22: Dashboard UI — bootstrap providers, real tiles, honest empty states

**Files:**
- Modify: `apps/desktop/renderer/app/providers.tsx`
- Modify: `apps/desktop/renderer/lib/presentation/hooks.ts`
- Modify: `apps/desktop/renderer/app/government/school-admin/layout.tsx`
- Modify: `apps/desktop/renderer/app/government/school-admin/page.tsx`
- Modify: `apps/desktop/renderer/components/dashboard/StatCard.tsx`
- Create: `apps/desktop/renderer/components/dashboard/InfoTile.tsx`
- Create: `apps/desktop/renderer/components/dashboard/DatabaseUnavailablePanel.tsx`
- Delete: `apps/desktop/renderer/lib/presentation/seed-demo-data.ts`
- Test: `apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `PresentationLayer.bootstrap` + `stores.bootstrap` (Task 20), graduated `DashboardSummaryView` (Task 17), `AcademicYearViewModel`/`SettingsViewModel`/`CurrentUserViewModel` state, `DatabaseUnavailableError.kind` (Task 16).
- Produces: `RootProviders` runs the BootstrapService (no async construction, store-observed splash); `useAcademicYearViewModel`/`useBootstrapStore` hooks; a layout with no demo ids; a Dashboard page rendering real counts + `InfoTile` empty states + `DatabaseUnavailablePanel`; `StatCard` with no `sample`/placeholder badge.

- [ ] **Step 1: Rewrite the dashboard render test.** Overwrite `apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DashboardPage from './page';

beforeEach(() => {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, attendanceToday: { present: 0, total: 0 } })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    identity: { getCurrentUser: vi.fn(async () => null) },
    device: { getInfo: vi.fn(async () => null) },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('School Admin dashboard (fresh install)', () => {
  it('shows real zero counts and honest empty states, never sample numbers', async () => {
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <DashboardPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Total Students')).toBeInTheDocument());
    expect(screen.getByText('School profile not set up yet')).toBeInTheDocument();
    expect(screen.getByText('No academic year configured')).toBeInTheDocument();
    expect(screen.getByText(/staff records not tracked yet/i)).toBeInTheDocument();
    // No fabricated "sample" placeholder tiles anywhere.
    expect(screen.queryByText(/sample/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm vitest run apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`
  Expected: FAIL — page still renders placeholder tiles / imports removed modules.

- [ ] **Step 3: Add the hooks.** In `apps/desktop/renderer/lib/presentation/hooks.ts`, add:
```ts
export const useAcademicYearViewModel = () => usePresentation().viewModels.academicYear;
export const useBootstrapStore = () => usePresentation().stores.bootstrap;
```

- [ ] **Step 4: Update `RootProviders`.** Overwrite `apps/desktop/renderer/app/providers.tsx`:

```tsx
'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Spinner } from '@nemis-desktop/ui';
import { PresentationProvider } from '../lib/presentation/presentation-provider';
import { createRendererPresentation } from '../lib/presentation/create-renderer-presentation';

export function RootProviders({ children }: { children: ReactNode }) {
  const layer = useMemo(() => createRendererPresentation(), []);
  const phase = useStore(layer.stores.bootstrap.store, (s) => s.phase);

  useEffect(() => {
    void layer.bootstrap.run();
  }, [layer]);

  if (phase === 'idle' || phase === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    );
  }
  return <PresentationProvider layer={layer}>{children}</PresentationProvider>;
}
```

Note: `phase` starts `idle`; `bootstrap.run()` sets it to `loading` then `ready`/`error`. Both `ready` and `error` render the app (individual screens render their own error/empty tiles, including the database-unavailable panel).

- [ ] **Step 5: Update the layout (drop demo ids).** Overwrite `apps/desktop/renderer/app/government/school-admin/layout.tsx`:

```tsx
'use client';

import { type ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { StatusBar } from '@/components/shell/StatusBar';
import { RouteGuard } from '@/components/shell/RouteGuard';
import { ToastHost } from '@/components/shell/ToastHost';
import { useSettingsViewModel } from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';

export default function SchoolAdminLayout({ children }: { children: ReactNode }) {
  // The school profile is loaded once by the BootstrapService; here we only read it.
  const settings = useSettingsViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);
  const institutionName = profile.status === 'success' ? profile.data.name : 'NEMIS School';

  return (
    <RouteGuard>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white">Skip to content</a>
        <Sidebar institutionName={institutionName} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main id="main-content" className="flex-1 overflow-y-auto">{children}</main>
          <StatusBar />
        </div>
      </div>
      <ToastHost />
    </RouteGuard>
  );
}
```

- [ ] **Step 6: Add the new tile components.**

Overwrite `apps/desktop/renderer/components/dashboard/StatCard.tsx`:
```tsx
import type { LucideIcon } from 'lucide-react';
import { Card } from '@nemis-desktop/ui';
import type { DashboardStatView } from '@nemis-desktop/presentation';

export function StatCard({ stat, icon: Icon }: { stat: DashboardStatView; icon: LucideIcon }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{stat.label}</p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-4xl font-bold text-slate-900">{stat.value}</p>
        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
          <Icon className="w-6 h-6 text-slate-600" />
        </div>
      </div>
    </Card>
  );
}
```

Create `apps/desktop/renderer/components/dashboard/InfoTile.tsx`:
```tsx
import { Card } from '@nemis-desktop/ui';

/** A single labelled fact. When `value` is null/empty it renders `emptyText`
 * in a muted style — never a fabricated number. */
export function InfoTile({
  label,
  value,
  emptyText,
}: {
  label: string;
  value: string | number | null;
  emptyText: string;
}) {
  const isEmpty = value === null || value === '';
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      {isEmpty ? (
        <p className="mt-2 text-sm italic text-slate-500">{emptyText}</p>
      ) : (
        <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      )}
    </Card>
  );
}
```

Create `apps/desktop/renderer/components/dashboard/DatabaseUnavailablePanel.tsx`:
```tsx
import { Card } from '@nemis-desktop/ui';
import { DatabaseZap } from 'lucide-react';

export function DatabaseUnavailablePanel({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <div role="alert" className="flex flex-col items-center py-8 text-center">
        <DatabaseZap className="mb-3 h-10 w-10 text-error" />
        <h3 className="mb-1 text-base font-semibold text-neutral-dark">Local database unavailable</h3>
        <p className="mb-4 max-w-md text-sm text-gray-600">
          We couldn&apos;t read the local database. Restart the application; if the problem
          persists, contact support.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 7: Rewrite the dashboard page.** Overwrite `apps/desktop/renderer/app/government/school-admin/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import {
  Users, UserCog2, Layers3, UserPlus, CalendarCheck, BookOpen, GraduationCap, Bell, Settings, Calendar,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@nemis-desktop/ui';
import {
  useDashboardViewModel, useCurrentUserViewModel, useSettingsViewModel, useAcademicYearViewModel,
} from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';
import { StatCard } from '@/components/dashboard/StatCard';
import { InfoTile } from '@/components/dashboard/InfoTile';
import { DatabaseUnavailablePanel } from '@/components/dashboard/DatabaseUnavailablePanel';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import QuickActionCard from '@/components/dashboard/QuickActionCard';
import RecentActivityFeed from '@/components/dashboard/RecentActivityFeed';
import TeachersListSection from '@/components/dashboard/TeachersListSection';

const STAT_ICONS: Record<string, typeof Users> = {
  'total-students': Users,
  'total-classes': Layers3,
};

export default function DashboardPage() {
  const dashboard = useDashboardViewModel();
  const currentUser = useCurrentUserViewModel();
  const settings = useSettingsViewModel();
  const academicYear = useAcademicYearViewModel();

  const summary = useViewModel(dashboard.store, (s) => s.summary);
  const user = useViewModel(currentUser.store, (s) => s.user);
  const profile = useViewModel(settings.store, (s) => s.profile);
  const year = useViewModel(academicYear.store, (s) => s.current);

  // Bootstrap loads this on startup; only self-load if the store is still idle
  // (e.g. navigated here before bootstrap ran).
  useEffect(() => {
    if (summary.status === 'idle') void dashboard.loadOverview();
  }, [dashboard, summary.status]);

  const name = user.status === 'success' ? user.data.fullName : 'Principal';

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <DashboardGreeting name={name} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoTile label="School" value={profile.status === 'success' ? profile.data.name : null} emptyText="School profile not set up yet" />
          <InfoTile label="Academic Year" value={year.status === 'success' ? year.data.code : null} emptyText="No academic year configured" />
        </div>

        {summary.status === 'error' && summary.error.kind === 'database-unavailable' ? (
          <DatabaseUnavailablePanel onRetry={() => void dashboard.loadOverview()} />
        ) : summary.status === 'error' ? (
          <ErrorState message={summary.error.userMessage} onRetry={() => void dashboard.loadOverview()} />
        ) : summary.status === 'success' || summary.status === 'refreshing' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {summary.data.stats.map((stat) => (
              <StatCard key={stat.key} stat={stat} icon={STAT_ICONS[stat.key] ?? Users} />
            ))}
            <InfoTile label="Attendance Today" value={`${summary.data.attendanceToday.present} / ${summary.data.attendanceToday.total}`} emptyText="No attendance recorded" />
            <InfoTile label="Total Teachers" value={null} emptyText="Staff records not tracked yet" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-card" />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-300 rounded-card p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickActionCard title="Add Student" description="Enroll a new student" icon={UserPlus} href="/government/school-admin/students" variant="primary" />
              <QuickActionCard title="Record Attendance" description="Mark daily attendance" icon={CalendarCheck} href="/government/school-admin/attendance" variant="primary" />
              <QuickActionCard title="Manage Classes" description="View and edit classes" icon={BookOpen} href="/government/school-admin/classes" />
              <QuickActionCard title="Grade Records" description="View student grades" icon={GraduationCap} href="/government/school-admin/academic-grading" />
              <QuickActionCard title="Add Teacher" description="Register new staff" icon={UserCog2} href="/government/school-admin/teachers-staff" />
              <QuickActionCard title="Timetable" description="Manage schedules" icon={Calendar} href="/government/school-admin/timetable" />
              <QuickActionCard title="Notifications" description="Send announcements" icon={Bell} href="/government/school-admin/notifications" />
              <QuickActionCard title="Settings" description="School configuration" icon={Settings} href="/government/school-admin/settings" />
            </div>
          </div>
          <RecentActivityFeed />
        </div>

        <TeachersListSection />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Delete the dead demo-seed module.** Run: `git rm apps/desktop/renderer/lib/presentation/seed-demo-data.ts`
  (It has no importers left: the layout no longer imports `DEMO_INSTITUTION_ID`/`DEMO_USER_ID`, and `create-renderer-presentation.ts` no longer seeds.)

- [ ] **Step 9: Run the dashboard render test + the full renderer suite.** Run: `pnpm vitest run apps/desktop/renderer && pnpm --filter @nemis-desktop/app typecheck`
  Expected: PASS (dashboard test asserts real zeros + empty states; no renderer references `seed-demo-data`).

- [ ] **Step 10: Lint the renderer boundary + commit.** Run: `pnpm lint`
  Expected: PASS — no `window.nemis` access outside `services/`, no `@nemis-desktop/application`/`domain` import outside `lib/presentation/`.

```bash
git add apps/desktop/renderer/app/providers.tsx apps/desktop/renderer/lib/presentation/hooks.ts apps/desktop/renderer/app/government/school-admin/layout.tsx apps/desktop/renderer/app/government/school-admin/page.tsx apps/desktop/renderer/components/dashboard apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx
git commit -m "feat(renderer): dashboard reads real data with honest empty states + bootstrap splash"
```

---

### Task 23: Documentation + full gate + installer smoke

**Files:**
- Create: `docs/dashboard-bootstrap.md`
- Modify: `docs/data-access.md`, `docs/application-layer.md`, `docs/presentation-layer.md`, `docs/conventions.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–22.
- Produces: the Phase-8 documentation deliverables and a green full-gate + packaged installer.

- [ ] **Step 1: Write `docs/dashboard-bootstrap.md`.** Create it mirroring the structure of `docs/desktop-shell.md`, covering these sections (use real names/paths from this phase):
  - **Startup sequence** — a diagram: `Electron main: DatabaseManager.initialize() (migrate 001→002 → seed metadata → seed local user) → createDataLayer → createApplicationComposition → registerIpcHandlers → window`; then `Renderer: createRendererPresentation → createIpcApplicationLayer → createPresentationLayer → RootProviders runs BootstrapService`.
  - **BootstrapService design** — the five parallel tasks (`device`, `user`, `school`, `academic-year`, `dashboard`), `Promise.allSettled`, `BootstrapStore` phases (`idle→loading→ready|error`), partial-failure tolerance.
  - **Dashboard data flow** — the layered path (React → ViewModel → UiQuery → ApplicationLayer facade → `window.nemis` → IPC handler → real ApplicationLayer → SQLite adapter → SQLite).
  - **Queries implemented** — table of the five no-arg queries, their services, channels, and repository methods.
  - **State transitions** — `AsyncState` (`idle/loading/refreshing/success/empty/error`) plus the `database-unavailable` error kind and how the UI branches.
  - **Empty-state strategy** — school/academic-year/attendance/teachers copy; why a fresh install is legitimately empty; no fabricated numbers.
  - **Error-handling strategy** — the failure table (migration failure → native dialog/quit; DB error after startup → `DATABASE_UNAVAILABLE` → panel; transport failure → `NetworkUnavailableError`; single sub-query failure isolated to its own tile; unexpected exception → masked `UNEXPECTED_ERROR`).
  - **Performance** — `Promise.allSettled`, `COUNT(*)` instead of `list({limit:1000})`, prepared statements, indexes.
  - **Remaining technical debt** — 7 stubbed business repos; `IAttendanceRepository`/`Attendance` domain has no `reconstitute` (lossy rebuild); academic-year port has one consumer; Recent Activity still static.
  - **Phase-9 readiness** — CRUD/import can now write through the same adapters; sync worker writes to the same tables.

- [ ] **Step 2: Update the layer docs.**
  - `docs/data-access.md`: add migration 002 (business tables + indexes), the six SQLite business adapters, `guarded` helper, `createDataLayer` now exposing business repos + `transactions`, and the local-user seed.
  - `docs/application-layer.md`: the three replaced stubs going live + the new read ports/queries/`ReportingApplicationService`, and the `ApplicationLayer.reporting` addition.
  - `docs/presentation-layer.md`: graduated `DashboardViewModel` (no placeholder tiles), `AcademicYearViewModel`, no-arg `loadCurrent*` methods, `DatabaseUnavailableError`, `BootstrapStore`/`BootstrapService`.
  - `docs/conventions.md`: append a short "Adding a no-arg current-X read query" recipe following this phase's pattern (port `findFirst`/`findCurrent` → use case → service method → IPC channel → NemisApi → bridge → facade → UiQuery → ViewModel).

- [ ] **Step 3: Run the full verification gate.** Run: `pnpm rebuild:node && pnpm typecheck && pnpm lint && pnpm test`
  Expected: PASS across every workspace package (types, application, presentation, ui, app) and both Vitest projects.

- [ ] **Step 4: Verify the production build + installer.** Run: `pnpm --filter @nemis-desktop/app build:renderer && pnpm rebuild:electron && pnpm make`
  Expected: `next build` static export succeeds and Electron Forge produces the Windows installer without error. (After this, run `pnpm rebuild:node` again before any further node tests.)

- [ ] **Step 5: Manual smoke (documented, not automated).** Launch the packaged app (or `pnpm start`) once: confirm the dashboard renders with `Total Students 0`, `Total Classes 0`, `Attendance Today 0 / 0`, and the empty-state copy for School / Academic Year / Teachers — with no spinner hang and no fabricated numbers. Record the result in the PR description.

- [ ] **Step 6: Commit.**

```bash
git add docs/dashboard-bootstrap.md docs/data-access.md docs/application-layer.md docs/presentation-layer.md docs/conventions.md
git commit -m "docs: Phase 8 dashboard bootstrap + data flow"
```

---

## Self-Review Notes (for the executor)

- **Deferred typechecks are intentional.** Tasks 17 and 18 change/extend the presentation package in ways that leave `create-presentation-layer.ts` temporarily inconsistent; the package typecheck is only expected to pass again at the end of Task 20. Run per-file Vitest at those boundaries (as each task states), not the package typecheck.
- **Structural DTO/wire-type alignment.** The `packages/types` result interfaces (Task 14) are intentionally byte-for-byte structural matches of the application output DTOs (Task 4/existing). If you change one, change both, or the handler return types (Task 15) and the facade (Task 21) stop compiling.
- **The five new IPC channels are all no-arg** (`assertNoArgs`); single-install, pre-auth semantics mean "current X" needs no id. Do not add id parameters.
- **`Attendance` domain limitation is known and accepted** (Task 11): no `reconstitute`, no subjectId/recordedBy getters. Only `countByDate` is on the dashboard path and it is exact SQL. Do not add domain methods to "fix" `findByClassAndDate` this phase.
- **Do not un-stub the remaining business ports** (`guardians`, `enrollments`, `assessments`, `grades`, `gradingConfigs`) in `createApplicationComposition`, and do not wire any create/update IPC channel or UI — that is out of scope (no CRUD).
