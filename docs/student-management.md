# Student Management and Enrollment

Phase 10 provides the first offline operational module. Student, guardian, and
enrollment writes use the encrypted SQLite database and retain synchronization
metadata without implementing synchronization itself.

## Architecture

```text
Students React pages
  -> StudentsList / StudentSearch / StudentProfile / Enrollment ViewModels
  -> shared StudentsViewModel coordinator
  -> Student/Academics Application Services
  -> Student and Enrollment domain aggregates
  -> repository interfaces
  -> validated Electron IPC handlers
  -> SQLite student/guardian/enrollment repositories
  -> encrypted nemis.db
```

The renderer never imports the application or repository packages and never
touches `window.nemis` outside the bridge service.

## Enrollment workflow

```text
Select student -> current active year -> term in year -> active class in year
  -> validate one enrollment per student/year/term
  -> transactionally persist Enrollment(ACTIVE)
  -> refresh student enrollment history and dashboard

Active enrollment -> choose active class in the same academic year
  -> validate target and enrollment state
  -> update the existing enrollment transactionally
  -> refresh enrollment history
```

## Student lifecycle

```text
Create (active) -> edit profile -> enroll / add guardians
       |                                  |
       +------------> archive <-----------+
                         |
                      restore
```

Archived students remain searchable for audit/history but cannot be edited or
enrolled. Admission numbers are unique within the local school. Student
documents and activity are explicit placeholders because the backend schema has
no desktop persistence contract for them yet.

## Pages

- Student directory with server-side-style local search, filters, pagination,
  sort-ready DTOs, and bulk-selection preparation
- Create and edit student forms
- Student profile summary, guardians, enrollment history, archive/restore
- Enrollment wizard using Academic Foundation years, terms, grades, and classes
- Documents and activity placeholders

## IPC endpoints

`student:list`, `student:get`, `student:create`, `student:update`,
`student:set-active`, `student:create-guardian`, `student:enroll`, and
`student:move-class`, and `student:list-enrollments`. All requests use
exact-shape bounded validators.

## Performance and future sync

Search uses indexed name, admission number, gender, grade/status, enrollment,
and foreign-key columns. Lists are paged and sorted using hardcoded order
expressions; inputs never become SQL fragments. Prepared statements are cached.
Rows keep version, update, modifier, and device metadata for a later sync phase.

## Phase boundaries

- School provisioning remains a prerequisite owned by the later onboarding or
  synchronization phase; Phase 10 consumes the configured school.
- Guardian edit/removal is not exposed until the production backend defines
  those workflow and audit semantics.
- Photo/document binary storage, timeline persistence, bulk import execution,
  and historical trend aggregation remain the explicit future placeholders
  required by the Phase 10 specification. The directory now provides real
  cross-page selection state and a stable bulk-selection extension hook.
