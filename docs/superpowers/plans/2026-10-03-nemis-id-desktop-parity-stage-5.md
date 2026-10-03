# NEMIS ID Desktop Parity — Stage 5 (End-of-Year Outcomes, offline + queued) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a school admin record each student's end-of-year outcome (Promoted / Retained / Graduated) on the desktop, offline, from a locally derived cohort, with the decisions queued and pushed to the server's grade-completion endpoint when online.

**Architecture:** The server snapshot gains the school's own grade completions and a minimal record of students who left during the current or most recently ended year (plus their enrolments in this school's classes), so the cohort can be derived locally. A new local `grade_completions` table (migration 029) holds pulled stamps as `synced` and the admin's decisions as `pending`; a dedicated `GradeCompletionSyncService` pushes pending decisions per (year, grade), like the fee-reversal service. A new End-of-Year Outcomes screen reads the cohort through new IPC channels.

**Tech Stack:** NestJS + Prisma + Jest (`Nemis/apps/Server`, Task 1); Electron + better-sqlite3 + Vitest + React Testing Library (desktop).

**Spec:** `docs/superpowers/specs/2026-10-02-nemis-id-desktop-parity-design.md` — §2 (D2, D5, D7), §9 (Stage 5, as amended). Server behaviour to mirror: `Nemis/apps/Server/src/enrollments/enrollments.service.ts` — `getCohortForCompletion` and `recordGradeCompletions`.

> **Granularity.** This plan is written at requirement level throughout, by the user's choice: each task gives exact names, behaviour, copy and mandatory test cases, and the implementer writes the code against the real files. Every listed test case is mandatory; write it first and see it fail.

## Global Constraints

- Desktop branch: `nemis-id-desktop-parity-stage-5` (already created from `main` @ `93d5dc2`; its first commit is this plan). Server branch (Task 1): create `nemis-id-desktop-parity-stage-5` in `Nemis` from `main` @ `47bb6ea5`; the server dir on disk is `apps/Server`. Never commit to `main`.
- Sidebar label and page heading, verbatim: `End-of-Year Outcomes`. Route: `/government/school-admin/students/promote`.
- Outcomes, verbatim labels: `Promoted`, `Retained`, `Graduated` (server values `PROMOTED` / `RETAINED` / `GRADUATED`). `GRADUATED` has no next grade.
- Copy, verbatim: `Grade changes apply after sync.`; offline averages note `Averages are shown when online.`; averages column shows `—` offline.
- D7: saving a decision never changes local `Student.gradeLevel` or enrolment status — the server does that when the stamp is accepted, and the pull brings it.
- `grade_completions` has **no outbox trigger**; it has its own push path.
- A pull never overwrites a local `grade_completions` row whose `syncState` is `pending` or `rejected`.
- The cohort mirrors `getCohortForCompletion`: enrolment in that year in this school's classes at that grade (deduplicated across terms) ∪ this school's stamps at that year and grade − anyone stamped that year at a different grade; **no `isActive` filter** (leavers stay); `unenrolledCount` = active students of this school at that grade not in (cohort ∪ stamped-elsewhere set).
- Server stamping is all-or-nothing per request: a 4xx rejects the whole (year, grade) group.
- The user's Electron app is usually running and locks `node_modules/better-sqlite3/build/Release/better_sqlite3.node`; never kill it. For SQLite tests: rename the locked file aside, `pnpm rebuild:node`, test, restore the original (2281472 bytes, Jun 18 09:16).
- Desktop: `pnpm vitest run <path>`, `pnpm typecheck`, `pnpm lint` (6 pre-existing errors). Server: from `Nemis/apps/Server`, `npx jest <path>`, `npx tsc --noEmit`. Known failures: desktop `renderer/app/page.test.tsx` (+ occasionally `teacher/timetable/timetable.test.tsx`); server `desktop-provisioning.service.spec.ts` "includes every district…", rarely `nemis-id.spec.ts`.
- `noUncheckedIndexedAccess` on; CRLF kept. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Scope rulings (decided while planning)

- **Departed students carry `dateOfBirth`.** Spec §9.1's minimal projection omits it, but the local `students.dateOfBirth` column is `NOT NULL`; the school that taught the child already holds it. Contact fields (phone, email, address) stay null; `admissionDate` null.
- **The push ordering gate waits only on `pending` / `in_flight` queue rows** for `students` and `enrollments`, not on everything "not completed": a dead-lettered row never self-resolves and would block outcomes forever.
- **The `verifyDatabase` exemption is re-keyed** (spec §9.1 amendment): a student whose `institutionId` is not a local institution is exempt when a local APPROVED transfer has `fromInstitutionId` = the workspace institution and `studentId` = that student — covering multi-hop moves (1→2→3).
- **Grades and attendance are not widened for departed students in this stage**, although spec §9.1's amendment mentions them: the cohort and the push need only the student rows and their enrolments; departed children's history therefore still survives only until the 24-hour full resync. Recorded as a known limit.
- **Guidance averages online only**, read through a new read-only channel against the server's existing `GET /enrollments/grade-completions` (no refresh).

## Review Focus

1. **A child who left mid-year** — appears in the old school's cohort for that year with their name, never in the students list or dashboard, and the import does not fail for them (Task 1 + Task 2 tests).
2. **A rejected group** (e.g. one student stamped at another grade on the web meanwhile) — every row in the group shows the server's message with student ids mapped to local names, and editing + saving a row returns it to pending (Task 4 + Task 5 tests).
3. **Offline then online** — decisions saved offline stay `pending`, survive a pull, and push on the next cycle once queued students/enrolments have gone (Task 2 + Task 4 tests).
4. **A dead-lettered student/enrolment row** — never blocks outcomes forever (Task 4 test).
5. **A school with no current academic year or no classes at a grade** — the screen explains it rather than showing an empty, unexplained table (Task 5 test).

---

### Task 1: Server — snapshot stamps and departed cohort students

**Repo:** `C:/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis` (dir `apps/Server`). First step: `git switch -c nemis-id-desktop-parity-stage-5`.

**Files:** `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` (+ its spec); the shared provisioning data type the snapshot satisfies (find it — the service ends with a `satisfies` check).

**Behaviour:**
- New snapshot collection `gradeCompletions`: the school's own `GradeCompletion` rows (`institutionId` = workspace institution), delta-filtered by `updatedAt` like other collections, mapped field by field to: `id, studentId, institutionId, academicYearId, gradeLevel, outcome, nextGradeLevel, averageAtDecision, notes, decidedBy, amendedBy, amendedAt, createdAt, updatedAt` (dates as ISO strings; `averageAtDecision` as a number or null). Teacher-scope snapshots get `[]` for it (follow how the teacher restriction blanks other admin collections).
- **Departed cohort students** (admin scope only): define the cohort window as this institution's current academic year plus its most recently ended one (greatest past `endDate`). Students with an enrolment in one of this institution's classes in a window year, who are **no longer** at this institution, are added to the students collection with a minimal projection: `id, institutionId, firstName, middleName, lastName, nemisId, dateOfBirth, gender, gradeLevel, isActive, updatedAt` plus the constant fields the existing mapping uses (`version`, `lastModifiedBy`), and `admissionDate`, `phoneNumber`, `email`, `address` as null. No guardians or links for them.
- Their enrolments in this institution's classes in the window years are included in the enrollments collection.
- Delta pulls: these rows follow the same `updatedAt > since` rule as the rest of their collection.
- Do not widen grades or attendance in this stage (the cohort does not need them; recorded as a ruling).

**Mandatory test cases:** the `gradeCompletions` query is scoped to the institution and delta-filtered; rows are mapped field by field (no extra keys); teacher scope gets `[]`; a departed student enrolled in a window year appears with exactly the minimal projection (contact fields null, no guardians); a departed student whose only enrolments here are from an older year does not appear; their window-year enrolments in this school's classes are included and their enrolments elsewhere are not.

**Commit:** `feat(desktop-provisioning): ship grade completions and departed cohort students`.

---

### Task 2: Desktop — `grade_completions` storage, import rules and the re-keyed exemption

**Files:** migration `apps/desktop/electron/database/migrations/029-create-grade-completions.ts` (+ test, registered after 028); `packages/types` provisioning contract (add `gradeCompletions` to `PROVISIONING_COLLECTIONS` and the data type — find where `studentTransfers` is declared); `apps/desktop/electron/provisioning/ProvisioningImporter.ts` (+ test).

**Behaviour:**
- Table `grade_completions`: the server columns above, plus `syncState TEXT NOT NULL DEFAULT 'synced'` (`synced` | `pending` | `rejected`) and `syncError TEXT`; `UNIQUE (studentId, academicYearId)`; no outbox triggers.
- Importer: pulled rows are upserted with `syncState = 'synced'`, `syncError = NULL`, **except** that a local row (matched by `id`, or by `(studentId, academicYearId)`) whose `syncState` is `pending` or `rejected` is left untouched. A snapshot without the `gradeCompletions` key imports as empty. A full (non-merge) re-provision must not delete local `pending`/`rejected` rows (they exist nowhere else).
- Re-key the `verifyDatabase` exemption for `students.institutionId -> institutions`: exempt a student when a local APPROVED `student_transfers` row has `studentId` = the student and `fromInstitutionId` = the workspace institution (replacing the `toInstitutionId = student.institutionId` rule, which fails for multi-hop moves). An unexplained foreign institution still fails the check.

**Mandatory test cases:** migration creates the table, unique key, no triggers; pulled stamp imports as synced; a later pull does not overwrite a pending row nor a rejected row; a full re-provision keeps pending/rejected rows; snapshot without `gradeCompletions` imports; multi-hop departed student (local APPROVED transfer from us to school 2, student now at school 3) imports without the missing-dependency error; an unexplained foreign `institutionId` still fails.

**Commit:** `feat(outcomes): store grade completions locally`.

---

### Task 3: Desktop — local cohort and saving decisions

**Files:** a repository/service under `apps/desktop/electron/data/` for grade completions (follow how `FeeReversalSyncService`'s table is read/written, or the generic repository pattern); IPC types in `packages/types` (`ipc.ts`, `api.ts`, a new `grade-completions.ts`); validators in `validateIpc.ts`; a handler file under `apps/desktop/electron/ipc/handlers/school-admin/`; `authorizeChannel.ts`; preload + renderer bridge (`grade-completion-bridge.ts`).

**Produces (exact names — Tasks 4 and 5 use them):**
- Types: `CompletionOutcome = 'PROMOTED' | 'RETAINED' | 'GRADUATED'`; `CohortRow { studentId; firstName; lastName; nemisId: string | null; outcome: CompletionOutcome | null; nextGradeLevel: GradeLevel | null; notes: string | null; syncState: 'synced' | 'pending' | 'rejected' | null; syncError: string | null }`; `CohortResult { rows: CohortRow[]; unenrolledCount: number }`; `CompletionDecision { studentId; outcome; nextGradeLevel?: GradeLevel; notes?: string }`; `SaveCompletionsRequest { academicYearId; gradeLevel; decisions: CompletionDecision[] }`.
- Channels (INSTITUTION_ADMIN only): `grade-completion:cohort` `[academicYearId, gradeLevel] → CohortResult`; `grade-completion:save` `[SaveCompletionsRequest] → { saved: number }`.
- Bridge: `gradeCompletionBridge.getCohort(academicYearId, gradeLevel)`, `gradeCompletionBridge.save(request)`.

**Behaviour:**
- Cohort query mirrors `getCohortForCompletion` exactly as in Global Constraints, ordered by last name then first name, with a comment naming the server method. It must include departed students (Task 1/2) and never filter `isActive`.
- Save: validates each decision (GRADUATED → no next grade; otherwise next grade required — same rule as the server's decision-shape check), then writes only **changed** decisions (outcome, next grade or notes differ from the local row) as `syncState = 'pending'`, `syncError = NULL`, inside one transaction; unchanged rows untouched. Never touches `students` or `enrollments` (D7), and never enqueues an outbox row.
- A decision for a student not in that year's cohort is rejected by the validator/service.

**Mandatory test cases (real SQLite):** cohort includes an enrolled student, deduplicates per-term enrolments, keeps a promoted-then-amended student (stamped here, enrolment marked COMPLETED), keeps a leaver, excludes a student stamped this year at another grade, and computes `unenrolledCount` excluding both sets; save writes changed decisions as pending and leaves unchanged ones; save of GRADUATED with a next grade is rejected; save never changes `students.gradeLevel` nor writes `sync_queue`; channel authorisation is school-admin only.

**Commit:** `feat(outcomes): local cohort and pending decisions`.

---

### Task 4: Desktop — push, and online guidance averages

**Files:** `apps/desktop/electron/sync/GradeCompletionSyncService.ts` (+ test); `DesktopSyncWorker.ts` (call it in the cycle beside the fee-reversal push, and keep the cycle alive while pending decisions exist, mirroring how pending reversals do); `BackendProvisioningGateway.ts` (`recordGradeCompletions`, `getCompletionGuidance`); a read-only channel `grade-completion:guidance` `[academicYearId, gradeLevel] → { studentId: string; average: number | null }[]` (INSTITUTION_ADMIN, online command opt-in, no refresh) + preload/bridge.

**Behaviour:**
- Groups `pending` rows by `(academicYearId, gradeLevel)`; one `POST /enrollments/grade-completions` per group with `{ academicYearId, gradeLevel, decisions }`.
- Ordering gate: skip a group while any `sync_queue` row for `students` or `enrollments` is `pending` or `in_flight` (not dead-lettered ones).
- 4xx → every row in the group becomes `rejected` with the server message (the gateway's `RemoteRejectedError.remoteMessage`, else a fixed fallback). Network error / 5xx → stays `pending`. Success → `synced`, `syncError = NULL`.
- One group's failure never stops other groups; the service never throws out of the worker cycle.
- Guidance: read the server's cohort response and return only per-student averages; offline/failed → the channel errors normally (the screen shows `—`).

**Mandatory test cases:** grouping into one request per (year, grade); gate blocks on a pending/in-flight student or enrolment row and does not block on a dead-lettered one; 4xx rejects the whole group with the message; 5xx/offline keeps pending; success marks synced; a failing group doesn't stop another; the worker runs the push and keeps the cycle alive while decisions are pending; guidance maps averages by student id and never triggers a refresh.

**Commit:** `feat(outcomes): push queued decisions and fetch guidance averages`.

---

### Task 5: Desktop — End-of-Year Outcomes screen and sidebar entry

**Files:** `apps/desktop/renderer/app/government/school-admin/students/promote/page.tsx`; components under `apps/desktop/renderer/components/outcomes/` (+ tests); `components/shell/sidebarConfig.ts` (school-admin entry `End-of-Year Outcomes`, anchored on the school-admin Students entry; other roles untouched).

**Behaviour:**
- Pickers: academic year (local years, default current) and grade. With no academic years, explain it; with an empty cohort, explain it (`No students were enrolled in this grade that year.`).
- Table per student: name + formatted NEMIS ID; outcome select; next grade select (defaults to the following grade for Promoted, same grade for Retained; empty and disabled for Graduated); notes; average (online value or `—` with `Averages are shown when online.`); sync badge (`Synced` / `Pending` / `Rejected`).
- `unenrolledCount` banner when non-zero: `{n} students in this grade have no enrolment for this year and are not listed.`
- Save writes the whole visible table's decisions; shows `Grade changes apply after sync.`; reloads the cohort.
- Rejected rows show the server message with any student ids in it replaced by local names; editing a rejected row and saving makes it pending again.
- Next-grade options: the grades this school offers when local grade-level data exists, otherwise all grades.

**Mandatory test cases (real presentation layer with `window.nemis` stubs):** cohort renders with names, NEMIS IDs and badges; Graduated disables and clears next grade; save sends exactly the decisions and shows the copy; offline shows `—` and the note and never calls guidance; online shows averages from guidance; the unenrolled banner; a rejected row shows the mapped message and becomes pending after edit + save; no-years and empty-cohort explanations; the sidebar entry for school admin only.

**Commit:** `feat(renderer): End-of-Year Outcomes screen`.

---

### Task 6: Stage gate

- Desktop (binary set aside, node build in place): `pnpm vitest run && pnpm typecheck && pnpm lint` → only the known failures; lint = 6 pre-existing. Restore the Electron binary.
- Server: `npx tsc --noEmit && npx jest` → only the known failure(s).
- Deploy coupling: the push uses the server's existing `POST /enrollments/grade-completions`, so outcomes work against the current server; without Task 1 the desktop simply has no pulled stamps and no departed students (empty collection), so leavers are missing from cohorts until the server deploys. Deploy the server first for complete cohorts. Record both branch heads.
