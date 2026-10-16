# County Schools List + Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port portal-web's County Schools list and School detail pages to the desktop app, read offline from synced SQLite, with Cloudinary photos allowed by the CSP.

**Architecture:** The Nemis snapshot's institution rows gain one `details` object; desktop migration 033 stores it in `institutions.details`. A read-model port + two use cases + two ViewModels serve the pages over two COUNTY_ADMIN-only IPC reads. Pages are copied from portal-web with only data-source, route and photo-fallback edits. The production CSP allows `https://res.cloudinary.com` images.

**Tech Stack:** NestJS + Prisma + Jest (Nemis); Electron 42.7.0, better-sqlite3, TypeScript, Vitest, Next 15 static export, React 19, Zustand vanilla (desktop).

**Spec:** `docs/superpowers/specs/2026-10-16-county-schools-design.md` (read it with this plan)

## Global Constraints

- Repos: `C:\Users\Alvin Dogba Jr\Desktop\Walamen\Nemis` (Task 1) and `C:\Users\Alvin Dogba Jr\Desktop\Walamen\desktop-client-nemis` (Tasks 2–9). Branch `feat/county-schools` from `main` in each (desktop branch exists).
- Stage files by explicit path; never `git add -A`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- SQLite-touching desktop tests: from the desktop repo root, `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>`. Pure TS/React tests may use `pnpm exec vitest run <paths>`.
- Known pre-existing desktop failures: `apps/desktop/renderer/app/page.test.tsx`, `apps/desktop/renderer/app/government/teacher/timetable/timetable.test.tsx`.
- `noUncheckedIndexedAccess` is on. ESLint: unused vars are errors (no `_x` escape for destructuring); `react-hooks/exhaustive-deps` warnings must be fixed.
- Write multi-file new code with the Write tool, one file per call (batched bash heredocs failed to parse last time).
- Parity: copy portal-web markup/behaviour verbatim; only spec §3 differences.
- Renderer components may import `@nemis-desktop/presentation`, `@nemis-desktop/ui`, `@nemis-desktop/types`, renderer-local modules and `services/nemis-bridge/*`.

## Review Focus

- **Older server or not-yet-resynced device (`details` NULL)** → detail page renders with "—" values, no Facilities card, fallback photo; no crash. → Task 8 test "renders a school whose details have not synced".
- **Photo URL that fails to load (offline)** → fallback image, never a broken image. → Task 7 test "swaps to the fallback image when the photo fails".
- **Corrupt `details` / `profile` JSON in one row** → that school shows "—"; the list and detail still render. → Task 4 test "treats corrupt JSON as missing".
- **Opening school B right after school A** → never shows A's data under B's id. → Task 8 test "does not show the previously opened school".
- **More than 10 schools / filters that match none** → pagination and "No schools found matching your criteria." → Task 7 tests.

---

### Task 1: Server — `details` on every snapshot institution row (Nemis)

**Files:**
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` (institutions mapping)
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`

**Interfaces:**
- Produces: `data.institutions[*].details: { establishedYear, registrationDate (ISO|null), accessMode, isBoarding, isUrban, numBuildings, numClassrooms, numBathrooms, waecCode, principalName, photoUrl, hasLibrary, hasComputerLab, hasSportsField, hasKitchen, hasCafeteria, hasElectricity, hasSafeWater, hasWaterAccess, hasTextbooks, hasWash, hasPTA, hasAuditorium, hasClinic }`.

- [ ] **Step 1: Branch** — `cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && git switch main && git switch -c feat/county-schools`

- [ ] **Step 2: Failing test** — in the existing `"ships a county device its county row, …"` test, add to `institutionRow` (after `officialSchoolCode: null,`):

```ts
      establishedYear: 1998,
      registrationDate: new Date("2010-02-03T00:00:00.000Z"),
      accessMode: "ROAD",
      isBoarding: false,
      isUrban: true,
      numBuildings: 3,
      numClassrooms: 12,
      numBathrooms: 4,
      waecCode: "W-1",
      principalName: null,
      photoUrl: "https://res.cloudinary.com/demo/image/upload/school.jpg",
      hasLibrary: true,
      hasComputerLab: false,
      hasSportsField: true,
      hasKitchen: false,
      hasCafeteria: false,
      hasElectricity: true,
      hasSafeWater: true,
      hasWaterAccess: true,
      hasTextbooks: false,
      hasWash: true,
      hasPTA: true,
      hasAuditorium: false,
      hasClinic: false,
      hasMoeSupport: true,
```

and after the existing `expect(snapshot.data.institutions[0]).toMatchObject({ contactPhone: … })`:

```ts
    // Exactly the fields the County School detail page reads — field by field,
    // so a Prisma column like hasMoeSupport never rides along unreviewed.
    expect((snapshot.data.institutions[0] as { details: unknown }).details).toEqual({
      establishedYear: 1998,
      registrationDate: "2010-02-03T00:00:00.000Z",
      accessMode: "ROAD",
      isBoarding: false,
      isUrban: true,
      numBuildings: 3,
      numClassrooms: 12,
      numBathrooms: 4,
      waecCode: "W-1",
      principalName: null,
      photoUrl: "https://res.cloudinary.com/demo/image/upload/school.jpg",
      hasLibrary: true,
      hasComputerLab: false,
      hasSportsField: true,
      hasKitchen: false,
      hasCafeteria: false,
      hasElectricity: true,
      hasSafeWater: true,
      hasWaterAccess: true,
      hasTextbooks: false,
      hasWash: true,
      hasPTA: true,
      hasAuditorium: false,
      hasClinic: false,
    });
```

- [ ] **Step 3: Run** `cd apps/Server && npx jest src/desktop-provisioning/desktop-provisioning.service.spec.ts` → FAIL (`details` undefined).

- [ ] **Step 4: Implement** — in the `institutions:` mapping add after `officialSchoolCode: row.officialSchoolCode,`:

```ts
            // County School detail page fields, field by field.
            details: {
              establishedYear: row.establishedYear,
              registrationDate: row.registrationDate?.toISOString() ?? null,
              accessMode: row.accessMode,
              isBoarding: row.isBoarding,
              isUrban: row.isUrban,
              numBuildings: row.numBuildings,
              numClassrooms: row.numClassrooms,
              numBathrooms: row.numBathrooms,
              waecCode: row.waecCode,
              principalName: row.principalName,
              photoUrl: row.photoUrl,
              hasLibrary: row.hasLibrary,
              hasComputerLab: row.hasComputerLab,
              hasSportsField: row.hasSportsField,
              hasKitchen: row.hasKitchen,
              hasCafeteria: row.hasCafeteria,
              hasElectricity: row.hasElectricity,
              hasSafeWater: row.hasSafeWater,
              hasWaterAccess: row.hasWaterAccess,
              hasTextbooks: row.hasTextbooks,
              hasWash: row.hasWash,
              hasPTA: row.hasPTA,
              hasAuditorium: row.hasAuditorium,
              hasClinic: row.hasClinic,
            },
```

- [ ] **Step 5: Verify** — `npx jest src/desktop-provisioning src/institutions` → PASS (if a fixture's `registrationDate` is a non-Date, fix the fixture); `pnpm typecheck` → 0; `pnpm lint` → 0 errors.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && git add apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts && git commit -m "feat(desktop-provisioning): ship school detail fields as one details object

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Desktop — migration 033, importer, CSP

**Files:**
- Create: `apps/desktop/electron/database/migrations/033-add-institution-details.ts` (+ `.test.ts`); Modify: `registry.ts`
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts` (`SPECS.institutions`) + test
- Modify: `apps/desktop/electron/security/csp.ts`; Create: `apps/desktop/electron/security/csp.test.ts`
- Modify: `apps/desktop/electron/database/schema/tableNames.ts` (`institutionAdmin`)

- [ ] **Step 1: Failing tests**

`033-add-institution-details.test.ts`:

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string; notnull: number };

describe('migration 033 add-institution-details', () => {
  it('adds a nullable JSON details column and keeps existing schools', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of migrations.filter((m) => m.version <= 32)) migration.up(db);
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
       VALUES ('s-1','S1','School','SCHOOL','PUBLIC','county-1','APPROVED',1,'2026-01-01T00:00:00.000Z')`,
    ).run();
    migrations.find((m) => m.version === 33)!.up(db);
    const column = (db.pragma('table_info(institutions)') as ColumnInfo[]).find((c) => c.name === 'details');
    expect(column).toMatchObject({ notnull: 0 });
    expect(db.prepare(`SELECT name, details FROM institutions`).get()).toEqual({ name: 'School', details: null });
  });
});
```

`ProvisioningImporter.test.ts` (add after the districts-columns test):

```ts
  it('stores the school details object as JSON, and NULL when the server sends none', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(
      snapshotOf({
        ...BASE_DATA,
        institutions: [{ ...BASE_DATA.institutions![0]!, details: { establishedYear: 1998, hasLibrary: true } }],
      }),
      CONTEXT,
    );
    const row = manager.connection.prepare(`SELECT details FROM institutions`).get() as { details: string };
    expect(JSON.parse(row.details)).toEqual({ establishedYear: 1998, hasLibrary: true });

    importer.import(snapshotOf({ ...BASE_DATA }), CONTEXT);
    expect(manager.connection.prepare(`SELECT details FROM institutions`).get()).toEqual({ details: null });
  });
```

`electron/security/csp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PRODUCTION_CSP } from './csp';

function directives(): Record<string, string[]> {
  return Object.fromEntries(
    PRODUCTION_CSP.split('; ').map((directive) => {
      const [name = '', ...values] = directive.split(' ');
      return [name, values];
    }),
  );
}

describe('PRODUCTION_CSP', () => {
  it('allows Cloudinary images and nothing else remote', () => {
    const csp = directives();
    expect(csp['img-src']).toEqual(["'self'", 'data:', 'https://res.cloudinary.com']);
    for (const [name, values] of Object.entries(csp)) {
      if (name === 'img-src') continue;
      expect(values.some((value) => value.startsWith('http'))).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run** (Electron runner) the three files → FAIL.

- [ ] **Step 3: Implement**

`033-add-institution-details.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County School detail page (docs/superpowers/specs/2026-10-16-county-schools-design.md):
 * the server's `details` object (establishment, access, building counts,
 * facility flags, photo) as one JSON column — nothing filters on it.
 * Institutions has no outbox triggers. */
export const addInstitutionDetails: Migration = {
  version: 33,
  name: 'add-institution-details',
  up(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE institutions ADD COLUMN details TEXT;`);
  },
};
```

Register after `addCountyDistrictsColumns` (import + array entry). `SPECS.institutions`: append `'details'` after `'officialSchoolCode'` (keep the `{ isActive: 1 }` defaults). `csp.ts`: `"img-src 'self' data: https://res.cloudinary.com",`. `tableNames.ts`: add `institutionAdmin: 'institution_admin',` after `staff`.

- [ ] **Step 4: Verify** — Electron runner on `apps/desktop/electron/database apps/desktop/electron/provisioning apps/desktop/electron/security` → PASS; `pnpm typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/database/migrations/033-add-institution-details.ts apps/desktop/electron/database/migrations/033-add-institution-details.test.ts apps/desktop/electron/database/migrations/registry.ts apps/desktop/electron/database/schema/tableNames.ts apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/provisioning/ProvisioningImporter.test.ts apps/desktop/electron/security/csp.ts apps/desktop/electron/security/csp.test.ts && git commit -m "feat(sync): store school details; allow Cloudinary images in the CSP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Application — types, `ICountySchoolsReadModel`, use cases, service

**Files:**
- Create: `packages/types/src/county-schools.ts`; Modify: `packages/types/src/index.ts`
- Create: `packages/application/src/interfaces/county/county-schools-read-model.ts`; Modify: `interfaces/county/index.ts`
- Create: `packages/application/src/dto/county/county-schools-dto.ts`
- Create: `packages/application/src/testing/county/in-memory-county-schools-read-model.ts`; Modify: `testing/county/index.ts`
- Create: `packages/application/src/use-cases/county/get-county-schools.ts`, `get-county-school-detail.ts`, `county-schools.test.ts`
- Modify: `services/county-application-service.ts`, `factories/create-application-layer.ts`, `index.ts`, `factories/create-application-layer.test.ts`, `packages/presentation/src/testing/create-test-application.ts`, `apps/desktop/electron/data/adapters/createApplicationComposition.ts`

**Interfaces (types, `county-schools.ts`):**

```ts
/** The server's per-school `details` object (all optional: absent on older servers). */
export interface CountySchoolDetails {
  establishedYear?: number | null;
  registrationDate?: string | null;
  accessMode?: string | null;
  isBoarding?: boolean;
  isUrban?: boolean;
  numBuildings?: number | null;
  numClassrooms?: number | null;
  numBathrooms?: number | null;
  waecCode?: string | null;
  principalName?: string | null;
  photoUrl?: string | null;
  hasLibrary?: boolean;
  hasComputerLab?: boolean;
  hasSportsField?: boolean;
  hasKitchen?: boolean;
  hasCafeteria?: boolean;
  hasElectricity?: boolean;
  hasSafeWater?: boolean;
  hasWaterAccess?: boolean;
  hasTextbooks?: boolean;
  hasWash?: boolean;
  hasPTA?: boolean;
  hasAuditorium?: boolean;
  hasClinic?: boolean;
}
export interface CountySchoolListItem {
  id: string; name: string; code: string; type: string; isActive: boolean;
  districtName: string | null; levels: string[]; studentCount: number; photoUrl: string | null;
}
export interface CountySchoolPrincipal { firstName: string; lastName: string; email: string | null; photoUrl: string | null }
export interface CountySchoolDetail {
  id: string; name: string; code: string; type: string; ownership: string; approvalStatus: string; isActive: boolean;
  street: string | null; communityTown: string | null; contactPhone: string | null; contactPersonPhone: string | null;
  emisCode: string | null; officialSchoolCode: string | null;
  metadata: Record<string, unknown> | null; levels: string[]; details: CountySchoolDetails | null;
  districtName: string | null; countyName: string | null;
  studentCount: number; staffCount: number; principal: CountySchoolPrincipal | null;
}
export interface CountySchoolsResult {
  county: { id: string; name: string } | null;
  districtCount: number;
  schools: CountySchoolListItem[];
}
export type CountySchoolDetailResult = CountySchoolDetail;
```

- Port:

```ts
// packages/application/src/interfaces/county/county-schools-read-model.ts
import type { CountySchoolDetail, CountySchoolListItem } from '@nemis-desktop/types';

/** County (CEO) Schools pages. "Own county" = institutions.countyId in the
 * synced counties row (all institutions when none has synced). */
export interface ICountySchoolsReadModel {
  /** institutions.service findAll: active, any type, by name; studentCount = ALL students. */
  listActiveSchools(): CountySchoolListItem[];
  /** institutions.service findOne: own county, any approval/active status, or null. */
  getSchool(id: string): CountySchoolDetail | null;
}
```

- DTO: `CountySchoolsOutput = CountySchoolsResult`, `CountySchoolDetailOutput = CountySchoolDetailResult | null`.
- Use cases: `GetCountySchoolsUseCase` deps `{ readModel: ICountySchoolsReadModel, districtsReadModel: ICountyDistrictsReadModel, countyReadModel: ICountyAnalyticsReadModel, logger }` → `{ county, districtCount: districtsReadModel.listActiveDistricts().length, schools }`; `GetCountySchoolDetailUseCase` deps `{ readModel, logger }`, query `{ schoolId }` → `readModel.getSchool(schoolId)`.
- Service: `listSchools()`, `getSchool(schoolId)`; port `countySchools`.

- [ ] **Step 1: Types** — write `county-schools.ts`; append `export * from './county-schools';` to `packages/types/src/index.ts`; `pnpm --filter @nemis-desktop/types typecheck` → 0.

- [ ] **Step 2: Port, DTO, fake** (Write each file). Fake:

```ts
import type { CountySchoolDetail, CountySchoolListItem } from '@nemis-desktop/types';
import type { ICountySchoolsReadModel } from '../../interfaces/county/county-schools-read-model';

export class InMemoryCountySchoolsReadModel implements ICountySchoolsReadModel {
  schools: CountySchoolListItem[] = [];
  schoolById = new Map<string, CountySchoolDetail>();
  listActiveSchools(): CountySchoolListItem[] {
    return this.schools;
  }
  getSchool(id: string): CountySchoolDetail | null {
    return this.schoolById.get(id) ?? null;
  }
}
```

Barrels: `interfaces/county/index.ts` and `testing/county/index.ts` gain the new exports.

- [ ] **Step 3: Failing use-case tests** — `use-cases/county/county-schools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyDistrictsReadModel } from '../../testing/county/in-memory-county-districts-read-model';
import { InMemoryCountySchoolsReadModel } from '../../testing/county/in-memory-county-schools-read-model';
import { GetCountySchoolsUseCase } from './get-county-schools';
import { GetCountySchoolDetailUseCase } from './get-county-school-detail';

const listItem = { id: 's-1', name: 'Alpha', code: 'A', type: 'SCHOOL', isActive: true, districtName: 'Buchanan', levels: ['PRIMARY'], studentCount: 40, photoUrl: null };

describe('GetCountySchoolsUseCase', () => {
  it('returns the county, the active-district count and the schools', async () => {
    const readModel = new InMemoryCountySchoolsReadModel();
    readModel.schools = [listItem];
    const districtsReadModel = new InMemoryCountyDistrictsReadModel();
    districtsReadModel.districts = [
      { id: 'd-1', name: 'Buchanan', code: null, isActive: true, activeSchoolCount: 1, activeDeoCount: 0, firstDeo: null },
      { id: 'd-2', name: 'Owensgrove', code: null, isActive: true, activeSchoolCount: 0, activeDeoCount: 0, firstDeo: null },
    ];
    const countyReadModel = new InMemoryCountyAnalyticsReadModel();
    countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };
    const { data } = await new GetCountySchoolsUseCase({ readModel, districtsReadModel, countyReadModel, logger: new RecordingLogger() }).execute({});
    expect(data).toEqual({ county: { id: 'county-1', name: 'Grand Bassa' }, districtCount: 2, schools: [listItem] });
  });
});

describe('GetCountySchoolDetailUseCase', () => {
  it('returns null for an unknown or other-county school', async () => {
    const { data } = await new GetCountySchoolDetailUseCase({ readModel: new InMemoryCountySchoolsReadModel(), logger: new RecordingLogger() }).execute({ schoolId: 'nope' });
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 4: Run** `pnpm exec vitest run packages/application/src/use-cases/county/county-schools.test.ts` → FAIL.

- [ ] **Step 5: Implement both use cases** (same shape as `get-county-districts.ts` / `get-county-district-detail.ts`, `invokeUseCase('GetCountySchools' | 'GetCountySchoolDetail', …)`). Run → PASS.

- [ ] **Step 6: Wire** — service methods + deps (`listSchools: GetCountySchoolsUseCase`, `getSchool: GetCountySchoolDetailUseCase`); factory: `countySchools: ICountySchoolsReadModel;` in `ApplicationPorts` and both use cases in the `county` service (`readModel: ports.countySchools, districtsReadModel: ports.countyDistricts, countyReadModel: ports.countyAnalytics`); `index.ts` exports the DTO and both use cases; `countySchools: new InMemoryCountySchoolsReadModel()` in `buildLayer()` and `createTestApplication` (+ `TestPorts`); `createApplicationComposition.ts` gets `countySchools: new Proxy({} as never, { get: () => () => notBuilt('CountySchools') }),` (Task 4 replaces it).

- [ ] **Step 7: Verify** — `pnpm typecheck` → 0; `pnpm exec vitest run packages/application packages/presentation` → PASS.

- [ ] **Step 8: Commit** (all touched files by path) — `feat(application): county schools list and school detail use cases`.

---

### Task 4: SQLite adapter — `SqliteCountySchoolsReadModel`

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountySchoolsReadModel.ts` (+ `.test.ts`)
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts`, `apps/desktop/electron/data/adapters/createApplicationComposition.ts`

- [ ] **Step 1: Failing tests** — `SqliteCountySchoolsReadModel.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountySchoolsReadModel } from './SqliteCountySchoolsReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountySchoolsReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountySchoolsReadModel;
  let seq = 0;

  const county = () => db.prepare(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`).run();
  const district = (id: string, name: string) =>
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive) VALUES (?,?,'county-1',1)`).run(id, name);
  const school = (
    id: string,
    name: string,
    opts: { districtId?: string | null; isActive?: number; countyId?: string; profile?: string | null; details?: string | null; approvalStatus?: string } = {},
  ) =>
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive,street,profile,details)
       VALUES (?,?,?,'SCHOOL','GOVERNMENT',?,?,?,1,?,?,'1 Road',?,?)`,
    ).run(id, id.toUpperCase(), name, opts.countyId ?? 'county-1', opts.districtId ?? null, opts.approvalStatus ?? 'APPROVED', NOW, opts.isActive ?? 1, opts.profile ?? null, opts.details ?? null);
  const student = (id: string, institutionId: string, isActive = 1) => {
    seq += 1;
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES (?,?,'F','L',?,'2015-01-01','MALE',?,1,?)`,
    ).run(id, institutionId, String(seq).padStart(12, '0'), isActive, NOW);
  };
  const staff = (id: string, institutionId: string, isActive = 1) =>
    db.prepare(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
       VALUES (?,?,'T','C','1990-01-01','FEMALE','0770000000',?,'TEACHER','FULL_TIME','2020-01-01',?,?,?)`,
    ).run(id, institutionId, id, isActive, NOW, NOW);
  const admin = (id: string, institutionId: string, first: string, isActive = 1) =>
    db.prepare(
      `INSERT INTO institution_admin (id,institutionId,firstName,lastName,position,photoUrl,email,phoneNumber,isActive)
       VALUES (?,?,?,'Doe','PRINCIPAL',NULL,?,NULL,?)`,
    ).run(id, institutionId, first, `${first.toLowerCase()}@school.lr`, isActive);

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountySchoolsReadModel(test.context);
    seq = 0;
  });
  afterEach(() => test.cleanup());

  it('lists active own-county schools by name with district, levels, all-student count and photo', () => {
    county();
    district('d-1', 'Buchanan');
    school('b', 'Beta', { districtId: 'd-1', profile: JSON.stringify({ levels: ['PRIMARY', 'SECONDARY'] }), details: JSON.stringify({ photoUrl: 'https://res.cloudinary.com/x/b.jpg' }) });
    school('a', 'Alpha');
    school('off', 'Closed', { isActive: 0 });
    school('x', 'Elsewhere', { countyId: 'county-2' });
    student('s1', 'b');
    student('s2', 'b', 0);
    expect(readModel.listActiveSchools()).toEqual([
      { id: 'a', name: 'Alpha', code: 'A', type: 'SCHOOL', isActive: true, districtName: null, levels: [], studentCount: 0, photoUrl: null },
      { id: 'b', name: 'Beta', code: 'B', type: 'SCHOOL', isActive: true, districtName: 'Buchanan', levels: ['PRIMARY', 'SECONDARY'], studentCount: 2, photoUrl: 'https://res.cloudinary.com/x/b.jpg' },
    ]);
  });

  it('gets any own-county school with counts, metadata, details and the first active principal', () => {
    county();
    district('d-1', 'Buchanan');
    school('p', 'Pending', {
      districtId: 'd-1', isActive: 0, approvalStatus: 'PENDING',
      profile: JSON.stringify({ statistics: { maxCapacity: 300 }, levels: ['PRIMARY'] }),
      details: JSON.stringify({ establishedYear: 1998, hasLibrary: true }),
    });
    student('s1', 'p');
    student('s2', 'p', 0);
    staff('t1', 'p');
    staff('t2', 'p', 0);
    admin('adm-2', 'p', 'Second');
    admin('adm-1', 'p', 'First');
    admin('adm-0', 'p', 'Gone', 0);
    expect(readModel.getSchool('p')).toMatchObject({
      id: 'p', name: 'Pending', approvalStatus: 'PENDING', isActive: false, ownership: 'GOVERNMENT', street: '1 Road',
      metadata: { statistics: { maxCapacity: 300 } }, levels: ['PRIMARY'], details: { establishedYear: 1998, hasLibrary: true },
      districtName: 'Buchanan', countyName: 'Grand Bassa', studentCount: 2, staffCount: 2,
      principal: { firstName: 'First', lastName: 'Doe', email: 'first@school.lr', photoUrl: null },
    });
    expect(readModel.getSchool('p')!.metadata).not.toHaveProperty('levels');
  });

  it("returns null for another county's or an unknown school", () => {
    county();
    school('x', 'Elsewhere', { countyId: 'county-2' });
    expect(readModel.getSchool('x')).toBeNull();
    expect(readModel.getSchool('nope')).toBeNull();
  });

  it('treats corrupt JSON as missing', () => {
    school('c', 'Corrupt', { profile: '{not json', details: 'nope' });
    expect(readModel.listActiveSchools()[0]).toMatchObject({ levels: [], photoUrl: null });
    expect(readModel.getSchool('c')).toMatchObject({ metadata: null, levels: [], details: null });
  });
});
```

- [ ] **Step 2: Run** (Electron runner) → FAIL.

- [ ] **Step 3: Implement** `SqliteCountySchoolsReadModel.ts`:

```ts
import type { CountySchoolDetail, CountySchoolDetails, CountySchoolListItem } from '@nemis-desktop/types';
import type { ICountySchoolsReadModel } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { institutions, districts, counties, students, staff, institutionAdmin } = TableNames;

const OWN_COUNTY = `(NOT EXISTS (SELECT 1 FROM ${counties}) OR i.countyId IN (SELECT id FROM ${counties}))`;

/** A corrupt JSON column must not blank a whole page: it reads as missing. */
function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function levelsOf(profile: Record<string, unknown> | null): string[] {
  const levels = profile?.levels;
  return Array.isArray(levels) ? levels.filter((level): level is string => typeof level === 'string') : [];
}

function metadataOf(profile: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!profile) return null;
  const metadata = { ...profile };
  delete metadata.levels;
  return metadata;
}

type ListRow = {
  id: string; name: string; code: string; type: string; isActive: number;
  districtName: string | null; profile: string | null; details: string | null; studentCount: number;
};
type DetailRow = ListRow & {
  ownership: string; approvalStatus: string; street: string | null; communityTown: string | null;
  contactPhone: string | null; contactPersonPhone: string | null; emisCode: string | null;
  officialSchoolCode: string | null; countyName: string | null; staffCount: number;
};

/** Read-only SQLite adapter for ICountySchoolsReadModel. */
export class SqliteCountySchoolsReadModel implements ICountySchoolsReadModel {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  listActiveSchools(): CountySchoolListItem[] {
    return guarded('SqliteCountySchoolsReadModel.listActiveSchools', () => {
      const rows = this.#statements
        .get(
          `SELECT i.id, i.name, i.code, i.type, i.isActive, d.name AS districtName, i.profile, i.details,
             (SELECT COUNT(*) FROM ${students} s WHERE s.institutionId = i.id) AS studentCount
           FROM ${institutions} i LEFT JOIN ${districts} d ON d.id = i.districtId
           WHERE i.isActive = 1 AND ${OWN_COUNTY}
           ORDER BY i.name ASC`,
        )
        .all() as ListRow[];
      return rows.map((row) => {
        const details = parseObject(row.details);
        return {
          id: row.id,
          name: row.name,
          code: row.code,
          type: row.type,
          isActive: row.isActive === 1,
          districtName: row.districtName,
          levels: levelsOf(parseObject(row.profile)),
          studentCount: row.studentCount,
          photoUrl: typeof details?.photoUrl === 'string' ? details.photoUrl : null,
        };
      });
    });
  }

  getSchool(id: string): CountySchoolDetail | null {
    return guarded('SqliteCountySchoolsReadModel.getSchool', () => {
      const row = this.#statements
        .get(
          `SELECT i.id, i.name, i.code, i.type, i.isActive, i.ownership, i.approvalStatus, i.street,
                  i.communityTown, i.contactPhone, i.contactPersonPhone, i.emisCode, i.officialSchoolCode,
                  i.profile, i.details, d.name AS districtName, c.name AS countyName,
             (SELECT COUNT(*) FROM ${students} s WHERE s.institutionId = i.id) AS studentCount,
             (SELECT COUNT(*) FROM ${staff} t WHERE t.institutionId = i.id) AS staffCount
           FROM ${institutions} i
           LEFT JOIN ${districts} d ON d.id = i.districtId
           LEFT JOIN ${counties} c ON c.id = i.countyId
           WHERE i.id = ? AND ${OWN_COUNTY}`,
        )
        .get(id) as DetailRow | undefined;
      if (!row) return null;
      const principal = this.#statements
        .get(
          `SELECT firstName, lastName, email, photoUrl FROM ${institutionAdmin}
           WHERE institutionId = ? AND isActive = 1 ORDER BY id ASC LIMIT 1`,
        )
        .get(id) as CountySchoolDetail['principal'] | undefined;
      const profile = parseObject(row.profile);
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        type: row.type,
        ownership: row.ownership,
        approvalStatus: row.approvalStatus,
        isActive: row.isActive === 1,
        street: row.street,
        communityTown: row.communityTown,
        contactPhone: row.contactPhone,
        contactPersonPhone: row.contactPersonPhone,
        emisCode: row.emisCode,
        officialSchoolCode: row.officialSchoolCode,
        metadata: metadataOf(profile),
        levels: levelsOf(profile),
        details: parseObject(row.details) as CountySchoolDetails | null,
        districtName: row.districtName,
        countyName: row.countyName,
        studentCount: row.studentCount,
        staffCount: row.staffCount,
        principal: principal ?? null,
      };
    });
  }
}
```

- [ ] **Step 4: Run** → PASS (4).
- [ ] **Step 5: Wire** — `createDataLayer.ts` (import type `ICountySchoolsReadModel`, `countySchools` in `DataLayer.repositories`, construct, return); `createApplicationComposition.ts`: replace the Task 3 Proxy with `countySchools: dataLayer.repositories.countySchools,`.
- [ ] **Step 6: Verify** — `pnpm typecheck` → 0; `pnpm lint` → 0; Electron runner on `apps/desktop/electron/data` → PASS.
- [ ] **Step 7: Commit** — `feat(data): SQLite county schools read model`.

---

### Task 5: Presentation — `CountySchoolsViewModel`, `CountySchoolDetailViewModel`

**Files:** `packages/presentation/src/queries/county/get-county-schools-ui-query.ts`, `get-county-school-detail-ui-query.ts`, `view-models/county/county-schools-views.ts`, `mappers/county/county-schools-view-mapper.ts`, `view-models/county/county-schools-view-model.ts`, `county-school-detail-view-model.ts`, `county-schools-view-models.test.ts`; Modify `factories/create-presentation-layer.ts`, `index.ts`.

**Interfaces** — `county-schools-views.ts`:

```ts
import type { CountySchoolDetails } from '@nemis-desktop/types';

/** portal-web Institution (findAll) as the ported list reads it. */
export interface SchoolCardView {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  photoUrl: string | null;
  district: { name: string } | null;
  levels: { level: string }[];
  _count: { students: number };
}
export interface CountySchoolsView {
  county: { id: string; name: string } | null;
  districtCount: number;
  schools: SchoolCardView[];
}
/** portal-web Institution (findOne) as the ported detail page reads it. */
export interface SchoolDetailView extends CountySchoolDetails {
  id: string;
  name: string;
  code: string;
  type: string;
  ownership: string;
  approvalStatus: string;
  isActive: boolean;
  address: string | null;
  contactPhone: string | null;
  contactPersonPhone: string | null;
  emisCode: string | null;
  metadata: Record<string, unknown> | undefined;
  levels: { level: string }[];
  district: { name: string } | null;
  county: { name: string } | null;
  _count: { students: number; staff: number };
  users: { role: 'INSTITUTION_ADMIN'; user: { firstName: string; lastName: string; email: string | null; photoUrl: string | null } }[];
}
```

Mapper:

```ts
import type { CountySchoolDetail, CountySchoolsResult } from '@nemis-desktop/types';
import type { CountySchoolsView, SchoolDetailView } from '../../view-models/county/county-schools-views';

export function toCountySchoolsView(dto: CountySchoolsResult): CountySchoolsView {
  return {
    county: dto.county,
    districtCount: dto.districtCount,
    schools: dto.schools.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      isActive: s.isActive,
      photoUrl: s.photoUrl,
      district: s.districtName ? { name: s.districtName } : null,
      levels: s.levels.map((level) => ({ level })),
      _count: { students: s.studentCount },
    })),
  };
}

export function toSchoolDetailView(dto: CountySchoolDetail): SchoolDetailView {
  return {
    ...(dto.details ?? {}),
    id: dto.id,
    name: dto.name,
    code: dto.code,
    type: dto.type,
    ownership: dto.ownership,
    approvalStatus: dto.approvalStatus,
    isActive: dto.isActive,
    address: dto.street,
    contactPhone: dto.contactPhone,
    contactPersonPhone: dto.contactPersonPhone,
    emisCode: dto.emisCode,
    metadata: dto.metadata ?? undefined,
    levels: dto.levels.map((level) => ({ level })),
    district: dto.districtName ? { name: dto.districtName } : null,
    county: dto.countyName ? { name: dto.countyName } : null,
    _count: { students: dto.studentCount, staff: dto.staffCount },
    users: dto.principal ? [{ role: 'INSTITUTION_ADMIN', user: dto.principal }] : [],
  };
}
```

ViewModels: `CountySchoolsViewModel` (`summary`, `load()`, map `toCountySchoolsView`); `CountySchoolDetailViewModel` (`detail`, `load(schoolId)`, map `toSchoolDetailView`, `null` → `empty`), each mirroring the district view models. Register `countySchools` / `countySchoolDetail`; export all new modules.

- [ ] **Step 1: Failing tests** — `county-schools-view-models.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { CountySchoolsViewModel } from './county-schools-view-model';
import { CountySchoolDetailViewModel } from './county-school-detail-view-model';

const detail = {
  id: 's-1', name: 'Alpha', code: 'A', type: 'SCHOOL', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isActive: true,
  street: '1 Road', communityTown: null, contactPhone: null, contactPersonPhone: null, emisCode: null, officialSchoolCode: null,
  metadata: { statistics: { maxCapacity: 100 } }, levels: ['PRIMARY'], details: { establishedYear: 1998, hasLibrary: true },
  districtName: 'Buchanan', countyName: 'Grand Bassa', studentCount: 40, staffCount: 3,
  principal: { firstName: 'Ada', lastName: 'Doe', email: 'ada@x', photoUrl: null },
};

describe('CountySchoolsViewModel', () => {
  it('shapes schools like portal-web findAll', async () => {
    const { app, ports } = createTestApplication();
    ports.countySchools.schools = [{ id: 's-1', name: 'Alpha', code: 'A', type: 'SCHOOL', isActive: true, districtName: 'Buchanan', levels: ['PRIMARY'], studentCount: 40, photoUrl: null }];
    const vm = new CountySchoolsViewModel({ county: app.county });
    await vm.load();
    const s = vm.store.getState().summary;
    expect(s.status).toBe('success');
    if (s.status !== 'success') return;
    expect(s.data.schools[0]).toEqual({
      id: 's-1', name: 'Alpha', code: 'A', isActive: true, photoUrl: null,
      district: { name: 'Buchanan' }, levels: [{ level: 'PRIMARY' }], _count: { students: 40 },
    });
  });
});

describe('CountySchoolDetailViewModel', () => {
  it('spreads details and shapes the principal as an INSTITUTION_ADMIN user', async () => {
    const { app, ports } = createTestApplication();
    ports.countySchools.schoolById.set('s-1', detail);
    const vm = new CountySchoolDetailViewModel({ county: app.county });
    await vm.load('s-1');
    const s = vm.store.getState().detail;
    expect(s.status).toBe('success');
    if (s.status !== 'success') return;
    expect(s.data).toMatchObject({
      establishedYear: 1998, hasLibrary: true, address: '1 Road',
      district: { name: 'Buchanan' }, county: { name: 'Grand Bassa' }, _count: { students: 40, staff: 3 },
      users: [{ role: 'INSTITUTION_ADMIN', user: { firstName: 'Ada', lastName: 'Doe', email: 'ada@x', photoUrl: null } }],
    });
  });

  it('is empty for an unknown school', async () => {
    const { app } = createTestApplication();
    const vm = new CountySchoolDetailViewModel({ county: app.county });
    await vm.load('nope');
    expect(vm.store.getState().detail.status).toBe('empty');
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (Write each file). **Step 4: Run** → PASS; `pnpm typecheck` → 0. **Step 5: Commit** — `feat(presentation): county schools and school detail view models`.

---

### Task 6: IPC — `county:list-schools`, `county:get-school`

**Files:** `packages/types/src/ipc.ts`, `api.ts`; `apps/desktop/electron/ipc/handlers/county/schools.ts` (+ `schools.test.ts`), `county/index.ts`, `ipc/registrar.ts`, `ipc/authorizeChannel.ts` (+ test); `electron/preload/county/schools-api.ts`, `county/index.ts`; `renderer/services/nemis-bridge/county/schools-bridge.ts`, `county/index.ts`; `renderer/lib/ipc/county.ts` (+ `index.test.ts`); `renderer/lib/presentation/hooks/county.ts`.

- Channels: `COUNTY_LIST_SCHOOLS: 'county:list-schools'` (args `[]`, result `CountySchoolsResult`), `COUNTY_GET_SCHOOL: 'county:get-school'` (args `[schoolId: string]`, result `CountySchoolDetailResult | null`). `CountyApi` gains `listSchools()`, `getSchool(schoolId)`.

- [ ] **Step 1: Failing tests**

`ipc/handlers/county/schools.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountySchoolHandlers } from './schools';

interface Captured { validate: IpcValidator; handler: (...args: readonly unknown[]) => unknown }

describe('county school reads', () => {
  it('list-schools takes no args; get-school takes one id and passes it through', async () => {
    const calls = new Map<string, Captured>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
      calls.set(channel, { validate, handler: handler as Captured['handler'] });
    }) as IpcHandle;
    const getSchool = vi.fn(async () => ({ data: null }));
    const app = { county: { listSchools: async () => ({ data: { schools: [] } }), getSchool } } as unknown as ApplicationLayer;
    registerCountySchoolHandlers(handle, app);
    expect(await calls.get('county:list-schools')!.handler()).toEqual({ schools: [] });
    expect(() => calls.get('county:list-schools')!.validate(['x'])).toThrow(IPCError);
    expect(await calls.get('county:get-school')!.handler('s-1')).toBeNull();
    expect(getSchool).toHaveBeenCalledWith('s-1');
    expect(() => calls.get('county:get-school')!.validate([])).toThrow(IPCError);
  });
});
```

`authorizeChannel.test.ts`: add `IpcChannels.COUNTY_LIST_SCHOOLS, IpcChannels.COUNTY_GET_SCHOOL` to the county channel list.

`renderer/lib/ipc/index.test.ts`:

```ts
  it('county.listSchools and county.getSchool return bridged data', async () => {
    const getSchool = vi.fn(async () => null);
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      county: { listSchools: vi.fn(async () => ({ schools: [] })), getSchool },
    });
    const app = createIpcApplicationLayer();
    expect((await app.county.listSchools()).data).toEqual({ schools: [] });
    expect((await app.county.getSchool('s-1')).data).toBeNull();
    expect(getSchool).toHaveBeenCalledWith('s-1');
  });
```

- [ ] **Step 2: Run** (Electron runner on `apps/desktop/electron/ipc apps/desktop/renderer/lib/ipc`) → FAIL.

- [ ] **Step 3: Implement** — types (imports from `./county-schools`, contract entries, channel constants, `CountyApi` methods); `handlers/county/schools.ts`:

```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs, assertSingleIdArg } from '@app/security/validateIpc';

export function registerCountySchoolHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_LIST_SCHOOLS, assertNoArgs, async () => {
    const res = await app.county.listSchools();
    return res.data;
  });
  handle(IpcChannels.COUNTY_GET_SCHOOL, assertSingleIdArg, async (schoolId: string) => {
    const res = await app.county.getSchool(schoolId);
    return res.data;
  });
}
```

export it from `handlers/county/index.ts`; registrar: import and call `registerCountySchoolHandlers(securedHandle, app);` after `registerCountyDistrictHandlers(...)`; add both channels to `COUNTY_ADMIN_CHANNELS`; `preload/county/schools-api.ts` (`Pick<CountyApi, 'listSchools' | 'getSchool'>`, `invoke(...)`), spread into `countyApi.county`; `schools-bridge.ts` (`listSchools`, `getSchool`), spread into `countyBridge`; facade group gains `listSchools: () => query(() => countyBridge.listSchools())`, `getSchool: (schoolId) => query(() => countyBridge.getSchool(schoolId))`; hooks: append `useCountySchoolsViewModel`, `useCountySchoolDetailViewModel` (keep `useSchoolsViewModel` for now — the old page still imports it; Task 7 deletes it).

- [ ] **Step 4: Verify** — Electron runner on `apps/desktop/electron/ipc apps/desktop/renderer/lib` → PASS; `pnpm typecheck` → 0; `pnpm lint` → 0.

- [ ] **Step 5: Commit** — `feat(ipc): county school list and detail reads`.

---

### Task 7: UI — Schools list page, `SchoolPhoto`, bulk-import placeholder

**Files:** Create `renderer/components/county/schools/SchoolPhoto.tsx` (+ `.test.tsx`); Replace `renderer/app/government/county/schools/page.tsx`, `page.test.tsx`; Create `renderer/app/government/county/schools/bulk-import/page.tsx` (+ `page.test.tsx`).

- [ ] **Step 1: Failing tests**

`SchoolPhoto.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchoolPhoto } from './SchoolPhoto';

describe('SchoolPhoto', () => {
  it('swaps to the fallback image when the photo fails', () => {
    render(<SchoolPhoto src="https://res.cloudinary.com/x/a.jpg" alt="Alpha" width={32} height={32} />);
    const img = screen.getByAltText('Alpha');
    expect(img.getAttribute('src')).toContain('res.cloudinary.com');
    fireEvent.error(img);
    expect(screen.getByAltText('Alpha').getAttribute('src')).toContain('/school-fallback.jpg');
  });
});
```

`schools/page.test.tsx` (replaces the old file):

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import SchoolsPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const school = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `s-${i}`, name: `School ${String(i).padStart(2, '0')}`, code: `SC${i}`, type: 'SCHOOL', isActive: true,
  districtName: i % 2 ? 'Buchanan' : 'Owensgrove', levels: i % 2 ? ['PRIMARY'] : ['SECONDARY'], studentCount: 10, photoUrl: null,
  ...extra,
});

function renderWith(schools: unknown[]) {
  (window as unknown as { nemis: unknown }).nemis = {
    county: { listSchools: vi.fn(async () => ({ county: { id: 'county-1', name: 'Grand Bassa' }, districtCount: 2, schools })) },
  };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <SchoolsPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
});

describe('County Schools page', () => {
  it('renders the header and stat cards', async () => {
    renderWith([school(1), school(2)]);
    await waitFor(() => expect(screen.getByText('Grand Bassa')).toBeInTheDocument());
    expect(screen.getByText('Total Schools').parentElement!.textContent).toContain('2');
    expect(screen.getByText('Total Enrollment').parentElement!.textContent).toContain('20');
    expect(screen.getByText('Districts').closest('a')).toHaveAttribute('href', '/government/county/districts');
  });

  it('searches by district name and filters by school type', async () => {
    renderWith([school(1), school(2)]);
    await waitFor(() => expect(screen.getByText('School 01')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Name, code, district…'), { target: { value: 'owens' } });
    expect(screen.queryByText('School 01')).not.toBeInTheDocument();
    expect(screen.getByText('School 02')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Name, code, district…'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Primary' }));
    expect(screen.getByText('School 01')).toBeInTheDocument();
    expect(screen.queryByText('School 02')).not.toBeInTheDocument();
  });

  it('shows the web empty state when the status filter matches none', async () => {
    renderWith([school(1)]);
    await waitFor(() => expect(screen.getByText('School 01')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));
    expect(screen.getByText('No schools found matching your criteria.')).toBeInTheDocument();
  });

  it('pages at 10 schools', async () => {
    renderWith(Array.from({ length: 11 }, (_, i) => school(i + 1)));
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument());
    expect(screen.queryByText('School 11')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('School 11')).toBeInTheDocument();
  });

  it('View School routes to the detail page with the id in the query, and the header buttons route', async () => {
    renderWith([school(1)]);
    await waitFor(() => expect(screen.getByText('View School →')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View School →'));
    expect(push).toHaveBeenCalledWith('/government/county/schools/details?id=s-1');
    fireEvent.click(screen.getByText('Add School'));
    expect(push).toHaveBeenCalledWith('/government/county/schools/create');
    fireEvent.click(screen.getByText('Bulk Import'));
    expect(push).toHaveBeenCalledWith('/government/county/schools/bulk-import');
  });

  it('switches to the table view', async () => {
    renderWith([school(1)]);
    await waitFor(() => expect(screen.getByText('School 01')).toBeInTheDocument());
    const toggles = within(screen.getByText('schools found').parentElement!.parentElement!).getAllByRole('button');
    fireEvent.click(toggles[1]!);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
```

`schools/bulk-import/page.test.tsx`: render `Page`, expect `'Bulk Import Schools'`.

- [ ] **Step 2: Run** `pnpm exec vitest run apps/desktop/renderer/components/county/schools apps/desktop/renderer/app/government/county/schools` → FAIL.

- [ ] **Step 3: Implement**

`SchoolPhoto.tsx`:

```tsx
'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

const FALLBACK = '/school-fallback.jpg';

/** next/image for school photos: unoptimized (static export, remote Cloudinary
 * URLs) and swapped to the local fallback when the photo cannot load — offline,
 * or a missing image. */
export function SchoolPhoto({ src, alt, ...rest }: ImageProps) {
  const [failedSrc, setFailedSrc] = useState<ImageProps['src'] | null>(null);
  return (
    <Image
      {...rest}
      unoptimized
      alt={alt}
      src={failedSrc === src ? FALLBACK : src}
      onError={() => setFailedSrc(src)}
    />
  );
}
```

Port the list page: `cp` portal-web `schools/page.tsx` over the desktop file, then:
- Edit 1 — replace L1–99 (imports through the `if (!mounted || loading)` block) with:

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Spinner, Card, ErrorState } from "@nemis-desktop/ui";
import { useRouter } from "next/navigation";
import {
  Search,
  School,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
} from "lucide-react";
import { useCountySchoolsViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { SchoolPhoto } from "@/components/county/schools/SchoolPhoto";

const ITEMS_PER_PAGE = 10;

export default function SchoolsPage() {
  const router = useRouter();
  const vm = useCountySchoolsViewModel();
  const summary = useViewModel(vm.store, (s) => s.summary);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [currentPage, setCurrentPage] = useState(1);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  // `refreshing` keeps the page on screen during a reload.
  const data =
    summary.status === "success" || summary.status === "refreshing" ? summary.data : null;
  const county = data?.county ?? null;
  const districtCount = data?.districtCount ?? 0;
  const schools = useMemo(() => data?.schools ?? [], [data]);

  const filteredSchools = useMemo(() => {
    return schools.filter((school) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        school.name.toLowerCase().includes(term) ||
        school.code.toLowerCase().includes(term) ||
        (school.district?.name || "").toLowerCase().includes(term);
      const matchesType =
        selectedType === "all" ||
        school.levels?.some((l) => l.level === selectedType);
      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active" && school.isActive) ||
        (selectedStatus === "inactive" && !school.isActive);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [schools, searchTerm, selectedType, selectedStatus]);

  const totalPages = Math.ceil(filteredSchools.length / ITEMS_PER_PAGE);
  const paginatedSchools = filteredSchools.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const totalEnrollment = schools.reduce(
    (sum, s) => sum + (s._count?.students || 0),
    0,
  );
  const activeSchools = schools.filter((s) => s.isActive).length;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedType, selectedStatus]);

  if (summary.status === "idle" || summary.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (summary.status === "error") {
    return (
      <div className="p-8">
        <ErrorState message={summary.error.userMessage} onRetry={() => void vm.load()} />
      </div>
    );
  }
```

- Edit 2 — `<CountyAuthGuard>` → `<>`, `</CountyAuthGuard>` → `</>`.
- Edit 3 — `{districts.length}` → `{districtCount}`.
- Edit 4 — both `` `/government/county/schools/${school.id}` `` → `` `/government/county/schools/details?id=${school.id}` ``.
- Edit 5 — both `<Image` → `<SchoolPhoto` (props unchanged).

After the edits, `grep -n "CountyAuthGuard\|useAppSelector\|useGet\|@nemis/\|mounted\|from \"next/image\"\|districts\.length" <page>` prints nothing.

`schools/bulk-import/page.tsx`:

```tsx
import { ComingSoon } from '@/components/shell/ComingSoon';

export default function Page() {
  return <ComingSoon title="Bulk Import Schools" />;
}
```

Delete the `useSchoolsViewModel` line from `lib/presentation/hooks/county.ts` (its only user was the old page).

- [ ] **Step 4: Verify** — Step 2 command → PASS; `pnpm lint` → 0; `pnpm typecheck` → 0; `diff --strip-trailing-cr` vs portal-web shows only Edits 1–5.
- [ ] **Step 5: Commit** — `feat(county): port the Schools list page`.

---

### Task 8: UI — School detail page

**Files:** Create `renderer/components/county/schools/SchoolDetailPage.tsx` (+ `.test.tsx`), `renderer/app/government/county/schools/details/page.tsx`.

- [ ] **Step 1: Failing tests** — `SchoolDetailPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { SchoolDetailPage } from './SchoolDetailPage';

let searchId: string | null = 's-1';
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => searchId }),
  useRouter: () => ({ push }),
}));

const SCHOOL = {
  id: 's-1', name: 'Alpha High', code: 'AH', type: 'SCHOOL', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isActive: true,
  street: '1 Road', communityTown: null, contactPhone: '0771', contactPersonPhone: '0772', emisCode: 'EMIS-1', officialSchoolCode: null,
  metadata: { statistics: { maxCapacity: 200 } }, levels: ['PRIMARY', 'SECONDARY'],
  details: { establishedYear: 1998, numClassrooms: 12, numBuildings: 3, numBathrooms: 4, isBoarding: false, isUrban: true, accessMode: 'ROAD', waecCode: 'W-1', hasLibrary: true, hasClinic: false },
  districtName: 'Buchanan', countyName: 'Grand Bassa', studentCount: 170, staffCount: 9,
  principal: { firstName: 'Ada', lastName: 'Doe', email: 'ada@school.lr', photoUrl: null },
};

function renderWith(getSchool: (id: string) => Promise<unknown>) {
  (window as unknown as { nemis: unknown }).nemis = { county: { getSchool: vi.fn(getSchool) } };
  // One layer for the whole test: the detail view model is an app-lifetime
  // singleton, which is exactly what the previous-school test exercises.
  const layer = createRendererPresentation();
  const view = render(
    <PresentationProvider layer={layer}>
      <SchoolDetailPage />
    </PresentationProvider>,
  );
  const rerender = () =>
    view.rerender(
      <PresentationProvider layer={layer}>
        <SchoolDetailPage />
      </PresentationProvider>,
    );
  return { rerender };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  searchId = 's-1';
  push.mockReset();
});

describe('County School detail page', () => {
  it('shows the header, quick stats, information, leadership, compliance and facilities', async () => {
    renderWith(async () => SCHOOL);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alpha High' })).toBeInTheDocument());
    expect(screen.getByText('AH · Buchanan · Grand Bassa · Est. 1998')).toBeInTheDocument();
    expect(screen.getAllByText('85%').length).toBeGreaterThan(0); // 170 / 200
    expect(screen.getByText('High Standing')).toBeInTheDocument();
    expect(screen.getByText('Primary, Secondary')).toBeInTheDocument();
    expect(screen.getByText('Urban')).toBeInTheDocument();
    expect(screen.getByText('Road')).toBeInTheDocument();
    expect(screen.getByText('Ada Doe')).toBeInTheDocument();
    expect(screen.getByText('MoE Approved')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByText('Clinic')).not.toBeInTheDocument();
  });

  it('renders a school whose details have not synced', async () => {
    renderWith(async () => ({ ...SCHOOL, details: null, metadata: null }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alpha High' })).toBeInTheDocument());
    expect(screen.getByText('Capacity not set')).toBeInTheDocument();
    expect(screen.queryByText('Facilities & Infrastructure')).not.toBeInTheDocument();
  });

  it('shows the web not-found view for an unknown school or a missing id', async () => {
    renderWith(async () => null);
    await waitFor(() => expect(screen.getByText("School not found or you don't have access.")).toBeInTheDocument());
  });

  it('does not show the previously opened school', async () => {
    const { rerender } = renderWith(async (id) => (id === 's-1' ? SCHOOL : new Promise(() => {})));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alpha High' })).toBeInTheDocument());
    searchId = 's-2';
    rerender();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Alpha High' })).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run apps/desktop/renderer/components/county/schools` → FAIL.

- [ ] **Step 3: Implement** — `cp` portal-web `schools/[id]/page.tsx` to `components/county/schools/SchoolDetailPage.tsx`, then:
- Edit 1 — replace the import block (L1–16) with:

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Avatar, Card } from "@nemis-desktop/ui";
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  Phone,
  Mail,
  Users,
} from "lucide-react";
import { useCountySchoolDetailViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { SchoolPhoto } from "@/components/county/schools/SchoolPhoto";
```

- Edit 2 — `export default function SchoolDetailPage() {` → `export function SchoolDetailPage() {`, and replace its first block (from `const params = useParams();` through the `useGetSchoolByIdQuery(…)` call) with:

```tsx
  const router = useRouter();
  const schoolId = useSearchParams().get("id") ?? "";
  const vm = useCountySchoolDetailViewModel();
  const detail = useViewModel(vm.store, (s) => s.detail);

  useRevalidateOnSync(() => {
    if (schoolId) void vm.load(schoolId);
  }, [vm, schoolId]);

  const loaded =
    detail.status === "success" || detail.status === "refreshing" ? detail.data : null;
  // The view model outlives the page: never show the previously opened school.
  const school = loaded && loaded.id === schoolId ? loaded : null;
  const isLoading = !!schoolId && !school && (detail.status === "idle" || detail.status === "loading" || detail.status === "refreshing");
  const isError = !schoolId || detail.status === "error" || detail.status === "empty";
```

- Edit 3 — `<CountyAuthGuard>` → `<>`, `</CountyAuthGuard>` → `</>` (both pairs).
- Edit 4 — `<Image` → `<SchoolPhoto`.
- Edit 5 — `DetailRow` uses `React.ReactNode`: add `import type { ReactNode } from "react";` to the Edit 1 imports and change `React.ReactNode` → `ReactNode` (no global `React` namespace reliance).

`app/government/county/schools/details/page.tsx`:

```tsx
import { Suspense } from 'react';
import { SchoolDetailPage } from '@/components/county/schools/SchoolDetailPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SchoolDetailPage />
    </Suspense>
  );
}
```

After the edits, `grep -n "useParams\|useGetSchoolByIdQuery\|CountyAuthGuard\|@nemis/\|from \"next/image\"" <component>` prints nothing.

- [ ] **Step 4: Verify** — Step 2 → PASS; `pnpm lint` → 0; `pnpm typecheck` → 0; `diff --strip-trailing-cr` vs portal-web shows only Edits 1–5.
- [ ] **Step 5: Commit** — `feat(county): port the School detail page`.

---

### Task 9: Full gate

- [ ] **Step 1: Desktop** — `pnpm lint && pnpm typecheck && ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run` (background). Expected: all pass except the two known pre-existing failures.
- [ ] **Step 2: Server** — `cd Nemis/apps/Server && pnpm typecheck && npx jest src/desktop-provisioning src/institutions` → exit 0.
- [ ] **Step 3: Static build** — `pnpm --filter @nemis-desktop/app build:renderer` → succeeds and lists `/government/county/schools/details` and `/government/county/schools/bulk-import`.
- [ ] **Step 4: Hand off** — final whole-branch review; merge (server first) via superpowers:finishing-a-development-branch; GUI pass (County Admin, online for photos, offline for fallbacks) is Alvin's.
