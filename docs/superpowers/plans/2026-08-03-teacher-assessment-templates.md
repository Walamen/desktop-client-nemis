# Teacher Weighted Assessment Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the web app's weighted assessment-template gradebook (`Nemis/apps/portal-web/.../grades/` + `.../grades/templates/`) to the desktop teacher Gradebook, replacing its fixed CA/Test columns, fully offline.

**Architecture:** Two new Prisma-backed collections (`assessmentTemplates`/`assessments`) flow through the existing desktop provisioning-snapshot + generic offline-collection-bridge + sync-outbox pipeline established for `grades` and, this session, `staffDirectory`/`institutionAdmin`. All business rules the web NestJS backend enforces server-side are re-expressed either as a new `desktop-sync-applier.ts` case (server-side push validation) or as renderer-side logic (client-side UX/locking), matching how `grade_entry_windows` locking already works on desktop.

**Tech Stack:** NestJS + Prisma (`Nemis/apps/Server`), Electron + better-sqlite3 (`desktop-client-nemis/apps/desktop/electron`), Next.js renderer + Zustand-backed presentation layer, `recharts` (new dependency) for the weight pie chart.

## Global Constraints

- Final grade formula: weighted percentage `Σ (score/totalMarks × weight)`, used consistently on-screen and for the submitted grade (desktop deliberately does NOT replicate web's `submitPeriodGrades` bug, which ignores `weight`).
- Full feature parity with web: template CRUD (single + bulk + copy-to-subject + pie chart), publish/unpublish, and the Summary & Submit tab are all in scope — not a reduced core.
- Exam periods (`MIDTERM_EXAM`/`FINAL_EXAM`) are untouched.
- Every write goes through the existing offline-first contract: write to SQLite immediately, queue via the existing outbox-trigger mechanism, sync in background. No new sync mechanism.
- Follow the exact file-list pattern already used for `staffDirectory`/`institutionAdmin` this session (backend type → backend query/scope → desktop type → desktop migration/SPECS → `SchoolAdminModuleService` registration) for both new collections.
- Full design detail lives in `docs/superpowers/specs/2026-08-03-teacher-assessment-templates-design.md` — consult it for anything this plan doesn't spell out.

---

## Task 1: Backend — provision `assessmentTemplates` and `assessments` in the snapshot

**Files:**
- Modify: `Nemis/packages/types/src/desktop-provisioning.ts`
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts`
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`

**Interfaces:**
- Produces: `DesktopProvisioningData.assessmentTemplates: Record<string, unknown>[]` (fields: `id, classId, subjectId, name, type, totalMarks, weight, date, createdAt, updatedAt`) and `DesktopProvisioningData.assessments: Record<string, unknown>[]` (fields: `id, templateId, classId, subjectId, gradingPeriodId, name, type, totalMarks, weight, date, createdAt, updatedAt`) — both scoped to the caller's own `classIds`/`subjectIds` for TEACHER-scoped devices, unrestricted (full institution) for INSTITUTION_ADMIN-scoped devices.

- [ ] **Step 1: Add both fields to `DesktopProvisioningData`**

In `Nemis/packages/types/src/desktop-provisioning.ts`, add right after the `staffDirectory` field (keep its existing JSDoc comment untouched):

```ts
  /** Reusable, weighted assessment definitions a teacher sets up per class+
   * subject (e.g. "Quiz 1", 20% weight, 20 marks) — desktop mirror of
   * Prisma's AssessmentTemplate. Scoped to the caller's own classes/subjects
   * for TEACHER devices in restrictTeacherSnapshot, same as `classes`. */
  assessmentTemplates: Record<string, unknown>[];
  /** A template applied to one grading period — desktop mirror of Prisma's
   * Assessment. Grades reference `assessments.id` via `grades.assessmentId`,
   * not `assessmentTemplates.id` directly. Same scoping as
   * assessmentTemplates. */
  assessments: Record<string, unknown>[];
```

- [ ] **Step 2: Rebuild `@nemis/types`**

Run: `cd Nemis/packages/types && npx tsc`
Expected: no output (clean build).

- [ ] **Step 3: Add both Prisma queries to the snapshot transaction**

In `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts`, add `assessmentTemplates` and `assessments` to the destructured `Promise.all` result array — insert them right after `classSubjects` in both the destructuring list (around line 136) and the query array (right after the `tx.classSubject.findMany(...)` call, around line 201):

```ts
          tx.assessmentTemplate.findMany({
            where: { class: { institutionId: institutionWhere }, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
          tx.assessment.findMany({
            where: { class: { institutionId: institutionWhere }, ...sinceFilter(since) },
            orderBy: { id: "asc" },
          }),
```

- [ ] **Step 4: Map both into the returned `data` object**

In the same file, add both mappings right after the existing `classSubjects: classSubjects.map(...)` block in the transaction's returned object literal:

```ts
          assessmentTemplates: assessmentTemplates.map((row) => ({
            id: row.id,
            classId: row.classId,
            subjectId: row.subjectId,
            name: row.name,
            type: row.type,
            totalMarks: row.totalMarks,
            weight: row.weight,
            date: row.date.toISOString(),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          })),
          assessments: assessments.map((row) => ({
            id: row.id,
            templateId: row.templateId,
            classId: row.classId,
            subjectId: row.subjectId,
            gradingPeriodId: row.gradingPeriodId,
            name: row.name,
            type: row.type,
            totalMarks: row.totalMarks,
            weight: row.weight,
            date: row.date.toISOString(),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          })),
```

- [ ] **Step 5: Scope both in `restrictTeacherSnapshot`**

In the same file, inside `restrictTeacherSnapshot`, add both filters right after the existing `classSubjects` filter (which uses the already-computed `classIds`/`subjectIds` sets):

```ts
    assessmentTemplates: data.assessmentTemplates.filter(
      (row) =>
        classIds.has(String(row.classId)) &&
        subjectIds.has(String(row.subjectId)),
    ),
    assessments: data.assessments.filter(
      (row) =>
        classIds.has(String(row.classId)) &&
        subjectIds.has(String(row.subjectId)),
    ),
```

- [ ] **Step 6: Write the failing test**

In `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`, extend the existing `"restricts \`staff\` to the signed-in teacher but keeps \`staffDirectory\` institution-wide"` test's `tx` mock object: add `assessmentTemplate` and `assessment` entries alongside the existing `staff` entry, and extend the assertions at the end of that test. Full updated test body (the `tx` object and assertions — everything else in the test file stays as-is):

```ts
    const templateRows = [
      { id: 'template-1', classId: 'class-1', subjectId: 'sub-1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: new Date('2026-02-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') },
      { id: 'template-2', classId: 'class-2', subjectId: 'sub-2', name: 'Not this class', type: 'QUIZ', totalMarks: 20, weight: 20, date: new Date('2026-02-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') },
    ];
    const assessmentRows = [
      { id: 'assessment-1', templateId: 'template-1', classId: 'class-1', subjectId: 'sub-1', gradingPeriodId: 'period-1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: new Date('2026-02-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') },
    ];
```

Add `classTeacher: { findMany: jest.fn().mockResolvedValue([{ id: 'ct-1', classId: 'class-1', staffId: 'staff-1' }]) }` and `classSubjectTeacher: { findMany: jest.fn().mockResolvedValue([{ id: 'cst-1', classId: 'class-1', subjectId: 'sub-1', staffId: 'staff-1' }]) }` to the `tx` mock (replacing their `emptyFind` entries — these are what actually populate `classIds`/`subjectIds` for the TEACHER scope filter, so they must return real rows or the new filters have nothing to keep), and add:

```ts
      assessmentTemplate: { findMany: jest.fn().mockResolvedValue(templateRows) },
      assessment: { findMany: jest.fn().mockResolvedValue(assessmentRows) },
```

to the `tx` mock object (replacing their `emptyFind` placeholders). Then append to the end of the test, before its closing `});`:

```ts
    expect(snapshot.data.assessmentTemplates).toHaveLength(1);
    expect((snapshot.data.assessmentTemplates[0] as { id: string }).id).toBe('template-1');
    expect(snapshot.data.assessments).toHaveLength(1);
    expect((snapshot.data.assessments[0] as { id: string }).id).toBe('assessment-1');
```

- [ ] **Step 7: Run the test**

Run: `cd Nemis/apps/Server && npx jest src/desktop-provisioning/desktop-provisioning.service.spec.ts`
Expected: all tests pass, including the extended one.

- [ ] **Step 8: Typecheck**

Run: `cd Nemis/apps/Server && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Lint**

Run: `cd Nemis/apps/Server && npx eslint src/desktop-provisioning/desktop-provisioning.service.ts src/desktop-provisioning/desktop-provisioning.service.spec.ts`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add Nemis/packages/types/src/desktop-provisioning.ts Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts
git commit -m "feat(provisioning): add assessmentTemplates/assessments to the desktop snapshot"
```

---

## Task 2: Backend — sync-push handler for `assessment_templates`

**Files:**
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.ts`
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.spec.ts`

**Interfaces:**
- Consumes: none from other tasks (standalone backend change).
- Produces: `DesktopSyncApplier` accepts `entityType: "assessment_templates"` push operations for `INSTITUTION_ADMIN` and `TEACHER` roles, upserting/deleting `AssessmentTemplate` rows with class/subject-assignment validation. Later tasks (5, 6) rely on this accepting a record shaped `{ id, classId, subjectId, name, type, totalMarks, weight, date }`.

- [ ] **Step 1: Add `AssessmentType` to the Prisma import**

In `Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.ts`, change the top import:

```ts
import { AssessmentType, Prisma, SystemRole } from "@prisma/client";
```

- [ ] **Step 2: Add a shared teacher-assignment helper**

Add this private method to `DesktopSyncApplier`, right after the existing `classAndSubjectInScope` method (around line 654):

```ts
  private async teacherAssignedToClassSubject(
    classId: string,
    subjectId: string,
  ): Promise<boolean> {
    if (this.context.role !== SystemRole.TEACHER) return true;
    const assigned = await this.prisma.staff.findFirst({
      where: {
        userId: this.context.userId,
        classSubjectTeachers: { some: { classId, subjectId } },
      },
      select: { id: true },
    });
    return Boolean(assigned);
  }
```

- [ ] **Step 3: Add the `assessment_templates` case to `existingInScope`**

In `existingInScope`'s switch, add right after the existing `case "class_subjects":` block:

```ts
      case "assessment_templates": {
        const row = await this.prisma.assessmentTemplate.findUnique({
          where: { id: entityId },
          select: { class: { select: { institutionId: true } } },
        });
        return row ? this.inScope(row.class.institutionId) : null;
      }
```

- [ ] **Step 4: Register the entity type in `roleAllowed` and the main `apply()` switch**

In `apply()`'s `roleAllowed` map, add `"assessment_templates"` to both the `INSTITUTION_ADMIN` set (alongside `"class_subjects"`) and the `TEACHER` set (alongside `"grades"`). In the `switch (operation.entityType)` block right below it, add:

```ts
        case "assessment_templates":
          return await this.assessmentTemplate(operation);
```

- [ ] **Step 5: Write the failing test — accepted create**

In `Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.spec.ts`, add:

```ts
  it("lets a teacher create an assessment template for their own class and subject", async () => {
    const assessmentTemplate = {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const schoolClass = {
      findUnique: jest.fn().mockResolvedValue({ institutionId: "school-1" }),
    };
    const subject = {
      findUnique: jest.fn().mockResolvedValue({ institutionId: "school-1" }),
    };
    const staff = { findFirst: jest.fn().mockResolvedValue({ id: "staff-1" }) };
    const result = await new DesktopSyncApplier(
      { assessmentTemplate, class: schoolClass, subject, staff } as unknown as PrismaService,
      { userId: "teacher-1", role: "TEACHER", scopeType: "TEACHER", institutionIds: new Set(["school-1"]) },
    ).apply(
      operation("assessment_templates", "create", {
        record: {
          id: "entity-1",
          classId: "class-1",
          subjectId: "subject-1",
          name: "Quiz 1",
          type: "QUIZ",
          totalMarks: 20,
          weight: 20,
          date: "2026-02-01T00:00:00.000Z",
        },
      }),
    );
    expect(result).toEqual({ status: "accepted" });
    expect(assessmentTemplate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "entity-1" },
        create: expect.objectContaining({ id: "entity-1", classId: "class-1", subjectId: "subject-1", name: "Quiz 1" }),
      }),
    );
  });

  it("rejects an assessment template for a class/subject the teacher isn't assigned to", async () => {
    const assessmentTemplate = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() };
    const schoolClass = { findUnique: jest.fn().mockResolvedValue({ institutionId: "school-1" }) };
    const subject = { findUnique: jest.fn().mockResolvedValue({ institutionId: "school-1" }) };
    const staff = { findFirst: jest.fn().mockResolvedValue(null) };
    const result = await new DesktopSyncApplier(
      { assessmentTemplate, class: schoolClass, subject, staff } as unknown as PrismaService,
      { userId: "teacher-1", role: "TEACHER", scopeType: "TEACHER", institutionIds: new Set(["school-1"]) },
    ).apply(
      operation("assessment_templates", "create", {
        record: { id: "entity-1", classId: "class-1", subjectId: "subject-1", name: "Quiz 1", type: "QUIZ", totalMarks: 20, weight: 20, date: "2026-02-01T00:00:00.000Z" },
      }),
    );
    expect(result).toEqual({ status: "conflict", reason: "The class and subject are not assigned to this teacher.", remotePayload: null });
    expect(assessmentTemplate.upsert).not.toHaveBeenCalled();
  });

  it("rejects deleting an assessment template that already has recorded assessments", async () => {
    const assessmentTemplate = {
      findUnique: jest.fn().mockResolvedValue({
        id: "entity-1",
        classId: "class-1",
        subjectId: "subject-1",
        class: { institutionId: "school-1" },
        _count: { assessments: 2 },
      }),
      delete: jest.fn(),
    };
    const staff = { findFirst: jest.fn().mockResolvedValue({ id: "staff-1" }) };
    const result = await new DesktopSyncApplier(
      { assessmentTemplate, staff } as unknown as PrismaService,
      { userId: "teacher-1", role: "TEACHER", scopeType: "TEACHER", institutionIds: new Set(["school-1"]) },
    ).apply(operation("assessment_templates", "delete", {}));
    expect(result).toEqual({
      status: "conflict",
      reason: "Cannot delete a template that has recorded grades. Delete the grades first.",
      remotePayload: null,
    });
    expect(assessmentTemplate.delete).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd Nemis/apps/Server && npx jest src/desktop-provisioning/desktop-sync-applier.spec.ts -t "assessment template"`
Expected: FAIL — `this.assessmentTemplate is not a function` (method doesn't exist yet).

- [ ] **Step 7: Implement the `assessmentTemplate` handler**

Add this private method to `DesktopSyncApplier`, right after the existing `grade` method:

```ts
  private async assessmentTemplate(
    operation: Operation,
  ): Promise<SyncApplyDecision> {
    const { base, record } = payload(operation);
    const remote = await this.prisma.assessmentTemplate.findUnique({
      where: { id: operation.entityId },
      include: { class: true, _count: { select: { assessments: true } } },
    });
    const decision = mutationDecision(operation, remote, base);
    if (decision) return decision;
    if (operation.operationType === "delete") {
      if (!remote) return accepted();
      if (!this.inScope(remote.class.institutionId)) {
        return conflict("Assessment template is outside the authorized scope.");
      }
      if (
        !(await this.teacherAssignedToClassSubject(
          remote.classId,
          remote.subjectId,
        ))
      ) {
        return conflict("The class and subject are not assigned to this teacher.");
      }
      if (remote._count.assessments > 0) {
        return conflict(
          "Cannot delete a template that has recorded grades. Delete the grades first.",
        );
      }
      await this.prisma.assessmentTemplate.delete({ where: { id: remote.id } });
      return accepted();
    }
    const classId = required(record, "classId");
    const subjectId = required(record, "subjectId");
    if (!(await this.classAndSubjectInScope(classId, subjectId))) {
      return conflict(
        "Class and subject must belong to the authorized institution scope.",
      );
    }
    if (!(await this.teacherAssignedToClassSubject(classId, subjectId))) {
      return conflict("The class and subject are not assigned to this teacher.");
    }
    const data = {
      classId,
      subjectId,
      name: required(record, "name"),
      type: required(record, "type") as AssessmentType,
      totalMarks: number(record.totalMarks),
      weight: nullableNumber(record.weight),
      date: requiredDate(record, "date"),
    };
    await this.prisma.assessmentTemplate.upsert({
      where: { id: operation.entityId },
      create: { id: operation.entityId, ...data },
      update: data,
    });
    return accepted();
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd Nemis/apps/Server && npx jest src/desktop-provisioning/desktop-sync-applier.spec.ts`
Expected: all tests pass (existing + 3 new).

- [ ] **Step 9: Typecheck and lint**

Run: `cd Nemis/apps/Server && npx tsc --noEmit -p tsconfig.json && npx eslint src/desktop-provisioning/desktop-sync-applier.ts src/desktop-provisioning/desktop-sync-applier.spec.ts`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.ts Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.spec.ts
git commit -m "feat(sync): validate and apply assessment_templates push operations"
```

---

## Task 3: Backend — sync-push handler for `assessments`

**Files:**
- Modify: `Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.ts`
- Test: `Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.spec.ts`

**Interfaces:**
- Consumes: `teacherAssignedToClassSubject` from Task 2.
- Produces: `DesktopSyncApplier` accepts `entityType: "assessments"` create/update push operations, validating the `templateId` belongs to a template the caller is assigned to. Delete is explicitly unsupported (no UI ever triggers it — see spec's Non-goals). Task 4/13 (the renderer's materialize-on-save flow) depends on create working with a record shaped `{ id, templateId, classId, subjectId, gradingPeriodId, name, type, totalMarks, weight, date }`.

- [ ] **Step 1: Add the `assessments` case to `existingInScope`**

Right after the new `case "assessment_templates":` block from Task 2:

```ts
      case "assessments": {
        const row = await this.prisma.assessment.findUnique({
          where: { id: entityId },
          select: { class: { select: { institutionId: true } } },
        });
        return row ? this.inScope(row.class.institutionId) : null;
      }
```

- [ ] **Step 2: Register in `roleAllowed` and the `apply()` switch**

Add `"assessments"` to the `INSTITUTION_ADMIN` and `TEACHER` sets in `roleAllowed` (alongside the `"assessment_templates"` entry from Task 2), and add to the switch:

```ts
        case "assessments":
          return await this.assessmentInstance(operation);
```

(Named `assessmentInstance` rather than `assessment` to avoid colliding with the unrelated `Assignment`-model handling elsewhere in this file, and to read clearly at the call site.)

- [ ] **Step 3: Write the failing tests**

Add to `desktop-sync-applier.spec.ts`:

```ts
  it("lets a teacher materialize an assessment instance from their own template", async () => {
    const assessment = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) };
    const assessmentTemplate = {
      findUnique: jest.fn().mockResolvedValue({ id: "template-1", classId: "class-1", subjectId: "subject-1", class: { institutionId: "school-1" } }),
    };
    const schoolClass = { findUnique: jest.fn().mockResolvedValue({ institutionId: "school-1" }) };
    const subject = { findUnique: jest.fn().mockResolvedValue({ institutionId: "school-1" }) };
    const staff = { findFirst: jest.fn().mockResolvedValue({ id: "staff-1" }) };
    const result = await new DesktopSyncApplier(
      { assessment, assessmentTemplate, class: schoolClass, subject, staff } as unknown as PrismaService,
      { userId: "teacher-1", role: "TEACHER", scopeType: "TEACHER", institutionIds: new Set(["school-1"]) },
    ).apply(
      operation("assessments", "create", {
        record: {
          id: "entity-1",
          templateId: "template-1",
          classId: "class-1",
          subjectId: "subject-1",
          gradingPeriodId: "period-1",
          name: "Quiz 1",
          type: "QUIZ",
          totalMarks: 20,
          weight: 20,
          date: "2026-02-01T00:00:00.000Z",
        },
      }),
    );
    expect(result).toEqual({ status: "accepted" });
    expect(assessment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "entity-1" },
        create: expect.objectContaining({ id: "entity-1", templateId: "template-1", gradingPeriodId: "period-1" }),
      }),
    );
  });

  it("rejects an assessment instance whose templateId belongs to someone else", async () => {
    const assessment = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() };
    const assessmentTemplate = { findUnique: jest.fn().mockResolvedValue(null) };
    const result = await new DesktopSyncApplier(
      { assessment, assessmentTemplate } as unknown as PrismaService,
      { userId: "teacher-1", role: "TEACHER", scopeType: "TEACHER", institutionIds: new Set(["school-1"]) },
    ).apply(
      operation("assessments", "create", {
        record: { id: "entity-1", templateId: "missing-template", classId: "class-1", subjectId: "subject-1", gradingPeriodId: "period-1", name: "Quiz 1", type: "QUIZ", totalMarks: 20, weight: 20, date: "2026-02-01T00:00:00.000Z" },
      }),
    );
    expect(result).toEqual({ status: "conflict", reason: "Assessment template not found.", remotePayload: null });
    expect(assessment.upsert).not.toHaveBeenCalled();
  });

  it("rejects deleting an assessment instance", async () => {
    const assessment = { findUnique: jest.fn().mockResolvedValue({ id: "entity-1", class: { institutionId: "school-1" } }) };
    const result = await new DesktopSyncApplier(
      { assessment } as unknown as PrismaService,
      { userId: "admin-1", role: "INSTITUTION_ADMIN", scopeType: "INSTITUTION", institutionIds: new Set(["school-1"]) },
    ).apply(operation("assessments", "delete", {}));
    expect(result).toEqual({ status: "conflict", reason: "Assessment instances cannot be deleted.", remotePayload: null });
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd Nemis/apps/Server && npx jest src/desktop-provisioning/desktop-sync-applier.spec.ts -t "assessment instance"`
Expected: FAIL — `this.assessmentInstance is not a function`.

- [ ] **Step 5: Implement the `assessmentInstance` handler**

Add right after the `assessmentTemplate` method from Task 2:

```ts
  private async assessmentInstance(
    operation: Operation,
  ): Promise<SyncApplyDecision> {
    if (operation.operationType === "delete") {
      return conflict("Assessment instances cannot be deleted.");
    }
    const { base, record } = payload(operation);
    const remote = await this.prisma.assessment.findUnique({
      where: { id: operation.entityId },
    });
    const decision = mutationDecision(operation, remote, base);
    if (decision) return decision;
    const templateId = required(record, "templateId");
    const template = await this.prisma.assessmentTemplate.findUnique({
      where: { id: templateId },
      include: { class: true },
    });
    if (!template) return conflict("Assessment template not found.");
    if (!this.inScope(template.class.institutionId)) {
      return conflict("Assessment template is outside the authorized scope.");
    }
    if (
      !(await this.teacherAssignedToClassSubject(
        template.classId,
        template.subjectId,
      ))
    ) {
      return conflict("The class and subject are not assigned to this teacher.");
    }
    const data = {
      templateId,
      classId: required(record, "classId"),
      subjectId: required(record, "subjectId"),
      gradingPeriodId: required(record, "gradingPeriodId"),
      name: required(record, "name"),
      type: required(record, "type") as AssessmentType,
      totalMarks: number(record.totalMarks),
      weight: nullableNumber(record.weight),
      date: requiredDate(record, "date"),
    };
    await this.prisma.assessment.upsert({
      where: { id: operation.entityId },
      create: { id: operation.entityId, ...data },
      update: data,
    });
    return accepted();
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd Nemis/apps/Server && npx jest src/desktop-provisioning/desktop-sync-applier.spec.ts`
Expected: all tests pass (existing + 6 new from Tasks 2-3).

- [ ] **Step 7: Typecheck and lint**

Run: `cd Nemis/apps/Server && npx tsc --noEmit -p tsconfig.json && npx eslint src/desktop-provisioning/desktop-sync-applier.ts src/desktop-provisioning/desktop-sync-applier.spec.ts`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.ts Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.spec.ts
git commit -m "feat(sync): validate and apply assessments push operations"
```

---

## Task 4: Desktop — `assessment_templates` table, provisioning, and generic-collection registration

**Files:**
- Modify: `desktop-client-nemis/packages/types/src/provisioning.ts`
- Modify: `desktop-client-nemis/packages/types/src/school-admin.ts`
- Create: `desktop-client-nemis/apps/desktop/electron/database/migrations/016-create-assessment-templates-table.ts`
- Modify: `desktop-client-nemis/apps/desktop/electron/database/migrations/registry.ts`
- Modify: `desktop-client-nemis/apps/desktop/electron/provisioning/ProvisioningImporter.ts`
- Modify: `desktop-client-nemis/apps/desktop/electron/data/services/SchoolAdminModuleService.ts`

**Interfaces:**
- Consumes: none from other desktop tasks (mirrors the `staffDirectory` plumbing pattern already in this codebase).
- Produces: `sharedBridge.listSchoolAdminRecords({ collection: 'assessment_templates' })` and `.saveSchoolAdminRecord(...)`/`.deleteSchoolAdminRecord(...)` become usable from the renderer for `TEACHER` and `INSTITUTION_ADMIN` roles. Task 6 depends on this.

- [ ] **Step 1: Add to `PROVISIONING_COLLECTIONS`**

In `packages/types/src/provisioning.ts`, add `'assessmentTemplates'` right after `'institutionAdmin'` in the array. Order doesn't need to match `desktop-provisioning.ts`'s field order — this array only drives iteration, not display — but keeping it adjacent to the other `staff`-cluster entries is fine for readability:

```ts
  'studentGuardians', 'enrollments', 'attendance', 'staff', 'staffDirectory', 'institutionAdmin', 'assessmentTemplates', 'subjectTeachers',
```

- [ ] **Step 2: Add to `SCHOOL_ADMIN_COLLECTIONS`**

In `packages/types/src/school-admin.ts`, add `'assessment_templates'` to the array (snake_case, matching the SQLite table name):

```ts
  'staff',
  'staff_directory',
  'institution_admin',
  'assessment_templates',
  'classes',
```

- [ ] **Step 3: Write the migration**

Create `apps/desktop/electron/database/migrations/016-create-assessment-templates-table.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/** Reusable, weighted assessment definitions a teacher sets up per class+
 * subject — desktop mirror of Prisma's AssessmentTemplate. Writable by the
 * teacher who owns the class/subject; synced up via the standard outbox
 * mechanism, validated server-side in desktop-sync-applier.ts. */
export const createAssessmentTemplatesTable: Migration = {
  version: 16,
  name: 'create-assessment-templates-table',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE assessment_templates (
        id TEXT PRIMARY KEY,
        classId TEXT NOT NULL REFERENCES classes (id),
        subjectId TEXT NOT NULL REFERENCES subjects (id),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        totalMarks REAL NOT NULL,
        weight REAL,
        date TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_assessment_templates_scope ON assessment_templates (classId, subjectId);
    `);
    installOutboxTriggers(db, ['assessment_templates']);
  },
};
```

- [ ] **Step 4: Register the migration**

In `apps/desktop/electron/database/migrations/registry.ts`, add the import after `createInstitutionAdminTable`'s:

```ts
import { createAssessmentTemplatesTable } from './016-create-assessment-templates-table';
```

And add `createAssessmentTemplatesTable,` to the end of the `migrations` array.

- [ ] **Step 5: Add the `ProvisioningImporter` SPECS entry**

In `apps/desktop/electron/provisioning/ProvisioningImporter.ts`, add to the `SPECS` object, right after the `institutionAdmin:` entry:

```ts
  assessmentTemplates: spec('assessment_templates', ['id','classId','subjectId','name','type','totalMarks','weight','date','createdAt','updatedAt']),
```

Also add to the `verifyDatabase` dependency-check array, right after the `institution_admin` entry:

```ts
    ['assessment_templates', 'classId', 'classes'],
```

- [ ] **Step 6: Register in `SchoolAdminModuleService`**

In `apps/desktop/electron/data/services/SchoolAdminModuleService.ts`:

Add to `CONFIG`, right after `institution_admin:`:

```ts
  assessment_templates: { columns: [], scope: 'institution' },
```

Add `'assessment_templates'` to `ROLE_READ_COLLECTIONS.TEACHER`'s set (right after `'institution_admin'`) and to `ROLE_WRITE_COLLECTIONS.TEACHER`'s set (which currently reads `new Set(['grades', 'messages', 'user_notifications'])` — add `'assessment_templates'` there too).

- [ ] **Step 7: Typecheck**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (This will fail with a missing-SPECS-entry error if Step 5 is skipped — `SPECS` is typed `Record<ProvisioningCollection, TableSpec>`, so TypeScript enforces every collection has an entry.)

- [ ] **Step 8: Lint**

Run: `cd desktop-client-nemis && npx eslint apps/desktop/electron/database/migrations/016-create-assessment-templates-table.ts apps/desktop/electron/database/migrations/registry.ts apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/data/services/SchoolAdminModuleService.ts packages/types/src/provisioning.ts packages/types/src/school-admin.ts`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/types/src/provisioning.ts packages/types/src/school-admin.ts apps/desktop/electron/database/migrations/016-create-assessment-templates-table.ts apps/desktop/electron/database/migrations/registry.ts apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/data/services/SchoolAdminModuleService.ts
git commit -m "feat(desktop): add assessment_templates collection, table, and TEACHER read/write access"
```

---

## Task 5: Desktop — `assessments` table, provisioning, and generic-collection registration

**Files:**
- Modify: `desktop-client-nemis/packages/types/src/provisioning.ts`
- Modify: `desktop-client-nemis/packages/types/src/school-admin.ts`
- Create: `desktop-client-nemis/apps/desktop/electron/database/migrations/017-create-assessments-table.ts`
- Modify: `desktop-client-nemis/apps/desktop/electron/database/migrations/registry.ts`
- Modify: `desktop-client-nemis/apps/desktop/electron/provisioning/ProvisioningImporter.ts`
- Modify: `desktop-client-nemis/apps/desktop/electron/data/services/SchoolAdminModuleService.ts`

**Interfaces:**
- Consumes: `assessment_templates` table from Task 4 (FK reference only, no code dependency).
- Produces: `sharedBridge.listSchoolAdminRecords({ collection: 'assessments' })` / `.saveSchoolAdminRecord(...)` usable for `TEACHER`/`INSTITUTION_ADMIN`. Task 6's materialize-on-save helper depends on this.

This task is the exact same shape as Task 4, one collection later. Repeat each step:

- [ ] **Step 1: Add `'assessments'` to `PROVISIONING_COLLECTIONS`** (right after `'assessmentTemplates'` from Task 4).

- [ ] **Step 2: Add `'assessments'` to `SCHOOL_ADMIN_COLLECTIONS`** (right after `'assessment_templates'`).

- [ ] **Step 3: Write the migration** — create `apps/desktop/electron/database/migrations/017-create-assessments-table.ts`:

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/** A single grading period's application of an assessment_templates row —
 * desktop mirror of Prisma's Assessment. `grades.assessmentId` references
 * this table's `id`, not assessment_templates' — see the renderer's
 * materialize-on-save helper in components/academic-grading/assessments.ts.
 * Created directly by the teacher (never by an admin), and never deleted
 * once created — see desktop-sync-applier.ts's assessmentInstance handler. */
export const createAssessmentsTable: Migration = {
  version: 17,
  name: 'create-assessments-table',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE assessments (
        id TEXT PRIMARY KEY,
        templateId TEXT NOT NULL REFERENCES assessment_templates (id),
        classId TEXT NOT NULL REFERENCES classes (id),
        subjectId TEXT NOT NULL REFERENCES subjects (id),
        gradingPeriodId TEXT NOT NULL REFERENCES grading_periods (id),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        totalMarks REAL NOT NULL,
        weight REAL,
        date TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(templateId, gradingPeriodId)
      );
      CREATE INDEX idx_assessments_scope ON assessments (classId, subjectId, gradingPeriodId);
    `);
    installOutboxTriggers(db, ['assessments']);
  },
};
```

- [ ] **Step 4: Register the migration** — in `registry.ts`, add `import { createAssessmentsTable } from './017-create-assessments-table';` after Task 4's import, and `createAssessmentsTable,` at the end of the `migrations` array.

- [ ] **Step 5: Add the SPECS entry** — in `ProvisioningImporter.ts`, right after Task 4's `assessmentTemplates:` entry:

```ts
  assessments: spec('assessments', ['id','templateId','classId','subjectId','gradingPeriodId','name','type','totalMarks','weight','date','createdAt','updatedAt']),
```

And to `verifyDatabase`'s dependency array, right after Task 4's entry:

```ts
    ['assessments', 'templateId', 'assessment_templates'],
```

- [ ] **Step 6: Register in `SchoolAdminModuleService`** — `CONFIG` entry `assessments: { columns: [], scope: 'institution' },` right after `assessment_templates:`; add `'assessments'` to both `ROLE_READ_COLLECTIONS.TEACHER` and `ROLE_WRITE_COLLECTIONS.TEACHER`.

- [ ] **Step 7: Typecheck**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Lint**

Run: `cd desktop-client-nemis && npx eslint apps/desktop/electron/database/migrations/017-create-assessments-table.ts apps/desktop/electron/database/migrations/registry.ts apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/data/services/SchoolAdminModuleService.ts packages/types/src/provisioning.ts packages/types/src/school-admin.ts`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/types/src/provisioning.ts packages/types/src/school-admin.ts apps/desktop/electron/database/migrations/017-create-assessments-table.ts apps/desktop/electron/database/migrations/registry.ts apps/desktop/electron/provisioning/ProvisioningImporter.ts apps/desktop/electron/data/services/SchoolAdminModuleService.ts
git commit -m "feat(desktop): add assessments collection, table, and TEACHER read/write access"
```

---

## Task 6: Desktop — shared assessment/template helpers and weighted-grade math

**Files:**
- Create: `desktop-client-nemis/apps/desktop/renderer/components/academic-grading/assessments.ts`
- Test: `desktop-client-nemis/apps/desktop/renderer/components/academic-grading/assessments.test.ts`

**Interfaces:**
- Consumes: `sharedBridge.listSchoolAdminRecords`/`.saveSchoolAdminRecord` (from `@/services/nemis-bridge/shared`), `SchoolAdminRecord` type (from `@nemis-desktop/types`) — both already used by the existing `apps/desktop/renderer/components/academic-grading/shared.tsx`.
- Produces (consumed by Tasks 8, 12, 14):
  - `interface AssessmentTemplateRow { id: string; classId: string; subjectId: string; name: string; type: string; totalMarks: number; weight: number | null; date: string }`
  - `toAssessmentTemplateRow(r: SchoolAdminRecord): AssessmentTemplateRow`
  - `listTemplatesForSubject(classId: string, subjectId: string): Promise<AssessmentTemplateRow[]>`
  - `interface AssessmentInstanceRow { id: string; templateId: string; classId: string; subjectId: string; gradingPeriodId: string }`
  - `listAssessmentsForPeriod(classId: string, subjectId: string, gradingPeriodId: string): Promise<AssessmentInstanceRow[]>`
  - `materializeAssessment(template: AssessmentTemplateRow, gradingPeriodId: string): Promise<string>` — returns the assessment instance id, creating it if absent.
  - `weightedPercentage(scores: ReadonlyMap<string, number | null>, templates: readonly AssessmentTemplateRow[]): number | null` — `Σ (score/totalMarks × weight)`, `null` if no scores.
  - `totalWeight(templates: readonly AssessmentTemplateRow[]): number` — `Σ weight` (treating `null` as `0`).

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/renderer/components/academic-grading/assessments.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listAssessmentsForPeriod,
  listTemplatesForSubject,
  materializeAssessment,
  toAssessmentTemplateRow,
  totalWeight,
  weightedPercentage,
} from './assessments';

function installMock(collections: Record<string, unknown[]>) {
  (window as unknown as { nemis: unknown }).nemis = {
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => ({
        items: collections[request.collection] ?? [],
        total: (collections[request.collection] ?? []).length,
      })),
      save: vi.fn(async (request: { collection: string; record: Record<string, unknown> }) => ({
        id: 'generated-id',
        ...request.record,
      })),
    },
  };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('toAssessmentTemplateRow', () => {
  it('maps a raw record, defaulting a missing weight to null', () => {
    const row = toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: null, date: '2026-02-01' });
    expect(row).toEqual({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: null, date: '2026-02-01' });
  });
});

describe('listTemplatesForSubject', () => {
  it('filters the class+subject client-side, matching listPeriodsForTerm\'s pattern', async () => {
    installMock({
      assessment_templates: [
        { id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' },
        { id: 't2', classId: 'c1', subjectId: 's2', name: 'Not this subject', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' },
      ],
    });
    const rows = await listTemplatesForSubject('c1', 's1');
    expect(rows.map((r) => r.id)).toEqual(['t1']);
  });
});

describe('listAssessmentsForPeriod', () => {
  it('filters by class+subject+gradingPeriodId', async () => {
    installMock({
      assessments: [
        { id: 'a1', templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p1' },
        { id: 'a2', templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p2' },
      ],
    });
    const rows = await listAssessmentsForPeriod('c1', 's1', 'p1');
    expect(rows.map((r) => r.id)).toEqual(['a1']);
  });
});

describe('materializeAssessment', () => {
  it('returns the existing assessment id when one already exists for this template+period', async () => {
    installMock({
      assessments: [{ id: 'existing-1', templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p1' }],
    });
    const template = toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' });
    const id = await materializeAssessment(template, 'p1');
    expect(id).toBe('existing-1');
    const nemis = (window as unknown as { nemis: { schoolAdmin: { save: ReturnType<typeof vi.fn> } } }).nemis;
    expect(nemis.schoolAdmin.save).not.toHaveBeenCalled();
  });

  it('creates a new assessment instance when none exists yet', async () => {
    installMock({ assessments: [] });
    const template = toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' });
    const id = await materializeAssessment(template, 'p1');
    expect(id).toBe('generated-id');
    const nemis = (window as unknown as { nemis: { schoolAdmin: { save: ReturnType<typeof vi.fn> } } }).nemis;
    expect(nemis.schoolAdmin.save).toHaveBeenCalledWith({
      collection: 'assessments',
      record: { templateId: 't1', classId: 'c1', subjectId: 's1', gradingPeriodId: 'p1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 20, date: '2026-02-01' },
    });
  });
});

describe('weightedPercentage', () => {
  const templates = [
    toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz', type: 'QUIZ', totalMarks: 20, weight: 40, date: '2026-02-01' }),
    toAssessmentTemplateRow({ id: 't2', classId: 'c1', subjectId: 's1', name: 'Test', type: 'TEST', totalMarks: 50, weight: 60, date: '2026-02-01' }),
  ];

  it('computes the sum of (score/totalMarks * weight) across templates', () => {
    const scores = new Map([['t1', 16], ['t2', 40]]); // 16/20*40=32, 40/50*60=48 -> 80
    expect(weightedPercentage(scores, templates)).toBe(80);
  });

  it('returns null when no scores are entered', () => {
    expect(weightedPercentage(new Map(), templates)).toBeNull();
  });

  it('skips templates with no score entered rather than treating them as zero', () => {
    const scores = new Map([['t1', 20]]); // only t1 scored: 20/20*40 = 40
    expect(weightedPercentage(scores, templates)).toBe(40);
  });
});

describe('totalWeight', () => {
  it('sums weight across templates, treating null as 0', () => {
    const templates = [
      toAssessmentTemplateRow({ id: 't1', classId: 'c1', subjectId: 's1', name: 'Quiz', type: 'QUIZ', totalMarks: 20, weight: 40, date: '2026-02-01' }),
      toAssessmentTemplateRow({ id: 't2', classId: 'c1', subjectId: 's1', name: 'Test', type: 'TEST', totalMarks: 50, weight: null, date: '2026-02-01' }),
    ];
    expect(totalWeight(templates)).toBe(40);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/components/academic-grading/assessments.test.ts`
Expected: FAIL — `Cannot find module './assessments'`.

- [ ] **Step 3: Implement the helpers**

Create `apps/desktop/renderer/components/academic-grading/assessments.ts`:

```ts
import { sharedBridge } from '@/services/nemis-bridge/shared';
import type { SchoolAdminRecord } from '@nemis-desktop/types';

export interface AssessmentTemplateRow {
  id: string;
  classId: string;
  subjectId: string;
  name: string;
  type: string;
  totalMarks: number;
  weight: number | null;
  date: string;
}

export interface AssessmentInstanceRow {
  id: string;
  templateId: string;
  classId: string;
  subjectId: string;
  gradingPeriodId: string;
}

export function toAssessmentTemplateRow(r: SchoolAdminRecord): AssessmentTemplateRow {
  return {
    id: String(r.id),
    classId: String(r.classId),
    subjectId: String(r.subjectId),
    name: String(r.name),
    type: String(r.type),
    totalMarks: Number(r.totalMarks),
    weight: r.weight != null ? Number(r.weight) : null,
    date: String(r.date),
  };
}

function toAssessmentInstanceRow(r: SchoolAdminRecord): AssessmentInstanceRow {
  return {
    id: String(r.id),
    templateId: String(r.templateId),
    classId: String(r.classId),
    subjectId: String(r.subjectId),
    gradingPeriodId: String(r.gradingPeriodId),
  };
}

/** Same client-side-filter approach as listPeriodsForTerm/listAllWindows in
 * shared.tsx — the generic offline collection API has no server-side filter
 * beyond collection + pagination. */
export async function listTemplatesForSubject(
  classId: string,
  subjectId: string,
): Promise<AssessmentTemplateRow[]> {
  const result = await sharedBridge.listSchoolAdminRecords({ collection: 'assessment_templates', limit: 250 });
  return result.items
    .filter((item) => item.classId === classId && item.subjectId === subjectId)
    .map(toAssessmentTemplateRow);
}

export async function listAssessmentsForPeriod(
  classId: string,
  subjectId: string,
  gradingPeriodId: string,
): Promise<AssessmentInstanceRow[]> {
  const result = await sharedBridge.listSchoolAdminRecords({ collection: 'assessments', limit: 250 });
  return result.items
    .filter(
      (item) =>
        item.classId === classId &&
        item.subjectId === subjectId &&
        item.gradingPeriodId === gradingPeriodId,
    )
    .map(toAssessmentInstanceRow);
}

/** Finds or creates the Assessment instance for this template+period —
 * desktop's two-step stand-in for the web backend's atomic
 * `Assessment.upsert` inside saveAssessmentScores. See the design doc's
 * "Materializing an Assessment instance offline" section. */
export async function materializeAssessment(
  template: AssessmentTemplateRow,
  gradingPeriodId: string,
): Promise<string> {
  const existing = await listAssessmentsForPeriod(template.classId, template.subjectId, gradingPeriodId);
  const match = existing.find((row) => row.templateId === template.id);
  if (match) return match.id;
  const created = await sharedBridge.saveSchoolAdminRecord({
    collection: 'assessments',
    record: {
      templateId: template.id,
      classId: template.classId,
      subjectId: template.subjectId,
      gradingPeriodId,
      name: template.name,
      type: template.type,
      totalMarks: template.totalMarks,
      weight: template.weight,
      date: template.date,
    },
  });
  return String(created.id);
}

/** Σ (score/totalMarks × weight) across every template the student has a
 * score for — templates with no score entered are skipped, not treated as
 * zero (matches the running-total display, not a penalty for ungraded
 * work). Returns null when nothing has been scored yet. */
export function weightedPercentage(
  scores: ReadonlyMap<string, number | null>,
  templates: readonly AssessmentTemplateRow[],
): number | null {
  let sum = 0;
  let hasScore = false;
  for (const template of templates) {
    const score = scores.get(template.id);
    if (score == null || template.totalMarks <= 0) continue;
    hasScore = true;
    sum += (score / template.totalMarks) * (template.weight ?? 0);
  }
  return hasScore ? Math.round(sum * 100) / 100 : null;
}

export function totalWeight(templates: readonly AssessmentTemplateRow[]): number {
  return templates.reduce((sum, t) => sum + (t.weight ?? 0), 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/components/academic-grading/assessments.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck and lint**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json`
Run: `cd desktop-client-nemis && npx eslint apps/desktop/renderer/components/academic-grading/assessments.ts apps/desktop/renderer/components/academic-grading/assessments.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/components/academic-grading/assessments.ts apps/desktop/renderer/components/academic-grading/assessments.test.ts
git commit -m "feat(desktop): add assessment-template helpers and weighted-grade math"
```

---

## Task 7: Desktop — Assessment Setup page skeleton (class/subject picker, template list, pie chart)

**Files:**
- Modify: `desktop-client-nemis/apps/desktop/package.json` (add `recharts`)
- Create: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx`

**Interfaces:**
- Consumes: `listTemplatesForSubject`, `AssessmentTemplateRow`, `totalWeight` (Task 6); `useTeachingAssignmentViewModel`/`useCurrentUserViewModel` (existing, same pattern as `grades/page.tsx`); `sharedBridge` for the `staff` self-id lookup (same pattern as `grades/page.tsx`).
- Produces: route `/government/teacher/grades/templates`, rendering the picker + list + pie chart. Tasks 8-10 add the drawer/bulk-create/copy-to-subject on top of this same file.

- [ ] **Step 1: Add the `recharts` dependency**

Run: `cd desktop-client-nemis && npm install recharts --workspace=apps/desktop`
Expected: `recharts` appears in `apps/desktop/package.json`'s `dependencies`.

- [ ] **Step 2: Create the page with the picker, list, and pie chart**

Create `apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Hash, Plus } from 'lucide-react';
import { Card, Button, Spinner } from '@nemis-desktop/ui';
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useTeachingAssignmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { useViewModel } from '@/hooks/use-view-model';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { rows } from '@/components/teachers/shared';
import {
  type AssessmentTemplateRow,
  listTemplatesForSubject,
  totalWeight,
} from '@/components/academic-grading/assessments';

const CHART_COLORS = ['#000e21', '#26556A', '#146316', '#a6731c', '#8099A8', '#c10021'];

interface ClassOption {
  classId: string;
  label: string;
  subjects: { id: string; name: string }[];
}

/** Teacher's per-class/subject weighted assessment template setup — mirrors
 * portal-web's grades/templates/page.tsx. Templates are reusable
 * definitions (see design doc); scoring them per grading period happens on
 * the main Gradebook page, not here. */
export default function AssessmentSetupPage() {
  const currentUser = useCurrentUserViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const assignments = useViewModel(teachingAssignments.store, (s) => s.assignments);

  const userId = user.status === 'success' ? user.data.id : undefined;
  const [staffId, setStaffId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void sharedBridge.listSchoolAdminRecords({ collection: 'staff', limit: 250 }).then((result) => {
      if (cancelled) return;
      const mine = result.items.find((r) => r.userId === userId);
      setStaffId(mine ? String(mine.id) : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (staffId && assignments.status === 'idle') void teachingAssignments.load(staffId);
  }, [staffId, assignments.status, teachingAssignments]);

  const myClasses = useMemo<ClassOption[]>(() => {
    if (assignments.status !== 'success' && assignments.status !== 'refreshing') return [];
    const byClass = new Map<string, ClassOption>();
    for (const a of assignments.data) {
      const existing = byClass.get(a.classId);
      const label = `${a.className}${a.section ? ` — ${a.section}` : ''}`;
      if (existing) {
        if (a.subjectId && a.subjectName && !existing.subjects.some((s) => s.id === a.subjectId)) {
          existing.subjects.push({ id: a.subjectId, name: a.subjectName });
        }
      } else {
        byClass.set(a.classId, {
          classId: a.classId,
          label,
          subjects: a.subjectId && a.subjectName ? [{ id: a.subjectId, name: a.subjectName }] : [],
        });
      }
    }
    return Array.from(byClass.values());
  }, [assignments]);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const selectedClass = myClasses.find((c) => c.classId === selectedClassId);

  const [templates, setTemplates] = useState<AssessmentTemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!selectedClassId || !selectedSubjectId) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    setLoadingTemplates(true);
    void listTemplatesForSubject(selectedClassId, selectedSubjectId).then((rows_) => {
      if (cancelled) return;
      setTemplates(rows_);
      setLoadingTemplates(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedClassId, selectedSubjectId, reloadToken]);

  const weight = totalWeight(templates);
  const isWeightValid = Math.abs(weight - 100) < 0.01;

  const chartData = useMemo(() => {
    const data = templates.map((t) => ({ name: t.name, value: t.weight ?? 0 }));
    if (weight < 100) data.push({ name: 'Unassigned', value: 100 - weight });
    return data;
  }, [templates, weight]);

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setSelectedSubjectId('');
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              >
                <option value="">Choose a class</option>
                {myClasses.map((cls) => (
                  <option key={cls.classId} value={cls.classId}>{cls.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                disabled={!selectedClassId}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-secondary disabled:bg-slate-100"
              >
                <option value="">Choose a subject</option>
                {(selectedClass?.subjects ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {!selectedClassId || !selectedSubjectId ? (
          <Card>
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-lg">
              <p className="text-slate-500">Select a class and subject to manage assessments.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <Card title="Weight Distribution">
                <div className="h-64 w-full">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {chartData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={entry.name === 'Unassigned' ? '#E0E0E0' : CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 text-center">
                  <h3 className={`text-2xl font-bold ${isWeightValid ? 'text-active' : 'text-pending'}`}>
                    {weight.toFixed(1)}%
                  </h3>
                  <p className="text-sm text-slate-600">Total Weight Assigned</p>
                  {!isWeightValid ? (
                    <p className="text-xs text-pending mt-1 flex items-center justify-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Total weight should be 100%.
                    </p>
                  ) : (
                    <p className="text-xs text-active mt-1 flex items-center justify-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Weight distribution is valid.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card title={`Assessments (${templates.length})`}>
                <div className="flex justify-end mb-3">
                  <Button onClick={() => setReloadToken((t) => t + 1)} variant="secondary">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Assessment
                  </Button>
                </div>
                {loadingTemplates ? (
                  <div className="flex justify-center py-12"><Spinner size="lg" /></div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
                    <p className="text-slate-500">No assessments found.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {templates.map((template) => (
                      <div key={template.id} className="flex items-start justify-between p-3 rounded-md border border-slate-300">
                        <div>
                          <h4 className="font-semibold text-slate-800">{template.name}</h4>
                          <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                            <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {template.totalMarks} marks</span>
                            {template.weight != null && <span className="font-medium text-primary">{template.weight}%</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

This skeleton's "Add Assessment" button is a placeholder that just reloads until Task 8 wires up the real drawer — that's expected at this checkpoint, not a plan violation, since Task 8 replaces this exact button's `onClick`.

- [ ] **Step 3: Typecheck**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

Run the app (`npm run dev` from `apps/desktop`, or whatever this repo's existing dev script is), sign in as a TEACHER, navigate to `/government/teacher/grades/templates`, and confirm the class/subject pickers populate and the empty state renders without a console error.

- [ ] **Step 5: Lint**

Run: `cd desktop-client-nemis && npx eslint apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx
git commit -m "feat(desktop): add Assessment Setup page skeleton with weight pie chart"
```

---

## Task 8: Desktop — Assessment Setup: create/edit drawer

**Files:**
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx`
- Test: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`

**Interfaces:**
- Consumes: `Drawer` from `@nemis-desktop/ui`; `sharedBridge.saveSchoolAdminRecord`/`.deleteSchoolAdminRecord`.
- Produces: single-template create/edit fully working. Task 9 (bulk-create) and Task 10 (copy-to-subject) extend the same drawer state in this file.

- [ ] **Step 1: Add drawer state, the assessment-type list, and the single-edit form**

In `templates/page.tsx`, add these imports:

```tsx
import { Edit2, Trash2 } from 'lucide-react';
import { Drawer } from '@nemis-desktop/ui';
```

Add this constant near the top of the file, after `CHART_COLORS`:

```tsx
const ASSESSMENT_TYPES = [
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'TEST', label: 'Test' },
  { value: 'ASSIGNMENT', label: 'Assignment' },
  { value: 'LAB', label: 'Lab' },
  { value: 'PRACTICAL', label: 'Practical' },
];

interface TemplateFormData {
  name: string;
  type: string;
  totalMarks: string;
  weight: string;
  date: string;
}

function emptyFormData(): TemplateFormData {
  return { name: '', type: 'QUIZ', totalMarks: '', weight: '', date: new Date().toISOString().slice(0, 10) };
}
```

Inside the `AssessmentSetupPage` component, replace the `const [reloadToken, setReloadToken] = useState(0);` line's neighborhood by adding:

```tsx
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(emptyFormData());
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFormData(emptyFormData());
    setEditingId(null);
    setIsDrawerOpen(false);
  };

  const handleEdit = (template: AssessmentTemplateRow) => {
    setEditingId(template.id);
    setFormData({
      name: template.name,
      type: template.type,
      totalMarks: String(template.totalMarks),
      weight: template.weight != null ? String(template.weight) : '',
      date: template.date.slice(0, 10),
    });
    setIsDrawerOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await sharedBridge.saveSchoolAdminRecord({
        collection: 'assessment_templates',
        record: {
          ...(editingId ? { id: editingId } : {}),
          classId: selectedClassId,
          subjectId: selectedSubjectId,
          name: formData.name,
          type: formData.type,
          totalMarks: Number(formData.totalMarks),
          weight: formData.weight ? Number(formData.weight) : null,
          date: formData.date,
        },
      });
      resetForm();
      setReloadToken((t) => t + 1);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await sharedBridge.deleteSchoolAdminRecord({ collection: 'assessment_templates', id });
    setReloadToken((t) => t + 1);
  };
```

Replace the "Add Assessment" button's `onClick` (from Task 7) with:

```tsx
                  <Button onClick={() => { setEditingId(null); setFormData(emptyFormData()); setIsDrawerOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Assessment
                  </Button>
```

Add Edit/Delete buttons to each template row (inside the `.map((template) => ...)` block from Task 7, right after the closing `</div>` of the marks/weight row):

```tsx
                        <div className="flex items-center gap-1">
                          <Button variant="secondary" size="sm" onClick={() => handleEdit(template)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => void handleDelete(template.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
```

Add the `Drawer` at the end of the component's returned JSX, right before the final closing `</div>` of the outermost `min-h-full` div:

```tsx
        <Drawer
          isOpen={isDrawerOpen}
          onClose={resetForm}
          title={editingId ? 'Edit Assessment' : 'Add Assessment'}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>Cancel</Button>
              <Button type="submit" form="assessment-template-form" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Assessment' : 'Create Assessment'}
              </Button>
            </div>
          }
        >
          <form id="assessment-template-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Quiz 1, Midterm Exam"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {ASSESSMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Total Marks *</label>
              <input
                type="number"
                value={formData.totalMarks}
                onChange={(e) => setFormData({ ...formData, totalMarks: e.target.value })}
                min="0"
                step="0.1"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Weight (%)</label>
              <input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                min="0"
                max="100"
                step="0.1"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </form>
        </Drawer>
```

- [ ] **Step 2: Write the regression test**

Create `apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import AssessmentSetupPage from './page';

const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';

function installBaseMock() {
  const templates: Record<string, unknown>[] = [];
  (window as unknown as { nemis: unknown }).nemis = {
    identity: { getCurrentUser: vi.fn(async () => ({ id: USER_ID, fullName: 'Jane Doe', email: 'jane@example.com', isActive: true, roles: ['TEACHER'] })) },
    device: { getInfo: vi.fn(async () => null) },
    school: { getSummary: vi.fn(async () => null) },
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    term: { getCurrent: vi.fn(async () => null) },
    teacher: {
      getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })),
      listAssignments: vi.fn(async (id: string) => (id === STAFF_ID ? [
        { id: 'a1', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: 'sub-1', subjectName: 'Mathematics', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
      ] : [])),
    },
    student: { list: vi.fn(async () => ({ items: [], total: 0, limit: 1, offset: 0 })) },
    attendance: { list: vi.fn(async () => []) },
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => {
        if (request.collection === 'staff') return { items: [{ id: STAFF_ID, userId: USER_ID }], total: 1 };
        if (request.collection === 'assessment_templates') return { items: templates, total: templates.length };
        return { items: [], total: 0 };
      }),
      save: vi.fn(async (request: { collection: string; record: Record<string, unknown> }) => {
        const record = { id: request.record.id ?? `template-${templates.length + 1}`, ...request.record };
        const existingIndex = templates.findIndex((t) => t.id === record.id);
        if (existingIndex >= 0) templates[existingIndex] = record;
        else templates.push(record);
        return record;
      }),
      delete: vi.fn(async (request: { id: string }) => {
        const index = templates.findIndex((t) => t.id === request.id);
        if (index >= 0) templates.splice(index, 1);
        return { id: request.id };
      }),
    },
  };
  return (window as unknown as { nemis: { schoolAdmin: { save: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } } }).nemis;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('Assessment Setup page', () => {
  it('creates, edits, and deletes a template for the selected class/subject', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <AssessmentSetupPage />
      </PresentationProvider>,
    );

    const [classSelect, subjectSelect] = await screen.findAllByRole('combobox');
    fireEvent.change(classSelect!, { target: { value: 'class-1' } });
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });

    fireEvent.click(await screen.findByText('Add Assessment'));
    fireEvent.change(screen.getByPlaceholderText('e.g., Quiz 1, Midterm Exam'), { target: { value: 'Quiz 1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /total marks/i }) ?? screen.getAllByRole('spinbutton')[0]!, { target: { value: '20' } });
    fireEvent.click(screen.getByText('Create Assessment'));

    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'assessment_templates', record: expect.objectContaining({ name: 'Quiz 1', classId: 'class-1', subjectId: 'sub-1' }) }),
    ));
    expect(await screen.findByText('Quiz 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Quiz 1').closest('div')!.parentElement!.querySelector('button')!);
    await waitFor(() => expect(screen.getByDisplayValue('Quiz 1')).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run the test**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`
Expected: PASS. If the DOM-query steps for "click edit" are brittle against your exact rendered markup, simplify that assertion to just verifying `handleEdit`'s effect (`screen.getByDisplayValue('Quiz 1')`) is reachable after clicking the first `Edit2`-icon button in the template row — adjust the selector to match what actually renders, this is expected iteration during implementation, not a plan defect.

- [ ] **Step 4: Typecheck and lint**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json`
Run: `cd desktop-client-nemis && npx eslint apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx
git commit -m "feat(desktop): add create/edit/delete drawer to Assessment Setup"
```

---

## Task 9: Desktop — Assessment Setup: bulk-create table

**Files:**
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx`
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`

**Interfaces:**
- Consumes: drawer state from Task 8.
- Produces: bulk-create mode on the same drawer (toggled by `editingId === null`, matching web's drawer content switch), one `saveSchoolAdminRecord` call per valid row.

- [ ] **Step 1: Add bulk-row state and validation**

Add near `TemplateFormData`/`emptyFormData` in `templates/page.tsx`:

```tsx
interface BulkRow {
  id: string;
  name: string;
  type: string;
  totalMarks: string;
  weight: string;
  date: string;
}

const makeRowId = () => Math.random().toString(36).slice(2, 9);
function emptyBulkRow(): BulkRow {
  return { id: makeRowId(), name: '', type: 'QUIZ', totalMarks: '', weight: '', date: new Date().toISOString().slice(0, 10) };
}
```

Inside the component, add state alongside the existing drawer state:

```tsx
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow()]);
  const [bulkErrors, setBulkErrors] = useState<Record<string, Record<string, string>>>({});
  const [bulkSaving, setBulkSaving] = useState(false);

  const handleBulkRowChange = (id: string, field: keyof Omit<BulkRow, 'id'>, value: string) =>
    setBulkRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const handleAddBulkRow = () => setBulkRows((prev) => [...prev, emptyBulkRow()]);

  const handleRemoveBulkRow = (id: string) => {
    setBulkRows((prev) => prev.filter((r) => r.id !== id));
    setBulkErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const liveWeight = bulkRows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);

  const handleBulkSubmit = async () => {
    const errors: Record<string, Record<string, string>> = {};
    bulkRows.forEach((row) => {
      const e: Record<string, string> = {};
      if (!row.name.trim()) e.name = 'Required';
      if (!row.date) e.date = 'Required';
      const marks = parseFloat(row.totalMarks);
      if (!row.totalMarks || Number.isNaN(marks) || marks <= 0) e.totalMarks = 'Must be > 0';
      if (Object.keys(e).length > 0) errors[row.id] = e;
    });
    setBulkErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBulkSaving(true);
    try {
      for (const row of bulkRows) {
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'assessment_templates',
          record: {
            classId: selectedClassId,
            subjectId: selectedSubjectId,
            name: row.name.trim(),
            type: row.type,
            totalMarks: parseFloat(row.totalMarks),
            weight: row.weight ? parseFloat(row.weight) : null,
            date: row.date,
          },
        });
      }
      setBulkRows([emptyBulkRow()]);
      setBulkErrors({});
      setIsDrawerOpen(false);
      setReloadToken((t) => t + 1);
    } finally {
      setBulkSaving(false);
    }
  };
```

- [ ] **Step 2: Wire "Add Assessment" to open bulk mode, and edit mode stays single**

Change the "Add Assessment" button's `onClick` from Task 8 to reset bulk rows too:

```tsx
                  <Button onClick={() => { setEditingId(null); setBulkRows([emptyBulkRow()]); setBulkErrors({}); setIsDrawerOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Assessment
                  </Button>
```

- [ ] **Step 3: Add the bulk table, conditionally shown instead of the single form**

Replace the `<Drawer ...>` body from Task 8 (the `<form id="assessment-template-form" ...>...</form>`) with a conditional: keep the exact same `<form>` for the `editingId` case, and add the bulk table as the `else` branch. Replace the `Drawer`'s `title`, `footer`, and children with:

```tsx
        <Drawer
          isOpen={isDrawerOpen}
          onClose={resetForm}
          title={editingId ? 'Edit Assessment' : 'Add Assessments'}
          size={editingId ? 'md' : 'lg'}
          footer={
            editingId ? (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>Cancel</Button>
                <Button type="submit" form="assessment-template-form" disabled={saving}>
                  {saving ? 'Saving...' : 'Update Assessment'}
                </Button>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={resetForm} disabled={bulkSaving}>Cancel</Button>
                <Button type="button" onClick={() => void handleBulkSubmit()} disabled={bulkSaving || bulkRows.length === 0}>
                  {bulkSaving ? 'Creating...' : `Create ${bulkRows.length} Assessment${bulkRows.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            )
          }
        >
          {editingId ? (
            <form id="assessment-template-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {/* unchanged single-edit fields from Task 8 */}
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Total weight across all rows</span>
                <span className={`font-bold ${Math.abs(liveWeight - 100) < 0.01 ? 'text-active' : 'text-pending'}`}>
                  {liveWeight.toFixed(1)}%
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 pr-2 font-medium min-w-[140px]">Name *</th>
                      <th className="text-left py-2 pr-2 font-medium min-w-[110px]">Type</th>
                      <th className="text-left py-2 pr-2 font-medium min-w-[80px]">Marks *</th>
                      <th className="text-left py-2 pr-2 font-medium min-w-[70px]">Weight %</th>
                      <th className="text-left py-2 pr-2 font-medium min-w-[130px]">Date *</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row) => {
                      const errs = bulkErrors[row.id] ?? {};
                      return (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2">
                            <input type="text" value={row.name} onChange={(e) => handleBulkRowChange(row.id, 'name', e.target.value)} placeholder="Quiz 1" className={`w-full px-2 py-1.5 border rounded text-sm ${errs.name ? 'border-red-400' : 'border-slate-300'}`} />
                            {errs.name && <p className="text-xs text-red-600 mt-0.5">{errs.name}</p>}
                          </td>
                          <td className="py-1.5 pr-2">
                            <select value={row.type} onChange={(e) => handleBulkRowChange(row.id, 'type', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm">
                              {ASSESSMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </td>
                          <td className="py-1.5 pr-2">
                            <input type="number" value={row.totalMarks} onChange={(e) => handleBulkRowChange(row.id, 'totalMarks', e.target.value)} placeholder="100" min="0" step="0.1" className={`w-full px-2 py-1.5 border rounded text-sm ${errs.totalMarks ? 'border-red-400' : 'border-slate-300'}`} />
                            {errs.totalMarks && <p className="text-xs text-red-600 mt-0.5">{errs.totalMarks}</p>}
                          </td>
                          <td className="py-1.5 pr-2">
                            <input type="number" value={row.weight} onChange={(e) => handleBulkRowChange(row.id, 'weight', e.target.value)} placeholder="20" min="0" max="100" step="0.1" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input type="date" value={row.date} onChange={(e) => handleBulkRowChange(row.id, 'date', e.target.value)} className={`w-full px-2 py-1.5 border rounded text-sm ${errs.date ? 'border-red-400' : 'border-slate-300'}`} />
                            {errs.date && <p className="text-xs text-red-600 mt-0.5">{errs.date}</p>}
                          </td>
                          <td className="py-1.5">
                            <button type="button" onClick={() => handleRemoveBulkRow(row.id)} disabled={bulkRows.length === 1} className="text-red-400 disabled:opacity-30 p-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddBulkRow}>
                <Plus className="w-4 h-4 mr-1" />
                Add Row
              </Button>
            </div>
          )}
        </Drawer>
```

(The `{/* unchanged single-edit fields from Task 8 */}` comment marks where the implementer pastes Task 8's existing five `<div>` field blocks verbatim — they do not change in this task, only their wrapping `<form>`'s sibling branch does.)

- [ ] **Step 2: Extend the regression test**

Add to `templates.test.tsx`, inside the existing `describe` block:

```tsx
  it('bulk-creates multiple templates in one submission', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <AssessmentSetupPage />
      </PresentationProvider>,
    );

    const [classSelect, subjectSelect] = await screen.findAllByRole('combobox');
    fireEvent.change(classSelect!, { target: { value: 'class-1' } });
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });
    fireEvent.click(await screen.findByText('Add Assessment'));

    fireEvent.click(screen.getByText('Add Row'));
    const nameInputs = screen.getAllByPlaceholderText('Quiz 1');
    fireEvent.change(nameInputs[0]!, { target: { value: 'Quiz 1' } });
    fireEvent.change(nameInputs[1]!, { target: { value: 'Quiz 2' } });
    const marksInputs = screen.getAllByPlaceholderText('100');
    fireEvent.change(marksInputs[0]!, { target: { value: '20' } });
    fireEvent.change(marksInputs[1]!, { target: { value: '20' } });

    fireEvent.click(screen.getByText('Create 2 Assessments'));

    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Quiz 1')).toBeInTheDocument();
    expect(screen.getByText('Quiz 2')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the tests**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`
Expected: both tests pass.

- [ ] **Step 4: Typecheck and lint**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json`
Run: `cd desktop-client-nemis && npx eslint apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx
git commit -m "feat(desktop): add bulk-create table to Assessment Setup"
```

---

## Task 10: Desktop — Assessment Setup: copy-to-subject modal

**Files:**
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx`
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`

**Interfaces:**
- Consumes: `listTemplatesForSubject` (Task 6), `selectedClass`/`selectedSubjectId` state (Task 7).
- Produces: "Copy to Subject" button + modal, completing Assessment Setup feature parity with web.

- [ ] **Step 1: Add copy-to-subject state and handler**

Add to the imports: `import { Copy, X } from 'lucide-react';`

Add inside the component:

```tsx
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [copyTargetSubjectId, setCopyTargetSubjectId] = useState('');
  const [isCopying, setIsCopying] = useState(false);

  const handleCopyToSubject = async () => {
    if (!copyTargetSubjectId || templates.length === 0) return;
    setIsCopying(true);
    const targetTemplates = await listTemplatesForSubject(selectedClassId, copyTargetSubjectId);
    for (const template of templates) {
      const existing = targetTemplates.find((t) => t.name.toLowerCase() === template.name.toLowerCase());
      await sharedBridge.saveSchoolAdminRecord({
        collection: 'assessment_templates',
        record: {
          ...(existing ? { id: existing.id } : {}),
          classId: selectedClassId,
          subjectId: copyTargetSubjectId,
          name: template.name,
          type: template.type,
          totalMarks: template.totalMarks,
          weight: template.weight,
          date: template.date,
        },
      });
    }
    setIsCopying(false);
    setIsCopyOpen(false);
    setCopyTargetSubjectId('');
  };
```

- [ ] **Step 2: Add the "Copy to Subject" button and modal**

In the template-list `Card`'s header button row (from Task 7/8), add the Copy button before "Add Assessment", only when there are templates to copy:

```tsx
                  {templates.length > 0 && (
                    <Button variant="secondary" onClick={() => { setCopyTargetSubjectId(''); setIsCopyOpen(true); }}>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy to Subject
                    </Button>
                  )}
```

Add the modal at the end of the component's JSX, right after the `<Drawer>` block:

```tsx
        {isCopyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Copy to Subject</h3>
                <button onClick={() => setIsCopyOpen(false)} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-500">
                All {templates.length} assessment(s) from the current subject will be copied to the subject you select below.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Target Subject *</label>
                <select
                  value={copyTargetSubjectId}
                  onChange={(e) => setCopyTargetSubjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">— Select a subject —</option>
                  {(selectedClass?.subjects ?? [])
                    .filter((s) => s.id !== selectedSubjectId)
                    .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setIsCopyOpen(false)} disabled={isCopying}>Cancel</Button>
                <Button onClick={() => void handleCopyToSubject()} disabled={!copyTargetSubjectId || isCopying}>
                  {isCopying ? 'Copying…' : (<><Copy className="w-4 h-4 mr-2" />Copy</>)}
                </Button>
              </div>
            </div>
          </div>
        )}
```

Note this modal reads `templates` for the SOURCE subject's list, computed from `selectedSubjectId` — after a successful copy, the target subject's own templates aren't reloaded on this page since the user hasn't navigated there, matching web's behavior (there's no `reloadToken` bump here because `templates` only reflects `selectedSubjectId`, not the copy target).

- [ ] **Step 3: Extend the regression test**

Add to `templates.test.tsx`, requiring a second subject on the mocked class — update `installBaseMock`'s `teacher.listAssignments` mock to include a second subject row, then add a test:

Change the `listAssignments` mock array to include a second entry:

```tsx
      listAssignments: vi.fn(async (id: string) => (id === STAFF_ID ? [
        { id: 'a1', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: 'sub-1', subjectName: 'Mathematics', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
        { id: 'a2', teacherId: STAFF_ID, institutionId: 'inst-1', academicYearId: 'ay-1', academicYearName: '2025/2026', classId: 'class-1', className: 'Grade 10A', gradeLevel: 'GRADE_10', subjectId: 'sub-2', subjectName: 'Science', isClassTeacher: false, assignedAt: '2025-01-01T00:00:00.000Z' },
      ] : [])),
```

Add:

```tsx
  it('copies templates from one subject to another', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <AssessmentSetupPage />
      </PresentationProvider>,
    );

    const [classSelect, subjectSelect] = await screen.findAllByRole('combobox');
    fireEvent.change(classSelect!, { target: { value: 'class-1' } });
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });
    fireEvent.click(await screen.findByText('Add Assessment'));
    fireEvent.change(screen.getByPlaceholderText('e.g., Quiz 1, Midterm Exam'), { target: { value: 'Quiz 1' } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '20' } });
    fireEvent.click(screen.getByText('Create Assessment'));
    await screen.findByText('Quiz 1');

    fireEvent.click(screen.getByText('Copy to Subject'));
    fireEvent.change(screen.getByRole('combobox', { name: '' }) ?? screen.getAllByRole('combobox').at(-1)!, { target: { value: 'sub-2' } });
    fireEvent.click(screen.getByText('Copy'));

    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ record: expect.objectContaining({ name: 'Quiz 1', subjectId: 'sub-2' }) }),
    ));
  });
```

- [ ] **Step 4: Run the tests**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`
Expected: all three tests pass. If the target-subject `<select>` query is ambiguous given multiple unlabeled comboboxes, adjust to select by DOM order (matching the pattern already used in `grades.test.tsx` for the same reason) rather than by accessible name.

- [ ] **Step 5: Typecheck and lint**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json`
Run: `cd desktop-client-nemis && npx eslint apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx apps/desktop/renderer/app/government/teacher/grades/templates/templates.test.tsx
git commit -m "feat(desktop): add copy-to-subject to Assessment Setup"
```

---

## Task 11: Desktop — Gradebook: weighted score grid replaces fixed CA/Test columns

**Files:**
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/page.tsx`
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`

**Interfaces:**
- Consumes: `listTemplatesForSubject`, `listAssessmentsForPeriod`, `materializeAssessment`, `weightedPercentage`, `totalWeight`, `AssessmentTemplateRow` (Task 6).
- Produces: regular-period grid keyed by template instead of CA/Test/Exam — this is the largest single behavioral change in the feature. Exam-period code paths in this same file are untouched.

- [ ] **Step 1: Add template/assessment/score state, replacing the fixed-field state**

In `grades/page.tsx`, add the import:

```tsx
import {
  type AssessmentTemplateRow,
  listAssessmentsForPeriod,
  listTemplatesForSubject,
  materializeAssessment,
  totalWeight,
  weightedPercentage,
} from '@/components/academic-grading/assessments';
```

Remove the existing `interface Scores { ca: number | null; test: number | null; exam: number | null; }`, `letterFor`, and the `isExamPeriod`-agnostic `Scores`-keyed state (`editedScores`, `computeTotals`, `setScore`, `gradeFor`, `isLocked`, `persist`) are being replaced for the REGULAR-period path only — the EXAM-period path (`isExamPeriod === true`) keeps its own separate, untouched scoring state. Split the single `editedScores`/`grades` state into two parallel tracks:

Keep `isExamPeriod`, `maxMarks`, `selectedPeriod` exactly as they are today (unchanged). Add, right after the existing `grades`/`loadingGrades`/`reloadGrades` state block:

```tsx
  const [templates, setTemplates] = useState<AssessmentTemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    if (isExamPeriod || !selectedClassId || !selectedSubjectId) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    setLoadingTemplates(true);
    void listTemplatesForSubject(selectedClassId, selectedSubjectId).then((rows_) => {
      if (!cancelled) {
        setTemplates(rows_);
        setLoadingTemplates(false);
      }
    });
    return () => { cancelled = true; };
  }, [isExamPeriod, selectedClassId, selectedSubjectId]);

  // studentId -> templateId -> score. Populated from `grades` rows filtered
  // by assessmentId (via the local `assessments` instances for this period),
  // matching web's getAssessmentScores shape.
  const [templateScores, setTemplateScores] = useState<Record<string, Record<string, number | null>>>({});
  const [scoresPublished, setScoresPublished] = useState(false);

  const reloadTemplateScores = async () => {
    if (isExamPeriod || templates.length === 0 || !selectedPeriodId) {
      setTemplateScores({});
      setScoresPublished(false);
      return;
    }
    const instances = await listAssessmentsForPeriod(selectedClassId, selectedSubjectId, selectedPeriodId);
    const instanceIdByTemplateId = new Map(instances.map((i) => [i.templateId, i.id]));
    const instanceIds = new Set(instances.map((i) => i.id));
    const relevantGrades = grades.filter((g) => g.assessmentId != null && instanceIds.has(String(g.assessmentId)));
    const next: Record<string, Record<string, number | null>> = {};
    for (const grade of relevantGrades) {
      const studentId = String(grade.studentId);
      const templateId = [...instanceIdByTemplateId.entries()].find(([, id]) => id === String(grade.assessmentId))?.[0];
      if (!templateId) continue;
      next[studentId] = { ...(next[studentId] ?? {}), [templateId]: grade.marksObtained != null ? Number(grade.marksObtained) : null };
    }
    setTemplateScores(next);
    setScoresPublished(relevantGrades.some((g) => Boolean(g.isPublished)));
  };

  useEffect(() => {
    void reloadTemplateScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, grades, isExamPeriod, selectedClassId, selectedSubjectId, selectedPeriodId]);

  const setTemplateScore = (studentId: string, templateId: string, value: string, template: AssessmentTemplateRow) => {
    const numValue = value === '' ? null : Number(value);
    if (numValue !== null && (Number.isNaN(numValue) || numValue < 0 || numValue > template.totalMarks)) return;
    setTemplateScores((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? {}), [templateId]: numValue },
    }));
    setHasUnsaved(true);
  };

  const weight = totalWeight(templates);
  const isWeightComplete = Math.abs(weight - 100) < 0.01;
```

- [ ] **Step 2: Replace the persist/save logic for the regular-period path**

Replace the existing `persist` function (which currently writes `assessmentScore`/`testScore`/`examScore` to a single `grades` row per student per period) — keep it for the EXAM-period path only by renaming it, and add a new function for the template path. Rename the existing `persist` to `persistExamScores` (no logic change), and add:

```tsx
  const persistTemplateScores = async () => {
    if (!selectedClassId || !selectedSubjectId || !selectedPeriodId) return;
    for (const template of templates) {
      const assessmentId = await materializeAssessment(template, selectedPeriodId);
      for (const student of roster) {
        const score = templateScores[student.id]?.[template.id];
        if (score === undefined) continue;
        const instances = await listAssessmentsForPeriod(selectedClassId, selectedSubjectId, selectedPeriodId);
        const existingGrade = grades.find(
          (g) => String(g.studentId) === student.id && String(g.assessmentId) === assessmentId,
        );
        if (score === null) {
          if (existingGrade) {
            await sharedBridge.deleteSchoolAdminRecord({ collection: 'grades', id: String(existingGrade.id) });
          }
          continue;
        }
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'grades',
          record: {
            ...(existingGrade ? { id: existingGrade.id } : {}),
            studentId: student.id,
            subjectId: selectedSubjectId,
            classId: selectedClassId,
            gradingPeriodId: selectedPeriodId,
            assessmentId,
            marksObtained: score,
            maxMarks: template.totalMarks,
            isPublished: existingGrade?.isPublished ?? false,
            status: existingGrade?.status ?? 'DRAFT',
          },
        });
        void instances; // instances refetched per-iteration above only to keep existingGrade lookups current across the loop; see design doc's race-window note.
      }
    }
    await reloadGrades(selectedPeriodId);
  };
```

Update `handleSave` to call the right function depending on period type:

```tsx
  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      if (isExamPeriod) await persistExamScores();
      else await persistTemplateScores();
      setHasUnsaved(false);
      setFeedback({ kind: 'success', message: 'Scores saved.' });
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to save scores.' });
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 3: Replace the grid columns and empty/loading states for the regular-period branch**

In the JSX, the existing table (inside the `!filtersComplete ? ... : loadingGrades ... : roster.length === 0 ... : (<table>...)` chain) currently renders CA/Test/Exam columns unconditionally based on `isExamPeriod`. Keep the exam-period `<table>` branch exactly as-is (it already only renders when `isExamPeriod` is true). Replace the regular-period branch's column headers and body cells:

Replace this existing header block (the `isExamPeriod ? (...) : (<>CA/Test columns</>)` inside `<thead>`) — keep the `isExamPeriod` branch, replace its `else`:

```tsx
                    {isExamPeriod ? (
                      <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase border-r min-w-[160px]">
                        Exam Score
                        <span className="block text-[10px] font-normal text-slate-400">(max {maxMarks})</span>
                      </th>
                    ) : templates.length === 0 ? null : (
                      templates.map((template) => (
                        <th key={template.id} className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase border-r min-w-[120px]">
                          {template.name}
                          <span className="block text-[10px] font-normal text-slate-400">({template.totalMarks} marks)</span>
                        </th>
                      ))
                    )}
```

Replace the body-row score cells' `else` branch similarly — the existing per-student `<tr>` for the regular-period case (currently rendering CA and Test `<input>`s) becomes:

```tsx
                        {isExamPeriod ? (
                          <td className="px-2 py-1 border-r">
                            <input type="number" value={examScores[student.id] ?? ''} onChange={(e) => setExamScore(student.id, e.target.value)} disabled={isExamLocked} min="0" max={maxMarks} className={inputClass} />
                          </td>
                        ) : (
                          templates.map((template) => (
                            <td key={template.id} className="px-2 py-1 border-r">
                              <input
                                type="number"
                                value={templateScores[student.id]?.[template.id] ?? ''}
                                onChange={(e) => setTemplateScore(student.id, template.id, e.target.value, template)}
                                disabled={scoresPublished}
                                min="0"
                                max={template.totalMarks}
                                className={`w-24 text-center p-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-primary ${scoresPublished ? 'bg-slate-100 cursor-not-allowed text-slate-500' : ''}`}
                              />
                            </td>
                          ))
                        )}
```

Replace the "Final" column's percentage cell to use the new weighted calculation for the regular-period case:

```tsx
                        <td className="px-4 py-2 text-center text-sm font-bold text-slate-800 border-r">
                          {isExamPeriod
                            ? (computeTotals(scores).percentage !== null ? `${computeTotals(scores).percentage}%` : '—')
                            : (() => {
                                const pct = weightedPercentage(new Map(Object.entries(templateScores[student.id] ?? {})), templates);
                                return pct !== null ? `${pct}%` : '—';
                              })()}
                        </td>
```

(This plan keeps the exam-period `computeTotals`/`scores` variables exactly as they exist in the current file — only the regular-period branch changes.)

- [ ] **Step 4: Add the "No Assessments Found" empty state and weight-incomplete banner**

Right before the main score-grid `<table>` render block (inside the `filtersComplete && !isExamPeriod` branch), add, matching web's structure:

```tsx
        {filtersComplete && !isExamPeriod && !loadingTemplates && templates.length === 0 && (
          <div className="bg-white border border-slate-300 rounded-card text-center py-12">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-900">No Assessments Found</h3>
            <p className="text-slate-600 mt-1 mb-4">
              You need to create assessments before you can enter grades.
            </p>
            <Button onClick={() => router.push('/government/teacher/grades/templates')}>
              Go to Assessment Setup
            </Button>
          </div>
        )}

        {filtersComplete && !isExamPeriod && templates.length > 0 && !isWeightComplete && (
          <Alert variant="warning">
            Assessment weights incomplete. Current total: {weight.toFixed(1)}%. You can enter grades now, but you&apos;ll need to complete the weighting (100%) before submitting final grades.
          </Alert>
        )}
```

This requires `useRouter` from `next/navigation` and `AlertCircle` from `lucide-react` — add both imports, and add `const router = useRouter();` near the top of the component.

- [ ] **Step 5: Run the existing test to see what breaks**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`
Expected: FAIL — the existing test exercises the old CA/Test/Exam fixed-field flow for a `REGULAR_PERIOD`, which this task removed. This is expected; Task 11's Step 6 rewrites it.

- [ ] **Step 6: Rewrite the regression test for the template-based grid**

Replace `grades.test.tsx`'s `installBaseMock`'s `schoolAdmin.list` mock to add `assessment_templates` and `assessments` collections, and update the test body to score against a template instead of CA/Test fields:

```tsx
    schoolAdmin: {
      list: vi.fn(async (request: { collection: string }) => {
        if (request.collection === 'staff') return { items: [{ id: STAFF_ID, userId: USER_ID }], total: 1 };
        if (request.collection === 'grading_periods') return { items: [{ id: 'period-1', termId: 'term-1', name: 'Period 1', periodType: 'REGULAR_PERIOD', maxMarks: 100, isActive: 1 }], total: 1 };
        if (request.collection === 'grade_entry_windows') return { items: [{ id: 'window-1', gradingPeriodId: 'period-1', status: 'OPEN' }], total: 1 };
        if (request.collection === 'institution_grading_configs') return { items: [{ id: 'config-1', gradeScale: JSON.stringify([{ letter: 'A', description: 'Excellent', min: 80, max: 100, gradePoint: 4 }]) }], total: 1 };
        if (request.collection === 'assessment_templates') return { items: [{ id: 'template-1', classId: 'class-1', subjectId: 'sub-1', name: 'Quiz 1', type: 'QUIZ', totalMarks: 20, weight: 100, date: '2025-09-15' }], total: 1 };
        if (request.collection === 'assessments') return { items: assessmentInstances, total: assessmentInstances.length };
        if (request.collection === 'grades') return { items: gradeRows, total: gradeRows.length };
        return { items: [], total: 0 };
      }),
      save: vi.fn(async (request: { collection: string; record: Record<string, unknown> }) => {
        if (request.collection === 'assessments') {
          const created = { id: `assessment-${assessmentInstances.length + 1}`, ...request.record };
          assessmentInstances.push(created);
          return created;
        }
        const created = { id: request.record.id ?? `grade-${gradeRows.length + 1}`, ...request.record };
        const idx = gradeRows.findIndex((g) => g.id === created.id);
        if (idx >= 0) gradeRows[idx] = created; else gradeRows.push(created);
        return created;
      }),
      delete: vi.fn(async (request: { id: string }) => {
        const idx = gradeRows.findIndex((g) => g.id === request.id);
        if (idx >= 0) gradeRows.splice(idx, 1);
        return { id: request.id };
      }),
    },
```

Add `const assessmentInstances: Record<string, unknown>[] = []; const gradeRows: Record<string, unknown>[] = [];` at the top of `installBaseMock`, replacing any prior hardcoded `grades` collection mock. Update the test body: after selecting subject and period (same as the existing test), assert the template column header renders (`Quiz 1`), enter a score, save, and assert the two-step save happened:

```tsx
    expect(await screen.findByText('Quiz 1')).toBeInTheDocument(); // template column header
    const scoreInput = screen.getAllByRole('spinbutton')[0]!;
    fireEvent.change(scoreInput, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'assessments', record: expect.objectContaining({ templateId: 'template-1', gradingPeriodId: 'period-1' }) }),
    ));
    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'grades', record: expect.objectContaining({ marksObtained: 18, assessmentId: 'assessment-1' }) }),
    ));
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`
Expected: PASS.

- [ ] **Step 8: Typecheck and lint**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json`
Run: `cd desktop-client-nemis && npx eslint apps/desktop/renderer/app/government/teacher/grades/page.tsx apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/renderer/app/government/teacher/grades/page.tsx apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx
git commit -m "feat(desktop): replace fixed CA/Test grid with weighted assessment templates"
```

---

## Task 12: Desktop — Gradebook: publish / unpublish (Send to Students / Update Grades)

**Files:**
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/page.tsx`
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`

**Interfaces:**
- Consumes: `scoresPublished`, `templateScores`, `templates`, `reloadTemplateScores` (Task 11).
- Produces: publish/unpublish button row for the regular-period path.

- [ ] **Step 1: Add publish/unpublish handlers**

Add to `grades/page.tsx`:

```tsx
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  const handleSendToStudents = async () => {
    setPublishing(true);
    setFeedback(null);
    try {
      if (hasUnsaved) await persistTemplateScores();
      const instances = await listAssessmentsForPeriod(selectedClassId, selectedSubjectId, selectedPeriodId);
      const instanceIds = new Set(instances.map((i) => i.id));
      const toPublish = grades.filter((g) => g.assessmentId != null && instanceIds.has(String(g.assessmentId)));
      for (const grade of toPublish) {
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'grades',
          record: { id: grade.id, isPublished: true, status: 'PUBLISHED', publishedAt: new Date().toISOString() },
        });
      }
      await reloadGrades(selectedPeriodId);
      setFeedback({ kind: 'success', message: `${toPublish.length} score(s) sent to students.` });
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to send grades to students.' });
    } finally {
      setPublishing(false);
    }
  };

  const handleUpdateGrades = async () => {
    setUnpublishing(true);
    setFeedback(null);
    try {
      const instances = await listAssessmentsForPeriod(selectedClassId, selectedSubjectId, selectedPeriodId);
      const instanceIds = new Set(instances.map((i) => i.id));
      const toUnpublish = grades.filter((g) => g.assessmentId != null && instanceIds.has(String(g.assessmentId)) && Boolean(g.isPublished));
      for (const grade of toUnpublish) {
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'grades',
          record: { id: grade.id, isPublished: false, status: 'DRAFT', publishedAt: null },
        });
      }
      await reloadGrades(selectedPeriodId);
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to unlock grades.' });
    } finally {
      setUnpublishing(false);
    }
  };
```

Note: `saveSchoolAdminRecord` with only `id` plus the changed fields relies on the existing generic `SchoolAdminModuleService.save()` doing a partial-field upsert-by-id (the same assumption the existing `persist`/`persistExamScores` functions already make when passing `{ id: existing.id, ...fullRecordAgain }` — if `save()` actually requires the FULL record rather than a partial patch, adjust these two handlers to spread the full existing grade row instead of just `{id, isPublished, status, publishedAt}`; verify this against `SchoolAdminModuleService.save()`'s implementation before writing this step's final code, since Task 11 didn't need to exercise this partial-vs-full distinction (it always sent full records).

- [ ] **Step 2: Add the button row for the regular-period path**

Replace the existing Save/Submit button row (currently shared between exam and regular periods) so the regular-period case shows Save / Send to Students / Update Grades instead of Save / Submit Grades:

```tsx
              <div className="flex items-center gap-2 ml-auto">
                {isExamPeriod ? (
                  <>
                    <Button variant="secondary" onClick={() => void handleSave()} disabled={saving || !hasUnsaved}>
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button onClick={() => void handleSubmit()} disabled={submitting || !isWindowOpen}>
                      <Send className="w-4 h-4 mr-2" />
                      {submitting ? 'Submitting...' : 'Submit Grades'}
                    </Button>
                  </>
                ) : scoresPublished ? (
                  <Button variant="secondary" onClick={() => void handleUpdateGrades()} disabled={unpublishing}>
                    {unpublishing ? 'Unlocking...' : 'Update Grades'}
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => void handleSave()} disabled={saving || !hasUnsaved}>
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button onClick={() => void handleSendToStudents()} disabled={publishing || saving || roster.length === 0}>
                      <Send className="w-4 h-4 mr-2" />
                      {publishing ? 'Sending...' : 'Send to Students'}
                    </Button>
                  </>
                )}
              </div>
```

- [ ] **Step 3: Extend the regression test**

Add to `grades.test.tsx`:

```tsx
  it('publishes scores to students, then allows unlocking them again', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(<PresentationProvider layer={layer}><TeacherGradesPage /></PresentationProvider>);

    const [, , subjectSelect, periodSelect] = screen.getAllByRole('combobox');
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });
    fireEvent.change(periodSelect!, { target: { value: 'period-1' } });
    await screen.findByText('Quiz 1');
    fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(expect.objectContaining({ collection: 'grades' })));

    fireEvent.click(await screen.findByText('Send to Students'));
    await waitFor(() => expect(screen.getByText('Update Grades')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Update Grades'));
    await waitFor(() => expect(screen.getByText('Send to Students')).toBeInTheDocument());
  });
```

- [ ] **Step 4: Run the tests**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`
Expected: all tests pass.

- [ ] **Step 5: Typecheck and lint**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json`
Run: `cd desktop-client-nemis && npx eslint apps/desktop/renderer/app/government/teacher/grades/page.tsx apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/app/government/teacher/grades/page.tsx apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx
git commit -m "feat(desktop): add publish/unpublish to the weighted Gradebook"
```

---

## Task 13: Desktop — Gradebook: Summary & Submit tab

**Files:**
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/page.tsx`
- Modify: `desktop-client-nemis/apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`

**Interfaces:**
- Consumes: `myClasses` (existing), `templates`/`totalWeight`/`weightedPercentage` (Task 6/11), `isWindowOpen` (existing).
- Produces: tab switcher (Gradebook / Summary & Submit) for the regular-period path; final window-gated submission writing period-level `assessmentId: null` grade rows.

- [ ] **Step 1: Add tab state and the readiness computation**

Add near the top of the component:

```tsx
  const [activeTab, setActiveTab] = useState<'scores' | 'submit'>('scores');
```

Add a readiness-status computation that, for the selected class + period, checks every subject the teacher teaches in that class (not just the currently selected one):

```tsx
  interface SubjectSubmissionStatus {
    subjectId: string;
    subjectName: string;
    studentsScored: number;
    totalStudents: number;
    weightsTotal: number;
    isReady: boolean;
    notReadyReason: string;
  }

  const [submissionStatuses, setSubmissionStatuses] = useState<SubjectSubmissionStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);

  useEffect(() => {
    if (activeTab !== 'submit' || !selectedClassId || !selectedPeriodId || isExamPeriod) return;
    let cancelled = false;
    setLoadingStatus(true);
    const subjectsInClass = selectedClass?.subjects ?? [];
    void Promise.all(
      subjectsInClass.map(async (subject) => {
        const [subjectTemplates, instances] = await Promise.all([
          listTemplatesForSubject(selectedClassId, subject.id),
          listAssessmentsForPeriod(selectedClassId, subject.id, selectedPeriodId),
        ]);
        const instanceIds = new Set(instances.map((i) => i.id));
        const gradesResult = await sharedBridge.listSchoolAdminRecords({ collection: 'grades', limit: 250 });
        const subjectGrades = gradesResult.items.filter((g) => g.assessmentId != null && instanceIds.has(String(g.assessmentId)));
        const studentsScored = new Set(subjectGrades.map((g) => g.studentId)).size;
        const weightsTotal = totalWeight(subjectTemplates);
        const isReady = Math.abs(weightsTotal - 100) < 0.01 && studentsScored > 0;
        return {
          subjectId: subject.id,
          subjectName: subject.name,
          studentsScored,
          totalStudents: roster.length,
          weightsTotal,
          isReady,
          notReadyReason: studentsScored === 0 ? 'No scores entered' : `Weights total ${weightsTotal}%`,
        };
      }),
    ).then((statuses) => {
      if (!cancelled) {
        setSubmissionStatuses(statuses);
        setLoadingStatus(false);
      }
    });
    return () => { cancelled = true; };
  }, [activeTab, selectedClassId, selectedPeriodId, isExamPeriod, selectedClass, roster.length]);

  const readyCount = submissionStatuses.filter((s) => s.isReady).length;
  const [submittingAll, setSubmittingAll] = useState(false);

  const handleSubmitAllReady = async () => {
    if (!isWindowOpen) {
      setFeedback({ kind: 'error', message: 'The grade entry window is not open.' });
      return;
    }
    setSubmittingAll(true);
    try {
      for (const status of submissionStatuses.filter((s) => s.isReady)) {
        const subjectTemplates = await listTemplatesForSubject(selectedClassId, status.subjectId);
        const instances = await listAssessmentsForPeriod(selectedClassId, status.subjectId, selectedPeriodId);
        const instanceIdByTemplateId = new Map(instances.map((i) => [i.id, i.templateId]));
        const gradesResult = await sharedBridge.listSchoolAdminRecords({ collection: 'grades', limit: 250 });
        for (const student of roster) {
          const studentScores = new Map<string, number | null>();
          for (const grade of gradesResult.items) {
            if (String(grade.studentId) !== student.id || grade.assessmentId == null) continue;
            const templateId = instanceIdByTemplateId.get(String(grade.assessmentId));
            if (templateId) studentScores.set(templateId, grade.marksObtained != null ? Number(grade.marksObtained) : null);
          }
          const percentage = weightedPercentage(studentScores, subjectTemplates);
          if (percentage === null) continue;
          const existingPeriodGrade = gradesResult.items.find(
            (g) => String(g.studentId) === student.id && g.assessmentId == null && g.gradingPeriodId === selectedPeriodId && g.subjectId === status.subjectId,
          );
          await sharedBridge.saveSchoolAdminRecord({
            collection: 'grades',
            record: {
              ...(existingPeriodGrade ? { id: existingPeriodGrade.id } : {}),
              studentId: student.id,
              subjectId: status.subjectId,
              classId: selectedClassId,
              gradingPeriodId: selectedPeriodId,
              assessmentId: null,
              marksObtained: percentage,
              maxMarks: 100,
              percentage,
              status: 'SUBMITTED',
            },
          });
        }
      }
      setFeedback({ kind: 'success', message: `Submitted final grades for ${readyCount} subject(s).` });
      setActiveTab('scores');
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to submit grades.' });
    } finally {
      setSubmittingAll(false);
    }
  };
```

- [ ] **Step 2: Add the tab switcher and Summary & Submit UI**

Right after the existing window-status banner (inside the top `<div className="bg-white ... rounded-card p-4">` block's parent), add, only for the non-exam-period case:

```tsx
        {selectedTermId && selectedClassId && selectedPeriodId && !isExamPeriod && (
          <div className="border-b border-slate-200">
            <nav className="flex gap-1">
              <button onClick={() => setActiveTab('scores')} className={`py-2.5 px-4 rounded-t-lg font-bold text-sm ${activeTab === 'scores' ? 'bg-secondary/10 border-x border-t text-slate-700' : 'text-slate-600'}`}>
                Gradebook
              </button>
              <button onClick={() => setActiveTab('submit')} className={`py-2.5 px-4 rounded-t-lg font-bold text-sm ${activeTab === 'submit' ? 'bg-secondary/10 border-x border-t text-slate-700' : 'text-slate-500'}`}>
                Summary & Submit
              </button>
            </nav>
          </div>
        )}
```

Wrap the entire existing Gradebook grid section (the `!filtersComplete ? ... : loadingGrades ... table ...` chain from Task 11) in `{activeTab === 'scores' && (...)}`  , and add the Summary & Submit panel as a sibling right after it:

```tsx
        {activeTab === 'submit' && !isExamPeriod && (
          <div className="space-y-4">
            {!isWindowOpen && (
              <Alert variant="warning">The grade submission window for this period is currently closed.</Alert>
            )}
            <div className="bg-white border border-slate-300 rounded-card overflow-hidden">
              {loadingStatus ? (
                <div className="flex justify-center py-12"><Spinner size="lg" /></div>
              ) : submissionStatuses.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-sm">You are not assigned to any subjects in this class.</p>
                </div>
              ) : (
                <table className="min-w-full border-collapse">
                  <thead className="bg-secondary/20">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase border-r">Subject</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase border-r">Scores Saved</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase border-r">Weights</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissionStatuses.map((s) => (
                      <tr key={s.subjectId} className="border-b hover:bg-slate-50/70">
                        <td className="px-4 py-3 text-sm font-bold text-slate-600 border-r">{s.subjectName}</td>
                        <td className="px-4 py-3 text-sm text-center border-r">{s.studentsScored}/{s.totalStudents}</td>
                        <td className={`px-4 py-3 text-sm text-center border-r ${Math.abs(s.weightsTotal - 100) < 0.01 ? 'text-slate-700' : 'text-amber-600 font-medium'}`}>{s.weightsTotal}%</td>
                        <td className="px-4 py-3 text-center">
                          {s.isReady ? (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Ready</span>
                          ) : (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Not ready — {s.notReadyReason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void handleSubmitAllReady()} disabled={submittingAll || !isWindowOpen || readyCount === 0}>
                <Send className="w-4 h-4 mr-2" />
                {submittingAll ? 'Submitting...' : `Submit All Ready Subjects (${readyCount})`}
              </Button>
            </div>
          </div>
        )}
```

- [ ] **Step 3: Extend the regression test**

Add to `grades.test.tsx` (reusing the same `installBaseMock` — the `gradeRows` array from Task 11's rewrite already backs the generic `grades` collection lookups this tab performs):

```tsx
  it('shows Summary & Submit readiness and submits ready subjects', async () => {
    const nemis = installBaseMock();
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(<PresentationProvider layer={layer}><TeacherGradesPage /></PresentationProvider>);

    const [, , subjectSelect, periodSelect] = screen.getAllByRole('combobox');
    fireEvent.change(subjectSelect!, { target: { value: 'sub-1' } });
    fireEvent.change(periodSelect!, { target: { value: 'period-1' } });
    await screen.findByText('Quiz 1');
    fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '18' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(expect.objectContaining({ collection: 'grades' })));

    fireEvent.click(screen.getByText('Summary & Submit'));
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(await screen.findByText('Ready')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Submit All Ready Subjects/));
    await waitFor(() => expect(nemis.schoolAdmin.save).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'grades', record: expect.objectContaining({ assessmentId: null, status: 'SUBMITTED' }) }),
    ));
  });
```

- [ ] **Step 4: Run the tests**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`
Expected: all tests pass.

- [ ] **Step 5: Typecheck and lint**

Run: `cd desktop-client-nemis/apps/desktop && npx tsc --noEmit -p renderer/tsconfig.json`
Run: `cd desktop-client-nemis && npx eslint apps/desktop/renderer/app/government/teacher/grades/page.tsx apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx`
Expected: no errors.

- [ ] **Step 6: Full teacher-portal regression sweep**

Run: `cd desktop-client-nemis && npx vitest run apps/desktop/renderer/app/government/teacher packages/presentation/src/view-models/timetables`
Expected: every test from this feature plus every pre-existing teacher-portal test (dashboard, my-school, timetable) still passes — this task didn't touch those files, but it's the final task in the plan, so this is the last checkpoint to catch any cross-file regression.

- [ ] **Step 7: Manual smoke test**

Run the app, sign in as a TEACHER with at least one class/subject assignment. Walk the full flow: Assessment Setup → create two templates totaling 100% weight → Gradebook → select the same class/subject/a REGULAR_PERIOD → confirm both template columns render → enter scores → Save → Send to Students → confirm inputs lock → Update Grades → confirm inputs unlock → Summary & Submit tab → confirm the subject shows "Ready" → Submit All Ready Subjects (with the grading window OPEN) → confirm success feedback. Then switch to a MIDTERM_EXAM period and confirm the existing exam flow (single score field, Submit Exam Grades) still works exactly as before this plan.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/renderer/app/government/teacher/grades/page.tsx apps/desktop/renderer/app/government/teacher/grades/grades.test.tsx
git commit -m "feat(desktop): add Summary & Submit tab to the weighted Gradebook"
```

---

## Plan self-review notes (for the human reviewing this plan, not a task to execute)

- **Spec coverage:** Goal 1 (template CRUD) → Tasks 7-10. Goal 2 (weighted grid + publish/unpublish) → Tasks 11-12. Goal 3 (Summary & Submit) → Task 13. Goal 4 (offline) → Tasks 1-6 (outbox triggers + sync-push validators, no online-only shortcuts anywhere). Goal 5 (exam periods untouched) → explicitly preserved as a separate branch in every Task 11-13 JSX/handler change. All three "Resolved design questions" from the spec are reflected: weighted formula in `weightedPercentage`/`handleSubmitAllReady`, full scope across all 13 tasks, `recharts` added in Task 7.
- **Known judgment call flagged in-line:** Task 12 Step 1 flags that `saveSchoolAdminRecord`'s partial-vs-full-record behavior needs verifying against `SchoolAdminModuleService.save()` before finalizing the publish/unpublish handlers — this wasn't verified during planning (Tasks 1-11 never needed a partial update, only full-record upserts), so it's the one place execution should double check the assumption before trusting the code as written.
- **Task 11 Step 3's exam-period JSX branches are described as edits to "the existing" table rather than full replacement code** — this is intentional, not a placeholder: Task 11 is a surgical edit to an already-large existing file, and reproducing the entire unchanged exam-period JSX verbatim in this plan would make the diff harder to review, not easier. The instruction to "keep the isExamPeriod branch, replace its else" is unambiguous about what changes.
