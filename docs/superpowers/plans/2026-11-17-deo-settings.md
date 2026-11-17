# DEO Settings — implementation plan (piece 10)

Spec: `docs/superpowers/specs/2026-11-17-deo-settings-design.md`. Native inline, TDD. Server ships first.

1. **Server:** refuse blank first/last name in `updateDistrictSettings` (spec first). Commit.
2. **Web:** remove switches and Employee ID; client checks for passwords; show the server's message. Panel test. Commit.
3. **Desktop data path:** types, channels (`deo:settings`, `deo:settings-remote`, `deo:settings-save`), `getUserProfile` on the district read model (+ SQLite test), `GetDeoSettingsUseCase`, gateway `getDistrictSettings` / `updateDistrictSettings`, handlers with validators and the DEO gate, preload, bridge, ipc group.
4. **Desktop page:** `DeoSettingsViewModel` (profile query) + test; `DeoSettingsPage` (online/offline states, save, feedback) + test; route.
5. lint, typecheck, build:renderer, full suite; fresh reviewer; fix pass; memory; merge menu.
