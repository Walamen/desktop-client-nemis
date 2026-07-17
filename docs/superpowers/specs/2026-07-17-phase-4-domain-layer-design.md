# Phase 4 Design: Enterprise Domain Layer

**Date:** 2026-07-17
**Status:** Approved
**Branch:** `phase-4-domain-layer` (off `main`, tip `b8f629c`)

## Goal

Establish a pure-TypeScript **Domain Layer** for the NEMIS desktop client that
faithfully mirrors and safely extends the existing production business model
(the authoritative NestJS/Prisma/PostgreSQL backend), while remaining completely
independent of infrastructure (Electron, SQLite, IPC) and presentation (React,
Next.js).

The domain layer is the home of business identity, invariants, and vocabulary:
rich entities, immutable value objects, reusable business specifications, domain
events (definitions only), and a domain exception taxonomy. Repositories
(Phase 3) map persistence rows into these entities; synchronization (Phase 5+)
transports them. Neither owns the business rules — the domain does.

**In scope (this phase):**

- Complete **Domain Discovery Report** covering all 66 Prisma models / 44 enums.
- Complete **Domain Mapping Matrix** (all 66 models).
- A new `@nemis-desktop/domain` package with a shared **kernel** (`Entity`,
  `AggregateRoot`, `ValueObject`, `DomainEvent`, `Specification`, exception
  hierarchy) and cross-cutting value objects.
- A fully implemented **vertical slice** of the offline-critical school-operations
  domains: Identity (User), Institution, Students (Student + Guardian),
  Academics (AcademicYear, Term, Class, Subject, Enrollment), Attendance,
  Assessments/Grading (GradingPeriod, Assessment, Grade).
- Canonical enums re-declared in `@nemis-desktop/types`, backend as documented
  single source of truth.
- A documented **extension recipe** for the remaining 6 domains.
- Unit tests (Vitest, TDD) for every value object, entity invariant, and
  specification in the slice.

**Out of scope:**

- Synchronization logic, conflict resolution algorithms, REST/API clients.
- CRUD, repositories, mappers (Phase 3 owns data access; not re-touched here).
- UI, React components, Electron/IPC features.
- Modifying the backend Prisma schema or the backend `@nemis/types` package.
- Redesigning any existing business entity.
- Full implementation of the 6 non-slice domains (discovery + recipe only).

## Decisions (settled during brainstorming)

1. **Scope = discovery + kernel + slice.** Rich models for all 66 entities in one
   pass would be shallow. Instead: full discovery deliverables for all 66, a
   proven kernel, a fully-built offline-critical slice, and a documented pattern
   to extend the rest.
2. **Type reuse = re-declare in `@nemis-desktop/types`.** The backend
   (`@nemis/*`) and desktop (`@nemis-desktop/*`) are **separate pnpm workspaces**;
   the desktop cannot `workspace:*`-import `@nemis/types`. Canonical enums/contracts
   are mirrored into `@nemis-desktop/types`, each annotated with its backend source
   and any divergence. No build coupling; domain stays pure TS.
3. **Placement = new `@nemis-desktop/domain` package** at `packages/domain`.
   Dedicated package makes the "no infrastructure dependencies" rule enforceable.
4. **Layout = feature-first** (documented divergence from the spec's technical-first
   layout). A `core/` kernel + cross-cutting `value-objects/`/`enums/`/`exceptions/`,
   then one folder per business domain. 66 entities across 12 domains make a single
   flat `entities/` folder unnavigable.
5. **Enum representation = `as const` object + union** (matches `platform.ts` and
   the `isolatedModules` config), not TypeScript `enum`. Backend `enum` values are
   preserved exactly.

---

# PART A — Domain Discovery Report

## A.1 Business domains

The 66 production models partition into 12 business domains. The Prisma migration
history corroborates this partitioning: the initial migrations are themselves
domain-scoped (`init_geo_auth`, `init_institutions`, `init_academics`,
`init_people`, `init_class_ops`, `init_attendance`, `init_grading`, `init_finance`,
`init_communication`), followed by incremental additions (assessment templates,
fee-obligation models, class resources, notification-type expansions, attendance
`PRESENT`/`LATE` refinements, weekend `DayOfWeek` values) and one removal
(legacy finance subsystems). Migration history = business knowledge; the domain
boundaries below honor it.

| # | Domain | Responsibility |
|---|--------|----------------|
| 1 | Identity & Access | Users, role assignments across the org hierarchy, preferences, auth tokens |
| 2 | Geography & Administration | National geographic hierarchy (county → district), census, generic registries/workflows |
| 3 | Institution | Schools and their profile, levels, grading config, reviews, access requests, inspections |
| 4 | Students | Students, guardians, applications, transfers, student-initiated requests |
| 5 | Staff | Staff members and staff attendance |
| 6 | Academics | Academic calendar (year/term), classes, subjects, teaching assignments, enrollment, timetable |
| 7 | Attendance | Student attendance records |
| 8 | Assessments & Grading | Assessments/templates, grades + audit, grading periods, entry windows, term/yearly averages, assignments |
| 9 | Finance | Fee rules, per-student obligations, payments, reversals |
| 10 | Communication | Announcements, conversations/messages (student-teacher, direct, district), notifications, alerts |
| 11 | Resources | Institution and class learning resources |
| 12 | Reporting & Audit | Cross-level reports, immutable audit log |

## A.2 Discovered entities

For each entity: **PK** is `id` (UUID) unless noted. **Ownership** = the aggregate
root or parent that owns its lifecycle. **Offline** = whether the desktop client
needs it available offline. **Sync** = whether local changes must propagate to the
backend. Fields cited come directly from `schema.prisma`.

### Domain 1 — Identity & Access

- **User** — root identity. Rel: 1–1 optional `Student`/`Staff`/`Guardian`
  profiles, 1–1 `UserPreference`, 1–N `UserOrganization`, `RefreshToken`,
  `AuditLog`, notifications, conversations. Lifecycle: created → active/inactive
  (`isActive`), `emailVerified`, `lastLoginAt`. Offline: Yes (current user + refs).
  Sync: Yes (read-mostly on desktop; auth stays server-authoritative).
- **UserOrganization** — assigns a `SystemRole` to a user scoped to an
  institution/county/district. Unique `(userId, institutionId, role)`. Ownership:
  User. Offline: Yes (drives authorization context). Sync: Yes.
- **UserPreference** — 1–1 with User; `notificationPreferences`, `readNotificationIds`,
  `officeAddress`. Ownership: User. Offline: Yes. Sync: Yes (LWW candidate).
- **RefreshToken** / **ActivationToken** — auth artifacts. Ownership: User.
  Offline: No (auth is online). Sync: No. *Excluded from the domain model* — these
  are infrastructure/auth concerns, not business domain.

### Domain 2 — Geography & Administration

- **County** — `code` unique, `name`. 1–N District, Institution, Census, Report.
  Ownership: root (national reference data). Offline: Yes (reference). Sync: pull-only.
- **District** — belongs to County; `code` unique. Ownership: County. Offline: Yes.
  Sync: pull-only.
- **Census** — yearly population stats per county; unique `(countyId, year)`.
  Ownership: County. Offline: rarely. Sync: pull-only.
- **Registry**, **Workflow** — generic `Json`-configured admin records
  (`status: Status`). Ownership: root. Offline: No. Sync: N/A for desktop.

### Domain 3 — Institution

- **Institution** — the school aggregate root. Rich profile: identity (`code`,
  `officialSchoolCode`, `emisCode`, `waecCode`), classification (`type`,
  `ownership`, `accessMode`), location (`address`, `gpsCoordinates` JSON,
  `communityTown`), infrastructure (`numClassrooms`, `hasElectricity`, …),
  approval workflow (`approvalStatus`, `approvedBy`, `approvedAt`,
  `rejectionReason`), assessment classification. Owns: classes, staff, students,
  subjects, academic years, grading config/periods/windows, resources, etc.
  Offline: Yes (the operating school). Sync: Yes.
- **InstitutionLevelOnInstitution** — join to `InstitutionLevel` enum; unique
  `(institutionId, level)`. Ownership: Institution.
- **InstitutionLevelSubject** — subjects offered per level. Ownership: Institution.
- **InstitutionGradingConfig** — 1–1; grading scale (`gradeScale` JSON),
  `passingMarks`, `periodsPerTerm`, `termsPerYear`, `requireAdminApproval`.
  Ownership: Institution. Offline: Yes (drives grade calc rules). Sync: Yes.
- **SchoolReview**, **SchoolAccessRequest**, **InspectionHistory** — governance/
  oversight records. Ownership: Institution. Offline: partial. Sync: Yes.

### Domain 4 — Students

- **Student** — aggregate root within an institution. Identity (`admissionNumber`
  unique, `nationalId?` unique), demographics (`dateOfBirth`, `gender`),
  `gradeLevel?`, approval workflow. Owns: enrollments, attendance, grades,
  submissions, guardians (via join), requests, transfers, averages, fee
  obligations/payments. Offline: Yes. Sync: Yes.
- **Guardian** — parent/guardian; `relationship`, `phoneNumber`, optional 1–1 User.
  Ownership: shared reference; associated to students via `StudentGuardian`.
  Offline: Yes. Sync: Yes.
- **StudentGuardian** — M–N join Student↔Guardian; `isPrimary`; unique
  `(studentId, guardianId)`. Ownership: Student (cascade delete).
- **EnrollmentApplication** — pre-enrollment intake (denormalized guardian fields);
  `status: ApplicationStatus`. Ownership: Institution. Offline: Yes. Sync: Yes.
- **StudentTransfer** — inter-institution transfer request; `status:
  TransferRequestStatus`; from/to institution. Ownership: Student. Sync: Yes.
- **StudentRequest** — student-initiated request (`StudentRequestType`);
  `documents String[]`. Ownership: Student. Sync: Yes.

### Domain 5 — Staff

- **Staff** — aggregate root within an institution; `employeeNumber` (unique per
  institution), `position: StaffPosition`, `employmentType`, qualifications,
  approval workflow. Owns: class/subject teaching assignments, staff attendance,
  teacher notifications, class resources. Offline: Yes. Sync: Yes.
- **StaffAttendance** — daily staff attendance; unique `(staffId, date)`.
  Ownership: Staff. Offline: Yes. Sync: Yes.

### Domain 6 — Academics

- **AcademicYear** — per institution; `startDate`/`endDate`, `isCurrent`; unique
  `(institutionId, name)`. Owns terms, classes, enrollments, grading periods.
  Offline: Yes. Sync: Yes.
- **Term** — belongs to AcademicYear; `isCurrent`. Owns enrollments, grading
  periods, term averages. Offline: Yes. Sync: Yes.
- **Class** — per institution+year; `gradeLevel`, `section?`, `capacity?`; unique
  `(institutionId, academicYearId, name)`. Owns enrollments, attendance,
  assessments, subject/teacher assignments, timetable. Offline: Yes. Sync: Yes.
- **Subject** — per institution; unique `(institutionId, code)`. Offline: Yes.
- **ClassSubject** / **ClassTeacher** / **ClassSubjectTeacher** / **SubjectTeacher** —
  teaching-assignment joins (M–N with attributes). Ownership: Class/Subject.
- **Enrollment** — Student↔Class for a year+term; unique `(studentId,
  academicYearId, termId)`; `status: EnrollmentStatus`. Ownership: Student.
  Offline: Yes. Sync: Yes.
- **TimetableEntry** — class schedule slot; `dayOfWeek`, `startTime`/`endTime`
  (string HH:mm), `room?`; unique `(classId, dayOfWeek, startTime)`. Offline: Yes.

### Domain 7 — Attendance

- **Attendance** — student attendance record; `date @db.Date`, `status:
  AttendanceStatus`, optional `subjectId`, `recordedBy`, `updateReason`; unique
  `(studentId, subjectId, date)`. Ownership: Student (recorded against a Class).
  Offline: **Yes — primary offline write path.** Sync: Yes.

### Domain 8 — Assessments & Grading

- **AssessmentTemplate** — reusable assessment blueprint per class+subject;
  `type`, `totalMarks`, `weight?`. Ownership: Class/Subject.
- **Assessment** — a concrete assessment instance in a grading period; unique
  `(templateId, gradingPeriodId)`. Owns grades. Offline: Yes. Sync: Yes.
- **Grade** — a student's mark on an assessment/subject; unique `(studentId,
  assessmentId)`; `status: GradeStatus`, `isPublished`, computed
  `percentage`/`letterGrade`/`gradePoint`, `lastModifiedBy`. Owns `GradeAudit`.
  Offline: **Yes — primary offline write path.** Sync: Yes (critical → manual
  conflict resolution).
- **GradeAudit** — append-only change log for a grade (`GradeAuditAction`, old/new
  value, actor, IP/UA). Ownership: Grade. Offline: Yes. Sync: Yes (append-only).
- **GradingPeriod** — per institution+year+term; `periodType`, `sequence`,
  `maxMarks`/`passingMarks`, `weight?`; unique `(institutionId, academicYearId,
  termId, code)`. Offline: Yes.
- **GradeEntryWindow** / **GradeEntryWindowClass** — controls when grades may be
  entered (`WindowStatus`, open/close dates, allowed roles). Ownership:
  Institution / (Window↔Class join). Offline: Yes. Sync: Yes.
- **TermAverage** / **YearlyAverage** — computed aggregates (`isPassing`,
  `isPublished`, letter/point). Ownership: Student. Offline: Yes (derived; may be
  recomputed locally). Sync: Yes.
- **Assignment** / **AssignmentSubmission** — homework lifecycle (`AssignmentType`,
  `AssignmentStatus`, `SubmissionStatus`). Ownership: Class/Staff, Student.
  Offline: Yes. Sync: Yes. *(Non-slice; recipe.)*

### Domain 9 — Finance

- **FeeRule** — fee definition; `category: FeeCategory`, `amount`, `currency`
  (default `LRD`), `applicableLevels InstitutionLevel[]`, `isMandatory`.
  Ownership: Institution (nullable → national default). Offline: Yes.
- **StudentFeeObligation** — per student per rule per year+term; `requiredAmount`,
  `totalPaid`, `status: FeeObligationStatus`; unique `(studentId, feeRuleId,
  academicYearId, termId)`. Ownership: Student. Offline: Yes. Sync: Yes.
- **FeePayment** — payment against an obligation; `method: PaymentMethod`,
  `receiptNumber` unique, unique `(reference, institutionId)`, `isReversed`.
  Ownership: Obligation. Offline: Yes. Sync: Yes (financial → careful conflict).
- **FeePaymentReversal** — 1–1 reversal of a payment. Ownership: FeePayment.
  *(Non-slice; recipe.)*

### Domain 10 — Communication

- **Announcement** — institution-wide notice; `priority`, `targetAudience`,
  publish/expiry. Ownership: Institution.
- **Conversation** + **Message** — student↔teacher threads; unique `(studentId,
  teacherId)`; message cascade on conversation delete.
- **DirectConversation** + **DirectMessage** — user↔user threads.
- **DistrictConversation** + **DistrictConversationMessage** — district↔institution.
- **TeacherNotification** / **ParentNotification** / **UserNotification** —
  role-scoped notifications (`isRead`, typed).
- **Alert** — system alert (`AlertType`, `AlertSeverity`, `isResolved`), scoped to
  county/district/institution. Ownership: root/scoped.
- Offline: partial (read-mostly). Sync: Yes. *(Non-slice; recipe.)*

### Domain 11 — Resources

- **Resource** — institution-level file; `category: ResourceCategory`.
- **ClassResource** — class+subject material; `type: ResourceType` (FILE/LINK),
  `category: ClassResourceCategory`, `isVisible`. Ownership: Institution/Class/Staff.
  Offline: Yes (download & cache). Sync: Yes (metadata). *(Non-slice; recipe.)*

### Domain 12 — Reporting & Audit

- **Report** — cross-level report (`ReportType`, `ReportStatus`), `data Json`,
  submit/review workflow, scoped to school/district/county. Ownership: submitter.
  Offline: Yes (draft locally). Sync: Yes.
- **AuditLog** — immutable server-side audit (`AuditAction`, entity ref, `changes`
  Json). Distinct from the desktop-local `audit_log` platform table. Offline: No
  (this is the backend's audit). Sync: append-only push. *(Non-slice; recipe.)*

## A.3 Entity relationships (overview)

```
County ──1:N── District ──1:N── Institution ══ (aggregate root of school ops)
                                     │
        ┌────────────┬──────────────┼───────────────┬─────────────┐
        │            │              │               │             │
     Student       Staff       AcademicYear       Subject     GradingConfig(1:1)
        │            │              │               │
   StudentGuardian   │            Term            ClassSubject
   (M:N Guardian)     │             │
        │            └──ClassTeacher┤
     Enrollment ──────────────────Class──── TimetableEntry
        │                           │
     Attendance                 Assessment ◄── AssessmentTemplate
        │                           │
      Grade ──1:N── GradeAudit      │
        │                           │
   TermAverage / YearlyAverage  GradingPeriod ── GradeEntryWindow ── (M:N) Class
        │
   StudentFeeObligation ──1:N── FeePayment ──1:1── FeePaymentReversal
        ▲
     FeeRule
```

Relationship kinds present:

- **1–1:** User↔UserPreference, User↔Student/Staff/Guardian profile,
  Institution↔InstitutionGradingConfig, FeePayment↔FeePaymentReversal.
- **1–N:** County→District, Institution→Class/Student/Staff/Subject,
  AcademicYear→Term, Class→Attendance/Enrollment, Grade→GradeAudit.
- **M–N (with attributes):** Student↔Guardian (StudentGuardian),
  Class↔Subject (ClassSubject), Class↔Teacher (ClassTeacher),
  Class×Subject↔Teacher (ClassSubjectTeacher), Window↔Class
  (GradeEntryWindowClass).
- **Composition (cascade delete):** Institution→InstitutionLevel, Student→
  StudentGuardian, Conversation→Message, GradeEntryWindow→GradeEntryWindowClass.
- **Aggregation (SetNull / optional):** Report→submittedBy/reviewedBy (SetNull),
  Attendance→recorder (optional), FeeRule→Institution (nullable = national).
- **Inheritance:** none in the schema — profiles (Student/Staff/Guardian) are
  **composition over a User**, not inheritance. The domain preserves this.

## A.4 Existing shared types (backend `@nemis/types`) — reuse map

The backend `@nemis/types` package exports (see `packages/types/src/index.ts`):
enums (`enums.ts`), auth contracts (`auth.ts`), user (`user.ts`), messaging,
finance, DEO, alerts, ministry-admin, CEO-audit, and a large `nemis.ts` barrel of
entity/DTO types (Student, Staff, Class, Enrollment, Term, AcademicYear, Grade,
Guardian, TimetableEntry, …).

**Reuse strategy (per Decision 2):** we cannot import these across the workspace
boundary. Instead:

- **Enums** → re-declared in `@nemis-desktop/types/src/enums.ts` as `as const`
  unions, value-for-value identical to `@nemis/types` `enums.ts` + `schema.prisma`,
  each with a `// canonical: @nemis/types enums.ts` annotation. These are the
  single local source consumed by both the domain layer and the future data/IPC
  layers.
- **DTO/response/request types** (from `nemis.ts`, `auth.ts`, etc.) → **not**
  copied wholesale. The domain layer defines its own rich entities; DTO shapes are
  only mirrored into `@nemis-desktop/types` when a concrete IPC/sync boundary needs
  them (future phases), keeping this phase focused. Where a DTO informs an entity's
  shape, the entity's `reconstitute()`/props type documents the lineage.

Reused (mirrored) enums include: `SystemRole`, `Status`, `Gender`, `InstitutionType`,
`OwnershipType`, `AccessMode`, `InstitutionLevel`, `GradeLevel`, `EnrollmentStatus`,
`AttendanceStatus`, `AssessmentType`, `GradeStatus`, `GradeAuditAction`,
`ApprovalStatus`, `ApplicationStatus`, `TransferRequestStatus`, `StaffPosition`,
`EmploymentType`, `PeriodType`, `WindowStatus`, `FeeCategory`, `FeeObligationStatus`,
`PaymentMethod`, `DayOfWeek`, and the notification/alert/report enums (full list in
the Mapping Matrix and mirrored file).

## A.5 Desktop-only types (offline existence)

These exist **only** because the client is offline-first. They already live in the
Phase 2/3 data layer (`electron/data/models/platform.ts`) and are **not**
duplicated in the domain package — the domain references the *concepts*, not the
infra types:

- **Device** — one desktop installation identity (`deviceId`). Why: the conflict
  model keys on device.
- **SyncMetadata** — last sync time, schema/db version, `syncStatus`. Why: resumable
  sync.
- **SyncQueueItem** — pending local operation (`entityType`, `operationType`,
  `payload`). Why: offline-first write-then-sync contract.
- **SyncError** — failed operation record. Why: fault tolerance/retry.
- **AuditLogEntry** (local) — desktop-local audit distinct from backend `AuditLog`.
  Why: local traceability before sync.

**Domain-relevant concurrency metadata** (`version`, `updatedAt`, `lastModifiedBy`)
*is* modeled in the kernel `AggregateRoot` because it is legitimately business/
conflict-resolution state per the CLAUDE.md conflict model. `deviceId` is **not**
in the domain — it is assigned at the sync layer (pure infrastructure identity).

---

# PART B — Domain Mapping Matrix (all 66 models)

Legend: **Slice** = built this phase (✔) or recipe (·). SQLite table = the future
Phase-5 local table (snake_case, mirrors Prisma `@@map`).

| # | Prisma Model | Domain Entity | Domain | SQLite Table (future) | Sync | Offline | Slice |
|---|--------------|---------------|--------|------------------------|------|---------|-------|
| 1 | User | User (AR) | Identity | users | Yes | Yes | ✔ |
| 2 | UserOrganization | UserOrganization | Identity | user_organizations | Yes | Yes | ✔ |
| 3 | UserPreference | UserPreference | Identity | user_preferences | Yes | Yes | · |
| 4 | RefreshToken | — (excluded: auth infra) | Identity | — | No | No | — |
| 5 | ActivationToken | — (excluded: auth infra) | Identity | — | No | No | — |
| 6 | County | County | Geography | counties | Pull | Yes | · |
| 7 | District | District | Geography | districts | Pull | Yes | · |
| 8 | Census | Census | Geography | census | Pull | No | · |
| 9 | Registry | Registry | Geography | registries | No | No | · |
| 10 | Workflow | Workflow | Geography | workflows | No | No | · |
| 11 | Institution | Institution (AR) | Institution | institutions | Yes | Yes | ✔ |
| 12 | InstitutionLevelOnInstitution | InstitutionLevel (VO/child) | Institution | institution_levels | Yes | Yes | ✔ |
| 13 | InstitutionLevelSubject | InstitutionLevelSubject | Institution | institution_level_subjects | Yes | Yes | · |
| 14 | InstitutionGradingConfig | GradingConfig | Institution | institution_grading_configs | Yes | Yes | ✔ |
| 15 | SchoolReview | SchoolReview | Institution | school_reviews | Yes | No | · |
| 16 | SchoolAccessRequest | SchoolAccessRequest | Institution | school_access_requests | Yes | No | · |
| 17 | InspectionHistory | InspectionHistory | Institution | inspection_history | Yes | No | · |
| 18 | Student | Student (AR) | Students | students | Yes | Yes | ✔ |
| 19 | Guardian | Guardian (AR) | Students | guardians | Yes | Yes | ✔ |
| 20 | StudentGuardian | StudentGuardian | Students | student_guardians | Yes | Yes | ✔ |
| 21 | EnrollmentApplication | EnrollmentApplication | Students | enrollment_applications | Yes | Yes | · |
| 22 | StudentTransfer | StudentTransfer | Students | student_transfers | Yes | Yes | · |
| 23 | StudentRequest | StudentRequest | Students | student_requests | Yes | Yes | · |
| 24 | Staff | Staff (AR) | Staff | staff | Yes | Yes | · |
| 25 | StaffAttendance | StaffAttendance | Staff | staff_attendance | Yes | Yes | · |
| 26 | AcademicYear | AcademicYear (AR) | Academics | academic_years | Yes | Yes | ✔ |
| 27 | Term | Term | Academics | terms | Yes | Yes | ✔ |
| 28 | Class | Class (AR) | Academics | classes | Yes | Yes | ✔ |
| 29 | Subject | Subject (AR) | Academics | subjects | Yes | Yes | ✔ |
| 30 | ClassSubject | ClassSubject | Academics | class_subjects | Yes | Yes | ✔ |
| 31 | ClassTeacher | ClassTeacher | Academics | class_teachers | Yes | Yes | · |
| 32 | ClassSubjectTeacher | ClassSubjectTeacher | Academics | class_subject_teachers | Yes | Yes | · |
| 33 | SubjectTeacher | SubjectTeacher | Academics | subject_teachers | Yes | Yes | · |
| 34 | Enrollment | Enrollment | Academics | enrollments | Yes | Yes | ✔ |
| 35 | TimetableEntry | TimetableEntry | Academics | timetable_entries | Yes | Yes | · |
| 36 | Attendance | Attendance (AR) | Attendance | attendance | Yes | Yes | ✔ |
| 37 | AssessmentTemplate | AssessmentTemplate | Assessments | assessment_templates | Yes | Yes | · |
| 38 | Assessment | Assessment (AR) | Assessments | assessments | Yes | Yes | ✔ |
| 39 | Grade | Grade (AR) | Assessments | grades | Yes | Yes | ✔ |
| 40 | GradeAudit | GradeAudit | Assessments | grade_audits | Yes | Yes | ✔ |
| 41 | GradingPeriod | GradingPeriod | Assessments | grading_periods | Yes | Yes | ✔ |
| 42 | GradeEntryWindow | GradeEntryWindow | Assessments | grade_entry_windows | Yes | Yes | · |
| 43 | GradeEntryWindowClass | GradeEntryWindowClass | Assessments | grade_entry_window_classes | Yes | Yes | · |
| 44 | TermAverage | TermAverage | Assessments | term_averages | Yes | Yes | · |
| 45 | YearlyAverage | YearlyAverage | Assessments | yearly_averages | Yes | Yes | · |
| 46 | Assignment | Assignment | Assessments | assignments | Yes | Yes | · |
| 47 | AssignmentSubmission | AssignmentSubmission | Assessments | assignment_submissions | Yes | Yes | · |
| 48 | FeeRule | FeeRule | Finance | fee_rules | Yes | Yes | · |
| 49 | StudentFeeObligation | StudentFeeObligation | Finance | student_fee_obligations | Yes | Yes | · |
| 50 | FeePayment | FeePayment | Finance | fee_payments | Yes | Yes | · |
| 51 | FeePaymentReversal | FeePaymentReversal | Finance | fee_payment_reversals | Yes | Yes | · |
| 52 | Announcement | Announcement | Communication | announcements | Yes | Yes | · |
| 53 | Conversation | Conversation | Communication | conversations | Yes | No | · |
| 54 | Message | Message | Communication | messages | Yes | No | · |
| 55 | DirectConversation | DirectConversation | Communication | direct_conversations | Yes | No | · |
| 56 | DirectMessage | DirectMessage | Communication | direct_messages | Yes | No | · |
| 57 | DistrictConversation | DistrictConversation | Communication | district_conversations | Yes | No | · |
| 58 | DistrictConversationMessage | DistrictConversationMessage | Communication | district_conversation_messages | Yes | No | · |
| 59 | TeacherNotification | TeacherNotification | Communication | teacher_notifications | Yes | Yes | · |
| 60 | ParentNotification | ParentNotification | Communication | parent_notifications | Yes | Yes | · |
| 61 | UserNotification | UserNotification | Communication | user_notifications | Yes | Yes | · |
| 62 | Alert | Alert | Communication | alerts | Yes | No | · |
| 63 | Resource | Resource | Resources | resources | Yes | Yes | · |
| 64 | ClassResource | ClassResource | Resources | class_resources | Yes | Yes | · |
| 65 | Report | Report | Reporting | reports | Yes | Yes | · |
| 66 | AuditLog | AuditLog (backend) | Reporting | audit_logs | Push | No | · |

*(AR = aggregate root. RefreshToken/ActivationToken are intentionally excluded
from the domain model as authentication infrastructure — documented divergence.)*

---

# PART C — Domain Layer Design

## C.1 Architecture & dependency position

```
┌─────────────────────────────────────────────────────────┐
│ Presentation (renderer: React/Next)   — NOT domain       │
├─────────────────────────────────────────────────────────┤
│ IPC / Application services (main)      — maps to/from     │
├─────────────────────────────────────────────────────────┤
│ Data Access Layer (Phase 3)            — persists         │
│   mappers:  SQLite row  ⇄  Domain entity                  │
├─────────────────────────────────────────────────────────┤
│ ▶ DOMAIN LAYER (this phase) @nemis-desktop/domain         │
│   pure TypeScript · entities · value objects ·            │
│   specifications · events · exceptions · kernel           │
├─────────────────────────────────────────────────────────┤
│ @nemis-desktop/types  — enums + shared contracts (only    │
│                          dependency the domain may use)   │
└─────────────────────────────────────────────────────────┘
```

The domain depends **only** on `@nemis-desktop/types`. It never imports Electron,
React, Next, better-sqlite3/SQLite, IPC, repositories, or sync code. It compiles
and tests standalone via `pnpm --filter @nemis-desktop/domain typecheck`.

## C.2 Folder structure

```
packages/domain/
  package.json          @nemis-desktop/domain (deps: @nemis-desktop/types)
  tsconfig.json         extends ../../tsconfig.base.json
  eslint.config.mjs     no-restricted-imports guard (bans infra)
  src/
    index.ts            public barrel
    core/                          ── the shared kernel ──
      identifier.ts       branded Id<TBrand> + UUID helpers
      entity.ts           Entity<TId>  (identity equality)
      aggregate-root.ts   AggregateRoot<TId> (events + version/updatedAt)
      value-object.ts     ValueObject<TProps> (frozen, structural equals)
      domain-event.ts     DomainEvent base + registry types
      specification.ts    Specification<T> + and/or/not combinators
      guard.ts            small invariant helpers (throw domain exceptions)
    exceptions/
      domain-exception.ts            DomainException (base, code+message)
      business-rule-violation.ts
      entity-validation.ts
      invalid-state.ts
      invalid-value-object.ts
      index.ts
    value-objects/        ── cross-cutting VOs ──
      person-name.ts  email-address.ts  phone-number.ts  national-id.ts
      address.ts  gps-location.ts  date-range.ts  date-of-birth.ts
      money.ts  percentage.ts  marks.ts  index.ts
    enums/
      index.ts            re-exports from @nemis-desktop/types (domain-facing)
    identity/             ── slice domain ──
      entities/ (user.ts, user-organization.ts)
      value-objects/ (email already shared; role-scope.ts)
      specifications/ (can-sync-entity.ts)
      events/ (user-created.ts)
      factories/ (user.factory.ts)
      index.ts
    institution/
      entities/ (institution.ts, grading-config.ts)
      value-objects/ (school-code.ts)
      specifications/ (is-institution-approved.ts)
      events/  factories/  index.ts
    students/
      entities/ (student.ts, guardian.ts, student-guardian.ts)
      value-objects/ (admission-number.ts)
      specifications/ (can-enroll-student.ts)
      events/ (student-created.ts)  factories/  index.ts
    academics/
      entities/ (academic-year.ts, term.ts, class.ts, subject.ts, enrollment.ts)
      value-objects/ (academic-year-code.ts)
      specifications/ (is-enrollment-open.ts)
      events/ (enrollment-created.ts)  factories/  index.ts
    attendance/
      entities/ (attendance.ts)
      specifications/ (can-record-attendance.ts)
      events/ (attendance-recorded.ts, attendance-corrected.ts)
      factories/  index.ts
    assessments/
      entities/ (grading-period.ts, assessment.ts, grade.ts, grade-audit.ts)
      specifications/ (is-grade-entry-window-open.ts, can-publish-grade.ts)
      events/ (grade-published.ts, assessment-created.ts)
      factories/  index.ts
    _extension-template/  ── documented recipe for the 6 remaining domains ──
      README.md           step-by-step: model a domain entity + VO + spec + event
      example.template.ts
```

**Documented divergence from the spec's technical-first layout:** the spec lists a
single flat `entities/`, `value-objects/`, `specifications/`, etc. We use
feature-first folders (kernel + cross-cutting + per-domain) because 66 entities in
one flat folder is unmaintainable and violates the spec's own "organize for
long-term maintainability" instruction. Technical categories still exist — they are
nested *within* each domain.

## C.3 Kernel

- **`Identifier` / branded ids** — `type StudentId = Id<'Student'>` prevents
  passing a ClassId where a StudentId is expected. UUID validation helper.
- **`Entity<TId>`** — holds a readonly `id`; equality by id + type. Protected
  constructor. No public setters.
- **`AggregateRoot<TId> extends Entity`** — additionally carries conflict metadata
  (`version: number`, `updatedAt: string` ISO, optional `lastModifiedBy`), and an
  internal `_events: DomainEvent[]` with `protected addEvent()` and public
  `pullDomainEvents(): DomainEvent[]` (drains). No dispatching here.
- **`ValueObject<TProps>`** — constructor `Object.freeze`s props; `equals(other)`
  by deep structural comparison; each concrete VO exposes a static `create(...)`
  that validates and throws `InvalidValueObjectException`.
- **`DomainEvent`** — `{ readonly name: string; readonly occurredAt: string;
  readonly aggregateId: string; ... }`. Concrete events are plain immutable data.
- **`Specification<T>`** — `isSatisfiedBy(candidate: T): boolean`; base provides
  `.and()`, `.or()`, `.not()` returning composed specifications.
- **`guard`** — tiny invariant helpers (`guard.againstEmpty`, `guard.range`) that
  throw `EntityValidationException` / `InvalidValueObjectException`.

## C.4 Value Object strategy

Every VO is immutable (frozen), self-validating (static `create`), and reusable.
Cross-cutting (in `value-objects/`):

| VO | Wraps / validates | Reused by |
|----|-------------------|-----------|
| `PersonName` | first/middle/last, non-empty | User, Student, Staff, Guardian |
| `EmailAddress` | RFC-ish email | User, Student, Staff, Guardian |
| `PhoneNumber` | Liberia-format tolerant | User, Guardian, Staff, Institution |
| `NationalId` | optional national id uniqueness shape | Student, Staff |
| `Address` | free-form + community/town | Institution, Student, Staff |
| `GpsLocation` | lat/lng bounds (from `gpsCoordinates` JSON) | Institution |
| `DateRange` | start ≤ end invariant | AcademicYear, Term, GradingPeriod, Window |
| `DateOfBirth` | past date, plausible age | Student, Staff |
| `Money` | amount ≥ 0 + currency (default `LRD`) | FeeRule, obligation, payment |
| `Percentage` | 0–100 | Grade, averages |
| `Marks` | `obtained ≤ total`, both ≥ 0 | Grade, Assessment |

Domain-local VOs live with their domain: `SchoolCode` (Institution),
`AdmissionNumber` (Student), `AcademicYearCode` (AcademicYear), `RoleScope`
(UserOrganization).

## C.5 Enum strategy

Canonical enums are mirrored into `@nemis-desktop/types/src/enums.ts` as
`as const` objects + derived unions (matching `platform.ts`), value-identical to
`schema.prisma`, each annotated with its backend source. The domain's `enums/`
folder re-exports them for domain-facing ergonomics. No enum is defined twice; the
`@nemis-desktop/types` copy is the single local source for domain + data + IPC.

## C.6 Specification strategy

Reusable business rules only — **no workflows/orchestration**:

- `IsEnrollmentOpen` (academics) — academic year/term current + window checks.
- `CanRecordAttendance` (attendance) — date not in future, enrollment active,
  no existing record for `(student, subject, date)`.
- `CanPublishGrade` / `IsGradeEntryWindowOpen` (assessments) — window open,
  grade in a publishable `GradeStatus`.
- `CanSyncEntity` (identity/core) — entity has required concurrency metadata.
- `IsInstitutionApproved` (institution) — `approvalStatus === APPROVED`.

Specifications are composable via `.and/.or/.not` and are unit-tested in isolation.

## C.7 Domain event strategy

Definitions only (no dispatcher, no bus — that is a later infrastructure concern):
`UserCreated`, `StudentCreated`, `EnrollmentCreated`, `AttendanceRecorded`,
`AttendanceCorrected`, `GradePublished`, `AssessmentCreated`. Aggregates append
events during behavior methods; callers `pullDomainEvents()`. This positions
Phase 5+ to translate events into sync-queue operations without changing the domain.

## C.8 Exception strategy

Self-contained hierarchy rooted at `DomainException` (carries `code` + `message`,
mirrors the `ApplicationError` shape so the IPC layer can map it later, but does
**not** import it — the domain must not depend on infra `@nemis-desktop/shared`):

- `BusinessRuleViolationException` — a specification/business rule failed.
- `EntityValidationException` — an entity invariant was violated.
- `InvalidStateException` — an operation is illegal for the entity's current state
  (e.g. publishing an already-locked grade).
- `InvalidValueObjectException` — a value object failed validation.

Documented relationship: `@nemis-desktop/shared`'s `ApplicationError`/
`toIpcErrorPayload` stays the infra-facing error boundary; a future adapter maps
`DomainException.code` → `IpcErrorCode`.

## C.9 Rich models (no anemic models)

Entities use private constructors with static `create(props)` (new, enforces
invariants + emits creation event) and `reconstitute(props)` (rehydrate from
persistence, no event). Behavior lives on the entity: e.g.
`Attendance.correct(status, reason, by)`, `Grade.publish(by)` /
`Grade.lock(by)`, `Enrollment.withdraw(reason)`, `Institution.approve(by)`.
Factories (`*.factory.ts`) handle multi-entity construction (e.g. building a
`Student` with its initial `StudentGuardian` links).

## C.10 Testing

Vitest (root-configured), TDD per superpowers `test-driven-development`. Coverage
targets for the slice: every VO's validation (happy + each failure), every entity
invariant and behavior transition, every specification (satisfied + unsatisfied +
composition). Tests colocate as `*.test.ts` beside sources (matching Phase 3).

## C.11 Enforcement

- `@nemis-desktop/domain/eslint.config.mjs` adds `no-restricted-imports` banning
  `electron`, `react`, `next`, `better-sqlite3*`, `*/database/*`, `*/data/*`,
  `*/ipc/*`, and `@nemis-desktop/shared`.
- `pnpm -r typecheck` proves the package compiles independently.
- `pnpm test` runs the domain unit tests.
- `pnpm lint` passes.

---

# PART D — Deliverables, Debt, Recommendations

## D.1 Deliverables produced this phase

1. Domain Discovery Report (Part A). ✔
2. Domain Mapping Matrix — all 66 (Part B). ✔
3. Domain Architecture Diagram (C.1). ✔
4. Entity Relationship Diagram (A.3). ✔
5. Folder Structure (C.2). ✔
6. Reused Shared Types (A.4). ✔
7. New Desktop-only Types (A.5). ✔
8. Value Object Strategy (C.4). ✔
9. Domain Event Strategy (C.7). ✔
10. Specification Strategy (C.6). ✔
11. Exception Strategy (C.8). ✔
12. Remaining Technical Debt (D.2). ✔
13. Recommendations before Phase 5 (D.3). ✔

## D.2 Remaining technical debt (intentional, tracked)

- **6 domains modeled by recipe, not code:** Geography, Staff(standalone),
  Finance, Communication, Resources, Reporting/Audit. Discovery-complete;
  implementation deferred with a template. Extend before their features ship.
- **Enum mirror drift risk:** `@nemis-desktop/types` enums are a hand-synced copy
  of `@nemis/types`. Mitigation: annotations + a follow-up idea to generate them
  from the Prisma schema in CI (see D.3).
- **DTO/response contracts not mirrored** beyond enums — deferred to the phase that
  introduces the concrete IPC/sync boundary needing them.
- **No mappers yet** between domain entities and Phase 3 repositories — that wiring
  belongs to the phase that persists business entities (post-slice).

## D.3 Recommendations before Phase 5

1. **Add a schema-drift check** (CI): parse `schema.prisma` enums and assert the
   `@nemis-desktop/types` mirror matches, so backend enum changes can't silently
   diverge.
2. **Define the domain↔persistence mapper contract** next: repositories return
   entities via `reconstitute()`; write a mapper per aggregate as its table lands.
3. **Wire the event→sync-queue adapter** when sync starts: translate
   `pullDomainEvents()` output into `SyncQueueItem`s, preserving the offline-first
   write-then-sync order.
4. **Prioritize the recipe domains by offline write pressure:** Staff/StaffAttendance
   and Finance next (they have real offline write paths), Communication/Resources
   later (read-mostly).
5. **Keep authorization in the backend** — `SystemRole`/`UserOrganization` are
   modeled for context only; the domain must not encode national authorization
   decisions (CLAUDE.md boundary).
