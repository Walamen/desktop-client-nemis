# School Office Users — delegated school-admin access

**Date:** 2026-11-10
**Repos:** `Nemis` (apps/Server, packages/types, apps/portal-web) and `desktop-client-nemis`
**Status:** design, awaiting approval

## 1. Intent

Today one person, the School Admin (`INSTITUTION_ADMIN`), does every office task in a school: registering and enrolling students, recording payments, setting fee rules, managing staff, building timetables, running reports. In a real Liberian school those tasks are distributed. A registrar registers and enrols students. A business manager keeps the payment records. Other offices exist and vary by school.

This programme lets the School Admin create additional sign-ins for the school's office staff and decide, per person, which parts of the school-admin workflow each one can use. It covers the server, the desktop client and the web portal.

## 2. Goals, non-goals, anti-goals

**Goals**

- A School Admin can create, edit, disable and re-enable office-staff accounts for their own school, without county involvement.
- Each office-staff account is limited to a chosen set of **modules**. The School Admin picks the modules; presets ("Registrar", "Business Manager") only pre-fill the choice.
- An office-staff user sees the same school-admin screens the admin sees for their modules, and nothing else, on both the desktop and the web.
- Offline work on the desktop stays possible for office staff, with the same sync path and the same server-side authorization that the School Admin has today, narrowed to their modules.
- Every grant, change and disable is in the audit log.

**Non-goals**

- No role switcher. A person with two roles still signs in to the most recently assigned one (existing behaviour).
- No per-record permissions. Modules are the finest grain.
- No changes to how teachers, students, parents or county-level users are created or authorized.
- No admin-side password reset for office users (the shared default password already covers internal testing; see memory note on `Nemis@123`).

**Anti-goals** (would make this a failure even if it works)

- An office-staff user reaching any endpoint, IPC channel or sync entity outside their modules. The server must refuse, not just the UI.
- `INSTITUTION_ADMIN` losing its meaning of "the principal". Rosters, notifications, county messaging and stats that look for the principal must still find only the principal.
- A new enum migration across three repos every time a school names a new office.

## 3. What the codebase gives us (constraints)

These are facts from the deep read; the design is shaped around them.

1. Authorization is role-only. `User` ↔ `UserOrganization(role, institutionId|countyId|districtId, isActive)` with a unique key on `[userId, institutionId, role]`. No permission table. The `SystemRole` enum is copied in `Nemis/apps/Server/prisma/schema.prisma`, `Nemis/packages/types/src/enums.ts` and `desktop-client-nemis/packages/types/src/enums.ts`, and must stay identical.
2. A session carries one role. `AuthService.login` takes `organizations[0]` (most recent `assignedAt`). The JWT and Redis session have an unused `scopes?: string[]`.
3. `RolesGuard` passes if any active org role matches `@Roles(...)`; `SUPER_ADMIN` bypasses.
4. About 18 services resolve the caller's school with a private `getInstitutionId(user)` that only accepts the `INSTITUTION_ADMIN` org (students, fees ×2, staff, classes, enrollments, guardians, subjects, timetables, dashboard, school-admin ×2, student-registry, student-transfers, transfer-record-preview, direct-messages, desktop-provisioning, users).
5. `Staff` is the HR row; creating staff with an email always issues a `TEACHER` login (web `staff.service.ts` and the desktop sync applier). The principal has no `Staff` row; the desktop snapshot synthesizes an `institutionAdmin` roster from `INSTITUTION_ADMIN` orgs.
6. School-admin user management already exists in a confined form: `isSchoolAdminOnly` + `assertSchoolManagesTarget` in `users.service.ts` restrict a School Admin to users with an active link at one of their schools and no privileged link. Only super/ministry/county can create users or assign roles today.
7. `role-eligibility.ts` holds `DESKTOP_ROLES` (five roles), the single source for the desktop controller's `@Roles`, the desktop sign-in boundary and the snapshot roster. `isStaffRole` already treats any non-STUDENT/PARENT role as needing an email.
8. Desktop: `DESKTOP_PORTALS` maps one role → one route + one scope type. `RouteGuard requiredRole` in the school-admin layout. Workspace DB keyed by `userId\0role\0scopeType\0scopeId`. `authorizeChannel.ts` compares the role string by equality per channel set. `SchoolAdminModuleService` has `ROLE_READ_COLLECTIONS` / `ROLE_WRITE_COLLECTIONS` keyed by role string and `role === 'INSTITUTION_ADMIN'` branches in `assertScoped`.
9. Server sync: `resolveDesktopScope` enumerates the five roles; `DesktopDevice` is unique on `[installationId|fingerprint, registeredById, role, scopeId]`; `DesktopSyncApplier` has a `roleAllowed` map role → entity-type set (`INSTITUTION_ADMIN_ENTITY_TYPES` is everything); attendance is special-cased.
10. The snapshot ships the school's `users` and `user_organizations` rows (DESKTOP_ROLES only) into the local SQLite tables of the same names (importer specs in `ProvisioningImporter.ts`).
11. The County portal already has a desktop users page (`renderer/app/government/county/users`, `components/county/users/*`, `ipc/handlers/county/users.ts`, `SqliteCountyUsersReadModel`): offline list from local tables, online-only commands through `BackendProvisioningGateway`. That is the template.
12. Web: `portal-web/src/middleware.ts` has a role → dashboard map; `src/components/sidebarConfig.ts` mirrors the desktop sidebar; `src/lib/permissions.ts` has a creatable-roles map.

## 4. Decisions already made (Alvin, 2026-11-10)

| # | Decision | Choice |
|---|---|---|
| 1 | Fixed office roles vs one office-staff role + modules | **One role + modules** (option C) |
| 2 | Module granularity | **Sidebar groups**, with Finance split into *recording payments* vs *managing fee rules* |
| 3 | Account creation | **Teacher pattern**: auto-active, shared default password, credential shown once |
| 4 | Link to a `Staff` HR row | **Optional** |
| 5 | Same person as teacher and office staff | **Accept "most recent role wins"**; role switcher parked |
| 6 | Web parity | **Final stage of this programme**, after server and desktop |

## 5. Design

### 5.1 Vocabulary

- **New `SystemRole` value: `INSTITUTION_STAFF`** (UI label "School Office Staff"). My call on the name: it pairs with `INSTITUTION_ADMIN` and avoids clashing with the `Staff` HR model. One value, added once, in all three enum copies.
- **Modules** (`SchoolModule`, string constants in `@nemis/types` and `@nemis-desktop/types`, same spelling):

| Module | Sidebar group / pages it unlocks | Server surface | Desktop sync entity types |
|---|---|---|---|
| `ACADEMIC_SETUP` | Academic Grading (years, terms, periods, windows, grading config), Subjects | `academic-years` (create/update/start/copy — **not** close/reopen/correct), `terms`, `grading-config`, `grading-periods`, `grade-entry-windows`, `averages`, `grade-audits`, `subjects`, `institution-level-subjects` | `academic_years`, `terms`, `subjects`, `class_subjects`, `institution_grading_configs`, `grading_periods`, `grade_entry_windows` |
| `STUDENTS` | Students (incl. bulk import, registry lookup/claim), Parents & Guardians, Inter-school transfer, Match prior record | `students`, `guardians`, `enrollments`, `student-registry`, `student-transfers` (both controllers), `transfer-carry-overs` | `students`, `guardians`, `student_guardians`, `enrollments` |
| `STAFF` | Teachers & Staff | `staff` (institution-level endpoints) | `staff`, `subject_teachers`, `class_teachers`, `class_subject_teachers` |
| `TEACHING` | Classes, Timetable, Attendance | `classes`, `timetables`, `attendance`, `grades` | `classes`, `class_subjects`, `timetable_entries`, `attendance`, `grades`, `assessment_templates`, `assessments` |
| `FINANCE_PAYMENTS` | Record Payment (incl. reversal) | payment and obligation-balance endpoints under `finance/school-admin` and `fees` | `fee_payments` (+ the online reversal command) |
| `FINANCE_RULES` | Payment Plan (fee rules, obligations) | fee-rule and obligation endpoints under `finance/school-admin` | `fee_rules`, `fee_obligations` |
| `REPORTS` | Reports, Past years, report cards | `school-reports`, `school-admin/reports`, `report-cards`, `reports` | `reports` |
| `SCHOOL` | Settings / School profile, Grade Levels, Infrastructure & Alerts | `institutions` (own-school read/update), `alerts` | `alerts` (and the institution profile write if one exists on the desktop) |

The builder splits the two finance controllers endpoint by endpoint between `FINANCE_PAYMENTS` and `FINANCE_RULES`; `fees.controller.ts` too.

- **Base access, every office role, no module needed:** dashboard (`dashboard`, `school-admin` dashboard + statistics), own profile (`users/profile`, photo), notifications (`user-notifications`), messages (`messages`, `direct-messages`), the academic context (current year/term, bell periods) the shell needs. Desktop sync base entity types: `conversations`, `messages`, `user_notifications`; `announcements` is read-only for office staff (writing announcements stays principal-only).
- **Reads are wider than writes.** Office work crosses modules: a business manager must pick a student to record a payment, a registrar must pick a class to enrol. So *read* endpoints, IPC channels and local collections for structural school data are **base** for every office role: students (list, get, enrolments), guardians (list, get), classes, subjects, staff list and profile, academic years, terms, grading periods, fee rules and obligation balances, the teacher directory. Only *writes* (create, update, delete, set-active, assign, record, reverse, import, claim, transfer) follow the module table. Exception: finance, grade and report *reads* that are themselves the product (payment history, grade sheets, report downloads) stay with their module.
- **Principal-only, never delegable:** closing, reopening and correcting an academic year (`academic-year-close` controller and the desktop `CLOSE_*` / `REOPEN_YEAR` / `CORRECT_*` channels), creating or managing office users, writing announcements. My call: these are decisions the head of the school owns.

### 5.2 Data model (server, Prisma)

On `UserOrganization`:

```prisma
modules  String[]  @default([])   // SchoolModule values; meaningful only when role = INSTITUTION_STAFF
title    String?                  // free-text job title, e.g. "Registrar"; max 60 chars, trimmed
```

Rules:
- `role = INSTITUTION_STAFF` rows must have `institutionId` set and `modules` non-empty on creation. Validated in the service, not the schema.
- **A user holds at most one `INSTITUTION_STAFF` org.** Creating a second one (any school) is refused with 409. This keeps `resolveInstitutionId` and `ModulesGuard` deterministic: "the caller's modules" always means that one row. (A later multi-school programme can relax it; see [[teacher-multi-school-plan]].)
- `INSTITUTION_ADMIN` rows ignore `modules` (they have everything). Nothing is written there.
- County, ministry and super admins never create or assign `INSTITUTION_STAFF`: `COUNTY_CREATABLE_ROLES`, `COUNTY_LISTED_ROLES`, `assignRole` and the county/ministry user pages are unchanged and do not offer the role. Office users are managed by the school only. They therefore do not appear on the county Administrative Users page or in county user stats.
- Enum addition goes in its **own migration** (`ALTER TYPE "SystemRole" ADD VALUE 'INSTITUTION_STAFF'`) before the column migration, because Postgres refuses to use a new enum value in the same transaction that adds it.

The desktop local `user_organizations` table gets the same two columns (one desktop migration, `048-add-user-organization-modules`), and the importer spec for `userOrganizations` adds them.

### 5.3 Session and request context (server)

- `AuthService.login` is unchanged in how it picks the primary org. When that org's role is `INSTITUTION_STAFF`, it puts `modules` into the session (`scopes`) and the JWT `scopes`, and returns `modules` and `title` on the login user object (`LoginResponse.user` in `@nemis/types`). **`GET /auth/me` returns the same two fields**, because the desktop rebuilds its cached user from that endpoint on every online session restore, and the web hydrates from it.
- **Propagation of a module change.** Server: next request (the guard reads the org row). Web: next page load or `/auth/me` refetch. Desktop: the signed-in user is cached for the 7-day offline lease, so a change takes effect at the next online session restore or re-login; the Users & Access page says so after a save.
- `JwtStrategy.validate` already loads active orgs; `UserContext.organizations[]` entries gain `modules: string[]` and `title: string | null`. The source of truth at request time is the org row, not the JWT, so a module change takes effect on the next request without re-login.
- `role-eligibility.ts`: add `INSTITUTION_STAFF` to `DESKTOP_ROLES`. `isStaffRole` already returns true for it (email required, not a student's account).
- App boundaries: `INSTITUTION_STAFF` may sign in to the portal and the desktop, never SIS. It falls out of the existing checks once it is in `DESKTOP_ROLES`.

### 5.4 Authorization (server)

**One shared school resolver.** New `resolveInstitutionId(user: UserContext): string` in `src/common/` returning the `institutionId` of the caller's `INSTITUTION_ADMIN` org, else their `INSTITUTION_STAFF` org, else throwing the existing `ForbiddenException("You must be assigned to an institution …")`. Every private `getInstitutionId` listed in §3.4 is replaced by it. Services that today *also* mean "the principal" (the `institutionAdmin` roster, `notifyAdminsOfNewTeacher`, county parent-message routing, county user stats, DEO School Admins page) keep querying `INSTITUTION_ADMIN` explicitly and are **not** touched.

**`@Modules(...)` decorator + `ModulesGuard`.** Registered globally right after `RolesGuard`. Rule, in order:

1. If the caller holds `INSTITUTION_ADMIN` or any higher role (county, ministry, super) → pass.
2. If the caller holds `INSTITUTION_STAFF` for the institution being acted on:
   - the handler or controller must declare `@Modules(...)`, or be marked `@BaseAccess()` → otherwise **refuse** (fail closed; a staff role on an endpoint nobody classified is a bug, not a grant);
   - at least one declared module must be in the org's `modules` → pass, else 403 "This account does not have access to <module label>".
3. Any other caller → the guard does nothing (RolesGuard already decided).

Every endpoint in the §5.1 table gets `INSTITUTION_STAFF` added to its `@Roles` **and** the matching `@Modules`. Base endpoints get `INSTITUTION_STAFF` in `@Roles` and `@BaseAccess()`. Principal-only endpoints get neither. A unit test walks the Nest metadata of every controller and asserts: any handler whose `@Roles` includes `INSTITUTION_STAFF` has `@Modules` or `@BaseAccess`. That test is the guard against future drift.

**Sync applier.** `DesktopSyncApplier` context gains `modules: ReadonlySet<string>`. `roleAllowed[INSTITUTION_STAFF]` = base entity types ∪ the union of the module → entity-type sets from §5.1 for the caller's modules. Attendance's special case admits `INSTITUTION_STAFF` with `TEACHING`. `resolveDesktopScope` maps `INSTITUTION_STAFF` to `scopeType: "INSTITUTION", scopeId: institutionId` exactly like the admin. The snapshot is unchanged in shape except for the two new columns on `userOrganizations`; `desktopRoleMemberships` picks up the new role through `DESKTOP_ROLES`.

### 5.5 Office-user management (server)

New controller `school-admin/users` (new `SchoolAdminUsersService` in `src/school-admin/`), all endpoints `@Roles(INSTITUTION_ADMIN)` only. Confinement reuses `isSchoolAdminOnly` / `assertSchoolManagesTarget` semantics (move those two into a shared helper so both services use one copy).

| Endpoint | Behaviour |
|---|---|
| `GET /school-admin/users` | Office users of the caller's school: every user with an active or inactive `INSTITUTION_ADMIN` or `INSTITUTION_STAFF` org at that institution. Returns name, email, phone, photo, role, title, modules, isActive, lastLoginAt, linked `staffId` if any. |
| `POST /school-admin/users` | Body: firstName, lastName, email (required), phoneNumber, title, modules (non-empty, valid), optional `staffId`. Creates the `User` **auto-active with the shared default password** (`DEFAULT_USER_PASSWORD` ?? `Nemis@123`, hashed with the existing argon2 util), `emailVerified: true`, one `INSTITUTION_STAFF` org. Returns the user plus `credential: { email, defaultPassword }` exactly like `staff.service.create`. If `staffId` is given it must be a `Staff` row of this school with `userId = null`; it is linked (`Staff.userId`). |
| `PATCH /school-admin/users/:id` | title, modules (non-empty), phoneNumber, firstName, lastName. Only for an `INSTITUTION_STAFF` org at this school. |
| `POST /school-admin/users/:id/deactivate` and `/reactivate` | Flips the org's `isActive`. If the user has no other active org, flips `User.isActive` too; reactivate restores it. The `JwtStrategy` already refuses inactive users on the next request. |

Email already in use:
- belongs to a user whose only links are at **this** school and none of them is `INSTITUTION_ADMIN` (e.g. an existing teacher): add an `INSTITUTION_STAFF` org to that user instead of failing, no new password, no credential returned (the account already has one). Most-recent-wins at login then lands them in the office portal. My call; it is what "the registrar is also a teacher" needs under decision 5.
- belongs to this school's `INSTITUTION_ADMIN`: 409 "This person is already a School Admin and has full access."
- anything else: 409 "Email already registered", as today.

Validation reuses `assertEligibleForRole` (email required, not a student's account). Every endpoint writes an `AuditLog` row with `entityType: "UserOrganization"` and the before/after modules in `changes`.

Nothing changes in `users.controller.ts` except that `assertSchoolManagesTarget` now also counts `INSTITUTION_STAFF` links as "in my school" so activation-token resend keeps working.

### 5.6 Desktop client

- `enums.ts`: add `INSTITUTION_STAFF`. `desktop-portals.ts`: add it to `DESKTOP_PORTAL_ROLES` with `route: '/government/school-admin'`, `scopeType: INSTITUTION`. `ProvisioningUser` gains `modules: readonly string[]` and `title?: string`; `BackendAuthenticationGateway` reads them from the login response (empty array for every other role). The workspace key already includes `userId`, so each office user gets their own encrypted DB.
- New `packages/types/src/school-modules.ts`: the `SchoolModule` constants, the module ↔ sidebar-group map, the route-prefix → module map, and `hasModule(user, module)` (true for `INSTITUTION_ADMIN`, module check for `INSTITUTION_STAFF`, false otherwise).
- **Shell.** `school-admin/layout.tsx`'s `RouteGuard` accepts either role. `headerConfigs` and `sidebarConfigs` in `sidebarConfig.ts` get an `INSTITUTION_STAFF` entry that reuses the school-admin configuration. A `ModuleGuard` (or an extension of `RouteGuard`) maps the current pathname to a module via the route-prefix map and redirects to the dashboard when the user lacks it; base routes (dashboard, notifications, messages, settings → profile only) always pass. `sidebarConfig.ts` groups and items carry a `module`; `Sidebar` hides items the user lacks and drops empty groups. `Header` treats `INSTITUTION_STAFF` like the admin (academic-year label, bell, basePath).
- **IPC.** `authorizeChannel.ts`: `SCHOOL_ADMIN_CHANNELS` becomes a `Map<IpcChannel, SchoolModule | 'PRINCIPAL' | 'BASE'>`. Admin passes everything; `INSTITUTION_STAFF` passes `BASE`, passes a module channel only when `workspaces.active.user.modules` has it, never passes `PRINCIPAL` (close/reopen/correct, office-user commands). `SCHOOL_STAFF_CHANNELS` and `REPORT_CARD_CHANNELS` admit `INSTITUTION_STAFF` (report cards additionally require `REPORTS`). `SchoolAdminModuleService`: `ROLE_READ_COLLECTIONS[INSTITUTION_STAFF]` = a structural base set (`institutions`, `students`, `staff`, `staff_directory`, `institution_admin`, `classes`, `subjects`, `academic_years`-equivalents, `announcements`, `conversations`, `messages`, `user_notifications`) ∪ the collections of the user's modules; `ROLE_WRITE_COLLECTIONS[INSTITUTION_STAFF]` = `messages`, `user_notifications` ∪ module collections. Because these are now per-user, the two maps become functions of the active user. Every `role === 'INSTITUTION_ADMIN'` branch in `assertScoped` becomes "is an institution-scoped role".
- **Users & Access page** at `/government/school-admin/settings/users` (sidebar: SCHOOL group, "Users & Access", admin-only). Mirrors the county users page: list from the local `users` + `user_organizations` tables (new `SqliteSchoolUsersReadModel`, both roles at this institution, title and modules shown), and online-only commands through `BackendProvisioningGateway` (`listSchoolUsers`, `createSchoolUser`, `updateSchoolUser`, `setSchoolUserActive`), each followed by a snapshot refresh like the county handlers do. The create drawer: name, email, phone, title, a preset picker (Registrar → `STUDENTS`; Business Manager → `FINANCE_PAYMENTS` + `FINANCE_RULES`; Custom) that pre-ticks a module checklist, an optional "link to existing staff member" picker over the school's unlinked `staff` rows, and a credential panel after success reusing the teacher-create credential display. New IPC channels `SCHOOL_USERS_LIST`, `SCHOOL_USERS_CREATE`, `SCHOOL_USERS_UPDATE`, `SCHOOL_USERS_SET_ACTIVE`, all `PRINCIPAL`.
- Pending-change and conflict pages, sync status bar, manual sync: unchanged; they already key on the workspace.

### 5.7 Web portal (final stage)

- `@nemis/types` `AuthUser` gains `modules` and `title`. `middleware.ts` `ROLE_DASHBOARD` gets `INSTITUTION_STAFF: "/government/school-admin"`. The school-admin layout accepts both roles. `sidebarConfig.ts` items get the same `module` tag and the sidebar filters; a client-side module guard on the school-admin layout redirects like the desktop. `permissions.ts` creatable map: `INSTITUTION_ADMIN: [INSTITUTION_STAFF]`.
- Users & Access page under school-admin settings, same shape as the desktop page, RTK Query over the §5.5 endpoints.

### 5.8 Rollout order

1. **Server** (Nemis): additive. Old desktop and web builds keep working because no row carries the new role until a School Admin creates one, and an old desktop refuses the role at sign-in anyway (`isDesktopPortalRole`).
2. **Desktop** (desktop-client-nemis): needs the server deployed first.
3. **Web** (Nemis/apps/portal-web).

## 6. Stages

- **Stage 1 — Server:** enum + column migrations, `resolveInstitutionId` refactor across the §3.4 services, `@Modules`/`@BaseAccess`/`ModulesGuard`, decorator sweep per §5.1 plus the drift test, login/JWT/`UserContext` changes, `DESKTOP_ROLES` + `resolveDesktopScope` + applier `roleAllowed` with modules, snapshot columns, `school-admin/users` service and controller with tests.
- **Stage 2 — Desktop:** enums/portals/types, local migration 048 + importer, shell guards and sidebar filtering, `authorizeChannel` map, `SchoolAdminModuleService` per-user maps, Users & Access page with gateway methods and IPC handlers, tests at the usual gate.
- **Stage 3 — Web:** types, middleware, layout guard, sidebar filter, Users & Access page.

Each stage follows the existing process: design → written plan → subagent-driven build and review → full test gate → merge to main.

## 7. Left to the builder

- Exact endpoint-level split of the two finance controllers and `fees.controller.ts` between `FINANCE_PAYMENTS` and `FINANCE_RULES`.
- Whether `ModuleGuard` is a new component or an option on `RouteGuard`.
- Internal shape of the per-user read/write collection maps in `SchoolAdminModuleService`.
- Drawer vs page for the create form on the desktop (follow the county users page).
- Test layout; the drift test in §5.4 and a desktop test that every `SCHOOL_ADMIN_CHANNELS` entry has a classification are required.

## 8. Parked

- Role switcher for people holding two roles (decision 5).
- Admin-side password reset for office users.
- Per-teacher scoping of office users (a registrar for one grade band).
- `DATA_OFFICER` / `VIEWER`: untouched, remain national read roles.
