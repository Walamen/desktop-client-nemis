# Guardian Account Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a School Admin creates a student with a guardian's email on the desktop client, that guardian gets linked to their existing parent account (or a new one gets created) — matching the web app's behavior, instead of silently failing to link at all.

**Architecture:** Two repos, one feature. `desktop-client-nemis` captures the guardian's email (currently structurally impossible — the domain entity has no such field) and threads it through to the existing sync outbox unchanged. `Nemis`'s backend sync applier gains a "check the email against existing accounts before creating a row" step; when it finds a match, it marks the new row as merged into the canonical guardian (a durable Postgres column, not in-memory state — verified `DesktopSyncApplier` is reconstructed fresh per operation) and tells the device via a new `redirectedTo` field on the push result, which the desktop sync worker uses to canonicalize its local copy.

**Tech Stack:** TypeScript, Vitest (desktop-client-nemis), Jest (Nemis/apps/Server), Prisma/PostgreSQL, better-sqlite3, React.

**Spec:** `docs/superpowers/specs/2026-08-16-guardian-account-linking-design.md` (this repo)

## Global Constraints

- No live "does this email already have an account" preview UI in the desktop wizard — resolution happens only at sync-push time (spec §Non-goals).
- Both the online and offline creation cases auto-resolve silently at sync time — no manual conflict surfaced for this (spec Goals).
- Only `email` is threaded onto the `Guardian` entity for this feature — `address`/`occupation`/`isEmergencyContact` are explicitly out of scope (nothing consumes them via the repository being touched here).
- No changes to the SIS/parent-portal app.
- `Nemis` and `desktop-client-nemis` are separate git repositories living side by side under the same parent directory — each task below states which repo it's in; commit to that repo, not the other.

---

### Task 1: Domain — `Guardian` entity gains `email`

**Repo:** desktop-client-nemis

**Files:**
- Modify: `packages/domain/src/students/entities/guardian.ts`
- Test: `packages/domain/src/students/entities/guardian.test.ts` (new file — no test currently exists for this entity in isolation)

**Interfaces:**
- Produces: `Guardian.create(input: CreateGuardianInput)` and `Guardian.reconstitute(input: ReconstituteGuardianInput)`, both now accepting an optional `email?: string`; `guardian.email: string | undefined` getter.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/domain/src/students/entities/guardian.test.ts
import { describe, expect, it } from 'vitest';
import { Guardian } from './guardian';

describe('Guardian', () => {
  it('create() stores an optional email', () => {
    const guardian = Guardian.create({
      id: 'g-1',
      firstName: 'John',
      lastName: 'Doe',
      relationship: 'Father',
      phoneNumber: '0770000000',
      email: 'john@example.com',
      occurredAt: '2026-08-16T00:00:00.000Z',
    });
    expect(guardian.email).toBe('john@example.com');
  });

  it('create() leaves email undefined when not provided', () => {
    const guardian = Guardian.create({
      id: 'g-2',
      firstName: 'Jane',
      lastName: 'Doe',
      relationship: 'Mother',
      phoneNumber: '0770000001',
      occurredAt: '2026-08-16T00:00:00.000Z',
    });
    expect(guardian.email).toBeUndefined();
  });

  it('reconstitute() restores the stored email', () => {
    const guardian = Guardian.reconstitute({
      id: 'g-3',
      firstName: 'John',
      lastName: 'Doe',
      relationship: 'Father',
      phoneNumber: '0770000000',
      email: 'john@example.com',
      version: 2,
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    expect(guardian.email).toBe('john@example.com');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/domain/src/students/entities/guardian.test.ts`
Expected: FAIL — `email` does not exist on the input types / getter is undefined-typed with no matching property.

- [ ] **Step 3: Implement**

Replace the full contents of `packages/domain/src/students/entities/guardian.ts` with:

```typescript
import { AggregateRoot } from '../../core';
import { PersonName, PhoneNumber } from '../../value-objects';
import { guard } from '../../core';

export interface ReconstituteGuardianInput {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email?: string;
  version: number;
  updatedAt: string;
  lastModifiedBy?: string;
}

export interface CreateGuardianInput extends Omit<ReconstituteGuardianInput, 'version' | 'updatedAt'> {
  occurredAt: string;
}

export class Guardian extends AggregateRoot<string> {
  #name: PersonName;
  #relationship: string;
  #phone: PhoneNumber;
  #email?: string;

  private constructor(
    id: string,
    name: PersonName,
    relationship: string,
    phone: PhoneNumber,
    email: string | undefined,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#name = name;
    this.#relationship = relationship;
    this.#phone = phone;
    this.#email = email;
  }

  static reconstitute(input: ReconstituteGuardianInput): Guardian {
    return new Guardian(
      input.id,
      PersonName.create({ firstName: input.firstName, lastName: input.lastName }),
      guard.againstEmpty(input.relationship, 'relationship'),
      PhoneNumber.create(input.phoneNumber),
      input.email,
      { version: input.version, updatedAt: input.updatedAt, lastModifiedBy: input.lastModifiedBy },
    );
  }
  static create(input: CreateGuardianInput): Guardian {
    return new Guardian(input.id, PersonName.create({ firstName: input.firstName, lastName: input.lastName }), guard.againstEmpty(input.relationship, 'relationship'), PhoneNumber.create(input.phoneNumber), input.email, { version: 1, updatedAt: input.occurredAt, lastModifiedBy: input.lastModifiedBy });
  }

  get name(): PersonName {
    return this.#name;
  }
  get relationship(): string {
    return this.#relationship;
  }
  get phone(): PhoneNumber {
    return this.#phone;
  }
  get email(): string | undefined {
    return this.#email;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/domain/src/students/entities/guardian.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/students/entities/guardian.ts packages/domain/src/students/entities/guardian.test.ts
git commit -m "feat(domain): Guardian entity carries an optional email"
```

---

### Task 2: Application — `CreateGuardianDto` and `CreateGuardianUseCase` gain `email`

**Repo:** desktop-client-nemis

**Files:**
- Modify: `packages/application/src/dto/students/student-dto.ts`
- Modify: `packages/application/src/use-cases/students/create-guardian.ts`
- Test: `packages/application/src/use-cases/students/create-guardian.test.ts` (new file)

**Interfaces:**
- Consumes: `Guardian.create` from Task 1 (now accepts `email?: string`).
- Produces: `CreateGuardianDto` now has `email?: string`. `CreateGuardianUseCase.execute(dto)` passes it through unchanged otherwise.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/application/src/use-cases/students/create-guardian.test.ts
import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { Student } from '@nemis-desktop/domain';
import { CreateGuardianUseCase } from './create-guardian';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { InMemoryGuardianRepository } from '../../testing/students/in-memory-guardian-repository';
import {
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
} from '../../testing';
import { WorkflowException } from '../../exceptions';

function build() {
  const students = new InMemoryStudentRepository();
  const guardians = new InMemoryGuardianRepository();
  students.save(
    Student.create({
      id: 'stu-1',
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
      occurredAt: '2026-08-16T00:00:00.000Z',
    }),
  );
  const useCase = new CreateGuardianUseCase({
    students,
    guardians,
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-08-16T00:00:00.000Z'),
    ids: new SequentialIdGenerator('grd'),
    logger: new RecordingLogger(),
  });
  return { students, guardians, useCase };
}

describe('CreateGuardianUseCase', () => {
  it('stores the email on the created guardian', async () => {
    const { guardians, useCase } = build();
    await useCase.execute({
      studentId: 'stu-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      relationship: 'Mother',
      phoneNumber: '0770000000',
      email: 'grace@example.com',
      isPrimary: true,
    });
    expect(guardians.store.get('grd-1')?.email).toBe('grace@example.com');
  });

  it('leaves the email undefined when not supplied', async () => {
    const { guardians, useCase } = build();
    await useCase.execute({
      studentId: 'stu-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      relationship: 'Mother',
      phoneNumber: '0770000000',
      isPrimary: true,
    });
    expect(guardians.store.get('grd-1')?.email).toBeUndefined();
  });

  it('throws when the student is missing', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({
        studentId: 'nope',
        firstName: 'Grace',
        lastName: 'Hopper',
        relationship: 'Mother',
        phoneNumber: '0770000000',
        isPrimary: true,
      }),
    ).rejects.toBeInstanceOf(WorkflowException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/application/src/use-cases/students/create-guardian.test.ts`
Expected: FAIL — `email` is not an assignable property of the execute() input, or the stored guardian's email is `undefined` where a value was expected.

- [ ] **Step 3: Implement**

In `packages/application/src/dto/students/student-dto.ts`, change:

```typescript
export interface CreateGuardianDto {
  studentId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  isPrimary: boolean;
  actorId?: string;
}
```

to:

```typescript
export interface CreateGuardianDto {
  studentId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email?: string;
  isPrimary: boolean;
  actorId?: string;
}
```

In `packages/application/src/use-cases/students/create-guardian.ts`, change the `Guardian.create` call from:

```typescript
      const guardian = Guardian.create({
        id: this.deps.ids.next(),
        firstName: command.firstName,
        lastName: command.lastName,
        relationship: command.relationship,
        phoneNumber: command.phoneNumber,
        occurredAt: at,
      });
```

to:

```typescript
      const guardian = Guardian.create({
        id: this.deps.ids.next(),
        firstName: command.firstName,
        lastName: command.lastName,
        relationship: command.relationship,
        phoneNumber: command.phoneNumber,
        email: command.email,
        occurredAt: at,
      });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/application/src/use-cases/students/create-guardian.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/dto/students/student-dto.ts packages/application/src/use-cases/students/create-guardian.ts packages/application/src/use-cases/students/create-guardian.test.ts
git commit -m "feat(application): thread guardian email through CreateGuardianDto/UseCase"
```

---

### Task 3: Infrastructure — `SqliteGuardianRepository` persists and reads `email`

**Repo:** desktop-client-nemis

**Files:**
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteGuardianRepository.ts`
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteGuardianRepository.test.ts` (new file)

**Interfaces:**
- Consumes: `Guardian.create`/`.reconstitute` from Task 1, `RepositoryContext`, `createTestContext()` (existing test helper at `apps/desktop/electron/data/testing/createTestContext.ts`).
- Produces: `SqliteGuardianRepository.save`/`.findById`/`.findByStudentId` now round-trip `email`. The `guardians` SQLite column already exists (migration 004) — no migration needed here.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/desktop/electron/data/repositories/sqlite/business/SqliteGuardianRepository.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Guardian } from '@nemis-desktop/domain';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteGuardianRepository } from './SqliteGuardianRepository';

function record(id: string, overrides: Partial<Parameters<typeof Guardian.create>[0]> = {}): Guardian {
  return Guardian.create({
    id,
    firstName: 'Grace',
    lastName: 'Hopper',
    relationship: 'Mother',
    phoneNumber: '0770000000',
    occurredAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  });
}

describe('SqliteGuardianRepository', () => {
  let test: TestContext;
  let repo: SqliteGuardianRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteGuardianRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('save + findById round-trips a guardian including its email', () => {
    repo.save(record('g-1', { email: 'grace@example.com' }));
    const found = repo.findById('g-1');
    expect(found?.email).toBe('grace@example.com');
    expect(found?.name.firstName).toBe('Grace');
  });

  it('save + findById leaves email undefined when not provided', () => {
    repo.save(record('g-2'));
    expect(repo.findById('g-2')?.email).toBeUndefined();
  });

  it('findById returns null for a missing id', () => {
    expect(repo.findById('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteGuardianRepository.test.ts`
Expected: FAIL — `found?.email` is `undefined` even when a value was saved (the column is never selected/written today).

- [ ] **Step 3: Implement**

Replace the full contents of `apps/desktop/electron/data/repositories/sqlite/business/SqliteGuardianRepository.ts` with:

```typescript
import { Guardian } from '@nemis-desktop/domain';
import type { IGuardianRepository } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface Row {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string | null;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}
const map = (r: Row) =>
  Guardian.reconstitute({ ...r, email: r.email ?? undefined, lastModifiedBy: r.lastModifiedBy ?? undefined });
export class SqliteGuardianRepository implements IGuardianRepository {
  readonly #s: StatementCache;
  constructor(context: RepositoryContext) {
    this.#s = new StatementCache(context.connection);
  }
  findById(id: string): Guardian | null {
    return guarded('Guardian.findById', () => {
      const r = this.#s
        .get(
          `SELECT id, firstName, lastName, relationship, phoneNumber, email, version, updatedAt, lastModifiedBy FROM ${TableNames.guardians} WHERE id = ?`,
        )
        .get(id) as Row | undefined;
      return r ? map(r) : null;
    });
  }
  exists(id: string): boolean {
    return this.findById(id) !== null;
  }
  save(g: Guardian): void {
    guarded('Guardian.save', () =>
      this.#s
        .get(
          `INSERT INTO ${TableNames.guardians} (id, firstName, lastName, relationship, phoneNumber, email, version, updatedAt, lastModifiedBy, deviceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO UPDATE SET firstName=excluded.firstName,lastName=excluded.lastName,relationship=excluded.relationship,phoneNumber=excluded.phoneNumber,email=excluded.email,version=excluded.version,updatedAt=excluded.updatedAt,lastModifiedBy=excluded.lastModifiedBy`,
        )
        .run(
          g.id,
          g.name.firstName,
          g.name.lastName,
          g.relationship,
          g.phone.value,
          g.email ?? null,
          g.version,
          g.updatedAt,
          g.lastModifiedBy ?? null,
        ),
    );
  }
  findByStudentId(studentId: string): Guardian[] {
    return guarded('Guardian.findByStudentId', () =>
      (
        this.#s
          .get(
            `SELECT g.id, g.firstName, g.lastName, g.relationship, g.phoneNumber, g.email, g.version, g.updatedAt, g.lastModifiedBy FROM ${TableNames.guardians} g JOIN ${TableNames.studentGuardians} sg ON sg.guardianId=g.id WHERE sg.studentId=? ORDER BY sg.isPrimary DESC, g.lastName`,
          )
          .all(studentId) as Row[]
      ).map(map),
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteGuardianRepository.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/data/repositories/sqlite/business/SqliteGuardianRepository.ts apps/desktop/electron/data/repositories/sqlite/business/SqliteGuardianRepository.test.ts
git commit -m "feat(desktop): SqliteGuardianRepository persists and reads email"
```

---

### Task 4: IPC — `assertCreateGuardianArgs` accepts `email`

**Repo:** desktop-client-nemis

**Files:**
- Modify: `apps/desktop/electron/security/validateIpc.ts`
- Modify (test): `apps/desktop/electron/security/validateIpc.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `assertCreateGuardianArgs` no longer throws on a request object that includes `email`.

Context: `assertCreateGuardianArgs` validates the raw IPC payload against an explicit allow-list (`assertKnownKeys`) before it ever reaches `CreateGuardianDto` (Task 2). Without this task, the renderer sending `email` over IPC would be rejected as an unknown key.

- [ ] **Step 1: Write the failing test**

In `apps/desktop/electron/security/validateIpc.test.ts`, add `assertCreateGuardianArgs` to the existing import block (currently ends `assertGradeSubmissionArgs,\n} from './validateIpc';`) so it reads:

```typescript
import {
  assertNoArgs,
  assertSettingKeyArg,
  assertSingleIdArg,
  assertCreateAcademicYearArgs,
  assertUpdateAcademicYearArgs,
  assertSetAcademicYearStatusArgs,
  assertCreateTermArgs,
  assertUpdateTermArgs,
  assertListClassesArgs,
  assertCreateClassArgs,
  assertUpdateClassArgs,
  assertSetActiveArgs,
  assertListSubjectsArgs,
  assertCreateSubjectArgs,
  assertUpdateSubjectArgs,
  assertClassSubjectPairArgs,
  assertMoveEnrollmentClassArgs,
  assertAuthenticateArgs,
  assertAttendanceListArgs,
  assertRecordAttendanceArgs,
  assertListAssignmentsArgs,
  assertCreateAssignmentArgs,
  assertUpdateAssignmentArgs,
  assertGradeSubmissionArgs,
  assertCreateGuardianArgs,
} from './validateIpc';
```

Then add a new `describe` block anywhere after the imports:

```typescript
describe('assertCreateGuardianArgs', () => {
  it('accepts an optional email and rejects unknown keys', () => {
    expect(() =>
      assertCreateGuardianArgs([
        {
          studentId: 's-1',
          firstName: 'John',
          lastName: 'Doe',
          relationship: 'Father',
          phoneNumber: '0770000000',
          email: 'john@example.com',
          isPrimary: true,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      assertCreateGuardianArgs([
        {
          studentId: 's-1',
          firstName: 'John',
          lastName: 'Doe',
          relationship: 'Father',
          phoneNumber: '0770000000',
          isPrimary: true,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      assertCreateGuardianArgs([
        {
          studentId: 's-1',
          firstName: 'John',
          lastName: 'Doe',
          relationship: 'Father',
          phoneNumber: '0770000000',
          isPrimary: true,
          unexpected: 'nope',
        },
      ]),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/security/validateIpc.test.ts`
Expected: FAIL — the first assertion throws because `email` is not in the current allow-list.

- [ ] **Step 3: Implement**

In `apps/desktop/electron/security/validateIpc.ts`, change:

```typescript
export function assertCreateGuardianArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, [
    'studentId',
    'firstName',
    'lastName',
    'relationship',
    'phoneNumber',
    'isPrimary',
  ]);
  for (const k of ['studentId', 'firstName', 'lastName', 'relationship', 'phoneNumber'] as const)
    assertString(r[k], k, NAME_MAX_LENGTH);
  assertBoolean(r.isPrimary, 'isPrimary');
}
```

to:

```typescript
export function assertCreateGuardianArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, [
    'studentId',
    'firstName',
    'lastName',
    'relationship',
    'phoneNumber',
    'email',
    'isPrimary',
  ]);
  for (const k of ['studentId', 'firstName', 'lastName', 'relationship', 'phoneNumber'] as const)
    assertString(r[k], k, NAME_MAX_LENGTH);
  assertOptionalString(r.email, 'email', NAME_MAX_LENGTH);
  assertBoolean(r.isPrimary, 'isPrimary');
}
```

`assertOptionalString` is already defined in this file and already imported/used elsewhere in it (e.g. `assertCreateStudentArgs`) — no new import needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/desktop/electron/security/validateIpc.test.ts`
Expected: PASS (all tests in the file, including the new block)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/security/validateIpc.ts apps/desktop/electron/security/validateIpc.test.ts
git commit -m "feat(desktop): allow email on the createGuardian IPC channel"
```

---

### Task 5: UI — `StudentFormPage` wizard collects the guardian's email

**Repo:** desktop-client-nemis

**Files:**
- Modify: `apps/desktop/renderer/components/students/StudentFormPage.tsx`
- Modify (test): `apps/desktop/renderer/components/students/StudentFormPage.test.tsx`

**Interfaces:**
- Consumes: `CreateGuardianDto` from Task 2 (via `profileVm.createGuardian`, unchanged signature — presentation's `students-view-model.ts` already forwards the whole DTO, no change needed there).
- Produces: the guardian step's `email` value flows into the `createGuardian(...)` call.

- [ ] **Step 1: Write the failing test**

In `apps/desktop/renderer/components/students/StudentFormPage.test.tsx`, extend the existing wizard-submit test. Find:

```typescript
    await user.type(textboxNear(/guardian first name/i), 'John');
    await user.type(textboxNear(/guardian last name/i), 'Toe');
    await user.type(textboxNear(/relationship/i), 'Father');
    await user.type(textboxNear(/guardian phone/i), '0770000000');
    await user.click(screen.getByRole('button', { name: /next/i }));
```

and change it to:

```typescript
    await user.type(textboxNear(/guardian first name/i), 'John');
    await user.type(textboxNear(/guardian last name/i), 'Toe');
    await user.type(textboxNear(/relationship/i), 'Father');
    await user.type(textboxNear(/guardian phone/i), '0770000000');
    await user.type(textboxNear(/guardian email/i), 'john@example.com');
    await user.click(screen.getByRole('button', { name: /next/i }));
```

Then find the existing assertion:

```typescript
    await waitFor(() =>
      expect(createGuardianMock).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 's-new',
          firstName: 'John',
          lastName: 'Toe',
          relationship: 'Father',
          phoneNumber: '0770000000',
          isPrimary: true,
        }),
      ),
    );
```

and change it to:

```typescript
    await waitFor(() =>
      expect(createGuardianMock).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 's-new',
          firstName: 'John',
          lastName: 'Toe',
          relationship: 'Father',
          phoneNumber: '0770000000',
          email: 'john@example.com',
          isPrimary: true,
        }),
      ),
    );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentFormPage.test.tsx`
Expected: FAIL — `textboxNear(/guardian email/i)` finds no matching input (doesn't exist yet).

- [ ] **Step 3: Implement**

In `apps/desktop/renderer/components/students/StudentFormPage.tsx`:

1. Change the `GuardianDraft` interface (around line 19) from:

```typescript
interface GuardianDraft {
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  isPrimary: boolean;
}
```

to:

```typescript
interface GuardianDraft {
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string;
  isPrimary: boolean;
}
```

2. Update the two places a `GuardianDraft` literal is constructed — the initial `useState` (around line 49-51) and `addGuardian` (around line 56-60) — both from:

```typescript
    { firstName: '', lastName: '', relationship: '', phoneNumber: '', isPrimary: true },
```

/

```typescript
      { firstName: '', lastName: '', relationship: '', phoneNumber: '', isPrimary: false },
```

to add `email: '',` (keep each literal's own `isPrimary` value):

```typescript
    { firstName: '', lastName: '', relationship: '', phoneNumber: '', email: '', isPrimary: true },
```

```typescript
      { firstName: '', lastName: '', relationship: '', phoneNumber: '', email: '', isPrimary: false },
```

3. In `submitCreate()` (around line 117-128), change:

```typescript
    for (const g of guardians.filter(
      (guardian) => guardian.firstName && guardian.lastName && guardian.phoneNumber,
    )) {
      await profileVm.createGuardian({
        studentId: r.data.id,
        firstName: g.firstName,
        lastName: g.lastName,
        relationship: g.relationship,
        phoneNumber: g.phoneNumber,
        isPrimary: g.isPrimary,
      });
    }
```

to:

```typescript
    for (const g of guardians.filter(
      (guardian) => guardian.firstName && guardian.lastName && guardian.phoneNumber,
    )) {
      await profileVm.createGuardian({
        studentId: r.data.id,
        firstName: g.firstName,
        lastName: g.lastName,
        relationship: g.relationship,
        phoneNumber: g.phoneNumber,
        email: g.email || undefined,
        isPrimary: g.isPrimary,
      });
    }
```

4. In the `GuardianStep` component, add an email input to the grid. Change:

```typescript
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Guardian first name"
              value={g.firstName}
              onChange={(e) => updateGuardian(index, 'firstName', e.target.value)}
            />
            <Input
              label="Guardian last name"
              value={g.lastName}
              onChange={(e) => updateGuardian(index, 'lastName', e.target.value)}
            />
            <Input
              label="Relationship"
              value={g.relationship}
              onChange={(e) => updateGuardian(index, 'relationship', e.target.value)}
            />
            <Input
              label="Guardian phone"
              value={g.phoneNumber}
              onChange={(e) => updateGuardian(index, 'phoneNumber', e.target.value)}
            />
          </div>
```

to:

```typescript
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Guardian first name"
              value={g.firstName}
              onChange={(e) => updateGuardian(index, 'firstName', e.target.value)}
            />
            <Input
              label="Guardian last name"
              value={g.lastName}
              onChange={(e) => updateGuardian(index, 'lastName', e.target.value)}
            />
            <Input
              label="Relationship"
              value={g.relationship}
              onChange={(e) => updateGuardian(index, 'relationship', e.target.value)}
            />
            <Input
              label="Guardian phone"
              value={g.phoneNumber}
              onChange={(e) => updateGuardian(index, 'phoneNumber', e.target.value)}
            />
            <Input
              label="Guardian email"
              type="email"
              value={g.email}
              onChange={(e) => updateGuardian(index, 'email', e.target.value)}
            />
          </div>
```

`updateGuardian`'s signature (`(index, field: keyof GuardianDraft, value)`) already accepts `'email'` once `GuardianDraft` includes it — no change needed there.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/desktop/renderer/components/students/StudentFormPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/students/StudentFormPage.tsx apps/desktop/renderer/components/students/StudentFormPage.test.tsx
git commit -m "feat(desktop): collect guardian email in the student creation wizard"
```

---

### Task 6: Protocol — `DesktopSyncOperationResult` gains `redirectedTo`

**Repo:** desktop-client-nemis

**Files:**
- Modify: `packages/types/src/sync.ts`

**Interfaces:**
- Produces: `DesktopSyncOperationResult.redirectedTo?: string`, consumed by Task 7.

This is a pure type addition (no runtime code, no test file of its own — it's exercised by Task 7's test). Change:

```typescript
export interface DesktopSyncOperationResult {
  operationId: string;
  entityType: string;
  entityId: string;
  status: 'accepted' | 'conflict';
  reason?: string;
  remotePayload?: Readonly<Record<string, unknown>> | null;
}
```

to:

```typescript
export interface DesktopSyncOperationResult {
  operationId: string;
  entityType: string;
  entityId: string;
  status: 'accepted' | 'conflict';
  reason?: string;
  remotePayload?: Readonly<Record<string, unknown>> | null;
  /** Set when the server reused an existing record instead of creating one
   *  at `entityId` — the canonical id the local device should adopt. */
  redirectedTo?: string;
}
```

- [ ] **Step 1: Implement the change above.**

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @nemis-desktop/types typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/sync.ts
git commit -m "feat(types): add redirectedTo to DesktopSyncOperationResult"
```

---

### Task 7: Sync worker — canonicalize a redirected guardian locally

**Repo:** desktop-client-nemis

**Files:**
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.ts`
- Test: `apps/desktop/electron/sync/DesktopSyncWorker.test.ts`

**Interfaces:**
- Consumes: `DesktopSyncOperationResult.redirectedTo` from Task 6.
- Produces: `DesktopSyncWorker` (no public API change — this is internal behavior added to the existing `syncActive()` push-result handling).

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('DesktopSyncWorker retry policy', ...)` block in `apps/desktop/electron/sync/DesktopSyncWorker.test.ts` (place it near the other push-result tests, e.g. after `'leaves already-pushed items completed when the pull step fails afterwards'`):

```typescript
  it('canonicalizes a redirected guardian id locally, cascading the link and any still-queued payload', async () => {
    manager.connection.prepare(`UPDATE sync_runtime SET captureEnabled=0 WHERE id='singleton'`).run();
    manager.connection.prepare(`
      INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
      VALUES ('school-1','SCH-1','Central High','SECONDARY','PUBLIC','county-1','APPROVED',1,?)
    `).run('2026-07-01T00:00:00.000Z');
    manager.connection.prepare(`
      INSERT INTO students (id,institutionId,firstName,lastName,admissionNumber,dateOfBirth,gender,isActive,version,updatedAt)
      VALUES ('s1','school-1','Ada','Learner','ADM-1','2012-05-04','FEMALE',1,1,?)
    `).run('2026-07-01T00:00:00.000Z');
    manager.connection.prepare(`
      INSERT INTO guardians (id,firstName,lastName,relationship,phoneNumber,email,version,updatedAt)
      VALUES ('g-local','Grace','Hopper','Mother','0770000000','grace@example.com',1,?)
    `).run('2026-07-01T00:00:00.000Z');
    manager.connection.prepare(`
      INSERT INTO student_guardians (id,studentId,guardianId,isPrimary,createdAt)
      VALUES ('sg-1','s1','g-local',1,?)
    `).run('2026-07-01T00:00:00.000Z');
    // A second, not-yet-pushed link for a later sibling reusing the same
    // local guardian id — backed off to a future retry, so claim() will not
    // pick it up in this cycle (simulates a push split across cycles).
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    manager.connection.prepare(`
      INSERT INTO sync_queue (id,entityType,entityId,operationType,payload,retryCount,status,nextAttemptAt,createdAt,updatedAt)
      VALUES ('op-link-2','student_guardians','sg-2','create',?,0,'pending',?,?,?)
    `).run(
      JSON.stringify({ record: { id: 'sg-2', studentId: 's2', guardianId: 'g-local', isPrimary: 0, createdAt: '2026-08-01T00:00:00.000Z' } }),
      future,
      '2026-08-01T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
    );

    const item = await dataLayer.services.syncQueue.enqueue({
      entityType: 'guardians',
      entityId: 'g-local',
      operationType: 'create',
      payload: { record: { id: 'g-local', email: 'grace@example.com' } },
    });
    const gateway = {
      pushChanges: vi.fn().mockResolvedValue({
        processedAt: '2026-08-16T00:00:00.000Z',
        results: [
          {
            operationId: item.id,
            entityType: 'guardians',
            entityId: 'g-local',
            status: 'accepted',
            redirectedTo: 'g-canonical',
          },
        ],
      }),
      downloadSnapshot: vi.fn(),
    } as unknown as BackendProvisioningGateway;
    const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

    await worker.syncActive();

    expect(
      manager.connection.prepare(`SELECT id FROM guardians WHERE id = 'g-canonical'`).get(),
    ).toBeDefined();
    expect(
      manager.connection.prepare(`SELECT id FROM guardians WHERE id = 'g-local'`).get(),
    ).toBeUndefined();

    const linkRow = manager.connection
      .prepare(`SELECT guardianId FROM student_guardians WHERE id = 'sg-1'`)
      .get() as { guardianId: string };
    expect(linkRow.guardianId).toBe('g-canonical');

    const queuedPayload = manager.connection
      .prepare(`SELECT payload FROM sync_queue WHERE id = 'op-link-2'`)
      .get() as { payload: string };
    expect(JSON.parse(queuedPayload.payload).record.guardianId).toBe('g-canonical');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/sync/DesktopSyncWorker.test.ts -t "canonicalizes a redirected guardian"`
Expected: FAIL — the `guardians` row is still at `g-local`, the link and queued payload are unchanged.

- [ ] **Step 3: Implement**

In `apps/desktop/electron/sync/DesktopSyncWorker.ts`, add the import (alongside the existing ones at the top of the file):

```typescript
import type { Database as SqliteDatabase } from 'better-sqlite3';
```

Add a private method to the `DesktopSyncWorker` class (place it near `recoverStaleInFlight`/`releaseBackoff`, after the class's other private-ish helpers, e.g. right after `#activeWorkspaceOrNull`):

```typescript
  /**
   * A guardian create the server redirected to an existing account's
   * canonical row (see DesktopSyncApplier.guardian() in the Nemis repo) —
   * rewrite this device's local copy to match. Without this, the next
   * snapshot pull would leave the local row diverging from Postgres, and
   * any not-yet-pushed link operation still referencing the old id would
   * fail server-side once it's finally sent.
   */
  #canonicalizeGuardian(connection: SqliteDatabase, oldId: string, newId: string): void {
    if (oldId === newId) return;
    connection.prepare(`UPDATE guardians SET id = ? WHERE id = ?`).run(newId, oldId);
    connection
      .prepare(`UPDATE OR IGNORE student_guardians SET guardianId = ? WHERE guardianId = ?`)
      .run(newId, oldId);
    connection
      .prepare(
        `UPDATE sync_queue
            SET payload = json_set(payload, '$.record.guardianId', ?)
          WHERE entityType = 'student_guardians'
            AND status IN ('pending','in_flight')
            AND json_extract(payload, '$.record.guardianId') = ?`,
      )
      .run(newId, oldId);
  }
```

Then, in `syncActive()`, inside the existing `runImmediate` block that handles `pushed.results` (the one with the `for (const result of pushed.results) { if (result.status !== 'conflict') continue; ... }` loop), add a second loop for redirects right after the conflict loop's closing brace, before the final `UPDATE sync_queue SET status='completed'` call:

```typescript
        workspace.database.transactions.runImmediate(() => {
          for (const result of pushed.results) {
            if (result.status !== 'conflict') continue;
            const local = byId.get(result.operationId)?.payload;
            workspace.database.connection.prepare(`
            INSERT INTO sync_conflicts
                (id,operationId,entityType,entityId,operationType,localPayload,remotePayload,reason,status,createdAt,resolvedAt)
              VALUES (?,?,?,?,?,?,?,?,'unresolved',?,NULL)
            `).run(
              randomUUID(),
              result.operationId,
              result.entityType,
              result.entityId,
              byId.get(result.operationId)?.operationType ?? 'update',
              local == null ? null : JSON.stringify(local),
              result.remotePayload == null ? null : JSON.stringify(result.remotePayload),
              result.reason ?? 'The server rejected this offline change.',
              pushed.processedAt,
            );
          }
          for (const result of pushed.results) {
            if (result.entityType !== 'guardians' || !result.redirectedTo) continue;
            this.#canonicalizeGuardian(workspace.database.connection, result.entityId, result.redirectedTo);
          }
          workspace.database.connection.prepare(`
            UPDATE sync_queue SET status='completed',updatedAt=?
            WHERE id IN (${pushed.results.map(() => '?').join(',')})
          `).run(pushed.processedAt, ...pushed.results.map((result) => result.operationId));
        });
```

(Only the new `for` loop and its surrounding context are new — the rest of the block is shown for placement, do not otherwise change it.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/desktop/electron/sync/DesktopSyncWorker.test.ts`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/sync/DesktopSyncWorker.ts apps/desktop/electron/sync/DesktopSyncWorker.test.ts
git commit -m "feat(desktop): canonicalize locally when the server redirects a guardian"
```

---

### Task 8: Schema — `Guardian.mergedIntoGuardianId` (Postgres migration)

**Repo:** Nemis

**Files:**
- Modify: `apps/Server/prisma/schema.prisma`
- Create: `apps/Server/prisma/migrations/20260816120000_add_guardian_merge_target/migration.sql`

**Interfaces:**
- Produces: `Guardian.mergedIntoGuardianId: string | null` and its inverse relation, available to Prisma Client after regeneration — consumed by Task 10.

This is a schema/config task, not a TDD unit — its correctness is verified by `prisma validate`/`prisma generate` succeeding and by Task 10's tests (which depend on the regenerated Prisma types compiling).

- [ ] **Step 1: Edit the schema**

In `apps/Server/prisma/schema.prisma`, change the `Guardian` model from:

```prisma
model Guardian {
  id                 String               @id @default(uuid())
  firstName          String
  lastName           String
  relationship       String
  phoneNumber        String
  email              String?
  address            String?
  occupation         String?
  isEmergencyContact Boolean              @default(false)
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt
  userId             String?              @unique
  user               User?                @relation(fields: [userId], references: [id])
  notifications      ParentNotification[]
  students           StudentGuardian[]

  @@index([phoneNumber])
  @@index([userId])
  @@map("guardians")
}
```

to:

```prisma
model Guardian {
  id                   String               @id @default(uuid())
  firstName            String
  lastName             String
  relationship         String
  phoneNumber          String
  email                String?
  address              String?
  occupation           String?
  isEmergencyContact   Boolean              @default(false)
  createdAt            DateTime             @default(now())
  updatedAt            DateTime             @updatedAt
  userId               String?              @unique
  user                 User?                @relation(fields: [userId], references: [id])
  notifications        ParentNotification[]
  students             StudentGuardian[]
  // Set when a desktop-created row turns out to duplicate an existing
  // account's guardian (matched by email at sync time) — the row is kept
  // (student_guardians rows already reference it) but points here instead
  // of carrying its own userId. No uniqueness constraint: many duplicate
  // rows, across any number of admissions/devices, can legitimately point
  // at the same canonical guardian.
  mergedIntoGuardianId String?
  mergedIntoGuardian   Guardian?            @relation("GuardianMerge", fields: [mergedIntoGuardianId], references: [id], onDelete: SetNull)
  mergedGuardians      Guardian[]           @relation("GuardianMerge")

  @@index([phoneNumber])
  @@index([userId])
  @@index([mergedIntoGuardianId])
  @@map("guardians")
}
```

- [ ] **Step 2: Validate the schema**

Run: `pnpm --filter @nemis/Server exec prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 3: Write the migration SQL**

Create `apps/Server/prisma/migrations/20260816120000_add_guardian_merge_target/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "guardians" ADD COLUMN "mergedIntoGuardianId" TEXT;

-- CreateIndex
CREATE INDEX "guardians_mergedIntoGuardianId_idx" ON "guardians"("mergedIntoGuardianId");

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_mergedIntoGuardianId_fkey" FOREIGN KEY ("mergedIntoGuardianId") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate Prisma Client**

Run: `pnpm --filter @nemis/Server prisma:generate` (existing script, equivalent to `prisma generate`)
Expected: "Generated Prisma Client" with no errors. (This step makes `mergedIntoGuardianId` and `guardianProfile` typed on `Guardian`/`User` for Task 10 — it does not require a live database.)

- [ ] **Step 5: Apply the migration**

When a local Postgres dev database is available: `pnpm --filter @nemis/Server exec prisma migrate dev` (this will detect the new migration folder already matches the schema and apply it — or regenerate an equivalent one if the hand-written SQL above doesn't byte-for-byte match what Prisma would generate; if it regenerates one, keep that version instead of the hand-written draft). In CI/staging this is applied the normal way via `prisma migrate deploy` (already the project's existing `prisma:migrate` script).

- [ ] **Step 6: Commit**

```bash
git add apps/Server/prisma/schema.prisma apps/Server/prisma/migrations/20260816120000_add_guardian_merge_target
git commit -m "feat(schema): add Guardian.mergedIntoGuardianId for desktop-sync account linking"
```

---

### Task 9: Shared types — `DesktopSyncOperationResult` gains `redirectedTo` (Nemis side)

**Repo:** Nemis

**Files:**
- Modify: `packages/types/src/desktop-sync.ts`

**Interfaces:**
- Produces: `DesktopSyncOperationResult.redirectedTo?: string` — this is Nemis's own copy of the shape defined in `desktop-client-nemis`'s Task 6 (the two repos have no shared npm package; each defines this interface independently and they must be kept in sync by hand). Consumed by `SyncApplyDecision` (Task 10) via the spread `...decision` already used in `desktop-provisioning.service.ts`.

- [ ] **Step 1: Implement**

In `packages/types/src/desktop-sync.ts`, change:

```typescript
export interface DesktopSyncOperationResult {
  operationId: string;
  entityType: string;
  entityId: string;
  status: "accepted" | "conflict";
  reason?: string;
  remotePayload?: Record<string, unknown> | null;
  credential?: { email: string; defaultPassword: string };
}
```

to:

```typescript
export interface DesktopSyncOperationResult {
  operationId: string;
  entityType: string;
  entityId: string;
  status: "accepted" | "conflict";
  reason?: string;
  remotePayload?: Record<string, unknown> | null;
  credential?: { email: string; defaultPassword: string };
  redirectedTo?: string;
}
```

- [ ] **Step 2: Build the package**

Run: `pnpm --filter @nemis/types build`
Expected: succeeds, `packages/types/dist/desktop-sync.d.ts` now includes `redirectedTo`. (`apps/Server` resolves `@nemis/types` to this `dist` output — see `apps/Server/tsconfig.json` — so this build step is required before Task 10's code will typecheck.)

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/desktop-sync.ts packages/types/dist
git commit -m "feat(types): add redirectedTo to DesktopSyncOperationResult"
```

---

### Task 10: Sync applier — check-then-link instead of create-then-orphan

**Repo:** Nemis

**Files:**
- Modify: `apps/Server/src/desktop-provisioning/desktop-sync-applier.ts`
- Modify (test): `apps/Server/src/desktop-provisioning/desktop-sync-applier.spec.ts`

**Interfaces:**
- Consumes: `Guardian.mergedIntoGuardianId`/`User.guardianProfile` (Task 8), `DesktopSyncOperationResult.redirectedTo` (Task 9).
- Produces: `guardian()` returns `redirectedTo` when it redirects instead of creating a new account; `studentGuardian()` resolves through `mergedIntoGuardianId` before checking guardian existence.

- [ ] **Step 1: Write the failing tests**

In `apps/Server/src/desktop-provisioning/desktop-sync-applier.spec.ts`, **replace** the existing test `"accepts a guardian without a new account when the email is already registered (e.g. a shared parent across siblings)"` (currently asserts the old, buggy orphan-accept behavior) with these two tests in its place:

```typescript
    it("redirects to an existing guardian profile instead of creating a duplicate account", async () => {
      const guardian = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const user = {
        findUnique: jest.fn().mockResolvedValue({
          id: "existing-user-9",
          guardianProfile: { id: "guardian-profile-9" },
        }),
        create: jest.fn(),
      };
      const result = await new DesktopSyncApplier(
        { guardian, user } as unknown as PrismaService,
        adminContextWithPassword,
      ).apply(
        operation("guardians", "create", {
          record: {
            id: "entity-1",
            firstName: "Grace",
            lastName: "Hopper",
            relationship: "MOTHER",
            phoneNumber: "0770000001",
            email: "grace@example.com",
            isEmergencyContact: 0,
          },
        }),
      );
      expect(result).toEqual({ status: "accepted", redirectedTo: "guardian-profile-9" });
      expect(user.create).not.toHaveBeenCalled();
      expect(guardian.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "entity-1" } }),
      );
      expect(guardian.update).toHaveBeenCalledWith({
        where: { id: "entity-1" },
        data: { mergedIntoGuardianId: "guardian-profile-9" },
      });
    });

    it("links a guardian to an existing user account that has no guardian profile yet", async () => {
      const guardian = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const user = {
        findUnique: jest.fn().mockResolvedValue({ id: "existing-user-9", guardianProfile: null }),
        create: jest.fn(),
      };
      const result = await new DesktopSyncApplier(
        { guardian, user } as unknown as PrismaService,
        adminContextWithPassword,
      ).apply(
        operation("guardians", "create", {
          record: {
            id: "entity-1",
            firstName: "Grace",
            lastName: "Hopper",
            relationship: "MOTHER",
            phoneNumber: "0770000001",
            email: "grace@example.com",
            isEmergencyContact: 0,
          },
        }),
      );
      expect(result).toEqual({ status: "accepted" });
      expect(user.create).not.toHaveBeenCalled();
      expect(guardian.update).toHaveBeenCalledWith({
        where: { id: "entity-1" },
        data: { userId: "existing-user-9" },
      });
    });

    it("redirects instead of orphaning a row when the email registers between the pre-check and account creation", async () => {
      const guardian = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const user = {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null) // guardian()'s own pre-check
          .mockResolvedValueOnce({ id: "race-user-1" }) // createLinkedUserAccount's internal check
          .mockResolvedValueOnce({ id: "race-user-1", guardianProfile: { id: "race-profile-1" } }), // re-resolve after the catch
        create: jest.fn(),
      };
      const result = await new DesktopSyncApplier(
        { guardian, user } as unknown as PrismaService,
        adminContextWithPassword,
      ).apply(
        operation("guardians", "create", {
          record: {
            id: "entity-1",
            firstName: "Grace",
            lastName: "Hopper",
            relationship: "MOTHER",
            phoneNumber: "0770000001",
            email: "grace@example.com",
            isEmergencyContact: 0,
          },
        }),
      );
      expect(result).toEqual({ status: "accepted", redirectedTo: "race-profile-1" });
      expect(user.create).not.toHaveBeenCalled();
      expect(guardian.update).toHaveBeenCalledWith({
        where: { id: "entity-1" },
        data: { mergedIntoGuardianId: "race-profile-1" },
      });
    });
```

Then add a new `describe("studentGuardian", ...)` block (place it near the end of the file, alongside the other entity-focused tests, before the closing of the outer `describe("DesktopSyncApplier", ...)`):

```typescript
  describe("studentGuardian", () => {
    it("resolves the link to the canonical guardian when the referenced row has been merged", async () => {
      const student = { findUnique: jest.fn().mockResolvedValue({ institutionId: "school-1" }) };
      const guardian = {
        findUnique: jest.fn().mockResolvedValue({ mergedIntoGuardianId: "canonical-1" }),
      };
      const studentGuardian = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      };
      const result = await new DesktopSyncApplier(
        { student, guardian, studentGuardian } as unknown as PrismaService,
        adminContext,
      ).apply(
        operation("student_guardians", "create", {
          record: {
            id: "entity-1",
            studentId: "student-1",
            guardianId: "local-guardian-1",
            isPrimary: 1,
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        }),
      );
      expect(result).toEqual({ status: "accepted" });
      expect(studentGuardian.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ guardianId: "canonical-1" }),
          update: expect.objectContaining({ guardianId: "canonical-1" }),
        }),
      );
    });

    it("links directly to the guardian id when it has not been merged", async () => {
      const student = { findUnique: jest.fn().mockResolvedValue({ institutionId: "school-1" }) };
      const guardian = { findUnique: jest.fn().mockResolvedValue({ mergedIntoGuardianId: null }) };
      const studentGuardian = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      };
      const result = await new DesktopSyncApplier(
        { student, guardian, studentGuardian } as unknown as PrismaService,
        adminContext,
      ).apply(
        operation("student_guardians", "create", {
          record: {
            id: "entity-1",
            studentId: "student-1",
            guardianId: "guardian-1",
            isPrimary: 0,
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        }),
      );
      expect(result).toEqual({ status: "accepted" });
      expect(studentGuardian.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ guardianId: "guardian-1" }) }),
      );
    });

    it("still rejects a link to a guardian that does not exist at all", async () => {
      const student = { findUnique: jest.fn().mockResolvedValue({ institutionId: "school-1" }) };
      const guardian = { findUnique: jest.fn().mockResolvedValue(null) };
      const studentGuardian = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() };
      const result = await new DesktopSyncApplier(
        { student, guardian, studentGuardian } as unknown as PrismaService,
        adminContext,
      ).apply(
        operation("student_guardians", "create", {
          record: {
            id: "entity-1",
            studentId: "student-1",
            guardianId: "missing-guardian",
            isPrimary: 0,
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        }),
      );
      expect(result).toEqual({
        status: "conflict",
        reason: "Guardian link references a missing guardian.",
        remotePayload: null,
      });
      expect(studentGuardian.upsert).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nemis/Server test -- desktop-sync-applier`
Expected: FAIL — `redirectedTo` is absent from results; the merged-row resolution isn't implemented; `guardian.update` isn't called with `userId`/`mergedIntoGuardianId` as expected.

- [ ] **Step 3: Implement**

In `apps/Server/src/desktop-provisioning/desktop-sync-applier.ts`:

1. Add `redirectedTo` to `SyncApplyDecision`:

```typescript
export interface SyncApplyDecision {
  status: "accepted" | "conflict";
  reason?: string;
  remotePayload?: Record<string, unknown> | null;
  credential?: { email: string; defaultPassword: string };
  redirectedTo?: string;
}
```

2. Replace the `guardian()` method's post-upsert account-creation block. The method currently reads (from `const data = {` through the end of the method):

```typescript
    const data = {
      firstName: required(record, "firstName"),
      lastName: required(record, "lastName"),
      relationship: required(record, "relationship"),
      phoneNumber: required(record, "phoneNumber"),
      email: nullableString(record.email),
      address: nullableString(record.address),
      occupation: nullableString(record.occupation),
      isEmergencyContact: bool(record.isEmergencyContact),
    };
    await this.prisma.guardian.upsert({
      where: { id: operation.entityId },
      create: { id: operation.entityId, ...data },
      update: data,
    });
    const [institutionId] = this.context.institutionIds;
    if (remote === null && data.email && institutionId) {
      try {
        const { userId, credential } = await this.createLinkedUserAccount({
          role: SystemRole.PARENT,
          institutionId,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          email: data.email,
        });
        await this.prisma.guardian.update({
          where: { id: operation.entityId },
          data: { userId },
        });
        return { ...accepted(), credential };
      } catch (error) {
        // Unlike staff/student, the same email legitimately recurring
        // across guardians is expected — one parent can (and often does)
        // appear on multiple children's records, and each desktop-side
        // create for that parent mints its own independent Guardian row.
        // A second row hitting an already-registered email must not
        // permanently fail the whole sync operation (which would also
        // cascade into an FK failure on the student_guardians link that
        // depends on this row existing) — just accept the guardian
        // without a new login account.
        if (error instanceof EmailAlreadyRegisteredError) {
          return accepted();
        }
        throw error;
      }
    }
    return accepted();
  }
```

Replace it with:

```typescript
    const data = {
      firstName: required(record, "firstName"),
      lastName: required(record, "lastName"),
      relationship: required(record, "relationship"),
      phoneNumber: required(record, "phoneNumber"),
      email: nullableString(record.email),
      address: nullableString(record.address),
      occupation: nullableString(record.occupation),
      isEmergencyContact: bool(record.isEmergencyContact),
    };
    await this.prisma.guardian.upsert({
      where: { id: operation.entityId },
      create: { id: operation.entityId, ...data },
      update: data,
    });
    const [institutionId] = this.context.institutionIds;
    if (remote === null && data.email && institutionId) {
      const email = data.email.toLowerCase();
      // Unlike staff/student, the same email legitimately recurring across
      // guardians is expected — one parent can (and often does) appear on
      // multiple children's records, and each desktop-side create for that
      // parent mints its own independent Guardian row. Check first, like
      // the web app's POST /students does, instead of creating then
      // catching a duplicate-email failure: a matching existing account
      // means this row should point at that account's canonical guardian
      // (or, if it has none yet, adopt that account directly) rather than
      // mint a second, disconnected login.
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        include: { guardianProfile: { select: { id: true } } },
      });
      if (existingUser?.guardianProfile) {
        await this.prisma.guardian.update({
          where: { id: operation.entityId },
          data: { mergedIntoGuardianId: existingUser.guardianProfile.id },
        });
        return { ...accepted(), redirectedTo: existingUser.guardianProfile.id };
      }
      if (existingUser) {
        // A User already owns this email but has never been a guardian
        // before (e.g. registered as staff elsewhere) — link this row to
        // that account directly; there is no new password to hand back.
        await this.prisma.guardian.update({
          where: { id: operation.entityId },
          data: { userId: existingUser.id },
        });
        return accepted();
      }
      try {
        const { userId, credential } = await this.createLinkedUserAccount({
          role: SystemRole.PARENT,
          institutionId,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          email: data.email,
        });
        await this.prisma.guardian.update({
          where: { id: operation.entityId },
          data: { userId },
        });
        return { ...accepted(), credential };
      } catch (error) {
        // Race: the email became registered between the pre-check above and
        // createLinkedUserAccount's own check. Re-resolve and redirect
        // exactly like the pre-checked path, instead of orphaning this row.
        if (error instanceof EmailAlreadyRegisteredError) {
          const now = await this.prisma.user.findUnique({
            where: { email },
            include: { guardianProfile: { select: { id: true } } },
          });
          if (now?.guardianProfile) {
            await this.prisma.guardian.update({
              where: { id: operation.entityId },
              data: { mergedIntoGuardianId: now.guardianProfile.id },
            });
            return { ...accepted(), redirectedTo: now.guardianProfile.id };
          }
          if (now) {
            await this.prisma.guardian.update({
              where: { id: operation.entityId },
              data: { userId: now.id },
            });
          }
          return accepted();
        }
        throw error;
      }
    }
    return accepted();
  }
```

3. Replace the `studentGuardian()` method's guardian-existence check. It currently reads:

```typescript
    const studentId = required(record, "studentId");
    const guardianId = required(record, "guardianId");
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student || !this.inScope(student.institutionId))
      return conflict("Guardian link student is outside the authorized scope.");
    if (
      !(await this.prisma.guardian.findUnique({ where: { id: guardianId } }))
    ) {
      return conflict("Guardian link references a missing guardian.");
    }
    await this.prisma.studentGuardian.upsert({
      where: { id: operation.entityId },
      create: {
        id: operation.entityId,
        studentId,
        guardianId,
        isPrimary: bool(record.isPrimary),
        createdAt: optionalDate(record.createdAt) ?? new Date(),
      },
      update: { studentId, guardianId, isPrimary: bool(record.isPrimary) },
    });
    return accepted();
  }
```

Replace it with:

```typescript
    const studentId = required(record, "studentId");
    const rawGuardianId = required(record, "guardianId");
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student || !this.inScope(student.institutionId))
      return conflict("Guardian link student is outside the authorized scope.");
    const guardianRow = await this.prisma.guardian.findUnique({
      where: { id: rawGuardianId },
      select: { mergedIntoGuardianId: true },
    });
    if (!guardianRow) {
      return conflict("Guardian link references a missing guardian.");
    }
    // The referenced guardian row may itself have been redirected to an
    // existing account's canonical guardian (see guardian() above) — always
    // link against the canonical id, never the merged-away one.
    const guardianId = guardianRow.mergedIntoGuardianId ?? rawGuardianId;
    await this.prisma.studentGuardian.upsert({
      where: { id: operation.entityId },
      create: {
        id: operation.entityId,
        studentId,
        guardianId,
        isPrimary: bool(record.isPrimary),
        createdAt: optionalDate(record.createdAt) ?? new Date(),
      },
      update: { studentId, guardianId, isPrimary: bool(record.isPrimary) },
    });
    return accepted();
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nemis/Server test -- desktop-sync-applier`
Expected: PASS — every test in the file, including the pre-existing ones (the "creates a linked User account for every guardian with an email" and "does not create a User account for a guardian without an email" tests are unmodified and must stay green).

- [ ] **Step 5: Commit**

```bash
git add apps/Server/src/desktop-provisioning/desktop-sync-applier.ts apps/Server/src/desktop-provisioning/desktop-sync-applier.spec.ts
git commit -m "fix(sync): link desktop-created guardians to existing accounts instead of orphaning them"
```

---

## Final verification (both repos)

- [ ] In `desktop-client-nemis`: run `pnpm vitest run` (full suite) and confirm no regressions beyond this feature's new/changed tests.
- [ ] In `Nemis`: run `pnpm --filter @nemis/Server test` (full suite) and confirm no regressions.
- [ ] Manually trace the scenario from the original report: create student A with guardian email `parent@example.com` (no prior account) → confirm a credential is returned and `mergedIntoGuardianId` is not set on that row. Create student B (different admission) with a guardian using the *same* email → confirm the new local row ends up canonicalized to A's guardian id locally (`guardians` table) and both `student_guardians` rows reference the same canonical id in Postgres.
