# NEMIS Desktop — Conventions

## Coding conventions

- TypeScript strict mode everywhere; `any` is forbidden (ESLint-enforced).
- Named exports only. Exceptions: files where a framework demands a default
  export (Next.js `layout.tsx`/`page.tsx`, `next.config.ts`, `tailwind.config.ts`,
  `postcss.config.mjs`, `forge.config.ts`, Vite configs, ESLint config).
- One responsibility per file. Pure logic lives in plain modules (testable
  without Electron); Electron-bound wrappers stay thin.
- Prettier formats; ESLint lints; both run in `pnpm format:check` / `pnpm lint`.
- Unit tests are colocated: `foo.ts` → `foo.test.ts`, run by `pnpm test` (Vitest).

## IPC conventions

- Channel names are `domain:action` (e.g. `system:get-version`).
- `packages/types/src/ipc.ts` holds the `IpcContract` map — the single source
  of truth for every endpoint's args/result types. `IpcChannel` derives from it.
- Every response crosses the bridge as `IpcResult<T>`; handlers never throw to
  the renderer. Unknown errors are masked (`toIpcErrorPayload`), full detail is
  logged in the main process.
- Every handler has a mandatory validator; never trust renderer input.

### Adding an endpoint (recipe)

1. Add the entry to `IpcContract` and a constant to `IpcChannels`
   (`packages/types/src/ipc.ts`).
2. Implement the service function (`apps/desktop/electron/services/`).
3. Register it in the domain handler module
   (`apps/desktop/electron/ipc/handlers/<domain>.ts`) with a validator
   (`apps/desktop/electron/security/validateIpc.ts`).
4. Expose it on `window.nemis.<domain>.<method>` in
   `apps/desktop/electron/preload/preload.ts` via the typed `invoke`.
5. Add the method to `NemisApi` (`packages/types/src/api.ts`) and call it from
   a renderer service (`apps/desktop/renderer/services/`).

## Folder responsibilities

| Path                              | Responsibility                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/desktop/electron/main/`     | App lifecycle, protocol serving, crash nets                                           |
| `apps/desktop/electron/preload/`  | The only bridge between worlds (`window.nemis`)                                       |
| `apps/desktop/electron/ipc/`      | Channel registration; `handlers/` per domain                                          |
| `apps/desktop/electron/security/` | Navigation guard, CSP, permissions, IPC validation                                    |
| `apps/desktop/electron/windows/`  | Window factories                                                                      |
| `apps/desktop/electron/services/` | Main-process services (logger, system)                                                |
| `apps/desktop/electron/database/` | Local SQLite platform (lifecycle, migrations, backup) — see docs/database.md          |
| `apps/desktop/electron/config/`   | Env loading + pure config validation                                                  |
| `apps/desktop/renderer/`          | Next.js UI (app router, layouts, hooks, services)                                     |
| `packages/types/`                 | IPC contract + shared API types                                                       |
| `packages/shared/`                | Error taxonomy shared across processes                                                |
| `packages/ui/`                    | Shared UI components (placeholder until Phase 2+)                                     |
| `packages/domain/`                | Pure business model — entities, VOs, domain events — see "Domain Layer" below         |
| `packages/application/`           | CQRS use cases, the only entry point for business ops — see docs/application-layer.md |

## Adding an IPC endpoint (Phase 3.5 checklist)

1. Contract first: add the channel to `IpcContract` in `packages/types/src/ipc.ts`
   and a constant in `IpcChannels` — the `IPC_CHANNELS_EXHAUSTIVE` assertion
   will not compile until both exist.
2. Shape validator in `apps/desktop/electron/security/validateIpc.ts`: enforce
   exact arity and types; bound every string/number; never trust renderer input.
3. Authorization where the endpoint exposes data: a dedicated module in
   `electron/security/` (pattern: `settingsAllowlist.ts`) — never inline
   permission logic in handlers.
4. Thin handler in `electron/ipc/handlers/`: one line binding channel →
   validator → service call. Handlers never touch repositories directly.
5. Errors: nothing to do — the registrar maps every throw through
   `toIpcError` (`electron/ipc/errorMapping.ts`), the single source of truth
   for the `IpcErrorCode` contract. Never bypass it.
6. Preload: add the method to the `NemisApi` surface in
   `packages/types/src/api.ts` and `electron/preload/preload.ts` via `invoke`.
7. Tests: validator unit tests (relative imports); mapping is already covered
   centrally.

## Domain Layer (`@nemis-desktop/domain`, Phase 4)

- Pure TypeScript business model. Only dependency: `@nemis-desktop/types`. No
  electron/react/next/sqlite/ipc/shared imports (ESLint-enforced).
- Feature-first folders: `core/` kernel, `exceptions/`, `value-objects/`, then one
  folder per domain (`identity/`, `institution/`, `students/`, `academics/`,
  `attendance/`, `assessments/`; more via `_extension-template/`).
- Entities: private constructor + static `create()` (emits events) / `reconstitute()`
  (no events). Behavior on the entity; mutations call `touch(by, at)`.
- Value objects: immutable (frozen), self-validating via static `create()`, throw
  `InvalidValueObjectException`.
- Canonical enums live in `@nemis-desktop/types` mirrored from backend `@nemis/types`
  (single source of truth). Keep values identical; see the Phase 4 spec for the
  drift-check recommendation.

## Application Layer (`@nemis-desktop/application`, Phase 5)

- The only entry point for business operations. UI (Phase 6) never touches a
  repository, and never imports `@nemis-desktop/domain` to mutate entities
  directly — everything goes through a use case in this package. See
  `docs/application-layer.md` for the full architecture writeup.
- Feature-first folders, mirroring the domain package: `core/` (CQRS base
  types, `ApplicationResponse<T>`), `exceptions/`, `interfaces/` (repository
  **ports**, plus cross-cutting ports: unit-of-work, clock, id-generator,
  event-publisher, permission-evaluator), `dto/`, `mappers/`, `validators/`,
  `use-cases/`, `services/`, `events/`, `policies/`, `pipeline/`,
  `factories/`, `testing/` (in-memory fakes), `_extension-template/`.
- **Boundary rule:** the package depends only on `@nemis-desktop/domain` and
  `@nemis-desktop/types`. It never imports `electron`, `react`, `react-dom`,
  `next`, `better-sqlite3`/`better-sqlite3-multiple-ciphers`, or anything
  under `**/electron/**`, `**/data/**`, `**/database/**`, `**/ipc/**` —
  enforced by `packages/application/eslint.config.mjs`'s
  `applicationImportGuard` (`no-restricted-imports`), the same pattern used
  for the domain package. Repository **adapters** and entity↔row **mappers**
  live outside this package, in the Electron composition root
  (`apps/desktop/electron/data/adapters/`).
- Use cases never instantiate repositories; every dependency arrives via
  constructor DI, assembled once in `factories/create-application-layer.ts`.

### Adding a use case (recipe)

Full recipe with examples: `packages/application/src/_extension-template/README.md`.

1. **Port** — add/extend a repository port in `interfaces/<domain>/`,
   speaking only in domain entities (never rows, never DTOs).
2. **DTOs** — add Input/Output DTOs in `dto/<domain>/`. Never expose
   entities or rows.
3. **Mapper** — add an entity → Output mapper in `mappers/<domain>/`.
4. **Use case** — add a `CommandHandler`/`QueryHandler` in
   `use-cases/<domain>/`, wrapped in `invokeUseCase(name, logger, async () => {...})`.
   Commands validate → check preconditions via ports → call the domain
   factory/method → persist inside `unitOfWork.run(() => repo.save(entity))`
   → publish an event → map to Output. Queries read via ports and map; they
   never take a unit of work and never publish events.
5. **Event** — only if the command needs one, add it to `events/<domain>.ts`.
   Do not declare events for use cases that don't exist yet.
6. **Service** — optionally add a façade in `services/` grouping the
   domain's use cases.
7. **Wire** — register the use case in `factories/create-application-layer.ts`.
8. **Test** — colocate `*.test.ts` using the in-memory fakes in `testing/`
   (happy path, validation failure, precondition/workflow failure, domain-
   exception translation).

Domains without entities yet (`geography`, `staff`, `finance`,
`communication`, `resources`, `reporting`) get extension points only — no
invented DTOs, ports, or use cases until their `@nemis-desktop/domain` slice
ships.

## Presentation Layer (`@nemis-desktop/presentation`, Phase 6)

The only layer the React UI (Phase 7) imports from. Full architecture writeup:
`docs/presentation-layer.md`.

- **Dependency rules.** `package.json` dependencies are exactly
  `@nemis-desktop/application`, `@nemis-desktop/types`, `zustand`. No React,
  no Electron, no SQLite, no IPC. `@nemis-desktop/domain` is a
  **devDependency only** — enforced by `presentationImportGuard`
  (`packages/presentation/eslint.config.mjs`): non-test source may never
  import `@nemis-desktop/domain` (presentation speaks application DTOs only),
  but `presentationTestImportRelaxation` lifts that one ban for
  `src/**/*.test.ts` and `src/testing/**/*.ts`, which seed the Phase-5
  in-memory application fakes with real domain entities. React/Electron/
  SQLite/IPC imports stay forbidden everywhere, tests included.
- **ViewModel files.** One folder per screen under `view-models/<screen>/`:
  `<screen>-view-model.ts` (the class + Zustand store), `<screen>-views.ts`
  (display-ready view-model interfaces), colocated
  `<screen>-view-model.test.ts`. Commands live in `commands/<domain>/`, one
  class per action; queries live in `queries/<domain>/`, one class per read.
  Both wrap exactly one application-service method through
  `trackQuery`/`executeCommand` (`core/async-runner.ts`) — never hand-rolled
  `try/catch` around an application call.
- **State-shape rule.** Every async slice of ViewModel state is an
  `AsyncState<T>` field (`core/async-state.ts`:
  `idle|loading|refreshing|success|empty|error`); every command-bearing
  ViewModel has a top-level `submission: SubmissionStatus` field
  (`core/submission.ts`: `idle|submitting|submitted|failed`). Do not invent
  ad-hoc `isLoading`/`error` boolean pairs.
- **Notification rule.** Commands notify the user **only** through
  `executeCommand`'s built-in `notifications.success/warning/error` calls.
  ViewModels never call `NotificationStore` directly around a command result
  (the one exception is `ConnectivityStore.setOnline`, which notifies for
  offline/online transitions — not a command).
- **Badge-token rule.** Status is always presented as `StatusPresentation {
label, badge: BadgeToken }` with `BadgeToken` a semantic name (`'success' |
'active' | 'pending' | 'error' | 'neutral'`, `presenters/status-presentation.ts`).
  Presentation code never emits a hex value or any palette-specific styling —
  the UI owns the token → palette mapping.
- **Selector purity.** Selectors (`selectors/`) are plain functions of state
  (optionally two stores' state) with no side effects, no store writes, no
  hidden caching — safe to call on every render.
- **New screens** follow `view-models/_extension-template/README.md`
  (Students slice is the reference implementation): views → mapper → queries
  → commands → ViewModel → selectors → wire into
  `factories/create-presentation-layer.ts` and `src/index.ts` → tests via
  `testing/create-test-application.ts`. Until the backing domain/application
  slice exists, ship a typed stub whose methods throw
  `NotImplementedPresentationError` (see `DashboardViewModel`,
  `TeachersViewModel`, `SyncViewModel`).

## Adding a desktop page (`@nemis-desktop/renderer`, Phase 7)

Full architecture writeup: `docs/desktop-shell.md`. Every School Admin
destination that isn't yet migrated renders the shared `ComingSoon` component;
migrating one means replacing that placeholder. Follow this recipe:

1. **Route.** The page already exists as a route — every School Admin
   destination is scaffolded under
   `apps/desktop/renderer/app/government/school-admin/<path>/page.tsx`
   rendering `<ComingSoon title={resolvePageTitle('<path>').title} />`
   (`components/shell/page-titles.ts`). Replace that file's contents; do not
   change the route path.
2. **Mark the file `'use client'`.** Any page reading a ViewModel needs hooks
   (`useEffect`, `useState` via the store subscription), so it is a client
   component, same as the Dashboard page
   (`apps/desktop/renderer/app/government/school-admin/page.tsx`).
3. **Bind to the ViewModel.** Get the typed accessor from
   `renderer/lib/presentation/hooks.ts` (add one following the existing
   pattern — `usePresentation().viewModels.<x>` — if the screen is new), then
   read its store through the renderer's one binding hook:

   ```tsx
   'use client';
   import { useEffect } from 'react';
   import { useStudentsViewModel } from '@/lib/presentation/hooks';
   import { useViewModel } from '@/hooks/use-view-model';

   export default function StudentsPage() {
     const vm = useStudentsViewModel();
     useEffect(() => {
       void vm.loadStudents();
     }, [vm]);
     const students = useViewModel(vm.store, (s) => s.students);
     // render AsyncState below
   }
   ```

4. **Render every `AsyncState` branch.** ViewModel async slices are always
   `idle | loading | refreshing | success | empty | error`
   (`@nemis-desktop/presentation`'s `core/async-state.ts`) — render all of
   them, never just the success path:
   - `idle` / `loading` → `Skeleton` (`@nemis-desktop/ui`), matching the
     Dashboard's 6-tile skeleton grid.
   - `error` → `ErrorState` (`@nemis-desktop/ui`) with `message={state.error.userMessage}`
     and an `onRetry` that re-invokes the load.
   - `empty` → `EmptyState` (`@nemis-desktop/ui`), same component `ComingSoon`
     already uses.
   - `success` (and typically `refreshing`, treated the same as `success` so a
     background refresh doesn't blank the screen — see the Dashboard page's
     `status === 'success' || status === 'refreshing'` branch) → render the
     real data.
5. **Never import `@nemis-desktop/application`, `@nemis-desktop/domain`, or
   `electron`** from a component or page. This is ESLint-enforced, not just a
   convention — `apps/desktop/renderer/eslint.config.mjs`'s
   `rendererImportGuard` rejects those imports (and any `**/electron/**`,
   `**/data/**`, `**/database/**`, `**/ipc/**` deep path) everywhere under
   `apps/desktop/renderer/**`, with a single carve-out for
   `renderer/lib/presentation/**` (the composition root). Pages talk only to
   `@nemis-desktop/presentation` (via the hooks above) and `@nemis-desktop/ui`.
6. **Wire navigation.** If the page is reachable from the sidebar (it already
   should be — the full School Admin nav is scaffolded), confirm its entry in
   `components/shell/sidebar-config.ts` (`SIDEBAR_NAV` / `SIDEBAR_DASHBOARD_ITEM`)
   and its title in `components/shell/page-titles.ts` (`resolvePageTitle`'s
   `TITLES` map) already point at the route. Add both if the page is genuinely
   new — the sidebar link and the header/breadcrumb title are two separate
   places and both are required for a discoverable, correctly-labeled page.
