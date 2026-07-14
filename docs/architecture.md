# NEMIS Desktop — Architecture (Phase 1)

## Process model

- **Main process** (`apps/desktop/electron/main`): app lifecycle, window creation,
  IPC handler registration, `app://` protocol serving in production.
- **Preload** (`apps/desktop/electron/preload`): the only bridge between worlds.
  Exposes `window.nemis` via `contextBridge`. Sandboxed; no Node APIs reach the renderer.
- **Renderer** (`apps/desktop/renderer`): Next.js 15 App Router, static export.
  Dev: served by `next dev` on port 3010. Prod: static files shipped as an
  Electron extraResource and served over the custom `app://renderer/` origin.

## IPC

All IPC is typed by `@nemis-desktop/types`: both the main-process registrar and
the preload bridge are keyed off the `IpcContract` map (`packages/types/src/ipc.ts`),
the single source of truth for every endpoint's args/result types. See
`docs/conventions.md` for the add-an-endpoint recipe.

Renderer → `window.nemis.system.getVersion()` → preload `ipcRenderer.invoke('system:get-version')`
→ main registrar (validates args, maps errors) → service → `IpcResult<T>` envelope back.

Handlers never throw across the wire: failures return
`{ ok: false, error: { code, message } }` and unknown errors are masked.

## Security

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`
- Forge fuses: RunAsNode off, NODE_OPTIONS off, ASAR integrity on, only-load-from-ASAR on
- `setWindowOpenHandler` denies all popups; `will-navigate` restricted to app origins
- CSP applied to every production `app://` response
- IPC input validated in main; renderer input is never trusted
- Deny-all `setPermissionRequestHandler`: every permission request (camera, mic,
  geolocation, notifications, etc.) is rejected
- Process-level crash nets: `uncaughtException` logs, shows an error dialog, and
  exits; `unhandledRejection` logs without exiting
- Single-instance lock: a second launch focuses the existing window instead of
  starting a new process

## Error taxonomy (`@nemis-desktop/shared`)

- `ApplicationError` — base, carries `code`
- `IPCError` — IPC transport/validation failures
- `ConfigurationError` — startup config validation failures

## Logging

`electron-log` via `electron/services/logger.ts`: console transport always,
file transport in production only.

## Deliberately absent in Phase 1

SQLite, synchronization, REST clients, authentication, business modules,
auto-update, printing, notifications. See the Phase 1 spec for the roadmap.

## Build environment notes

- pnpm v10 blocks dependency build scripts by default; `pnpm-workspace.yaml` sets
  `onlyBuiltDependencies: [electron]` so Electron's postinstall (binary download) runs.
  If the Electron binary is missing after an install, run: `node node_modules/electron/install.js`.
- `pnpm make` (Squirrel.Windows) requires `7z.exe` next to Squirrel.exe, but
  electron-winstaller's `vendor/` ships only `7z-x64.exe`. The `make` script runs
  `apps/desktop/scripts/fix-squirrel-7z.mjs` first, which copies the binaries into
  place automatically (idempotent; safe after fresh installs).
