# NEMIS Desktop — Phase 1 Foundation Design

**Date:** 2026-07-14
**Status:** Approved
**Scope:** Project foundation only. No SQLite, no synchronization, no REST clients, no auth, no business modules.

## Goal

Establish a production-ready Electron application foundation that every future phase builds on: workspace structure, secure Electron main/preload/renderer split, typed IPC architecture, Next.js renderer with the NEMIS design language, and full tooling (TypeScript strict, ESLint, Prettier, logging, env config, error taxonomy).

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Renderer framework | **Next.js 15 static export** (App Router) | Matches portal-web (Next 15.1 / React 19), keeping later phases' porting of portal-web pages/components cheap. SSR/API routes/middleware are unavailable inside Electron, so `output: 'export'` is used. |
| Workspace tooling | **pnpm workspaces** | Matches the Nemis monorepo conventions; better native-dep handling for Electron. |
| Renderer serving (prod) | **Custom `app://` protocol** via `protocol.handle` | Bare `file://` breaks Next static-export client routing and asset paths; a custom protocol behaves like a real origin (routing, deep links, CSP). |
| Renderer serving (dev) | Electron loads `next dev` URL on a fixed port | Full HMR during development. |
| TypeScript | **5.x strict** across all packages | Scaffold's TS ~4.5 is incompatible with Next 15. |
| Tailwind | **3.4.x** | Matches portal-web exactly. |
| Primary color | **#020833** | Phase 1 spec value; CLAUDE.md's `#000e21` will be updated to match so they don't drift. |
| ESLint | **v9 flat config** | Matches Nemis monorepo style. |

## Workspace Structure

```
desktop-client-nemis/
├── apps/
│   └── desktop/                  # @nemis-desktop/app
│       ├── electron/
│       │   ├── main/             # entry point, app lifecycle
│       │   ├── preload/          # contextBridge → window.nemis
│       │   ├── ipc/              # channel registrar + handlers
│       │   ├── security/         # navigation guards, CSP, IPC input validation
│       │   ├── windows/          # main window factory
│       │   ├── services/         # system service (app version) only
│       │   └── config/           # typed env/config module
│       ├── renderer/             # Next.js 15 app
│       │   ├── app/              # App Router pages (shell only)
│       │   ├── components/
│       │   ├── layouts/          # Sidebar, Header, Shell
│       │   ├── hooks/
│       │   ├── store/            # empty placeholder (state mgmt later)
│       │   ├── lib/
│       │   ├── services/         # window.nemis client wrappers
│       │   ├── styles/
│       │   └── types/
│       ├── forge.config.ts
│       ├── vite.main.config.ts
│       ├── vite.preload.config.ts
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared/                   # @nemis-desktop/shared — errors, constants, utils
│   ├── types/                    # @nemis-desktop/types — IPC contract types
│   └── ui/                       # @nemis-desktop/ui — compilable placeholder barrel
├── docs/
├── pnpm-workspace.yaml
├── .editorconfig / .prettierrc / eslint.config.mjs / .gitignore
└── package.json                  # workspace root
```

The existing flat Forge scaffold (src/main.ts, src/preload.ts, src/renderer.ts, index.html) is dissolved into this structure.

## Build Pipeline

Two coordinated builds inside `apps/desktop`:

1. **Electron Forge + Vite plugin** builds `electron/main` and `electron/preload` (the Vite *renderer* entry is removed from forge.config.ts).
2. **Next.js** builds the renderer:
   - **Dev:** `next dev` on a fixed port (3010). Electron waits for the port, then `loadURL`.
   - **Prod:** `next build` with `output: 'export'` → static files packaged into the app and served via `app://` protocol; `loadURL('app://-/index.html')` equivalent.

Root scripts orchestrate: `pnpm dev` (start Next → wait on port → `electron-forge start`), `pnpm build` / `pnpm make` (Next export → forge make), plus `typecheck`, `lint`, `format` across the workspace.

## Security Model

- `BrowserWindow` webPreferences: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`.
- Forge **fuses kept** as-is: RunAsNode off, cookie encryption on, NODE_OPTIONS off, ASAR integrity validation on, only-load-from-ASAR on.
- Navigation hardening in `electron/security/`: `will-navigate` blocked except allowed origins (dev server / app://), `setWindowOpenHandler` denies all popups.
- CSP injected for the `app://` origin via `onHeadersReceived`.
- The renderer sees **only** `window.nemis` (contextBridge). No Node globals. Acceptance test: `window.require`, `process`, `fs` are all undefined in the renderer.

## IPC Architecture

- **Contract in `packages/types`:** channel name constants, request/response types, and an `IpcResult<T>` envelope: `{ ok: true, data: T } | { ok: false, error: { code: string; message: string } }`.
- **Main (`electron/ipc/`):** a registrar binds `ipcMain.handle` per channel, wrapping every handler with input validation and error mapping (unknown errors → `IPCError`, never raw stack traces to the renderer).
- **Preload:** builds the `window.nemis` API surface from the same typed contract; exposes namespaced methods only.
- **Phase 1 proof endpoint:** `window.nemis.system.getVersion()` → `ipcRenderer.invoke('system:get-version')` → main → `app.getVersion()`. The renderer shell displays this version, doubling as the IPC acceptance test.

## Renderer Shell

- Next.js App Router, static export, TS strict, Tailwind 3.4, Lucide icons.
- Layout only: fixed **Sidebar** (nav placeholders, non-functional), **Header** (app title + placeholder status area), **Content area** (welcome panel showing IPC-fetched app version).
- Design tokens (Tailwind theme): primary `#020833`, secondary `#0367A0`, accent `#6494b1`, success `#097a0b`, active `#146316`, error `#c10021`; card radius 16px, pill buttons, 8-point spacing grid, no shadows. Enterprise/government minimal style.
- No business pages, no dashboard, no data.

## Configuration & Tooling

- **TypeScript 5.x strict** everywhere; project references / per-package tsconfigs extending a root base.
- **Path aliases:** `@/*` in renderer, `@main/*` and `@preload/*` in electron code, workspace imports `@nemis-desktop/{types,shared,ui}`.
- **Env config:** `.env.development` / `.env.production` read **only in the main process** by a typed `electron/config/` module; validated at startup (invalid → `ConfigurationError`). Nothing env-sensitive reaches the renderer in Phase 1. `.env*` gitignored with a committed `.env.example`.
- **ESLint 9 flat config** + Prettier + `.editorconfig`; scripts wired at workspace root.

## Logging

Thin `logger` wrapper in `electron/`: console transport in development, **electron-log** file transport in production. Setup only — no advanced sinks, rotation policy, or renderer log bridging yet.

## Error Handling

In `packages/shared`:

- `ApplicationError` — base class with `code: string`, `message`, optional `cause`.
- `IPCError extends ApplicationError` — IPC transport/handler failures.
- `ConfigurationError extends ApplicationError` — startup config validation failures.

IPC handlers convert all thrown errors into the `IpcResult` error envelope. No business error types.

## Acceptance Criteria

- Electron launches; Next.js renderer loads (dev and packaged prod).
- TailwindCSS styles render; shell layout (sidebar/header/content) visible.
- `window.nemis.system.getVersion()` round-trips and displays the version.
- Node APIs inaccessible from the renderer (verified in DevTools/console check).
- `tsc --noEmit` zero errors; ESLint passes; Prettier check passes.
- `pnpm make` produces a working installer/package.

## Out of Scope (deferred)

SQLite/SQLCipher, sync layer and queue, REST client, device model, auth, offline behavior, business modules, portal-web page ports, auto-update, printing, notifications, advanced logging.

## Known Technical Debt Accepted in Phase 1

- `packages/ui` is an empty compilable stub.
- Dev orchestration depends on a fixed renderer port (3010).
- No automated tests yet beyond the acceptance checks (test harness lands with first logic-bearing phase).
- Renderer `store/` is an empty placeholder pending state-management decision in a later phase.
