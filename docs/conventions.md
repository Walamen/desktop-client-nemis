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
