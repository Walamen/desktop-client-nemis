# DEO School Admins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** The DEO School Admin Directory, offline on the desktop with real figures, and the web fixed to match.
**Spec:** `docs/superpowers/specs/2026-11-15-deo-school-admins-design.md`
**Global Constraints:** as `2026-11-15-deo-dashboard.md`. Temporary Node-ABI SQLite in `build/Debug` for tests only; remove before finishing.

## Review Focus
1. An admin with no photo, no staff record, no `createdAt` or no last sign-in: no "undefined", parts left out.
2. "This month" at a month boundary (report on the 1st 00:00, on the last day 23:59).
3. One person who is School Admin at two schools.
4. A suspended account still counted in Total and shown under Suspended.
5. A district with no School Admins at all.

### Task 1: Server — school admins endpoint
`districts.service.ts`, `districts.controller.ts`, `districts.school-admins.spec.ts`, `packages/types/src/deo.ts`.
- [ ] Failing tests: one row per active membership; inactive account → isActive false; employee number from staff of that user at that school; reports this month only; open infrastructure issues excluding staff requests; schoolsWithoutAdmin; another district's DEO refused.
- [ ] Implement `getDistrictSchoolAdmins(districtId, user)`; route `GET :id/school-admins`.
- [ ] jest districts + tsc. Commit.

### Task 2: Web — School Admins page
`school-admins/page.tsx`, `lib/deo-dashboard.ts` (+ test): `adminTabCounts`, `filterAdminsByTab`, `lastActiveLabel`.
- [ ] Failing helper tests; rewrite page; vitest + tsc + eslint. Commit.

### Task 3: Desktop — read model, use case, channel, view model, page
- [ ] Failing tests: read model `listSchoolAdmins` (incl. two schools, suspended, month boundary, missing staff) and `countOpenInfrastructureIssuesBySchool`; use case (schoolsWithoutAdmin, ordering, no district); IPC + DEO-only gate; view model; helpers; page.
- [ ] Implement; lint, typecheck, build:renderer, full suite. Commit.

### Task 4: Review and finish
- [ ] Fresh reviewer; one fix pass; remove temp SQLite binary; report.
