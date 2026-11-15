# DEO Teachers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** DEO Teacher Monitoring, offline on the desktop with real figures; web fixed to match.
**Spec:** `docs/superpowers/specs/2026-11-15-deo-teachers-design.md`
**Global Constraints:** as `2026-11-15-deo-dashboard.md`. Temporary Node-ABI SQLite in `build/Debug` for tests only; remove before finishing.

## Review Focus
1. A teacher who teaches a subject at school-level only (subject_teachers) and one who teaches by class (class_subject_teachers): both own the right assessments, never another school's.
2. Assessments of a past term, or a school with no current term: never count as pending.
3. A teacher with no subjects and no classes: "General", Unassigned, "No assessments".
4. An inactive teacher or a non-teaching position: not listed.
5. District with hundreds of teachers and many assessments: the grade-state query stays fast (per-teacher EXISTS through indexes, not a join of everything).

### Task 1: Server — teacher-monitoring endpoint
`districts.service.ts`, `districts.controller.ts`, `districts.teacher-monitoring.spec.ts`, `packages/types/src/deo.ts`.
- [ ] Failing tests for every rule in the spec's table and the access check.
- [ ] Implement with grouped queries; route `GET :id/teacher-monitoring`.
- [ ] jest districts + tsc. Commit.

### Task 2: Web — Teachers page
`teachers/page.tsx`, `lib/deo-dashboard.ts` (+ test): `teacherTabCounts`, `filterTeachersByTab`, `groupTeachersBySchool`.
- [ ] Failing helper tests; rewrite page; vitest + tsc + eslint. Commit.

### Task 3: Desktop — read model, use case, channel, view model, page
- [ ] Failing tests: read model (each grade state, both ownership paths, past term, other school, unassigned, listing filter); use case (summary, no district); IPC + DEO gate; view model; helpers; page (banner, cards, tabs, By School, note, chips) — watched failing against the old page.
- [ ] Implement; lint, typecheck, build:renderer, full suite. Commit.

### Task 4: Review and finish
- [ ] Fresh reviewer; one fix pass; remove temp SQLite binary; report.
