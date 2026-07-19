# Phase 7 — Desktop Shell & UI Integration: Design

**Date:** 2026-07-19
**Status:** Approved (brainstorming complete)
**Depends on:** Phase 6 (`@nemis-desktop/presentation`, merged to `main` at `34d17ed`)

## 1. Context

Phases 1–6 built everything below the UI: Electron foundation, SQLite platform, repository
layer, domain layer, application layer (hexagonal CQRS), and a React-free MVVM presentation
layer over vanilla Zustand. Phase 7 connects the UI to that stack by porting the canonical
NEMIS web UI (`Nemis/apps/portal-web`) into the desktop renderer.

This is an integration, not a rewrite: the web app's design language, layout, navigation
structure, and components are preserved. Only the data layer underneath changes.

The web repo (`Nemis`) and this repo (`desktop-client-nemis`) are independent pnpm
workspaces — direct cross-repo imports are impossible.

## 2. Decisions (settled with the user)

| Question | Decision |
| --- | --- |
| Target role portal | **School Admin only.** Matches the offline-first mission and the existing school-scoped ViewModels. Other roles follow the same pattern in later phases. |
| Data wiring | **In-renderer fakes.** Compose the real presentation layer over the Phase-6 test application factory (real `createApplicationLayer` over the 17 Phase-5 in-memory fakes), seeded with demo data through real use cases. The Phase-6 seam guarantees the Phase-8 IPC facade swap changes only the composition file. |
| Startup flow | **Straight into the shell.** Boot to the School Admin dashboard with a mocked current user via the real `CurrentUserViewModel`. Login arrives with the auth/sync phase. |
| Component reuse | **Port-and-own.** One-time port of `@nemis/ui` (15 components) and the shell pattern into this repo, with every intentional difference recorded in a divergence log. The desktop owns its design system from here. |

## 3. Goals

- Desktop Shell: Sidebar + Header + StatusBar + routed content area, visually faithful to
  the web School Admin portal.
- Complete School Admin navigation structure (no dead links); Dashboard fully migrated;
  every other destination renders a shared ComingSoon page.
- `@nemis-desktop/ui` populated as the desktop design system.
- React binds to ViewModels through one thin hook; architecture boundary enforced by ESLint.
- Offline/sync/notification placeholders bound to the real presentation stores.
- TypeScript, ESLint, tests, and production build all green.

## 4. Non-goals (explicit DO-NOTs)

No page migrations beyond Dashboard. No Student/Teacher/Attendance/Assessment CRUD
workflows. No synchronization. No REST calls. No IPC data facade (Phase 8). No login
screen. No repository/SQLite/Electron access from React. No redesign of the visual
identity. The Phase-5 business repo adapter debt (`as never` Proxy-stub) stays untouched —
it becomes a Phase-8 prerequisite.

## 5. Architecture

### 5.1 Data flow (unchanged contract)

```
React component
  → useViewModel(vm.store, selector)   (renderer hook, zustand React useStore)
    → ViewModel                        (@nemis-desktop/presentation — real)
      → ApplicationLayer               (Phase-6 test factory over in-memory fakes)
```

Phase 8 replaces only the bottom box with an `ApplicationLayer`-shaped proxy over
`window.nemis` IPC. No presentation or component code changes.

### 5.2 Composition root — `renderer/lib/presentation/`

- `create-renderer-presentation.ts` — the ONLY module allowed to touch
  `@nemis-desktop/presentation/testing`. Builds `createTestApplication()`, runs
  `seedDemoData(app)`, then `createPresentationLayer(app)`. Constructed once.
- `seed-demo-data.ts` — seeds a realistic demo school **through real use cases**
  (`createStudent`, `enrollStudent`, `recordAttendance`, …) so demo data flows the same
  path production data will. Includes the mocked current user + registered device.
- `presentation-provider.tsx` — React context provider exposing the `PresentationLayer`;
  mounted in the root layout.
- Typed accessor hooks: `useStudentsViewModel()`, `useDashboardViewModel()`,
  `useSyncViewModel()`, `useCurrentUserViewModel()`, etc.

**Package change:** `@nemis-desktop/presentation` gains a `"./testing"` subpath export
(package.json `exports`) so the renderer can reach `createTestApplication` without
deep-importing `src/`.

### 5.3 React binding

`renderer/hooks/use-view-model.ts`:

```ts
export function useViewModel<S, T>(store: StoreApi<S>, selector: (s: S) => T): T
```

Thin wrapper over zustand's React `useStore`. Selectors keep re-renders minimal. The
presentation package remains 100% React-free.

### 5.4 Boundary enforcement (ESLint, not convention)

A renderer guard in the root `eslint.config.mjs` (following the Phase-6
`presentationImportGuard` pattern):

- Banned everywhere in `apps/desktop/renderer/**`: `@nemis-desktop/domain`,
  `@nemis-desktop/application`, `electron`, `better-sqlite3`, `**/database|data|ipc/**`
  deep paths, and `window.nemis` usage outside the existing `services/` bridge modules.
- `@nemis-desktop/presentation/testing` allowed ONLY in `renderer/lib/presentation/**`.
- Components may import only `@nemis-desktop/presentation`, `@nemis-desktop/ui`, React,
  Next, lucide-react, and renderer-local modules.

## 6. Routing

Next.js App Router (per repo CLAUDE.md), static export, **mirroring web paths verbatim**
so `sidebarConfig` hrefs, breadcrumb logic, and future deep links stay identical:

```
/                                        → redirect → /government/school-admin
/government/school-admin                 → Dashboard (migrated)
/government/school-admin/students        → ComingSoon
/government/school-admin/teachers-staff  → ComingSoon
/government/school-admin/parents-guardians → ComingSoon
/government/school-admin/classes         → ComingSoon
/government/school-admin/subjects        → ComingSoon
/government/school-admin/attendance      → ComingSoon
/government/school-admin/academic-grading → ComingSoon
/government/school-admin/academic-grading/windows → ComingSoon
/government/school-admin/timetable       → ComingSoon
/government/school-admin/financial       → ComingSoon
/government/school-admin/financial/record-payment → ComingSoon
/government/school-admin/reports         → ComingSoon
/government/school-admin/notifications   → ComingSoon
/government/school-admin/messages        → ComingSoon
/government/school-admin/settings        → ComingSoon
(anything else)                          → not-found.tsx (styled 404)
```

- `app/government/school-admin/layout.tsx` is the ported web layout: persistent Sidebar +
  Header + scrollable `<main>` + StatusBar. Web-only concerns removed and logged as
  divergences (auth guard, SetupWizard, WebSocket notifications, react-hot-toast).
- `RouteGuard` component wraps the portal layout — always allows today (mocked user), but
  establishes the protected-route seam for the auth phase.
- Lazy loading via Next per-route code splitting; ComingSoon pages are one shared
  component parameterized by page title.
- All routes are static paths — no dynamic segments this phase, so static export is safe.

## 7. Shared UI library — `@nemis-desktop/ui`

One-time port of all 15 web `@nemis/ui` components, preserving props and visuals:

Alert, Avatar, Badge, Button, Card, Drawer, EmptyState, Input, Modal, ProgressBar,
Select, Spinner, Table, Textarea, Toast.

New components (only what the shell/dashboard needs now):

- **Breadcrumbs** (extracted from web Header logic)
- **Dropdown** (header profile menu)
- **Skeleton** (dashboard loading states)
- **ErrorState** (AsyncState error rendering)

Deferred on YAGNI grounds until a page needs them: Tabs, Tooltip, Pagination, standalone
SearchInput. The package exports through `src/index.ts`; the renderer's Tailwind `content`
globs include `../../packages/ui/src/**`.

### 7.1 Theme

Renderer `tailwind.config.ts` adopts the portal-web theme block verbatim: primary
`#000e21` scale, secondary `#0367A0`, accent `#1874A8`, success/active/pending/error,
border `#e3e3e5`, `3xl` screen, font families (`--font-lato`, `--font-crete-round`,
`--font-poppins`), the h1–button font sizes, `card`/`button` border radii, `card` spacing.
Fonts load via `next/font` (self-hosted at build time — offline-safe, no runtime fetch).

### 7.2 Divergence log

`docs/desktop-shell.md` carries a table of every intentional difference from web source.
Initial entries:

| Divergence | Reason |
| --- | --- |
| Redux/RTK Query hooks → ViewModel hooks | Desktop data layer is the offline-first stack |
| Auth guard + login redirect removed | Desktop auth arrives in a later phase; RouteGuard seam kept |
| SetupWizard removed | Backend workflow not in desktop scope yet |
| WebSocket notifications → NotificationStore binding | No live backend; presentation store is the contract |
| react-hot-toast → ported Toast + NotificationStore | Single notification pipeline |
| Mobile slide-over sidebar removed | Desktop enforces min window size; persistent sidebar |
| StatusBar added | Desktop-only offline/sync surface |

## 8. Desktop Shell components — `renderer/components/shell/`

- **Sidebar** — ported web `Sidebar.tsx` + the school-admin slice of `sidebarConfig.ts`
  (identical nav groups, icons, hrefs; existing label typos preserved — fidelity over
  cleanup). Logout button disabled with tooltip "Available after sign-in support".
  Institution name from `SettingsViewModel` institution profile.
- **Header** — ported web `Header.tsx`: breadcrumb ("Home / …"), quick search input
  (non-functional placeholder styled as web), notification bell bound to the shared
  `NotificationStore` (badge = unread count), avatar dropdown (Profile placeholder,
  Settings placeholder, Sign Out disabled). User name/role from `CurrentUserViewModel`.
- **StatusBar** (new) — bottom bar: online/offline dot, sync status + last-sync time from
  `SyncViewModel` (live `ConnectivityStore`), pending-changes count placeholder, database
  status ("Local database ready"), app version via existing `useAppVersion`.
- **ComingSoon** — EmptyState-based placeholder page ("This page has not been migrated to
  desktop yet").
- **RouteGuard** — pass-through guard, seam for the auth phase.
- **ToastHost** — renders ported Toast components from `NotificationStore` state.

The Phase-1 scaffold files (`layouts/AppShell.tsx`, `layouts/Header.tsx`,
`layouts/Sidebar.tsx`) are replaced by these.

## 9. Dashboard migration

Port of the web School Admin dashboard structure: greeting/profile card (time-of-day
greeting, user name, role, formatted date), 4-stat grid (Total Students, Total Teachers,
Total Classes, Average Class Size), quick actions, recent activity feed, teachers list
section.

**`DashboardViewModel` graduates from stub to implementation** (in
`packages/presentation`, per the extension template, with tests):

- Total-students count is computed from the real `listStudents` use case (`PagedResult.total`).
  This is the ONLY real stat: `StudentSummaryOutput` (the list projection) carries no
  gender, so the male/female split is a placeholder — deriving it would need an N+1
  per-student `getById`, which is out of scope.
- Gender split, staff/class stats, recent activity, and teachers list return **clearly
  marked placeholder data** (`placeholder: true` on the view slices) — no application use
  cases exist for them yet. The view types document which fields are real vs placeholder.
- All loading through `trackQuery`; UI renders Skeletons while pending and ErrorState on
  failure via `AsyncState`.

Dashboard sub-components (`QuickActionCard`, `RecentActivityFeed`,
`TeachersListSection`, stat cards) are ported into `renderer/components/dashboard/`.

## 10. Accessibility & desktop adaptations

- Focus-visible rings on all interactive elements; skip-to-content link before the
  sidebar; `nav`/`main`/`status` landmarks with ARIA labels.
- Escape closes dropdowns and dialogs (DialogStore already promise-based); dropdown
  keyboard navigation (arrow keys, Enter, Escape).
- Min window size (1024×700) is **already enforced** in `electron/windows/mainWindow.ts`
  (`minWidth: 1024, minHeight: 700`) — no Electron change needed this phase.
- Styled scrollbars matching the web `sidebar-scroll` treatment; large-screen (`3xl`)
  layout behavior preserved from web.
- No visual identity changes.

## 11. Testing

Renderer test setup: vitest + `@testing-library/react` + jsdom (new devDeps), wired into
the workspace vitest config. Scope (no business-logic tests):

- `useViewModel` hook subscribes/re-renders on store changes.
- Shell renders: sidebar shows all nav groups/items; header shows user + breadcrumb;
  status bar shows sync placeholders.
- Navigation: sidebar links carry correct hrefs; active state matches pathname;
  unknown route renders 404; `/` redirects to the dashboard route.
- Dashboard: over the seeded fake application, stat cards render real seeded counts;
  placeholder sections are marked; loading state renders skeletons.
- Composition: renderer presentation layer builds and seeds without error.

**Gate (all must pass):** `pnpm typecheck`, `pnpm lint`, `pnpm test`, production build
(`next build` static export) + Electron Forge package smoke.

**Env note:** full `pnpm test` includes infra E2E needing `better-sqlite3` on Node ABI —
run `pnpm rebuild:node` before, `pnpm rebuild:electron` after (before dev/packaging).

## 12. Documentation deliverables

`docs/desktop-shell.md` covering the 8 requested deliverables:

1. Desktop Shell architecture (composition root, binding, boundary)
2. Component reuse report + divergence log
3. Routing diagram (§6 map)
4. Shared component inventory (`@nemis-desktop/ui`)
5. Desktop adaptations (§10)
6. Remaining pages to migrate (the 14 ComingSoon routes + other role portals)
7. Technical debt (placeholder stats, disabled logout, non-functional search, Phase-5
   adapter debt, `NetworkUnavailableError` unmapped)
8. Recommendations before Phase 8 (IPC facade shaped as `ApplicationLayer`; complete
   business repo adapters; then swap the composition file)

Plus a Presentation-binding section appended to `docs/conventions.md` (how future pages
follow the pattern: route → hook → ViewModel → ComingSoon replacement).

## 13. Risks & accepted debt

- Dashboard staff/class stats and activity feed are placeholders until application use
  cases exist — clearly marked in view types and docs.
- Demo data lives only in the renderer composition path; nothing persists. Intentional:
  SQLite wiring is Phase 8.
- Search, notifications list page, profile/settings menu items are placeholders.
- The web app evolves independently; the divergence log is the tool for future
  reconciliation, not automated sync.
