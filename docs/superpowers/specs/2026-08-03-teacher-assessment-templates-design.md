# Teacher Weighted Assessment Templates — Design

Status: approved (pending plan)
Date: 2026-08-03

## Problem

The desktop teacher Gradebook (`apps/desktop/renderer/app/government/teacher/grades/page.tsx`)
scores regular grading periods against three fixed `grades` columns — `assessmentScore` (CA),
`testScore`, `examScore` — because the desktop backend has no `assessment_templates`/`assessments`
concept and building one wasn't in scope when that page was first written.

The production web app (`Nemis/apps/portal-web/src/app/government/teacher/grades/`) has a richer,
already-shipped model: a teacher defines reusable, weighted **assessment templates** per
class+subject (`Nemis/apps/Server/prisma/schema.prisma`'s `AssessmentTemplate`/`Assessment`/`Grade`
models), scores students against however many templates they've set up, and the weighted total
becomes the period grade. This also includes a publish/unpublish step (grades are private until
the teacher sends them to students) and a cross-subject "ready to submit" summary, neither of
which the desktop CA/Test/Exam model has any equivalent for.

This spec ports that full web behavior to desktop's offline-first architecture. Desktop has no
NestJS request/response cycle to lean on for validation — every business rule the web backend
enforces server-side (`Nemis/apps/Server/src/teacher/teacher.service.ts`) has to be re-expressed
either as client-side logic in the renderer or as a new sync-push validator
(`Nemis/apps/Server/src/desktop-provisioning/desktop-sync-applier.ts`), since desktop reads and
writes through the generic offline collection bridge (`schoolAdmin:list`/`:save`/`:delete`)
established throughout this codebase, not per-feature IPC endpoints.

## Goals

1. A teacher can create, edit, delete, bulk-create, and copy-to-subject weighted assessment
   templates per class+subject, fully offline — matching
   `Nemis/apps/portal-web/.../grades/templates/page.tsx`.
2. The Gradebook's regular-period flow scores students against those templates (one column per
   template) instead of the fixed CA/Test fields, computes a weighted running percentage, and
   supports Save (draft) / Send to Students (publish) / Update Grades (unpublish) — matching
   `Nemis/apps/portal-web/.../grades/page.tsx`.
3. A "Summary & Submit" tab aggregates readiness (weight totals to 100%, has scores) across every
   subject the teacher teaches in the selected class + period, and does the final,
   window-gated submission.
4. All of the above works offline (create/edit/delete templates and scores while disconnected,
   synced later) — the existing Offline-First Contract, not a new one.
5. Exam periods (`MIDTERM_EXAM`/`FINAL_EXAM`) are untouched — desktop's existing single-score-field
   flow already matches web there.

## Non-goals

- No change to the exam-period flow, the grading-period/window/institution-config screens, or the
  school-admin side of grading (`components/academic-grading/WindowGradesPage.tsx`).
- No change to how `grades` rows with `assessmentId: null` behave for anything other than the new
  period-level submit path (Goal 3) — pre-existing fixed-field data, if any exists from before this
  feature shipped, is left alone; this spec does not migrate or backfill it.
- Not replicating the web bug where the final submitted grade actually ignores `weight` (see
  resolved question below) — desktop uses the weighted percentage consistently everywhere,
  on-screen and submitted.
- No changes to `PROVISIONING_COLLECTIONS` iteration/manifest/checksum machinery — both new
  collections plug into the existing generic loops (confirmed in the earlier `staffDirectory`/
  `institutionAdmin` work this session), no new special-casing needed there.

## Resolved design questions

- **Final grade formula**: weighted percentage — `Σ (score/totalMarks × weight)` — used both for
  the on-screen running total *and* the value written to the period-level submitted grade. Web's
  own `submitPeriodGrades` actually computes a plain `Σ marksObtained / Σ totalMarks × 100`,
  silently ignoring `weight`; that's treated as a latent web bug, not something to port.
- **Feature scope**: full parity with web, not a reduced core-only version — templates CRUD
  (single + bulk + copy-to-subject + pie-chart weight visualizer), publish/unpublish, and the
  Summary & Submit tab are all in scope.
- **New dependency**: `recharts` (matching web's pie chart) is added to the desktop renderer. No
  charting library exists there today.

## Architecture

### Data model — two new collections, mirroring `AssessmentTemplate`/`Assessment`

| Collection (backend field / desktop table) | Maps to Prisma model | Fields (desktop SQLite) |
|---|---|---|
| `assessmentTemplates` / `assessment_templates` | `AssessmentTemplate` | `id, classId, subjectId, name, type, totalMarks, weight, date, createdAt, updatedAt` |
| `assessments` / `assessments` | `Assessment` (period instance of a template) | `id, templateId, classId, subjectId, gradingPeriodId, name, type, totalMarks, weight, date, createdAt, updatedAt` |

Both are added to `PROVISIONING_COLLECTIONS` (desktop `packages/types/src/provisioning.ts`) and
`DesktopProvisioningData` (backend `Nemis/packages/types/src/desktop-provisioning.ts`), following
the exact file-list already used for `staffDirectory`/`institutionAdmin` this session: backend
type, backend query + mapping in `desktop-provisioning.service.ts`, desktop type, desktop
migration + `ProvisioningImporter` SPECS entry, `SchoolAdminModuleService` CONFIG +
`ROLE_READ_COLLECTIONS.TEACHER`.

Both new desktop tables get outbox triggers (`installOutboxTriggers`, same migration mechanism as
`grades`) — writes queue for background sync like every other teacher-writable table.

### Provisioning scope (read-down)

`restrictTeacherSnapshot` (backend) filters both new collections to the teacher's own
`classIds`/`subjectIds` sets — the same sets it already computes for `classes`/`classSubjects`. No
new query needed for `assessments`; both are cheap institution-scale reads, same pattern as
`staffDirectory`.

### Sync-push validation (write-up) — `desktop-sync-applier.ts`

Two new cases, modeled directly on the existing `grade` handler:

- **`assessment_templates`**: on create/update, verify the caller (when `role === TEACHER`) has a
  `classSubjectTeachers` row for `(classId, subjectId)` — the same assignment check `grade`
  already does. On delete, re-check `_count.assessments === 0` server-side — the client-side guard
  (below) is a UX nicety, not the enforcement boundary, since another device could race in an
  assessment first.
- **`assessments`**: verify `templateId` resolves to a template the caller owns (same class/subject
  assignment check) before allowing the upsert. This is what stops a forged `assessments` row
  pointing at someone else's template.

Add `'assessment_templates'` and `'assessments'` to `TEACHER`'s set in
`SchoolAdminModuleService.ROLE_READ_COLLECTIONS` *and* `ROLE_WRITE_COLLECTIONS` (desktop), and to
the sync applier's `roleAllowed` map (backend). Both need write: templates because the teacher
creates/edits/deletes them directly, `assessments` because the teacher materializes new instances
directly (see below) — neither is a read-only, admin-populated collection like `staffDirectory`.

### Materializing an Assessment instance offline

Web does this atomically inside `saveAssessmentScores` (`Assessment.upsert` keyed on
`(templateId, gradingPeriodId)`, inside the same request as the score save). Desktop has no
transaction spanning two generic-collection writes, so this becomes two sequential renderer calls:

1. Look for a local `assessments` row matching `(templateId, gradingPeriodId)`. If absent,
   `saveSchoolAdminRecord({ collection: 'assessments', record: { templateId, classId, subjectId,
   gradingPeriodId, name, type, totalMarks, weight, date } })` and capture the generated id.
2. Save `grades` rows against that `assessmentId`, exactly like the existing `persist()` function
   in `grades/page.tsx` already does against `gradingPeriodId` directly.

This has the same race window as every other generic-collection write in this app (no local unique
constraint enforced across concurrent saves) — acceptable because a single teacher is the only
writer of their own gradebook, matching the trust model everywhere else in this offline system.

### Client-side business rules (renderer)

- Max-marks validation on score input (already the pattern for the existing fields).
- Publish-lock: once any grade in the current assessment set has `isPublished: true`, inputs
  disable until "Update Grades" (unpublish) is clicked — mirrors `isFormLocked`/`handleUpdateGrades`.
- Delete-guard: a template can only be deleted client-side when its local `assessments` count for
  that template is 0 (mirrors web's `_count.assessments > 0` check) — real enforcement is the
  sync-push check above.
- Weight-completeness (`Math.abs(totalWeight - 100) < 0.01`) gates *readiness* for Summary & Submit
  only; it never blocks saving drafts.

### UI — new route `grades/templates/page.tsx`

Ported from `Nemis/apps/portal-web/.../grades/templates/page.tsx`:

- Class/subject pickers, template list for that pair, weight-distribution pie chart (`recharts`).
- Add/Edit `Drawer` (desktop's `@nemis-desktop/ui` already exports one) with the single-edit form
  and the bulk-create row table (client-side row validation, per-row error display).
- Copy-to-subject modal: match-by-name-or-create against the target subject's existing templates,
  per-row failure counting, same as web.
- Cross-links ("Assessment Setup" / "Go to Gradebook") between this page and the main Gradebook.

### UI — `grades/page.tsx` changes (regular-period path only)

- Replace the fixed CA/Test columns with one column per template returned for the selected
  class/subject/period (reading `assessment_templates` + `assessments` + `grades` filtered by
  `assessmentId`, instead of `assessmentScore`/`testScore`).
- "No Assessments Found" empty state with a CTA into Assessment Setup — templates become required
  for regular periods (no fallback to the old fixed-field entry), matching web.
- Button row becomes Save / Send to Students (publish) / Update Grades (unpublish), replacing
  today's Save/Submit pair for the regular-period case.
- New "Summary & Submit" tab: for the selected class + period, lists every subject the teacher
  teaches in that class with weight-total, students-scored count, and a computed Ready/Not-ready
  status; "Submit All Ready Subjects" writes the period-level (`assessmentId: null`) weighted grade
  per subject per student, gated on the matching `grade_entry_windows` row being `OPEN` — the same
  window check the page already performs today.
- Assessment-weights-incomplete warning banner: visible, non-blocking for Save (matches web).

## Error handling / edge cases

- **Offline template delete blocked by a race**: local guard passes (count is 0 on this device) but
  another device already synced an assessment against it — sync-push rejects with a conflict; the
  existing sync-conflict UI surfaces it, no new conflict-handling path needed.
- **Publish attempted with no scores entered**: matches web — publish is a no-op update (`0` rows
  updated), not an error.
- **Score exceeds `totalMarks`**: rejected client-side before it's even staged as an edit, same
  pattern as the existing CA/Test/Exam inputs.
- **Submit All Ready Subjects with zero ready subjects**: button disabled client-side (matches
  web's `readyCount === 0` disable), no submit call made.
- **Window closed**: Save and Send to Students still work (matches web — neither checks window
  status); only the Summary & Submit tab's final submission is window-gated.

## Testing

- `desktop-sync-applier.spec.ts` (backend): two new cases mirroring the existing `grade` test —
  assignment-scoped accept/reject for `assessment_templates` and `assessments`, plus the
  server-side delete-guard re-check.
- `desktop-provisioning.service.spec.ts` (backend): extend the existing TEACHER-scope test to
  assert both new collections are present and correctly class/subject-scoped.
- Desktop renderer integration tests (mirroring `my-school.test.tsx`/`grades.test.tsx`'s mocked-
  `window.nemis` + render approach), one file per page:
  - `templates.test.tsx`: create/edit/delete a template, bulk-create, copy-to-subject.
  - `grades.test.tsx` (extended): the two-step materialize-then-save flow, publish/unpublish
    toggling the lock, weighted total display.
  - New coverage for the Summary & Submit tab's readiness computation and gated submit.

## File-level summary

**Backend (`Nemis`)**
- `packages/types/src/desktop-provisioning.ts` — add `assessmentTemplates`, `assessments` fields.
- `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` — query + map both,
  scope both in `restrictTeacherSnapshot`.
- `apps/Server/src/desktop-provisioning/desktop-sync-applier.ts` — two new cases + `roleAllowed`
  entries for `TEACHER`.
- `apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`,
  `desktop-sync-applier.spec.ts` — new test coverage.

**Desktop (`desktop-client-nemis`)**
- `packages/types/src/provisioning.ts` — add both to `PROVISIONING_COLLECTIONS`.
- `packages/types/src/school-admin.ts` — add both to `SCHOOL_ADMIN_COLLECTIONS`.
- `apps/desktop/electron/database/migrations/016-create-assessment-templates-table.ts`,
  `017-create-assessments-table.ts` — new tables + outbox triggers.
- `apps/desktop/electron/provisioning/ProvisioningImporter.ts` — SPECS entries.
- `apps/desktop/electron/data/services/SchoolAdminModuleService.ts` — CONFIG,
  `ROLE_READ_COLLECTIONS.TEACHER`, `ROLE_WRITE_COLLECTIONS.TEACHER`.
- `apps/desktop/renderer/app/government/teacher/grades/templates/page.tsx` — new.
- `apps/desktop/renderer/app/government/teacher/grades/page.tsx` — rewritten regular-period path.
- `apps/desktop/renderer/components/academic-grading/` — new shared helpers for templates/
  assessments (mirroring the existing `listPeriodsForTerm`-style helpers in `shared.tsx`).
- `apps/desktop/package.json` — add `recharts`.
- New/updated test files per the Testing section above.
