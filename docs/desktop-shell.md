# Desktop Shell & UI Integration (Phase 7)

Phase 7 connects the React UI to the stack built in Phases 1–6 by porting the
School Admin portal from the canonical web app (`Nemis/apps/portal-web`) into
the desktop renderer (`apps/desktop/renderer/`). It is an integration, not a
rewrite: the web app's design language, layout, navigation structure, and
components are preserved — only the data layer underneath changes. Design
source: `docs/superpowers/specs/2026-07-19-phase-7-desktop-shell-design.md`.

This document is the durable reference for the shell architecture, the
component reuse/divergence log, routing, the shared UI inventory, desktop
adaptations, remaining migration work, technical debt, and Phase-8
recommendations.

---

## 1. Desktop Shell architecture

### 1.1 Data flow

```
React component
  → useViewModel(vm.store, selector)     renderer hook, zustand React useStore
    → ViewModel                          @nemis-desktop/presentation (real)
      → ApplicationLayer                 Phase-6 test factory over 17 in-memory fakes
```

Every box above the `ApplicationLayer` line is real production code from
Phases 4–6. Only the bottom box — how the `ApplicationLayer` is obtained — is
a Phase-7 stand-in, and it is isolated to one file.

### 1.2 Composition root — `apps/desktop/renderer/lib/presentation/`

- **`create-renderer-presentation.ts`** — the ONLY module allowed to import
  `@nemis-desktop/presentation/testing`. It calls `createTestApplication()`
  (the Phase-6 test factory that wires the real `createApplicationLayer` over
  17 in-memory application fakes), awaits `seedDemoData(app, ports)`, then
  returns `createPresentationLayer(app)`. The function is marked in-source as
  **THE Phase-8 seam**:

  ```ts
  /** THE Phase-8 SEAM: today this builds the in-memory fake application; the
   * sync/IPC phase replaces the body with an ApplicationLayer-shaped proxy over
   * window.nemis. Nothing else in the renderer changes. */
  export async function createRendererPresentation(): Promise<PresentationLayer> {
    const { app, ports } = createTestApplication();
    await seedDemoData(app, ports);
    return createPresentationLayer(app);
  }
  ```

- **`seed-demo-data.ts`** — seeds a realistic demo school **through real use
  cases** (`app.students.create`, plus `reconstitute`-based Institution/User/
  UserOrganization records matching the current-user and settings ViewModel
  shapes), exporting `DEMO_INSTITUTION_ID` / `DEMO_USER_ID` for the layout to
  load. Demo data flows the same construction path production data will.
- **`presentation-provider.tsx`** — a React context (`PresentationContext`)
  holding the constructed `PresentationLayer`; `usePresentation()` throws if
  called outside the provider.
- **`hooks.ts`** — typed accessors: `useDashboardViewModel`,
  `useStudentsViewModel`, `useSettingsViewModel`, `useCurrentUserViewModel`,
  `useSyncViewModel`, `useConnectivityStore`, `useNotificationStore`. Each is a
  one-line `usePresentation().viewModels.<x>` / `.stores.<x>` delegation.
- **`apps/desktop/renderer/app/providers.tsx`** (`RootProviders`) constructs
  the layer exactly once (`useEffect` + `useState`, guarded against
  unmount-during-async-build), rendering a `Spinner` until it resolves, then
  mounts `PresentationProvider`. It is wired into `app/layout.tsx` at the root.

**Package change enabling this:** `packages/presentation/package.json` gained
a `"./testing"` subpath export —

```json
"exports": {
  ".": "./src/index.ts",
  "./testing": "./src/testing/create-test-application.ts"
}
```

— so the renderer reaches `createTestApplication` without a deep `src/` import.

### 1.3 React binding

`apps/desktop/renderer/hooks/use-view-model.ts`:

```ts
export function useViewModel<S, T>(store: StoreApi<S>, selector: (state: S) => T): T {
  return useStore(store, selector);
}
```

A thin wrapper over zustand's React `useStore`. Selectors keep re-renders
minimal. `@nemis-desktop/presentation` itself stays 100% React-free — this
hook is the only place React and a ViewModel store meet.

### 1.4 Boundary enforcement (ESLint, not convention)

`apps/desktop/renderer/eslint.config.mjs` defines two rule blocks, wired into
the root `eslint.config.mjs`:

- **`rendererImportGuard`** (`apps/desktop/renderer/**/*.{ts,tsx}`) — bans
  `@nemis-desktop/application`, `@nemis-desktop/domain`, `better-sqlite3` (both
  packages), `electron`, and `@nemis-desktop/presentation/testing`, plus any
  `**/electron/**`, `**/data/**`, `**/database/**`, `**/ipc/**` deep-path
  pattern, everywhere under the renderer.
- **`rendererCompositionRelaxation`** (`apps/desktop/renderer/lib/presentation/**`
  only) — re-permits `@nemis-desktop/presentation/testing`,
  `@nemis-desktop/domain`, and `@nemis-desktop/application` (the composition
  root seeds demo data via domain `reconstitute` and needs the
  `ApplicationLayer` type), while the electron/SQLite/infra-path bans stay in
  force even here.

Net effect: every component under `renderer/components/`, `renderer/app/`,
etc. can import only `@nemis-desktop/presentation`, `@nemis-desktop/ui`,
React, Next, `lucide-react`, and renderer-local modules — verified by ESLint,
not just convention.

### 1.5 Build wiring

`apps/desktop/renderer/next.config.ts` lists `@nemis-desktop/presentation`,
`@nemis-desktop/application`, and `@nemis-desktop/domain` (alongside the
pre-existing `types`/`shared`/`ui`) in `transpilePackages`, because the
composition root now transitively imports all three and they ship raw
TypeScript source, not a build.

---

## 2. Component reuse report + divergence log

**Reuse strategy: port-and-own.** All 15 `@nemis/ui` web components were
ported **verbatim** into `@nemis-desktop/ui` (byte-identical diff against the
web source, only CRLF→LF normalized) and the shell/dashboard pattern was
ported and adapted for the offline-first, IPC-free desktop data layer. The
desktop owns its design system from this point forward; every intentional
difference from the web source is recorded below rather than silently drifting.

| Web (`Nemis/apps/portal-web`)                                       | Desktop (`apps/desktop/renderer`)                                                                                                  | Reason                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Redux/RTK Query hooks                                               | ViewModel hooks (`useViewModel` + `use*ViewModel()`) over `@nemis-desktop/presentation`                                            | Desktop data layer is the offline-first MVVM stack, not a REST cache                                             |
| Auth guard + login redirect                                         | `RouteGuard` pass-through seam (always allows; mocked current user via `CurrentUserViewModel`)                                     | Desktop auth arrives in a later phase; the seam is kept so wiring is a small diff later                          |
| SetupWizard                                                         | Removed entirely                                                                                                                   | Backend onboarding workflow not in desktop scope yet                                                             |
| WebSocket notifications                                             | `NotificationStore` binding (`ToastHost` renders it; `Header` bell badge reads unread count)                                       | No live backend; the presentation store is the single notification contract                                      |
| `react-hot-toast` / SweetAlert2 (`Swal`)                            | Ported `Toast` UI component + `ToastHost` driven by `NotificationStore`                                                            | Single notification pipeline instead of two competing UI libraries                                               |
| Mobile slide-over sidebar                                           | Removed — sidebar is always persistent                                                                                             | Desktop enforces a 1024×700 minimum window; there is no mobile breakpoint to collapse for                        |
| (no equivalent)                                                     | **`StatusBar`** added (new component)                                                                                              | Desktop-only offline/sync/database surface — online/offline dot, sync label, "Local database ready", app version |
| Web dashboard data hooks (RTK queries per stat)                     | `DashboardViewModel` (`packages/presentation/src/view-models/dashboard/`), graduated from stub to a real implementation this phase | Same reason as row 1 — one ViewModel replaces several ad-hoc data hooks                                          |
| Header quick-search input (functional)                              | Rendered identically, `disabled`, `aria-label="Quick search (coming soon)"`                                                        | No search use case/index exists yet                                                                              |
| Header avatar dropdown → Profile / Settings / Sign Out (functional) | Ported `Dropdown`/`DropdownItem`, all three items rendered `disabled`                                                              | No profile page, settings page, or auth/session teardown yet                                                     |
| Sidebar Logout button (functional)                                  | Rendered `disabled`, `title="Available after sign-in support"`                                                                     | No sign-in/sign-out flow exists yet (auth is a later phase)                                                      |

Divergences are additive to the design spec's §7.2 log (`docs/superpowers/specs/2026-07-19-phase-7-desktop-shell-design.md`) — the table above is the merged, current source of truth.

---

## 3. Routing diagram

Next.js App Router, static export, mirroring web paths verbatim so
`sidebar-config.ts` hrefs, breadcrumb logic (`page-titles.ts`), and future deep
links stay identical to the web app:

```
/                                          → redirect  → /government/school-admin   (app/page.tsx)
/government/school-admin                   → Dashboard (migrated, real data)
/government/school-admin/students          → ComingSoon
/government/school-admin/teachers-staff    → ComingSoon
/government/school-admin/parents-guardians → ComingSoon
/government/school-admin/classes           → ComingSoon
/government/school-admin/subjects          → ComingSoon
/government/school-admin/attendance        → ComingSoon
/government/school-admin/academic-grading  → ComingSoon
/government/school-admin/academic-grading/windows → ComingSoon
/government/school-admin/timetable         → ComingSoon
/government/school-admin/financial         → ComingSoon
/government/school-admin/financial/record-payment → ComingSoon
/government/school-admin/reports           → ComingSoon
/government/school-admin/notifications     → ComingSoon
/government/school-admin/messages          → ComingSoon
/government/school-admin/settings          → ComingSoon
(anything else)                            → not-found.tsx (styled 404)
```

That is **15 `ComingSoon` routes** + 1 migrated Dashboard + redirect + 404.

- `apps/desktop/renderer/app/government/school-admin/layout.tsx` is the ported
  web layout: persistent `Sidebar` + `Header` + scrollable `<main
id="main-content">` + `StatusBar`, all wrapped in `RouteGuard`, with
  `ToastHost` mounted alongside. It loads the institution profile
  (`useSettingsViewModel().loadProfile(DEMO_INSTITUTION_ID)`) and the mocked
  current user (`useCurrentUserViewModel().loadUser(DEMO_USER_ID)`) in an
  effect. Web-only concerns from the equivalent `Nemis` layout (auth guard,
  `SetupWizard`, WebSocket notifications, `react-hot-toast`) are removed and
  logged as divergences (§2 above).
- Every `ComingSoon` route is a one-line page: `<ComingSoon title={resolvePageTitle('<path>').title} />` — one shared component (`components/shell/ComingSoon.tsx`) parameterized by title, backed by the ported `EmptyState` UI component.
- All routes are static paths — no dynamic segments this phase — so `next build`'s static export is safe (verified green in Task 14/16 of the build ledger).
- `app/not-found.tsx` renders a styled 404 (`EmptyState` + a `Button` linking back to the dashboard), not the Next.js default.

---

## 4. Shared component inventory — `@nemis-desktop/ui`

`packages/ui/src/index.ts` barrel-exports 19 components total:

**15 ported verbatim from `@nemis/ui`** (web source, byte-identical):
Alert, Avatar, Badge, Button, Card, Drawer, EmptyState, Input, Modal,
ProgressBar, Select, Spinner, Table, Textarea, Toast.

**4 new components**, built this phase for the shell/dashboard only:

| Component                   | Purpose                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Breadcrumbs`               | Extracted from the web `Header` breadcrumb logic; renders the `["School Admin", ...segments]` trail from `page-titles.ts` |
| `Dropdown` / `DropdownItem` | Header profile menu — click-outside + Escape-to-close, `role="menu"`/`"menuitem"`, `aria-haspopup`/`aria-expanded`        |
| `Skeleton`                  | Dashboard loading placeholders (rendered while `AsyncState` is `idle`/`loading`)                                          |
| `ErrorState`                | `AsyncState` error rendering (message + retry action)                                                                     |

Deferred on YAGNI grounds until a page needs them: Tabs, Tooltip, Pagination,
a standalone `SearchInput`. The renderer's `tailwind.config.ts` `content`
globs include `../../../packages/ui/src/**/*.{ts,tsx}` so Tailwind scans the
shared package.

---

## 5. Desktop adaptations

Adaptations that exist because this is a desktop application, not because the
web design was wrong:

- **`StatusBar`** (`components/shell/StatusBar.tsx`, new) — a `role="status"`
  footer bar reading the shared `ConnectivityStore` via
  `selectConnectivityPresentation` / `selectSyncPresentation`: online/offline
  icon + label, sync status label, "Local database ready", a static "0
  pending changes" placeholder, and the app version via the existing
  `useAppVersion` hook.
- **Minimum window size already enforced** — `apps/desktop/electron/windows/mainWindow.ts` sets `minWidth: 1024, minHeight: 700`; this predates Phase 7 (no Electron change was needed) and is why the mobile slide-over sidebar has no desktop equivalent (§2).
- **Focus-visible rings** — `apps/desktop/renderer/styles/globals.css` adds a
  global `:focus-visible { outline: 2px solid #1874a8; outline-offset: 2px; }`
  rule on top of the untouched `@tailwind base/components/utilities` imports.
- **Skip-to-content link** — the portal layout renders `<a href="#main-content" class="sr-only focus:not-sr-only ...">Skip to content</a>` before the `Sidebar`, target `<main id="main-content">`.
- **Landmarks** — `Sidebar` root has `aria-label="Primary"`, its `<nav>` has
  `aria-label="Sidebar"`, `<main>` is the content landmark, `StatusBar`'s
  `<footer>` carries `role="status"` and `aria-label="Application status"`.
- **Styled scrollbars** — `.sidebar-scroll` in `globals.css` (thin,
  transparent-until-hover thumb, `scrollbar-gutter: stable`) matches the web
  `sidebar-scroll` treatment; applied to the `Sidebar`'s `<nav>`.
- **Escape closes dropdowns** — `packages/ui/src/Dropdown.tsx` attaches a
  `keydown` listener while open: `Escape` calls `onOpenChange(false)`;
  click-outside is handled the same way via a `mousedown` listener bound to a
  container ref.

No visual identity changes — theme (`primary #000e21` scale, `secondary
#0367A0`, `accent #1874A8`, fonts, radii, spacing) was ported byte-for-byte
from the web `tailwind.config.ts` `theme.extend` block.

---

## 6. Remaining pages to migrate

**15 `ComingSoon` routes under the School Admin portal** (§3), each needing a
real page in the same Component → ViewModel → Presentation pattern the
Dashboard now demonstrates:

Students, Teachers & Staff, Parents & Guardians, Classes, Subjects,
Attendance, Academic & Grading (+ its nested Grade Windows page), General
Schedule (Timetable), Financial/Fees (+ its nested Record Payment page),
Reports, Notifications, Messages, School Settings.

Several of these already have a supporting `@nemis-desktop/presentation`
slice ready to bind to (Students, ClassRoster/Attendance, Assessments,
Settings/Device/CurrentUser — see `docs/presentation-layer.md`); others
(Reports, Notifications-as-a-list-page, Messages, Financial) have no
application/domain slice yet and need that work first per the extension-point
convention.

**Other role portals — not started at all:**

- Teacher portal
- County Education Officer (CEO) portal
- District Education Officer (DEO) portal

Phase 7 scoped to School Admin only (per the design spec's settled decision);
these three portals need their own routing subtree, sidebar config, and
ViewModel slices, following the same pattern established here.

---

## 7. Technical debt

Debt items are pulled from the Phase 7 section of `.superpowers/sdd/progress.md`
(the build ledger) and the design spec §13. Nothing below is new — it is the
accumulated "MINOR-for-final-triage" register plus explicitly accepted
deviations, carried forward for the Phase 8 planner.

**Data / dashboard honesty:**

- Dashboard stats: only Total Students is real (`page.total` from the real
  `listStudents` use case via `PagedResult`). The other five tiles (Total
  Teachers, Total Classes, Avg Class Size, Male Students, Female Students) are
  hard-coded `0` and flagged `placeholder: true` on `DashboardStat`
  (`packages/presentation/src/view-models/dashboard/dashboard-views.ts`); the
  UI (`StatCard`) visibly marks placeholder tiles. Deriving the gender split
  from `StudentSummaryOutput` is not possible — that list projection carries
  no gender field, and an N+1 per-student `getById` fetch was explicitly ruled
  out as out of scope.
- `DashboardViewModel.loadSummary()` requests `{ limit: 1000, offset: 0 }` with
  a comment claiming this reflects "the whole roster" — `ListStudentsUseCase`
  actually clamps to `MAX_LIMIT` 100 server-side. Harmless today because
  `PagedResult.total` is limit-independent (the count comes from the full
  query, not the page slice), but the comment is misleading and the literal
  1000 does nothing.
- `RecentActivityFeed` and `TeachersListSection` render static, honestly-framed
  placeholder copy ("Sample activity" / "not available yet") — no data hook
  exists for either; nothing fabricated as real.
- Demo data (`seed-demo-data.ts`) lives only in the renderer composition path
  and does not persist anywhere — no SQLite write occurs. This is intentional:
  SQLite/IPC wiring is Phase 8.

**Disabled UI surfaces (no backing feature yet):**

- Header quick search — rendered, `disabled`, non-functional.
- Header avatar dropdown — Profile and Settings items rendered `disabled`.
- Sign Out — rendered `disabled` in both the Header dropdown and the Sidebar
  logout button (`title="Available after sign-in support"`).
- Notifications — bell badge is live (real unread count from
  `NotificationStore`), but there is no notifications list page; that route is
  still `ComingSoon`.

**Presentation-layer carryover (pre-existing, inherited from Phase 6):**

- `NetworkUnavailableError` (`packages/presentation/src/errors/presentation-error.ts`)
  is declared "reserved for future IPC/REST transports" but nothing in
  `toPresentationError` maps to it yet — there is no live transport to fail.
- The Phase-5 business repository adapter debt: `apps/desktop/electron/data/adapters/createApplicationComposition.ts`
  still stubs every business port (`students`, `guardians`, `enrollments`,
  `classes`, `attendance`, `assessments`, `grades`, `users`, `institutions`,
  `gradingConfigs`) as `new Proxy({} as never, { get: () => () => notBuilt(...) })`.
  This was explicitly deferred at the end of Phase 5 and is untouched by
  Phase 7 (the design spec's non-goals call this out directly) — it is a
  hard Phase-8 prerequisite, not decorative debt.

**Seam coupling beyond the composition root:**

- The Phase-8 seam is described elsewhere in this doc as "swap only
  `create-renderer-presentation.ts`," but the portal layout
  (`apps/desktop/renderer/app/government/school-admin/layout.tsx`) also imports
  `DEMO_INSTITUTION_ID` / `DEMO_USER_ID` from
  `lib/presentation/seed-demo-data.ts` to call
  `loadProfile(institutionId)` / `loadUser(userId)`. So the real Phase-8 scope
  is the whole `lib/presentation/` composition folder plus reworking
  `layout.tsx` to source the active user/institution id from a session/
  ViewModel selector instead of seed constants — the Phase-6
  `loadUser(userId)`/`loadProfile(institutionId)` API shape currently forces a
  component to supply the id explicitly.

**Build/tooling minors (accept-as-debt, non-blocking):**

- `package.json` `engines.node` is `>=22`, looser than the jsdom 29 floor of
  Node 22.13 introduced by the renderer's vitest/jsdom devDeps (warn-only;
  local dev runs Node 24).
- `@radix-ui/react-dialog` was added as a dependency of the Task-4 verbatim
  port (matching the web package's own `package.json`) but is unused by any
  of the 15 ported components — `Modal.tsx` implements its own dialog, it
  does not import Radix. Candidate for removal once confirmed no upcoming
  ported component needs it.
- Header notification bell `aria-label` always pluralizes:
  `` `${unread} unread notifications` `` reads "1 unread notifications" at
  `unread === 1` (cosmetic, plan-mandated as written).
- `DashboardGreeting`'s name-splitting (`fullName.split(' ')[0]`/`[1]`) leaves
  `lastName` `undefined` for a single-word display name — harmless, the
  `Avatar` component tolerates a missing last name.
- Any other ported `@nemis-desktop/ui` component that uses a hook (`useState`,
  `useEffect`, `useRef`) needs an explicit `'use client'` directive if a
  future **server** component imports it — one instance of this was already
  caught and fixed for `Dropdown.tsx` (it lacked the directive and broke the
  production build when `not-found.tsx`, a server component, pulled it in
  through the `@nemis-desktop/ui` barrel). Today's build is green because only
  `not-found.tsx` is a server component and it now passes; a future
  server-rendered page reusing a hook-using component without the directive
  would repeat the same failure.

---

## 8. Recommendations before Phase 8

In dependency order:

1. **Build the IPC facade shaped as `ApplicationLayer`.** Phase 8's entire job
   is a proxy over `window.nemis` that satisfies the same `ApplicationLayer`
   type `createRendererPresentation()` consumes today. If the facade's shape
   matches, `create-renderer-presentation.ts` is the _only_ renderer file that
   changes — everything from `hooks.ts` up through every component stays
   untouched, per the Phase-6 seam guarantee this design relied on.
2. **Complete the Phase-5 business repository adapters.** Every business port
   in `createApplicationComposition.ts` (§7) is still an `as never` Proxy
   stub. The IPC facade cannot do real work until these are real SQLite-backed
   adapters — this blocks step 1 in practice even though it is architecturally
   independent of it.
3. **Add a real student-count/summary application query.** Introduce a
   dedicated summary/count use case (or extend `listStudents`) that can supply
   gender split, teacher count, class count, and average class size without an
   N+1 fetch, so `DashboardViewModel` can retire `PLACEHOLDER_STATS` tile by
   tile instead of all at once.
4. **Then swap only `create-renderer-presentation.ts`.** Once 1–3 land, change
   the composition root's function body from
   `createTestApplication()+seedDemoData()` to the real IPC-backed
   `ApplicationLayer`; delete `seed-demo-data.ts`'s renderer usage (keep it for
   tests if useful); everything else in `apps/desktop/renderer/` is
   unaffected by construction.

Secondary, non-blocking follow-ups: wire the disabled Header/Sidebar
affordances (search, profile, settings, sign-out) once their respective
features exist; migrate the 15 `ComingSoon` routes per §6, prioritizing
Students (already has a presentation slice) first; retire the `@radix-ui/react-dialog`
dependency or find its first real consumer.
