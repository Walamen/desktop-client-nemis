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

| Path                              | Responsibility                                                               |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `apps/desktop/electron/main/`     | App lifecycle, protocol serving, crash nets                                  |
| `apps/desktop/electron/preload/`  | The only bridge between worlds (`window.nemis`)                              |
| `apps/desktop/electron/ipc/`      | Channel registration; `handlers/` per domain                                 |
| `apps/desktop/electron/security/` | Navigation guard, CSP, permissions, IPC validation                           |
| `apps/desktop/electron/windows/`  | Window factories                                                             |
| `apps/desktop/electron/services/` | Main-process services (logger, system)                                       |
| `apps/desktop/electron/database/` | Local SQLite platform (lifecycle, migrations, backup) — see docs/database.md |
| `apps/desktop/electron/config/`   | Env loading + pure config validation                                         |
| `apps/desktop/renderer/`          | Next.js UI (app router, layouts, hooks, services)                            |
| `packages/types/`                 | IPC contract + shared API types                                              |
| `packages/shared/`                | Error taxonomy shared across processes                                       |
| `packages/ui/`                    | Shared UI components (placeholder until Phase 2+)                            |

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
