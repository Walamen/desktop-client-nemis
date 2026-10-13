# Lint Baseline Cleanup — Design

Date: 2026-10-13
Branch: `lint-baseline-cleanup` (from `main` at dc794f2)
Scope: desktop-client-nemis workspace tooling + one domain import. No runtime behaviour changes.

## Goal

`pnpm lint` (root `eslint .`) exits 0. Today it reports 6 errors, all
pre-existing and outside the renderer:

| File | Errors | Cause |
|---|---|---|
| `scripts/bump-desktop-version.mjs` | 4 × `no-undef` (`console` ×2, `process` ×2) | The root ESLint config gives `scripts/**` no Node globals. |
| `packages/domain/src/students/value-objects/nemis-id.ts` | 2 × `no-restricted-imports` | `NemisId` imports `normalizeNemisId` from `@nemis-desktop/shared`, which the domain import guard bans (both the exact path and the pattern). |

**Why:** a red `pnpm lint` hides new errors; and the domain guard should be
enforced, not routinely ignored. The guard has never had an automated test.

## Non-goals

- No change to `bump-desktop-version.mjs` itself or to any other script.
- No change to the other ~54 `@nemis-desktop/shared` imports in
  `apps/desktop/electron`, `apps/desktop/renderer` and `packages/application`.
- No move, copy or edit of `packages/shared/src/nemis-id.ts` — it is the
  byte-identical twin of `Nemis/packages/utils/src/nemis-id.ts`, verified by
  shared golden fixtures.
- No loosening of the domain guard beyond the one subpath below.

## Design

### 1. Node globals for root scripts

Root `eslint.config.mjs` gains one config block:

```js
{
  files: ['scripts/**/*.{js,mjs,cjs}'],
  languageOptions: { globals: globals.node },
},
```

with `import globals from 'globals';` at the top.

`globals` (14.0.0) already resolves from `node_modules` today, but only as a
transitive dependency of ESLint's own packages. It becomes an explicit root
devDependency pinned to the version already in the lockfile
(`pnpm add -Dw globals@14.0.0`), so the change touches only the root
`package.json` and `pnpm-lock.yaml` and downloads nothing new.

The block must sit **after** `js.configs.recommended` /
`tseslint.configs.recommended` so its globals apply (flat config merges
`languageOptions.globals` across matching blocks; order only matters for
conflicting rule settings, but placing it after the shared presets keeps the
intent obvious).

### 2. `@nemis-desktop/shared/nemis-id` subpath

**`packages/shared/package.json`** — add a subpath export, keep the root:

```json
"exports": {
  ".": "./src/index.ts",
  "./nemis-id": "./src/nemis-id.ts"
}
```

**`packages/domain/src/students/value-objects/nemis-id.ts`** — change the
import to:

```ts
import { normalizeNemisId } from '@nemis-desktop/shared/nemis-id';
```

**`packages/domain/eslint.config.mjs`** (`domainImportGuard`):

- `paths` keeps the exact-name entry banning `@nemis-desktop/shared` (the
  package root). Its message becomes:
  `'Domain layer must not depend on the infra-facing shared package (only @nemis-desktop/shared/nemis-id is allowed).'`
- `patterns[0].group` replaces the single `'@nemis-desktop/shared/*'` entry
  with the pair:
  ```js
  '@nemis-desktop/shared/*',
  '!@nemis-desktop/shared/nemis-id',
  ```
  (`'@nemis-desktop/shared'` stays in the group.) ESLint's
  `no-restricted-imports` pattern groups use gitignore semantics, so the
  negation re-allows exactly that one subpath while every other subpath stays
  banned.
- A comment above the negation explains the exception: `nemis-id.ts` is a
  pure, dependency-free module (the NEMIS ID algorithm), the byte-identical
  twin of the server's copy, verified by golden fixtures — so the domain
  reuses it rather than duplicating it.

**`packages/domain/README.md`** — the sentence listing banned imports
(currently "Imports of `electron`, `react`, `next`, `better-sqlite3`,
`@nemis-desktop/shared`, or any …") gains: "(the single exception is the pure
`@nemis-desktop/shared/nemis-id` subpath, used by the `NemisId` value
object)". The preceding sentence "The only permitted dependency is
`@nemis-desktop/types`" is amended to name the same exception.

`packages/domain/package.json` already lists `@nemis-desktop/shared` as a
dependency (added with `NemisId` on 2026-09-21); it stays.

### 3. Import-guard test

New `packages/domain/src/import-guard.test.ts` (picked up by the existing
`node` Vitest project: `packages/**/src/**/*.test.ts`). It uses ESLint's Node
API with the repo's real flat config:

```ts
const eslint = new ESLint({ cwd: <repo root> });
const [result] = await eslint.lintText(source, { filePath: '<repo root>/packages/domain/src/__guard_probe__.ts' });
```

and asserts, by collecting `no-restricted-imports` messages:

| Probe source | Expected |
|---|---|
| `import { normalizeNemisId } from '@nemis-desktop/shared/nemis-id';` | no `no-restricted-imports` message |
| `import { IPCError } from '@nemis-desktop/shared';` | reported |
| `import { x } from '@nemis-desktop/shared/errors';` | reported |
| `import { x } from '@nemis-desktop/shared/src/nemis-id';` | reported (the allowed subpath is exact) |
| `import { app } from 'electron';` | reported (existing ban still works) |

The repo root is resolved from the test file's location
(`fileURLToPath(new URL('../../..', import.meta.url))`). The probe file path
does not need to exist on disk (`lintText` lints in-memory text).

ESLint is a root devDependency and resolves from `packages/domain` through the
workspace root `node_modules`. The test imports only `eslint` and Node
built-ins — nothing the domain guard bans (the guard covers
`packages/domain/**/*.ts`, so the test file itself must also lint clean).

## Verification (definition of done)

- `pnpm lint` exits 0.
- `pnpm typecheck` (workspace) passes — includes `@nemis-desktop/domain` and
  `@nemis-desktop/app` resolving the new subpath under `moduleResolution:
  "Bundler"`.
- `pnpm exec vitest run --project node packages/domain packages/shared` passes:
  the new guard test, the existing `NemisId` / domain tests, and the shared
  `nemis-id` + golden-fixture tests. (The `node` project's better-sqlite3 ABI
  failures live under `apps/desktop/electron` and `packages/application`, not in
  these two packages.)
- The electron tests that construct `NemisId` through the domain still pass —
  they exercise the same Vite resolver that bundles the Electron main process
  (`@electron-forge/plugin-vite`). Run the electron test files that import
  `@nemis-desktop/domain`'s students module (the plan names them); if the
  better-sqlite3 ABI mismatch blocks them, run `pnpm rebuild:node` first and
  restore with `pnpm rebuild:electron` afterwards, as the repo already does.
- `pnpm build:renderer` still succeeds.
- No other file changes; `git diff --stat main` lists only the files named
  above plus `pnpm-lock.yaml`.
