# School Office Users — Stage 2 (Desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A School Admin can create and manage office-staff sign-ins from the desktop, and an office-staff user (`INSTITUTION_STAFF`) signs in to the desktop and sees and uses only the school-admin screens their modules allow.

**Architecture:** The signed-in user's `modules` travel from the login and `/auth/me` responses into `ProvisioningUser`. The main process enforces them in two places: `authorizeChannel` (one access class per school channel) and `SchoolAdminModuleService` (per-user read and write collection sets). The renderer mirrors them for display only: a session-user context fed by `RouteGuard`, a `ModuleGuard` that redirects by route, and a sidebar that hides what the user lacks. The Users & Access page follows the county users page. Its list is online-first with a device fallback, and its commands are online-only through `BackendProvisioningGateway` followed by a forced pull. Task 1 is a small server prerequisite in the Nemis repo.

**Tech Stack:** Electron 42.7.0, Next.js renderer, React 19, Zustand view models (`@nemis-desktop/presentation`), hexagonal application layer (`@nemis-desktop/application`), better-sqlite3 (SQLCipher), Vitest + Testing Library. The server task uses NestJS, Prisma and Jest.

**Spec:** `docs/superpowers/specs/2026-11-10-school-office-users-design.md` (§5.6 is this stage). Stage 1 (server) is merged to Nemis main at 7f2e26eb.

## Global Constraints

- Role value `INSTITUTION_STAFF`, UI label "School Office Staff". It is added once to `packages/types/src/enums.ts`, and its spelling is identical to the server's.
- Module ids, copied verbatim from `Nemis/packages/types/src/school-modules.ts`: `ACADEMIC_SETUP`, `STUDENTS`, `STAFF`, `TEACHING`, `FINANCE_PAYMENTS`, `FINANCE_RULES`, `REPORTS`, `SCHOOL`.
- Module labels, verbatim: "Academic setup", "Students & families", "Teachers & staff", "Teaching workflow", "Record payments", "Fee rules & payment plans", "Reports", "School settings".
- Presets only pre-fill the checklist:
  - Registrar → `STUDENTS`, title "Registrar".
  - Business Manager → `FINANCE_PAYMENTS` + `FINANCE_RULES`, title "Business Manager".
  - Custom → nothing ticked.
- Principal-only, never delegable:
  - the close, reopen and correct channels and routes
  - the four office-user channels and the Users & Access route
  - writing announcements
- Reads are wider than writes. Structural school data is readable by every office user. Writes follow the module. Grade, payment-history and report reads stay with their module.
- Desktop migration id `048-add-user-organization-modules`: `modules TEXT NOT NULL DEFAULT '[]'` (JSON array) and `title TEXT` on `user_organizations`.
- New IPC channels:
  - `SCHOOL_USERS_LIST: 'school-users:list'`
  - `SCHOOL_USERS_CREATE: 'school-users:create'`
  - `SCHOOL_USERS_UPDATE: 'school-users:update'`
  - `SCHOOL_USERS_SET_ACTIVE: 'school-users:set-active'`
- Users & Access route `/government/school-admin/settings/users`, sidebar item "Users & Access" in the SCHOOL group, visible to the School Admin only.
- Server endpoints (Stage 1):
  - `GET /school-admin/users` returns `SchoolOfficeUser[]`.
  - `POST /school-admin/users` returns `{ user, credential? }`.
  - `PATCH /school-admin/users/:id` returns `SchoolOfficeUser`.
  - `POST /school-admin/users/:id/deactivate` and `/reactivate` return `SchoolOfficeUser`.
  - `:id` is the user id.
- The `credential.defaultPassword` value is never logged. That covers the logger, error messages and audit text in both processes.
- Refusal copy:
  - An office user without the module gets `This account does not have access to <labels joined " or ">.`
  - An office user on a principal-only action gets `This action is only available to the School Admin.`
- Tests that touch SQLite run under Electron-as-Node from the repo root, because better-sqlite3 is built for the Electron ABI on this machine:
  `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>`
  Pure and renderer tests may use `pnpm vitest run <paths>`.
- Do not stage `apps/desktop/package.json`. It carries Alvin's uncommitted version bump.
- Work happens on the desktop branch `feat/school-office-users`, which already holds the spec commit 13aba6e. Task 1 happens on a new Nemis branch `feat/school-office-users-stage2` cut from Nemis main.
- Rollout is server first. Task 1 must be deployed before a desktop build from this plan ships.

## Review Focus

1. **A session saved by an older build has no `modules` field.** An office user restored offline must get an empty module set: dashboard and base pages only, no crash. Pinned in Task 2 (`hasModule` with `modules` undefined) and Task 3 (gateway with `modules` missing).
2. **An office user types or deep-links a route they lack.** Examples are `/financial`, `/academic-years/close` and `/settings/users`. The user must land on the dashboard, not on a blank page or a refused-IPC error screen. Pinned in Task 7.
3. **The server sends a module id this build does not know.** The id must be ignored and never grant anything. Pinned in Task 3.
4. **A Business Manager with only `FINANCE_PAYMENTS` records a payment.** They must read students, fee rules and obligations, and write `fee_payments` and reversals. Saving a `fee_rules` row is refused. Pinned in Task 6.
5. **The admin opens Users & Access while the server is unreachable.** The admin sees the active accounts stored on the device, a banner that says so, and disabled command buttons. A server error while "online" falls back the same way. Pinned in Tasks 9 and 10.

---

### Task 1: Server — scope the school grade and average reads (Nemis repo)

The Stage 1 follow-up ticket. These reads are nationwide today, and office staff with `TEACHING` or base access can now reach them. Stage 2 is the first release that lets a principal create office users, so the fix ships with it.

**Files:**
- Modify: `Nemis/apps/Server/src/grades/grades.controller.ts`
  - `getAssessments`, `getStudentGrades`, `getAssessmentGrades`, `getStatistics`: pass `@CurrentUser() user`.
- Modify: `Nemis/apps/Server/src/grades/grades.service.ts`
  - The same four methods take `user: UserContext`.
- Modify: `Nemis/apps/Server/src/grading/controllers/averages.controller.ts`
  - `getStudentTermAverages` and `getStudentYearlyAverages`: pass the user.
- Modify: the average service behind those two handlers.
- Test: `Nemis/apps/Server/src/grades/grades.service.spec.ts`, plus the averages service spec next to its service.

**Interfaces:**
- Consumes `resolveInstitutionId(user)` from `src/common/utils/resolve-institution-id.ts` (Stage 1).
- Produces: no new exports.

**Rule:**
- A `SUPER_ADMIN` caller keeps today's unscoped behaviour.
- For grades:
  - every other caller is scoped to `resolveInstitutionId(user)`
  - `getAssessments` and `getGradeStatistics` filter on `class: { institutionId }`
  - `getStudentGrades` throws `NotFoundException("Student not found")` unless the student's `institutionId` matches
  - `getAssessmentGrades` throws `NotFoundException("Assessment not found")` unless the assessment's class belongs to the institution
- For averages:
  - only `INSTITUTION_ADMIN` and `INSTITUTION_STAFF` callers are scoped, the same way
  - the student must belong to the caller's school, else `NotFoundException("Student not found")`
  - TEACHER, STUDENT and PARENT behaviour is unchanged and out of scope; note it in the commit body

- [ ] **Step 1: Branch.** Run `git -C Nemis switch -c feat/school-office-users-stage2 main`.
- [ ] **Step 2: Write failing tests** in the grades service spec:
  - `getAssessments scopes to the caller's school`: asserts the `findMany` where-clause contains `class: { institutionId: "inst-1" }`.
  - `getStudentGrades refuses a student of another school`: rejects with `NotFoundException`.
  - `getAssessmentGrades refuses an assessment of another school`: rejects with `NotFoundException`.
  - `getGradeStatistics counts only the caller's school`: both the `count` and `findMany` where-clauses carry the institution filter.
  - `super admin stays unscoped`: no institution filter.
  - In the averages spec, `staff caller refused for a student of another school` and `teacher caller unchanged`.
- [ ] **Step 3: Run** `pnpm --filter server test -- grades.service averages`. Expected: the new cases FAIL.
- [ ] **Step 4: Implement** the rule above.
- [ ] **Step 5: Run** the same specs (PASS). Then run `pnpm --filter server typecheck` and `pnpm --filter server test`. All must be green. The baseline is 1047.
- [ ] **Step 6: Commit** in Nemis: `fix(grades): scope school grade and average reads to the caller's school`.

---

### Task 2: Shared desktop types

**Files:**
- Modify: `packages/types/src/enums.ts`. Add `INSTITUTION_STAFF: 'INSTITUTION_STAFF'` after `INSTITUTION_ADMIN`.
- Modify: `packages/types/src/enums.test.ts`. The SystemRole length becomes 11.
- Modify: `packages/types/src/desktop-portals.ts`.
  - Add the role to `DESKTOP_PORTAL_ROLES` after `INSTITUTION_ADMIN`.
  - Add `DESKTOP_PORTALS[INSTITUTION_STAFF] = { role, route: '/government/school-admin', scopeType: INSTITUTION }`.
- Modify: `packages/types/src/provisioning.ts`. `ProvisioningUser` gains `readonly modules?: readonly SchoolModule[]` and `readonly title?: string`. Both are optional so stored sessions still parse.
- Create: `packages/types/src/school-modules.ts`.
- Create: `packages/types/src/school-users.ts`.
- Modify: `packages/types/src/ipc.ts`. Add the four channels from Global Constraints.
- Modify: `packages/types/src/index.ts`. Export both new files.
- Test: `packages/types/src/school-modules.test.ts` and `packages/types/src/desktop-portals.test.ts`.

**Interfaces:**
- Produces from `school-modules.ts`:
  - `SchoolModule` (const object plus type), `SCHOOL_MODULES`, `SCHOOL_MODULE_LABELS` and `isSchoolModule(value: string): value is SchoolModule`, all byte-identical to the Nemis file.
  - `type SchoolAccess = SchoolModule | 'BASE' | 'PRINCIPAL'`
  - `SCHOOL_MODULE_PRESETS: readonly { id: 'REGISTRAR' | 'BUSINESS_MANAGER'; label: string; title: string; modules: readonly SchoolModule[] }[]`
  - `isInstitutionScopedRole(role: string): boolean`. True for `INSTITUTION_ADMIN` and `INSTITUTION_STAFF`.
  - `hasModule(user: { role: string; modules?: readonly string[] }, module: SchoolModule): boolean`
    - admin → true
    - staff → whether `modules` includes the module
    - anyone else → false
  - `canUseSchoolAccess(user, access: SchoolAccess): boolean`
    - `'BASE'` → `isInstitutionScopedRole`
    - `'PRINCIPAL'` → admin only
    - a module → `hasModule`
  - `SCHOOL_ROUTE_ACCESS: Readonly<Record<string, SchoolAccess>>`. Keys are paths relative to `/government/school-admin`.
  - `schoolRouteAccess(pathname: string): SchoolAccess`. Strips the base, picks the longest matching key (exact match or key + `/` prefix), and defaults to `'BASE'`.
  - `schoolAccessLabel(access: SchoolModule[] | SchoolModule): string`. Labels joined with `" or "`, used in refusal copy.
- Produces from `school-users.ts`:
  - `SchoolOfficeUser`, matching the server interface field for field, with `modules: SchoolModule[]`
  - `LinkableStaff { id; firstName; lastName; position: string | null }`
  - `SchoolUsersResult { source: 'server' | 'device'; users: SchoolOfficeUser[]; linkableStaff: LinkableStaff[] }`
  - `CreateSchoolUserRequest { firstName; lastName; email; phoneNumber?; title?; modules: SchoolModule[]; staffId? }`
  - `UpdateSchoolUserRequest { userId; firstName?; lastName?; phoneNumber?; title?: string | null; modules?: SchoolModule[] }`
  - `SetSchoolUserActiveRequest { userId; isActive: boolean }`
  - `SchoolUserCredential { email; defaultPassword }`
  - `CreateSchoolUserResult { user: SchoolOfficeUser; credential?: SchoolUserCredential }`

`SCHOOL_ROUTE_ACCESS` (exact table):

| Key | Access |
|---|---|
| `/academic-grading` | ACADEMIC_SETUP |
| `/academic-grading/windows/grades` | TEACHING |
| `/subjects` | ACADEMIC_SETUP |
| `/academic-years` | PRINCIPAL |
| `/students` | STUDENTS |
| `/parents-guardians` | STUDENTS |
| `/teachers-staff` | STAFF |
| `/classes` | TEACHING |
| `/timetable` | TEACHING |
| `/attendance` | TEACHING |
| `/financial` | FINANCE_RULES |
| `/financial/record-payment` | FINANCE_PAYMENTS |
| `/reports` | REPORTS |
| `/past-years` | REPORTS |
| `/school-profile` | SCHOOL |
| `/grade-levels` | SCHOOL |
| `/infrastructure` | SCHOOL |
| `/settings/users` | PRINCIPAL |

Everything else is `BASE`: the dashboard, `/settings`, `/messages`, `/notifications`, `/sync-pending` and `/sync-conflicts`.

**Ruling:** the module ↔ sidebar-group map in spec §5.6 is carried by a tag on each sidebar item (Task 8), not by a separate map, so the two cannot drift.

- [ ] **Step 1: Write failing tests** in `school-modules.test.ts`:
  - `hasModule`
    - admin → true for every module
    - staff `{ modules: ['STUDENTS'] }` → true for STUDENTS, false for FINANCE_RULES
    - staff with `modules` undefined → false
    - TEACHER → false
  - `canUseSchoolAccess`
    - staff BASE → true
    - staff PRINCIPAL → false
    - TEACHER BASE → false
  - `schoolRouteAccess`
    - `'/government/school-admin'` → BASE
    - `'/government/school-admin/financial/record-payment'` → FINANCE_PAYMENTS
    - `'/government/school-admin/financial'` → FINANCE_RULES
    - `'/government/school-admin/financialx'` → BASE
    - `'/government/school-admin/academic-years/close'` → PRINCIPAL
    - `'/government/school-admin/academic-grading/windows/grades'` → TEACHING
    - `'/government/school-admin/settings'` → BASE
    - `'/government/school-admin/settings/users'` → PRINCIPAL
  - `SCHOOL_MODULE_LABELS` equals the eight labels in Global Constraints.
  - The presets equal the Global Constraints values.
  - In `desktop-portals.test.ts`, add `[SystemRole.INSTITUTION_STAFF, '/government/school-admin']` to the `it.each` table.
- [ ] **Step 2: Run** `pnpm vitest run packages/types`. Expected: FAIL, because the module does not exist yet.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `pnpm vitest run packages/types` and `pnpm -r typecheck`.
  - The typecheck will fail on every `Record<DesktopPortalRole, …>` that now lacks an `INSTITUTION_STAFF` key: `sidebarConfigs`, `headerConfigs`, and others the compiler names.
  - In this task, give each one an entry that reuses the `INSTITUTION_ADMIN` value, and add a `// Stage 2 Task 8 refines` comment where it is the sidebar or header.
  - Expected: all green.
- [ ] **Step 5: Commit** `feat(types): INSTITUTION_STAFF role, school modules and office-user contracts`.

---

### Task 3: Sign-in carries modules and title

**Files:**
- Modify: `apps/desktop/electron/provisioning/BackendAuthenticationGateway.ts`
  - `BackendUser` gains `modules?: unknown` and `title?: unknown`.
  - `toProvisioningUser` sets `modules` to the array filtered through `isSchoolModule`. A non-array becomes `[]`.
  - `title` is set only when it is a non-empty string.
  - Both fields are set for every role. Other roles get `modules: []`.
- Modify: `packages/presentation/src/formatters/format-text.ts`. Add the role label `INSTITUTION_STAFF: 'School Office Staff'`.
- Modify: `apps/desktop/renderer/components/messaging/shared.tsx`. Add the same label to its role map.
- Test: `apps/desktop/electron/provisioning/BackendAuthenticationGateway.test.ts`, plus the format-text test if one exists.

**Interfaces:**
- Consumes `isSchoolModule` and `ProvisioningUser.modules`/`title` from Task 2.
- Produces: `workspaces.active.user.modules` is always an array after an online sign-in or restore. It may be undefined only on a session stored by an older build.

- [ ] **Step 1: Write failing tests** in the gateway test, following its existing fetch-stub pattern:
  - `login of an INSTITUTION_STAFF user carries modules and title`
    - Payload user `{ role: 'INSTITUTION_STAFF', institutionId: 'inst-1', modules: ['STUDENTS'], title: 'Registrar' }`.
    - Expect `user.modules` to equal `['STUDENTS']`, `user.title` to be `'Registrar'`, and `user.scope` to equal `{ type: 'INSTITUTION', scopeId: 'inst-1', institutionId: 'inst-1', … }`.
  - `restore via /auth/me carries modules`: same assertions on `restore()`.
  - `unknown module ids are dropped`: `modules: ['STUDENTS', 'TIME_TRAVEL']` yields `['STUDENTS']`.
  - `missing or malformed modules become []`: `modules` absent, and `modules: 'STUDENTS'`.
  - `staff account without institutionId is refused`: rejects with `ForbiddenError`.
- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/electron/provisioning/BackendAuthenticationGateway.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** the test again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): sign-in carries office-staff modules and title`.

---

### Task 4: Local migration 048 and importer columns

**Files:**
- Create: `apps/desktop/electron/database/migrations/048-add-user-organization-modules.ts`
  - Migration id `'048-add-user-organization-modules'`.
  - Two `ALTER TABLE user_organizations ADD COLUMN` statements per Global Constraints.
  - `down` drops both columns. Follow the shape of an existing ADD COLUMN migration such as `037` or `043`.
- Modify: `apps/desktop/electron/database/migrations/registry.ts`. Append it as `addUserOrganizationModules`.
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts`. Add `'modules','title'` to the `userOrganizations` spec columns, and `{ modules: '[]' }` as its defaults. Arrays already serialize through the importer's `JSON.stringify` fallback.
- Test: `apps/desktop/electron/database/migrations/048-add-user-organization-modules.test.ts` and `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`.

**Interfaces:**
- Produces local columns `user_organizations.modules` (a JSON text array, never NULL) and `user_organizations.title`. Task 9 reads them.

- [ ] **Step 1: Write failing tests.**
  - The migration test, modelled on the `047` test:
    - after `up`, an inserted row without the columns reads `modules = '[]'` and `title = NULL`
    - `down` removes both
  - An importer test, `imports userOrganizations modules and title`:
    - a snapshot row `{ …, role: 'INSTITUTION_STAFF', modules: ['STUDENTS','REPORTS'], title: 'Registrar' }` lands with `modules = '["STUDENTS","REPORTS"]'`
    - a row without `modules` lands `'[]'`
- [ ] **Step 2: Run** with the Electron-as-Node command on both files. Expected: FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** again with the Electron-as-Node command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): store office-staff modules and title locally (migration 048)`.

---

### Task 5: IPC channel classification

**Files:**
- Modify: `apps/desktop/electron/ipc/authorizeChannel.ts`
- Modify: `apps/desktop/electron/ipc/handlers/shared/reportCards.ts`. `viewerFor` returns `{ teacherUserId: null }` for any `isInstitutionScopedRole` role. `authorizeChannel` has already required `REPORTS` for staff.
- Modify: `apps/desktop/electron/data/services/YearStructureCopyService.ts`. Allow an institution-scoped role. `authorizeChannel` gates `ACADEMIC_YEAR_COPY_STRUCTURE` by module.
- Modify: `apps/desktop/electron/data/services/StudentSyncStatusService.ts`. Same change, gated by `STUDENT_CREATE_SYNCED`.
- Test: `apps/desktop/electron/ipc/authorizeChannel.test.ts`, plus the existing tests of the two services and `reportCards`.

**Interfaces:**
- Consumes `SchoolAccess`, `canUseSchoolAccess`, `hasModule`, `isInstitutionScopedRole` and `SCHOOL_MODULE_LABELS` from Task 2, and `workspaces.active.user.modules` from Task 3.
- Produces exported `SCHOOL_ADMIN_CHANNELS: ReadonlyMap<IpcChannel, SchoolAccess>` and `SCHOOL_STAFF_CHANNELS: ReadonlyMap<IpcChannel, SchoolAccess>`. They are exported so the coverage test can walk them.

**Rules:**
- `SCHOOL_ADMIN_CHANNELS` (admin and office staff):
  - an admin passes every entry
  - `INSTITUTION_STAFF` passes when `canUseSchoolAccess(user, access)` is true
  - every other role gets today's refusal text
  - a module refusal uses the module copy, and a `PRINCIPAL` refusal uses the principal copy, both from Global Constraints
- `SCHOOL_STAFF_CHANNELS` (admin, teacher and office staff): admin and TEACHER pass as today, and office staff follow the same rule.
- `REPORT_CARD_CHANNELS` stays as a set but also admits `INSTITUTION_STAFF`. Its access comes from the `SCHOOL_STAFF_CHANNELS` map (`REPORTS`).
- Every other set keeps its role-equality check unchanged, so `INSTITUTION_STAFF` is refused there. That covers teacher-only, county, and government year archives.

Classification of `SCHOOL_ADMIN_CHANNELS`:
- **STUDENTS:**
  - all `REGISTRY_*`, `STUDENT_BULK_CLAIM` and all `TRANSFER_*`
  - all `CARRY_OVER_*`
  - `STUDENT_CREATE`, `STUDENT_CREATE_AND_ENROLL`, `STUDENT_UPDATE`, `STUDENT_SET_ACTIVE`, `STUDENT_CREATE_GUARDIAN`, `STUDENT_ENROLL`, `STUDENT_MOVE_CLASS`
  - `STUDENT_CREATE_SYNCED`
- **ACADEMIC_SETUP:** `ACADEMIC_YEAR_CREATE`/`UPDATE`/`START`/`COPY_STRUCTURE`, all `TERM_*` writes, and all `SUBJECT_*` writes.
- **PRINCIPAL:**
  - all `CLOSE_*`, `REOPEN_YEAR` and all `CORRECT_*`
  - `SCHOOL_USERS_LIST`, `SCHOOL_USERS_CREATE`, `SCHOOL_USERS_UPDATE`, `SCHOOL_USERS_SET_ACTIVE` (added to this map)
- **TEACHING:**
  - `CLASS_CREATE`/`UPDATE`/`SET_ACTIVE`, `CLASS_SUBJECT_ASSIGN`/`UNASSIGN`
  - `TIMETABLE_CREATE`/`UPDATE`/`DELETE`/`COPY`
  - `TIMETABLE_LIST`/`CLASS`/`SUBJECT`/`CONFLICTS`
- **STAFF:** all `TEACHER_*` writes.
- **BASE:**
  - `DASHBOARD_GET_OVERVIEW`, `SCHOOL_GET_SUMMARY`
  - `ACADEMIC_YEAR_LIST`, `TERM_GET_CURRENT`
  - `SUBJECT_LIST`, `CLASS_GRADE_LEVEL_COUNTS`, `CLASS_SUBJECT_LIST`
  - `TEACHER_LIST`, `TEACHER_GET_PROFILE`
  - `STUDENT_GET`, `STUDENT_LIST_ENROLLMENTS`, `STUDENT_GET_STATISTICS`
  - `TIMETABLE_DASHBOARD`, which the dashboard needs

Classification of `SCHOOL_STAFF_CHANNELS` for office staff:
- **TEACHING:** `ATTENDANCE_LIST`, `ATTENDANCE_RECORD`, `CARRIED_GRADES_FOR_PERIOD`, `TIMETABLE_TEACHER`.
- **REPORTS:** the four report-card channels.
- **BASE:** `CLASS_LIST`, `STUDENT_LIST`, `TEACHER_LIST_ASSIGNMENTS`, `TIMETABLE_PERIODS`, `ACADEMIC_YEAR_GET_CURRENT`, `TERM_LIST`, `ACADEMIC_CONTEXT_GET`.

- [ ] **Step 1: Write failing tests** in `authorizeChannel.test.ts`, with a stub workspace whose `active.user` is `{ role, modules }`:
  - `every school-admin and school-staff channel has a classification`
    - iterate both exported maps and assert each value is `'BASE'`, `'PRINCIPAL'` or `isSchoolModule`
    - also assert the union of their keys equals the channel list before this change plus the four `SCHOOL_USERS_*` channels (a frozen literal array in the test), so a channel dropped from a set fails the test
  - `principal-only channels refuse office staff even with every module`: each `CLOSE_*`, `REOPEN_YEAR`, `CORRECT_*` and `SCHOOL_USERS_*` channel throws `ForbiddenError('This action is only available to the School Admin.')`
  - `office staff pass base channels with no modules`: `DASHBOARD_GET_OVERVIEW`, `STUDENT_LIST`, `TIMETABLE_DASHBOARD`
  - `office staff need the module`
    - `STUDENT_CREATE` with `['FINANCE_PAYMENTS']` throws `'This account does not have access to Students & families.'`
    - `STUDENT_CREATE` with `['STUDENTS']` passes
  - `office staff with REPORTS read report cards; without it they are refused`
  - `office staff are refused teacher-only and county channels`: `ASSIGNMENT_LIST`, `COUNTY_LIST_USERS`
  - `admin and teacher behaviour unchanged`: keep the existing cases, plus admin on `SCHOOL_USERS_CREATE` passes and TEACHER on `STUDENT_CREATE` is still refused
  - In the `reportCards` test, `office staff viewer reads institution-wide`
  - In the copy-structure and sync-status tests, `office staff workspace is allowed`
- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/electron/ipc/authorizeChannel.test.ts apps/desktop/electron/ipc/handlers/shared` and use the Electron-as-Node command for the two service tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the check order of today: report cards are checked before the staff map, so the refusal names report cards.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): classify school IPC channels by module for office staff`.

---

### Task 6: Per-user record collections in `SchoolAdminModuleService`

**Files:**
- Modify: `apps/desktop/electron/data/services/SchoolAdminModuleService.ts`
- Test: `apps/desktop/electron/data/services/SchoolAdminModuleService.test.ts`

**Interfaces:**
- Consumes `hasModule`, `isInstitutionScopedRole` and `SchoolModule` from Task 2, and `active.user.modules` from Task 3.
- Produces two module-level functions, `readCollectionsFor(user: ProvisioningUser): ReadonlySet<SchoolAdminCollection>` and `writeCollectionsFor(user: ProvisioningUser): ReadonlySet<SchoolAdminCollection>`. They replace the lookups `ROLE_READ_COLLECTIONS[role]` and `ROLE_WRITE_COLLECTIONS[role]`. Other roles return today's sets unchanged.

**Office-staff sets:**
- Base read set:
  - `institutions`, `students`, `guardians`, `student_guardians`, `staff`, `staff_directory`, `institution_admin`
  - `classes`, `subjects`, `grading_periods`, `fee_rules`, `fee_obligations`
  - `announcements`, `conversations`, `messages`, `user_notifications`
- Base write set: `messages`, `user_notifications`.
- Module collections, added to both the read and the write set unless noted:
  - **ACADEMIC_SETUP:** `institution_grading_configs`, `grading_periods`, `grade_entry_windows`
  - **STUDENTS:** `guardians`, `student_guardians`, and `student_transfers` (read only, because it stays pull-only for every role)
  - **STAFF:** `staff`, `staff_directory`
  - **TEACHING:** `grades`, `assessment_templates`, `assessments`, `timetable_entries`, `class_resources`
  - **FINANCE_PAYMENTS:** `fee_payments`
  - **FINANCE_RULES:** `fee_rules`, `fee_obligations`
  - **REPORTS:** `reports`
  - **SCHOOL:** `alerts`, `institutions`
- `announcements` is never in an office-staff write set.
- The dedicated-workflow guards in `save` and `delete` still apply on top of these sets. That covers students, staff, classes and the other collections those guards list.

**Other changes:**
- In `context()`, `save()` and `assertScoped()`, every `role === 'INSTITUTION_ADMIN'` and `role !== 'INSTITUTION_ADMIN'` test becomes `isInstitutionScopedRole(role)` or its negation. That includes forcing `institutionId` and `schoolId` to the workspace scope on save.
- `reverseFeePayment` already calls `context('fee_payments')`. With this change it requires `FINANCE_PAYMENTS`.

- [ ] **Step 1: Write failing tests**, using the file's existing workspace fixture with the user swapped:
  - `business manager (FINANCE_PAYMENTS) reads students, fee rules and obligations`: `list` succeeds for `students`, `fee_rules`, `fee_obligations` and `fee_payments`
  - `business manager records a payment and reverses it`: the existing payment-create and reversal fixtures pass under a staff user with `['FINANCE_PAYMENTS']`
  - `business manager cannot save a fee rule`: `save({ collection: 'fee_rules', … })` throws `ForbiddenError('This record type cannot be changed by the active role.')`
  - `registrar (STUDENTS) cannot read grades or fee payments`: `list` throws on `grades` and `fee_payments`
  - `office staff never write announcements`, even with all eight modules
  - `office staff saves are forced into their own institution`: a staff save of `alerts` with a foreign `institutionId` lands with the workspace id, the same as the admin today
  - `office staff with modules undefined get the base sets only`
- [ ] **Step 2: Run** with the Electron-as-Node command on the test file. Expected: FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** the test again. Expected: PASS, with every existing case still green.
- [ ] **Step 5: Commit** `feat(desktop): per-user record collections for office staff`.

---

### Task 7: Renderer session context, route guard and module guard

**Files:**
- Create: `apps/desktop/renderer/components/shell/SessionUserContext.tsx`. It holds `SessionUserProvider({ user, children })` and `useSessionUser(): ProvisioningUser`. The hook throws outside a provider.
- Modify: `apps/desktop/renderer/components/shell/RouteGuard.tsx`.
  - Replace `requiredRole?` with `requiredRoles?: readonly DesktopPortalRole[]`, and update every caller.
  - When allowed, render `<SessionUserProvider user={status.user}>`.
- Create: `apps/desktop/renderer/components/shell/ModuleGuard.tsx`.
  - It reads `usePathname()` and `useSessionUser()`.
  - When `canUseSchoolAccess(user, schoolRouteAccess(pathname))` is false, it calls `router.replace('/government/school-admin')` and renders nothing.
  - Otherwise it renders its children.
  - It re-checks on every pathname change.
- Modify: `apps/desktop/renderer/app/government/school-admin/layout.tsx`.
  - `RouteGuard requiredRoles={[INSTITUTION_ADMIN, INSTITUTION_STAFF]}` wraps an inner `SchoolAdminShell`.
  - The shell reads `useSessionUser().role` for `Sidebar` and `Header`, and wraps `{children}` in `<ModuleGuard>`.
- Test: `apps/desktop/renderer/components/shell/ModuleGuard.test.tsx` and `apps/desktop/renderer/components/shell/RouteGuard.test.tsx`. Create the RouteGuard test if none exists.

**Interfaces:**
- Consumes `canUseSchoolAccess` and `schoolRouteAccess` from Task 2.
- Produces `useSessionUser()`. Tasks 8 and 10 use it.

- [ ] **Step 1: Write failing tests.**
  - ModuleGuard: mock `next/navigation` and wrap the guard in `SessionUserProvider`.
    - `registrar on /students renders the page`
    - `registrar on /financial is redirected to the dashboard`, and the children are not rendered
    - `office staff on /academic-years/close and /settings/users are redirected`
    - `admin passes every route`
    - `staff with modules undefined on /students is redirected; on /messages renders`
  - RouteGuard, with `sharedBridge.getProvisioningStatus` mocked:
    - `INSTITUTION_STAFF is admitted when listed in requiredRoles`
    - `a TEACHER is sent to /government/teacher`
- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/renderer/components/shell`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** the shell tests again, then `pnpm -r typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): office staff enter the school-admin shell, routes gated by module`.

---

### Task 8: Sidebar filtering, header and dashboard for office staff

**Files:**
- Modify: `apps/desktop/renderer/components/shell/sidebarConfig.ts`.
  - `SidebarNavItem` gains `access?: SchoolAccess`. Absent means `BASE`.
  - Tag each school-admin item with its `SCHOOL_ROUTE_ACCESS` value. The admin sidebar already matches the route table by href.
  - The `INSTITUTION_STAFF` entries in `sidebarConfigs` and `headerConfigs` point at the same objects as the admin's. Drop the Task 2 comment.
- Modify: `apps/desktop/renderer/components/shell/Sidebar.tsx`.
  - Filter items by `canUseSchoolAccess(useSessionUser(), item.access ?? 'BASE')`, but only when the role is institution-scoped. Other portals are unfiltered.
  - Drop groups that end up empty.
  - Enable `usePendingTransferCount` when `hasModule(user, 'STUDENTS')`.
- Modify: `apps/desktop/renderer/components/shell/Header.tsx`. Show `AcademicYearLabel` for `INSTITUTION_STAFF` too.
- Modify: `apps/desktop/renderer/app/government/school-admin/page.tsx`.
  - Render `PriorRecordsToMatchCard` only with `STUDENTS`.
  - Hide quick actions whose target route the user cannot use, using `schoolRouteAccess(href)`.
- Modify: `apps/desktop/renderer/components/shell/use-collapsed-groups.ts`, only if its key is role-typed. Office staff share the admin's key namespace.
- Test: `apps/desktop/renderer/components/shell/Sidebar.test.tsx`, `apps/desktop/renderer/components/shell/Header.test.tsx` and `apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`.

**Interfaces:**
- Consumes `useSessionUser` from Task 7, plus `canUseSchoolAccess`, `hasModule` and `schoolRouteAccess` from Task 2.
- Produces `SidebarNavItem.access`. Task 10 adds the Users & Access item with `access: 'PRINCIPAL'`.

- [ ] **Step 1: Write failing tests**, wrapping the components in `SessionUserProvider`:
  - Sidebar:
    - `registrar sees Students, Parents & Guardians, Student Transfers, Notifications, Messages, Settings, and no Finance group`
    - `business manager sees Record Payment and Payment Plan, no Students group`
    - `office staff with no modules see Overview, Notifications, Messages and Settings only`
    - `admin sidebar unchanged`: the existing cases
    - `transfer badge reads only with STUDENTS`: `listSchoolAdminRecords` is not called for a business manager
  - Header: `office staff see the academic-year label`
  - Dashboard:
    - `prior-records card hidden without STUDENTS`
    - `quick actions limited to the user's modules`
- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/renderer/components/shell apps/desktop/renderer/app/government/school-admin/dashboard.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): sidebar, header and dashboard follow office-staff modules`.

---

### Task 9: Users & Access — main process

**Files:**
- Create: `packages/application/src/interfaces/institution/school-users-read-model.ts`. It defines the port `ISchoolUsersReadModel { list(institutionId: string): Omit<SchoolUsersResult, 'source'> }`.
- Create: `packages/application/src/use-cases/institution/get-school-users.ts`. It defines `GetSchoolUsersUseCase`, which returns `{ source: 'device', ...readModel.list(institutionId) }`. Follow `get-county-users.ts`.
- Modify: the `institution-application-service.ts` deps, plus the method `listSchoolUsers(query: { institutionId: string }): Promise<ApplicationResponse<SchoolUsersResult>>`.
- Modify: `packages/application/src/factories/create-application-layer.ts`, with the port `schoolUsers: ISchoolUsersReadModel`. Export it from the interfaces index.
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteSchoolUsersReadModel.ts`.
  - It lists users joined to `user_organizations` with `institutionId = ?` and `role IN ('INSTITUTION_ADMIN','INSTITUTION_STAFF')`.
  - `isActive` comes from the org row.
  - `modules` is parsed with try/catch. Malformed JSON gives `[]`, and unknown ids are filtered out.
  - `staffId` comes from `staff.userId`.
  - Order is admin first, then lastName and firstName.
  - It also returns `linkableStaff`: staff with `institutionId = ?`, `userId IS NULL` and `isActive = 1`, ordered by lastName and firstName.
  - It uses `guarded(...)` like `SqliteCountyUsersReadModel`.
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts`. Wire the read model.
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts`. Add four methods. Each validates the response shape with a `requireSchoolOfficeUser` mapper that throws on a missing `id` or `role`, the same way `requireId` does.
  - `listSchoolUsers(): Promise<SchoolOfficeUser[]>`
  - `createSchoolUser(request: CreateSchoolUserRequest): Promise<CreateSchoolUserResult>`
  - `updateSchoolUser(request: UpdateSchoolUserRequest): Promise<SchoolOfficeUser>`
  - `setSchoolUserActive(request: SetSchoolUserActiveRequest): Promise<SchoolOfficeUser>`
  - Commands use `ONLINE_COMMAND`.
- Create: `apps/desktop/electron/ipc/handlers/school-admin/schoolUsers.ts`, with `registerSchoolUserHandlers(handle, app, deps: { gateway: SchoolUserGateway; isOnline: () => boolean; refresh: () => Promise<boolean>; institutionId: () => string })`.
  - `SCHOOL_USERS_LIST`: when `isOnline()` is true, it tries the gateway. A success returns `{ source: 'server', users, linkableStaff }`, with `linkableStaff` from the local read model. When offline, or on any gateway failure (log `logger.warn` without the payload), it returns `app.institution.listSchoolUsers(...)` data.
  - The three commands go through `runOnline(command, refresh)`.
  - `SchoolUserGateway` is a `Pick` of the four gateway methods.
- Modify: `apps/desktop/electron/security/validateIpc.ts`.
  - Add `assertSchoolUserCreateArgs`, `assertSchoolUserUpdateArgs` and `assertSchoolUserSetActiveArgs`.
  - Required strings are trimmed and non-empty.
  - Lengths: first and last name ≤ 100, email ≤ 255 with the existing email check, phone ≤ 30, title ≤ 60.
  - `modules` must be a non-empty array of `isSchoolModule` values with no duplicates. On update it is optional, but non-empty when given.
  - `userId` and `staffId` must be non-empty strings.
  - The list channel uses `assertNoArgs`.
- Modify: `apps/desktop/electron/ipc/registrar.ts` and `apps/desktop/electron/ipc/handlers/school-admin` exports. Register with `isOnline: () => syncWorker.isOnline()`, the same `refresh` as the county commands, and `institutionId: () => workspaces.active.user.scope.scopeId`.
- Create: `apps/desktop/electron/preload/school-admin/school-users-api.ts`, exported as `schoolUsersApi { list, create, update, setActive }`. Add it to `schoolAdminApi`, and add the `SchoolUsersApi` type to `NemisApi` in `packages/types/src/api.ts`.
- Test files:
  - `apps/desktop/electron/ipc/handlers/school-admin/schoolUsers.test.ts`
  - `apps/desktop/electron/data/repositories/sqlite/business/SqliteSchoolUsersReadModel.test.ts`
  - gateway cases in `BackendProvisioningGateway.test.ts`
  - validator cases in the existing validateIpc test file
  - `packages/application/src/use-cases/institution/get-school-users.test.ts`

**Interfaces:**
- Consumes the Task 2 contracts, the Task 4 columns, and the Task 5 `PRINCIPAL` classification of the four channels.
- Produces the preload API `window.nemis.schoolAdmin.schoolUsers.{list(): Promise<SchoolUsersResult>, create(r): Promise<OnlineCommandResult<CreateSchoolUserResult>>, update(r): Promise<OnlineCommandResult<SchoolOfficeUser>>, setActive(r): Promise<OnlineCommandResult<SchoolOfficeUser>>}`.

- [ ] **Step 1: Write failing tests.**
  - Read model:
    - `lists the school's admin and office staff with parsed modules and staff link`
    - `malformed modules JSON reads as []`
    - `excludes other schools and other roles`
    - `linkableStaff excludes linked and inactive staff`
  - Handler:
    - `online list comes from the server`, with `source: 'server'`
    - `offline list comes from the device without calling the gateway`, with `source: 'device'`
    - `server failure while online falls back to the device`
    - `create calls the gateway then refresh and returns the credential`
    - `a failed command throws and does not refresh`
  - Gateway, with a fetch stub:
    - `createSchoolUser posts the body and maps user and credential`
    - `setSchoolUserActive(false) posts to /deactivate, (true) to /reactivate`
    - `updateSchoolUser PATCHes /school-admin/users/:id without userId in the body`
  - Validators:
    - `rejects empty modules, unknown module, duplicate module, 61-char title`
    - `accepts a minimal create`
  - Use case: `returns device source`.
- [ ] **Step 2: Run** the SQLite and handler tests with the Electron-as-Node command, and the rest with `pnpm vitest run`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** the same tests, then `pnpm -r typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): office-user list and commands in the main process`.

---

### Task 10: Users & Access — renderer page

**Files:**
- Create: `apps/desktop/renderer/services/nemis-bridge/school-admin/school-users-bridge.ts`, with `schoolUsersBridge { list, create, update, setActive }`, and export it from the folder index.
- Create: `packages/presentation/src/view-models/school-admin/school-users-view-model.ts`, with `SchoolUsersViewModel`. Its store is `{ users: AsyncState<SchoolUsersResult> }`, and `load()` uses `trackQuery`.
  - Wire it in `create-presentation-layer.ts` from a new `PresentationLayerOptions.loadSchoolUsers?: () => Promise<SchoolUsersResult>`, the same way `startAcademicYear` is passed.
  - Pass it in `apps/desktop/renderer/lib/presentation/create-renderer-presentation.ts`.
  - Add a hook, `useSchoolUsersViewModel`, in `renderer/lib/presentation/hooks/school-admin.ts`.
- Create: `apps/desktop/renderer/app/government/school-admin/settings/users/page.tsx`, which re-exports `SchoolUsersPage`.
- Create: `apps/desktop/renderer/components/school-users/SchoolUsersPage.tsx`, the list.
  - Each card shows the name, email, title, a "School Admin" or "School Office Staff" badge, module chips with labels, an Active or Disabled state, and the last sign-in.
  - Admin rows have no actions.
  - Staff rows have Edit and Disable or Enable actions.
  - The page has an "Add office user" button.
  - A `source: 'device'` result shows a banner: "You're offline. These are the active accounts saved on this device. Disabled accounts and changes need a connection."
  - All command buttons are disabled while offline (`useConnectivityStore`), with the note "Connect to the internet to add or change office accounts."
- Create: `apps/desktop/renderer/components/school-users/SchoolUserDrawer.tsx`, for create and edit, using `Drawer` from `@nemis-desktop/ui`.
  - Fields: first name, last name, email (create only), phone, title, a preset picker, `ModuleChecklist`, and an optional "Link to an existing staff member" select over `linkableStaff` (create only).
  - The preset picker is Registrar, Business Manager or Custom. Choosing a preset sets the title when it is empty, and replaces the ticked modules.
  - Client validation mirrors Task 9's rules.
  - Server errors are shown with `parseIpcError`.
- Create: `apps/desktop/renderer/components/school-users/ModuleChecklist.tsx`, with one checkbox per `SCHOOL_MODULES` entry labelled by `SCHOOL_MODULE_LABELS`.
- Create: `apps/desktop/renderer/components/school-users/CredentialPanel.tsx`.
  - It shows after a create that returned `credential`. It reads: "Share these sign-in details with <name>. They are shown only once."
  - It shows the email and the password, each with a copy button, and has a Done button that clears the panel from state.
  - A create without a credential, for an existing teacher who gained office access, shows a toast instead: "<name> can now sign in with their existing password."
- After a successful edit or enable/disable, the page shows a toast: "Saved. A signed-in desktop picks up the change the next time it reconnects, or when the person signs in again."
- Modify: `apps/desktop/renderer/components/shell/sidebarConfig.ts`. Add `{ name: 'Users & Access', href: '/government/school-admin/settings/users', icon: ShieldCheck, access: 'PRINCIPAL' }` to the SCHOOL group, and add `pageTitles` `'/government/school-admin/settings/users': 'Users & Access'`.
- Test files:
  - `apps/desktop/renderer/components/school-users/SchoolUsersPage.test.tsx`
  - `apps/desktop/renderer/components/school-users/SchoolUserDrawer.test.tsx`
  - the view-model test in `packages/presentation`
  - a Sidebar case

**Interfaces:**
- Consumes the Task 9 preload API, the Task 2 presets and labels, `useSessionUser` (Task 7), and `SidebarNavItem.access` (Task 8).
- Produces the finished page.

- [ ] **Step 1: Write failing tests.**
  - Page:
    - `lists admin and office staff with module labels`
    - `device source shows the offline banner and disables Add, Edit and Disable`
    - `disable calls setActive({ userId, isActive: false }) then reloads`
  - Drawer:
    - `Registrar preset ticks Students & families and fills the title`
    - `Business Manager preset ticks both finance modules`
    - `submit is blocked with no module ticked`
    - `create with a credential shows the credential panel; Done clears it`
    - `create without a credential shows the existing-password toast`
  - View model: `load stores the bridged result`.
  - Sidebar: `Users & Access shows for the admin, not for office staff with every module`.
- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/renderer/components/school-users packages/presentation apps/desktop/renderer/components/shell/Sidebar.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes, following the county users page and its components for layout and styling.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): Users & Access page for the School Admin`.

---

### Task 11: Full gate and handover

**Files:** none new.

- [ ] **Step 1: Run** `pnpm -r typecheck` and `pnpm lint`. Expected: 0 errors.
- [ ] **Step 2: Run the full suite under Electron-as-Node.**
  ```
  ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run
  ```
  Expected: green except the known pre-existing failures, `app/page.test.tsx` and `teacher/timetable.test.tsx`. Record the count in the ledger.
- [ ] **Step 3: Run** `pnpm --filter @nemis-desktop/app build:renderer`. Expected: the static export includes `/government/school-admin/settings/users`.
- [ ] **Step 4: Check that `git status` shows only `apps/desktop/package.json` modified.** That is Alvin's version bump, left unstaged.
- [ ] **Step 5: Write the manual GUI checklist into the ledger** for Alvin. This needs a deployed Task 1 server and a known School Admin account.
  1. Create a Registrar with the preset, and copy the credential.
  2. Sign in as that user and confirm the sidebar shows Students and base items only.
  3. Type `/government/school-admin/financial` and confirm the redirect.
  4. Register a student offline, then sync.
  5. As the admin, disable the user, and confirm the next online restore signs them out.
