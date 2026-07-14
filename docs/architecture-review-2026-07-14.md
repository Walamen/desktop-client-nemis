# NEMIS Desktop — Architecture Review Report (Phase 1.5 Freeze)

**Date:** 2026-07-14
**Branch reviewed:** `phase-1-foundation` (Phase 1 commits `be94f13..dde4b35` + Phase 1.5 commits `486f367..d6c62e0`)
**Reviewer:** Lead Architect session (per-task reviews + independent whole-branch review on every change)

---

## 1. Executive Summary

The NEMIS Desktop foundation is **frozen and ready for Phase 2**. The application is a pnpm workspace with a hardened Electron shell (Forge + Vite for main/preload) and a Next.js 15 static-export renderer served over a custom `app://` protocol in production. Every security surface demanded by the audit checklist is implemented, runtime-verified via Chrome DevTools Protocol in both dev and packaged builds, and the security-critical logic is locked by 28 unit tests. The typed `IpcContract` map makes the IPC bridge scale to hundreds of endpoints without main/preload drift. All quality-gate commands pass; production packaging (including the Squirrel installer) is proven self-healing from a broken toolchain state. Remaining debt is minor, enumerated, and scheduled.

## 2. Overall Architecture Score: 9/10

Clean three-layer separation (workspace packages → electron shell → renderer), one responsibility per module, pure logic extracted from Electron-bound wrappers, and a single source of truth for the IPC contract. One point withheld: the renderer is still a shell (routing/state patterns unproven at scale) and there is no CI pipeline yet — both are Phase 2 concerns by design.

## 3. Security Score: 9/10

Verified against the audit checklist (all runtime-verified via CDP unless noted):

| Surface                 | Status                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contextIsolation`      | ✅ true (`window.require`/`window.process` undefined in renderer, CDP-verified)                                                                                                                              |
| `sandbox`               | ✅ true                                                                                                                                                                                                      |
| `nodeIntegration`       | ✅ false                                                                                                                                                                                                     |
| Navigation restrictions | ✅ protocol+host origin comparison; evil, userinfo-bypass, and port-collision URLs blocked live; test-locked                                                                                                 |
| Popup blocking          | ✅ `setWindowOpenHandler` denies all; verified live                                                                                                                                                          |
| Permission handling     | ✅ deny-all `setPermissionRequestHandler`; `Notification.requestPermission()` → "denied" verified live                                                                                                       |
| Protocol validation     | ✅ host + method checks, traversal guard (encoded `..`, backslash, sibling-prefix, malformed encoding — all test-locked), CSP on every response including 403/404                                            |
| External URL handling   | ✅ nothing opens externally; all foreign navigation blocked and logged                                                                                                                                       |
| CSP                     | ✅ `default-src 'self'` + `base-uri 'none'`, `object-src 'none'`, `form-action 'self'`, `frame-ancestors 'none'` (documented exception: `'unsafe-inline'` scripts, required by Next static-export hydration) |
| Secure defaults         | ✅ Forge fuses (RunAsNode off, NODE_OPTIONS off, ASAR integrity on, only-load-from-ASAR on); single-instance lock; crash safety nets                                                                         |

One point withheld for the documented gaps: `'unsafe-inline'` script CSP, no `setPermissionCheckHandler` (sync permission _checks_ default permissive while all actual requests are denied), and no `will-redirect` guard (dev-only exposure). All three are recorded in §12 with owners.

## 4. Maintainability Score: 9/10

Strict TypeScript everywhere, `any` forbidden by lint, named exports, one-responsibility modules, colocated tests, and a conventions guide (`docs/conventions.md`) with a five-step recipe for adding an IPC endpoint. Docs verified accurate against the tree by independent review. Withheld point: ESLint runs non-type-aware (speed tradeoff, documented) and knip cannot scan the monorepo without a config (findings recorded manually).

## 5. Scalability Score: 8/10

The `IpcContract` map + generic `handle`/`invoke` means hundreds of endpoints stay type-checked end-to-end with per-domain handler modules. Workspace layering (`types` ← `shared` ← `app`) supports future packages cleanly. Renderer matches portal-web's stack (Next 15/React 19/Tailwind 3.4) for cheap page porting. Withheld: renderer state management is deliberately undecided, the registrar needs an arity-validating pattern at the first multi-arg endpoint, and offline/sync layers (the real scale test) are still ahead.

## 6. Code Quality Score: 9/10

- 28 unit tests, all passing, targeting real bypass classes (userinfo URLs, encoded traversal, custom-scheme origin pitfalls, error masking) — not happy paths.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all exit 0 across the workspace.
- Dead code removed (`constants.ts`); every knip finding triaged (its unused-file cascade is a false positive from Forge/Vite/Next entry points being invisible without a knip config — verified by hand).
- Every commit in both phases passed an independent spec + quality review; the whole branch passed two independent final reviews.

## 7. Folder Structure Review

```
apps/desktop/
  electron/
    main/       main.ts, appProtocol.ts, rendererPath.ts, safetyNets.ts
    preload/    preload.ts (the only bridge)
    ipc/        registrar.ts, handlers/system.ts
    security/   navigation.ts, hardenWindow.ts, csp.ts, permissions.ts, validateIpc.ts
    windows/    mainWindow.ts
    services/   logger.ts, systemService.ts
    config/     parseConfig.ts (pure), env.ts (electron-bound)
  renderer/     Next.js app (app/, layouts/, hooks/, services/, styles/, types/, components/, store/, lib/)
  scripts/      fix-squirrel-7z.mjs
packages/       types (IPC contract), shared (errors), ui (stub)
docs/           architecture.md, conventions.md, this report, specs/, plans/
```

Verdict: **sound**. Responsibilities are separated by concern, not by technicality; pure logic sits beside its Electron wrapper; naming is consistent (`camelCase.ts` modules, `registerX`/`denyX`/`installX` verbs). No unnecessary folders — `store/`, `lib/`, `components/` are intentional placeholders for Phase 2 and documented as such.

## 8. IPC Review

- Contract: `IpcContract` in `packages/types/src/ipc.ts` is the single source of truth; `IpcChannel = keyof IpcContract`; constants checked with `satisfies`.
- Flow: renderer → `window.nemis.<domain>.<method>` → typed preload `invoke` → `ipcMain.handle` via a registrar that enforces a validator before every handler → service → `IpcResult<T>` envelope back. Unknown errors are masked (`UNEXPECTED_ERROR`) with full detail logged main-side; the renderer sees `[CODE] message`.
- Naming: `domain:action` (documented).
- Scales to hundreds of endpoints: adding one is a 5-step recipe touching the contract, one handler module line, one preload line, one API type, one renderer service — all compile-checked against each other.
- Verified end-to-end at runtime in dev and packaged builds (`system:get-version` → "1.0.0" rendered).

## 9. Electron Review

- **Startup:** squirrel-event check → single-instance lock → `bootstrap()`: safety nets first, config load (fail-fast `ConfigurationError`), pre-ready scheme privilege registration, then post-ready: logger init, permission handler, protocol handler (prod), IPC registration, hardened window. `.catch` on the ready chain logs fatal and quits.
- **Shutdown:** `window-all-closed` quits (except macOS); `closed` handler clears the window reference; second launch focuses the running instance (verified live against the packaged exe).
- **Windows:** single factory (`createMainWindow`) + `createHardenedWindow` wrapper; no duplicated hardening.
- **Crash handling:** `uncaughtException` → log + plain-language dialog + exit(1); `unhandledRejection` → log. Both safe pre-ready (verified electron-log/dialog semantics).
- **Dev vs prod:** dev loads `next dev` (port 3010, HMR); prod serves the static export over `app://renderer/` from `extraResource` — both paths CDP-verified.

## 10. Configuration Review

- **package.json (root):** workspace scripts, `packageManager: pnpm@10.30.3` + engines pins (installs with the wrong tool fail loudly).
- **TypeScript:** strict + `noUncheckedIndexedAccess`/`noImplicitOverride`, `moduleResolution: Bundler`, per-package configs extending one base.
- **ESLint 9 flat config:** typescript-eslint + react/react-hooks scoped to the renderer, `no-explicit-any: error`, prettier last.
- **Prettier/EditorConfig:** enforced in the gate.
- **Forge:** fuses as audited; ASAR; `extraResource` for the renderer export; makers incl. Squirrel (name `nemis_desktop`, setup exe named); AutoUnpackNatives registered ahead of Phase 2 native modules.
- **Env:** main-process-only dotenv with pure validated parsing (`parseConfig`, test-locked); defaults safe; `.env*` gitignored with a committed example; no secrets exist in the renderer or repo.
- **Build scripts:** `dev` (concurrent renderer+electron with port wait), `package`/`make` (renderer export → forge; make self-heals the Squirrel 7z toolchain gap — proven from a deliberately broken state).

## 11. Documentation Review

`README.md` (setup/commands), `docs/architecture.md` (process model, IPC, security, logging, build notes), `docs/conventions.md` (coding + IPC conventions, folder table, endpoint recipe), `CLAUDE.md` (aligned: color `#020833`, real code tree), specs + implementation plans + this report — all committed, all verified accurate against the tree by independent review. A new developer can go from clone → running app with README alone (prerequisites, one install command, one dev command).

## 12. Remaining Technical Debt

**Critical:** none.
**High:** none.

**Medium:**

| Item                                                                                     | Resolution                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP allows `'unsafe-inline'` scripts (Next static-export hydration requirement)          | Revisit if Next ships nonce support for static export; otherwise accept — all other injection surfaces are closed (`base-uri 'none'`, deny-all permissions, navigation lock) |
| No `setPermissionCheckHandler` (sync checks report permissive while requests are denied) | Add deny-all check handler in `permissions.ts` at the start of Phase 2                                                                                                       |
| `electron-winstaller` is resolved as a transitive dep by `fix-squirrel-7z.mjs`           | Add as explicit devDependency of `@nemis-desktop/app` in Phase 2's first install                                                                                             |

**Low:**

| Item                                                                                         | Resolution                                                                        |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| No `will-redirect` guard (dev-only exposure; prod `app://` never redirects)                  | Add alongside the permission check handler                                        |
| Registrar's `args` cast needs arity/shape validation pattern at the first multi-arg endpoint | Phase 2 first-endpoint checklist (with an `IpcChannels` exhaustiveness assertion) |
| ESLint non-type-aware                                                                        | Add a type-aware CI job in Phase 2                                                |
| `packages/ui` placeholder; renderer `store/`/`lib/` empty                                    | Populate when the first shared component / state decision lands                   |
| No CI pipeline                                                                               | Stand up CI (typecheck/lint/test/build) before Phase 2 feature work merges        |

## 13. Recommended Improvements

1. **Phase 2 first-endpoint checklist:** shape-validating validator + arity comment at the registrar cast + `IpcChannels` exhaustiveness assertion — land together with the first parameterized IPC endpoint.
2. **CI before features:** a pipeline running the exact quality gate (typecheck/lint/format/test/build:renderer) on every PR; add the type-aware ESLint job there.
3. **Permission check handler + will-redirect guard:** one small security commit at Phase 2 start (both are ≤10 lines).
4. **Design tokens:** move the hex palette into a shared token module when `packages/ui` gains its first component, so renderer and future shared components consume one source.

## 14. Risks Before Phase 2

- **SQLite/SQLCipher integration** (native modules) is the first real test of the packaging pipeline — AutoUnpackNatives is pre-registered, but expect rebuild/config work; prototype early.
- **Sync-layer design** will stress the IPC contract with large payloads and long-running operations; decide on streaming/progress conventions before building.
- **State management** in the renderer is undecided; choose (likely Redux Toolkit for portal-web parity) before porting pages.
- **No CI** means the frozen gate is only enforced by discipline until a pipeline exists.
- Environment quirk: this machine's `pnpm make` depended on the (now automated) 7z fix; fresh machines get it for free via the make script, but CI images should run the same script.

## 15. Go / No-Go Recommendation

**GO.** Every quality-gate item passes with runtime evidence, the security audit closes with only enumerated, low-risk debt, the IPC architecture demonstrably scales, and documentation matches reality. The foundation is frozen: Phase 2 (SQLite + sync scaffolding per the roadmap) can build on this branch without restructuring.

---

### Quality-gate evidence (final state, commit `d6c62e0`)

| Check                                             | Result                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                  | ✅ exit 0 (all 4 packages)                                                             |
| `pnpm lint`                                       | ✅ exit 0                                                                              |
| `pnpm format:check`                               | ✅ exit 0                                                                              |
| `pnpm test`                                       | ✅ 28/28 (4 files)                                                                     |
| `pnpm --filter @nemis-desktop/app build:renderer` | ✅ static export produced                                                              |
| `pnpm --filter @nemis-desktop/app package`        | ✅ packaged app runs                                                                   |
| `pnpm make`                                       | ✅ setup.exe + RELEASES + nupkg (proven from broken vendor state)                      |
| Dev CDP                                           | ✅ node isolation, IPC 1.0.0, popup deny, nav block (evil + userinfo), permission deny |
| Packaged CDP                                      | ✅ `app://renderer/`, IPC 1.0.0, Tailwind `rgb(2, 8, 51)`, single-instance held        |
