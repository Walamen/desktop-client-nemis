# Academic Foundation

The Academic Foundation module provides the local reference data required by
the NEMIS Desktop operational modules. It is deliberately offline-first: all
reads and writes execute against the encrypted local SQLite database through
the same layered architecture used by the rest of the desktop application.

## Scope

- Academic years, including current-year and lifecycle status management
- Terms belonging to an academic year
- National grade-level reference data (a fixed backend-compatible enum)
- Classes/sections and subject assignment
- Subjects
- Read-only school profile and device/academic settings views

Student, teacher, attendance, assessment, synchronization, authentication, and
remote profile editing are intentionally outside this module.

## Data flow

```text
Next.js page
  -> AcademicFoundationViewModel
  -> ApplicationLayer facade
  -> typed IPC/preload bridge
  -> Electron handler + input validator
  -> application use case
  -> SQLite repository / transaction
  -> encrypted local database
```

React only reads a ViewModel store and invokes ViewModel actions. It does not
call a repository or `window.nemis` directly. The IPC contract in
`packages/types/src/ipc.ts` remains the single source of truth for all
renderer-visible endpoints.

## CRUD lifecycle and validation

| Area | Lifecycle | Important rules |
| --- | --- | --- |
| Academic years | Create, edit, set current, close, archive, restore | One current active year; unique code per school; valid date range; closed/archived years cannot become current. |
| Terms | Create, edit, set current, delete | Belongs to one year; unique name in that year; dates must fall within the parent year. |
| Classes | Create, edit, deactivate, restore | Belongs to a non-archived year; fixed grade level; unique name within school/year; capacity 1–1000. |
| Subjects | Create, edit, deactivate, restore | Unique normalized code per school; subject assignment requires active class and subject. |
| Class subjects | Assign, remove | Class/subject pair is unique. |

Classes and subjects use `isActive` as their soft-delete/restore mechanism.
Academic years use `ACTIVE`, `CLOSED`, and `ARCHIVED`. Terms use hard delete,
matching the current backend policy.

## UI and state

The school-admin shell exposes pages for Academic Years, Terms, Grade Levels,
Classes, Subjects, School Profile, and Settings. Classes and subjects provide
local search, filter/sort options, pagination, professional empty states, and
modal-based create/edit actions. The Grade Levels page is read-only because
grade levels are national reference data rather than school-managed rows.

Command actions notify the user and reload the affected local list after a
successful write. This avoids speculative state while keeping data consistent
with the transactional database result.

## Folder map

- `packages/domain/src/academics` — aggregates, events, value objects, rules
- `packages/application/src/use-cases/academics` — workflow orchestration
- `apps/desktop/electron/data/repositories/sqlite/business` — SQLite adapters
- `apps/desktop/electron/ipc/handlers` — validated IPC endpoints
- `packages/presentation/src/view-models/academic-foundation` — renderer state
- `apps/desktop/renderer/components/academic` — desktop interaction screens

## Future extension

Operational modules should reference the stable IDs produced here; they should
not recreate academic years, classes, or subjects. When adding a future module,
first extend the typed IPC contract, then add a validator, handler, facade
method, ViewModel action, and UI. Sync-queue enqueueing remains intentionally
deferred to the synchronization phase.
