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
