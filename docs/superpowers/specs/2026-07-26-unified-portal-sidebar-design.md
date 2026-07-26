# Unified Portal Sidebar & Navigation — Design

Status: approved (pending plan)
Date: 2026-07-26

## Problem

The desktop renderer currently has two competing shell implementations:

- `components/shell/Sidebar.tsx` + `components/shell/sidebar-config.ts` — a polished sidebar
  matching `Nemis/apps/portal-web/src/components/Sidebar.tsx`'s visual design, but hardcoded
  for the school-admin (`INSTITUTION_ADMIN`) role only.
- `components/shell/RolePortalShell.tsx` — a crude placeholder shell (flat unstyled link list,
  no header/breadcrumbs, different colors) used by `county`, `deo`, `ministry-portal`, and
  `teacher` layouts.

This means four of the five portals have no top header bar (search, avatar, breadcrumbs) and a
visually inconsistent sidebar, and the school-admin sidebar's logout button is actually disabled
(`RolePortalShell`'s logout, ironically, works).

Additionally, the non-school-admin portals' navigation only covers the handful of routes that
happen to exist today, rather than the fuller navigation breadth the production web app
(`portal-web`) already ships for county/deo/school-admin/teacher roles.

## Goals

1. One shared `Sidebar` + `sidebarConfig` used by all 5 portals (school-admin, county, deo,
   teacher, ministry-portal), visually matching the existing school-admin sidebar / web app.
2. One shared `Header` (top bar) used by all 5 portals, generalized from its current
   school-admin-only hardcoding.
3. Retire `RolePortalShell.tsx` — every layout converges on the same shell shape.
4. Sidebar navigation breadth matches (or, for ministry-portal, is modeled on) the richer
   `portal-web` navigation, not just the routes that happen to exist today. Every new nav
   item gets a real route (either a real read-only data page or a `ComingSoon` stub) so no
   link 404s.

## Non-goals

- No new IPC channels, no new SQLite collections, no changes to what data is provisioned.
- No change to authentication, RouteGuard's role-gating logic, or `roleCanAccessRoute`
  (it already allows any subpath under a role's base route — no change needed there).
- No renaming of `SchoolAdminCollectionPage` / `SchoolAdminCollection` / `listSchoolAdminRecords`
  despite being used by non-school-admin roles already — that naming mismatch is pre-existing
  and out of scope for this change.
- Administrative Users, Audit Trail, and role-scoped Settings pages get `ComingSoon` stubs, not
  real implementations — no backing collection exists for them today.

## Architecture

### Types & config — `components/shell/sidebarConfig.ts` (new file, replaces `sidebar-config.ts`)

Keyed by the existing `DesktopPortalRole` type (`@nemis-desktop/types`) rather than inventing a
parallel string union like the web app's `SidebarRole` — the desktop codebase already threads
`DesktopPortalRole` through `RouteGuard`, `DESKTOP_PORTALS`, etc.

```ts
export type SidebarBadge = 'notifications'; // only badge with real backing data today

export interface SidebarNavItem { name: string; href: string; icon: LucideIcon; badge?: SidebarBadge }
export interface SidebarNavGroup { label: string; items: readonly SidebarNavItem[] }
export interface SidebarConfig {
  headerTitle?: string;       // static brand text; omitted => caller-supplied institutionName
  headerSubtitle?: string;
  dashboardItem?: SidebarNavItem; // ungrouped item rendered above the groups
  navGroups: readonly SidebarNavGroup[];
}

export interface HeaderConfig {
  basePath: string;
  avatarRole: AvatarRole;              // from @nemis-desktop/ui
  breadcrumbRoot: string;               // e.g. "County", "DEO", "Ministry", "Teacher", "School Admin"
  pageTitles?: Record<string, string>;  // explicit overrides for nested pages not in the sidebar
}

export const sidebarConfigs: Record<DesktopPortalRole, SidebarConfig> = { ... };
export const headerConfigs: Record<DesktopPortalRole, HeaderConfig> = { ... };
```

### `components/shell/Sidebar.tsx`

Generalized to `Sidebar({ role, institutionName? }: { role: DesktopPortalRole; institutionName?: string })`:

- Reads `sidebarConfigs[role]`.
- Header title: `config.headerTitle ?? institutionName ?? 'NEMIS'`.
- Renders `dashboardItem` (if any) above groups, then groups with separators/labels, identical
  markup/classes to the current school-admin `Sidebar.tsx` (`bg-primary`, `bg-slate-800` active
  state, etc.) — no visual changes.
- Badge counts: only `notifications` is wired, via `useNotificationStore`; only rendered when an
  item declares `badge: 'notifications'`.
- Logout: real `nemisBridge.logout()` call (fixes the currently-disabled button), same as
  `RolePortalShell` already does — `router.replace('/')` after.

### `components/shell/Header.tsx` + `components/shell/page-titles.ts`

- `Header({ role }: { role: DesktopPortalRole })` reads `headerConfigs[role]`.
- `resolvePageTitle(pathname, role)`:
  1. Match `pathname` against `sidebarConfigs[role]`'s flattened items (dashboardItem + all
     group items) — use that item's `name` if found. Single source of truth for top-level
     labels; removes the current duplication between `sidebar-config.ts` and `page-titles.ts`.
  2. Else look up `headerConfigs[role].pageTitles?.[pathname]` — explicit overrides for nested
     pages that aren't themselves sidebar entries (e.g. `financial/record-payment`,
     `academic-grading/windows`, `financial/fee-rules`).
  3. Else title-case the last path segment (covers new pages with no explicit entry).
- Breadcrumb segments: same `pathname.replace(basePath, '').split('/').filter(Boolean).map(titleCase)`
  logic as today, prefixed with `headerConfigs[role].breadcrumbRoot`.
- Avatar role: `headerConfigs[role].avatarRole` (`'generic'` for school-admin/county/ministry,
  `'deo'` for deo, `'teacher'` for teacher).
- Institution name / user name / role label continue to come from `useCurrentUserViewModel`
  (already role-agnostic); institution name specifically still only resolved for school-admin
  via `useSettingsViewModel` (teacher stays static per current behavior — no new institution
  fetch added for teacher).

### Layouts

All 5 `layout.tsx` files converge on:

```tsx
<RouteGuard requiredRole={ROLE}>
  <div className="flex h-screen overflow-hidden bg-gray-50">
    <Sidebar role={ROLE} institutionName={...only school-admin...} />
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header role={ROLE} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <StatusBar />
    </div>
  </div>
  <ToastHost />
</RouteGuard>
```

`RolePortalShell.tsx` (and its implicit `ROLE_LINKS` map) is deleted once all 4 layouts stop
importing it.

## Per-role navigation

Existing generic viewer: `SchoolAdminCollectionPage` from
`components/school-admin/SchoolAdminModulePages.tsx`, driven by
`nemisBridge.listSchoolAdminRecords({ collection, limit })` — already scope-safe (each
workspace's local SQLite only contains what that user's provisioning snapshot downloaded).
Valid `collection` values: see `SCHOOL_ADMIN_COLLECTIONS` in `packages/types/src/school-admin.ts`.

### School Admin — unchanged

Keeps its current full config as-is (Students, Teachers & Staff, Parents & Guardians, Academic
group, Financial group, Reports, Communication, System).

### County

| Item | Status | Route | Backing |
|---|---|---|---|
| Dashboard | existing | `/government/county` | — |
| Schools | existing | `/government/county/schools` | `institutions`+`students`+`staff` |
| Districts | **new — ComingSoon** | `/government/county/districts` | none |
| Students | **new — real** | `/government/county/students` | `students` |
| Teachers | **new — real** | `/government/county/teachers` | `staff` |
| Parents/Guardians | **new — real** | `/government/county/parents` | `guardians` |
| Administrative Users | **new — ComingSoon** | `/government/county/users` | none (users/userOrganizations not exposed to this viewer) |
| Finance Overview | **new — real** | `/government/county/finance` | `fee_obligations`, `fee_payments`, `fee_rules` (tabs) |
| Fee Rules | **new — real** | `/government/county/finance/fee-rules` | `fee_rules` |
| Reports | existing | `/government/county/reports` | `reports` |
| Messages | **new — real** | `/government/county/messages` | `messages` |
| Notifications | **new — real** | `/government/county/notifications` | `user_notifications` |
| Alerts | existing, kept | `/government/county/alerts` | `alerts` (desktop-specific; no web equivalent, not removed) |
| Audit Trail | **new — ComingSoon** | `/government/county/audit` | none |
| Settings | **new — ComingSoon** | `/government/county/settings` | none |

### DEO

| Item | Status | Route | Backing |
|---|---|---|---|
| Dashboard | existing | `/government/deo` | — |
| Schools | existing | `/government/deo/schools` | `institutions` |
| School Admins | **new — ComingSoon** | `/government/deo/school-admins` | none |
| Teachers | **new — real** | `/government/deo/teachers` | `staff` |
| Students | **new — real** | `/government/deo/students` | `students` |
| Transfers | existing | `/government/deo/transfers` | `student_transfers` |
| Finance | **new — real** | `/government/deo/finance` | `fee_obligations`, `fee_payments`, `fee_rules` (tabs) |
| Reports | existing | `/government/deo/reports` | `reports` |
| Messaging | **new — real** | `/government/deo/messages` | `messages` |
| Notifications | **new — real** | `/government/deo/notifications` | `user_notifications` |
| Alerts | existing, kept | `/government/deo/alerts` | `alerts` |
| Settings | **new — ComingSoon** | `/government/deo/settings` | none |

### Ministry Portal (no web equivalent; modeled on County's enriched set, national scope)

| Item | Status | Route | Backing |
|---|---|---|---|
| Dashboard | existing | `/government/ministry-portal` | — |
| Schools | existing | `/government/ministry-portal/schools` | `institutions` |
| Students | **new — real** | `/government/ministry-portal/students` | `students` |
| Teachers | **new — real** | `/government/ministry-portal/teachers` | `staff` |
| Parents/Guardians | **new — real** | `/government/ministry-portal/parents` | `guardians` |
| Administrative Users | **new — ComingSoon** | `/government/ministry-portal/users` | none |
| Finance | **new — real** | `/government/ministry-portal/finance` | `fee_obligations`, `fee_payments`, `fee_rules` (tabs) |
| Fee Rules | **new — real** | `/government/ministry-portal/finance/fee-rules` | `fee_rules` |
| Reports | existing | `/government/ministry-portal/reports` | `reports` |
| Messages | **new — real** | `/government/ministry-portal/messages` | `messages` |
| Notifications | **new — real** | `/government/ministry-portal/notifications` | `user_notifications` |
| Alerts | existing, kept | `/government/ministry-portal/alerts` | `alerts` |
| Audit Trail | **new — ComingSoon** | `/government/ministry-portal/audit` | none |
| Settings | **new — ComingSoon** | `/government/ministry-portal/settings` | none |

No "Counties" drill-down is fabricated — nothing in the current schema backs a distinct
county-entity list (only `countyId` string fields on institutions/students/staff).

### Teacher — nearly complete already

| Item | Status | Route | Backing |
|---|---|---|---|
| Dashboard | existing | `/government/teacher` | — |
| My School | **new — real** | `/government/teacher/my-school` | `institutions` (single-row, scoped to teacher's own school) |
| My Classes, Class Schedule, Gradebook, Attendance, Assignment, Resources, Messages, Notifications | existing | (unchanged) | (unchanged) |

## Error handling / edge cases

- `sidebarConfigs` / `headerConfigs` are `Record<DesktopPortalRole, …>` — TypeScript guarantees
  all 5 keys exist at compile time; no runtime "missing config" fallback needed.
- New real pages reuse `SchoolAdminCollectionPage` verbatim — its existing loading/error/empty
  states apply unchanged.
- `ComingSoon` pages are static (already exist as a component, currently unused — this restores
  its intended purpose).
- No new client-side scope filtering: each workspace's local SQLite already only contains what
  that user's provisioning snapshot downloaded, scoped server-side by role/scope.

## Testing

Matches existing convention: only root dashboard pages have tests today (e.g.
`school-admin/dashboard.test.tsx`); the ~25 thin collection/ComingSoon wrapper pages get no new
test files, following that precedent.

- `Sidebar.test.tsx`: extend to cover at least one more role besides school-admin (config-driven
  rendering, active-link class, badge rendering).
- `Header.test.tsx` / `page-titles.test.ts`: extend with a second role's title-resolution case
  (sidebar-derived match, explicit override, and title-case fallback).
- `RolePortalShell` and any of its dedicated tests are removed along with the file.

## File-level summary

- **New**: `components/shell/sidebarConfig.ts` (replaces `sidebar-config.ts`, which is deleted)
- **Changed**: `components/shell/Sidebar.tsx`, `components/shell/Header.tsx`,
  `components/shell/page-titles.ts`, all 5 `app/government/*/layout.tsx`
- **Deleted**: `components/shell/RolePortalShell.tsx` (+ its test if one exists)
- **New route pages** (~25 thin wrapper files, per tables above): mostly one-line
  `SchoolAdminCollectionPage` wrappers matching the existing `county/schools`-style pattern, plus
  a handful of `<ComingSoon title="…" />` wrappers.
