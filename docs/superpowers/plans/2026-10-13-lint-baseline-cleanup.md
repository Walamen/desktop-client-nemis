# Lint Baseline Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm lint` exit 0 by giving root scripts Node globals and letting the domain import only the pure `@nemis-desktop/shared/nemis-id` subpath, with an automated test for the domain import guard.

**Architecture:** Two config-level changes. (1) A root ESLint block applies `globals.node` to `scripts/**`. (2) `@nemis-desktop/shared` gains a `./nemis-id` subpath export; the domain's `NemisId` imports it; the domain guard keeps banning the package root and every other subpath but negates exactly that one. A new Vitest test drives ESLint's Node API against in-memory probe files to pin the guard's behaviour.

**Tech Stack:** pnpm workspace, ESLint 9.39 flat config + typescript-eslint, TypeScript 5 (`moduleResolution: "Bundler"`), Vitest 3 (`node` project), Node 22 types.

**Spec:** `docs/superpowers/specs/2026-10-13-lint-baseline-cleanup-design.md`

## Global Constraints

- No runtime behaviour change. `bump-desktop-version.mjs` is not edited. `packages/shared/src/nemis-id.ts` is not moved, copied or edited (byte-identical twin of `Nemis/packages/utils/src/nemis-id.ts`).
- The other ~54 `@nemis-desktop/shared` imports in `apps/desktop/electron`, `apps/desktop/renderer`, `packages/application` are not touched.
- The domain guard is loosened by exactly one subpath: `@nemis-desktop/shared/nemis-id`. The root `@nemis-desktop/shared`, every other subpath (e.g. `/errors`, `/src/nemis-id`) and every existing ban (`electron`, `react`, `next`, `better-sqlite3`, `**/database/**`, …) stay reported.
- `globals` is added as a root devDependency pinned to **14.0.0** (the version already in the lockfile): `pnpm add -Dw globals@14.0.0`.
- New guard-path message text (verbatim): `'Domain layer must not depend on the infra-facing shared package (only @nemis-desktop/shared/nemis-id is allowed).'`
- Files allowed to change on the branch (besides the spec/plan docs): `eslint.config.mjs`, `package.json`, `pnpm-lock.yaml`, `packages/shared/package.json`, `packages/domain/eslint.config.mjs`, `packages/domain/README.md`, `packages/domain/src/students/value-objects/nemis-id.ts`, `packages/domain/src/import-guard.test.ts` (new).
- Commit trailer: end every commit message with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Commands** (from the repo root `desktop-client-nemis/`):
- Lint: `pnpm lint` (root `eslint .`); targeted: `pnpm exec eslint <paths>`
- Typecheck: `pnpm typecheck` (all packages); targeted: `pnpm --filter @nemis-desktop/domain typecheck`
- Tests (node project): `pnpm exec vitest run --project node <paths>`

**Baseline** (measured on `main` at dc794f2): `pnpm lint` → 6 errors (4 in `scripts/bump-desktop-version.mjs`, 2 in `packages/domain/src/students/value-objects/nemis-id.ts`); `pnpm typecheck` passes; `vitest --project node packages/domain packages/shared` → 22 files / 149 tests pass. The `node` project's better-sqlite3 ABI failures live under `apps/desktop/electron` and `packages/application` SQLite tests — not run here.

## Review Focus

1. **The negation re-allowing more than one path** (e.g. `@nemis-desktop/shared/src/nemis-id` or `@nemis-desktop/shared/nemis-id/x`) — a person expects only the exact subpath to pass. Pinned by the guard test's `/src/nemis-id` and `/nemis-id/extra` probes (Task 2).
2. **The root `@nemis-desktop/shared` import silently becoming legal** — expected: still reported. Pinned (Task 2).
3. **An unrelated existing ban regressing** (`electron`, a `**/database/**` path) after editing the pattern group — expected: still reported. Pinned (Task 2).
4. **The Node-globals block leaking to JS files outside `scripts/`** — expected: an `.mjs` file elsewhere still gets `no-undef` for `console`/`process` (TypeScript files are unaffected either way, since typescript-eslint disables `no-undef` for them). Pinned by the guard test file's "do not leak" probe (Task 2).
5. **Consumers outside the domain failing to resolve the new subpath at build time** (Vite/Vitest, tsc Bundler resolution) — expected: unchanged behaviour. Pinned by running the SQLite-free application tests and `pnpm typecheck` + `pnpm build:renderer` in Task 2.

---

## File Structure

- Modify `eslint.config.mjs` — add `import globals from 'globals';` and one `scripts/**` block.
- Modify `package.json`, `pnpm-lock.yaml` — `globals@14.0.0` devDependency (via pnpm).
- No test file under root `scripts/` (it has no Vitest project): Task 1 is verified at the command level, and its scoping is pinned by probes in the Task 2 guard test, which already drives the ESLint API.
- Modify `packages/shared/package.json` — `./nemis-id` export.
- Modify `packages/domain/src/students/value-objects/nemis-id.ts` — import path.
- Modify `packages/domain/eslint.config.mjs` — message + negation + comment.
- Modify `packages/domain/README.md` — dependency-rule wording.
- Create `packages/domain/src/import-guard.test.ts` — ESLint-API test of the guard (and the scripts-globals scoping probe).

---

### Task 1: Node globals for root scripts

**Files:**
- Modify: `eslint.config.mjs` (imports at lines 1–22; insert a block after the `@typescript-eslint/no-explicit-any` block at lines 54–58)
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)

**Interfaces:**
- Produces: root config block `{ files: ['scripts/**/*.{js,mjs,cjs}'], languageOptions: { globals: globals.node } }`. Task 2's guard test asserts it does not apply outside `scripts/`.

- [ ] **Step 1: Confirm the failure (RED)**

Run: `pnpm exec eslint scripts/bump-desktop-version.mjs`
Expected: exit 1 with exactly 4 `no-undef` errors (`'console' is not defined` at 21:3 and 98:1, `'process' is not defined` at 22:3 and 89:24).

- [ ] **Step 2: Declare `globals` explicitly**

Run: `pnpm add -Dw globals@14.0.0`
Expected: root `package.json` `devDependencies` gains `"globals": "14.0.0"` (pnpm may write `^14.0.0` or `14.0.0` depending on `save-exact`; either is fine as long as the lockfile resolves 14.0.0). `pnpm-lock.yaml` changes only to record the root importer's new devDependency — no new package versions. Check with `git diff --stat` (should list only `package.json` and `pnpm-lock.yaml`) and `git diff pnpm-lock.yaml | grep -c "^+.*resolution"` → `0`.

If `pnpm add` tries to download or bumps other packages, stop and report instead of committing a broad lockfile change.

- [ ] **Step 3: Add the config block**

In `eslint.config.mjs`, after line 5 (`import prettier from 'eslint-config-prettier';`) add:

```js
import globals from 'globals';
```

After the block

```js
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
```

insert:

```js
  {
    // Repo maintenance scripts (e.g. scripts/bump-desktop-version.mjs) run in Node.
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
```

- [ ] **Step 4: Verify (GREEN)**

Run: `pnpm exec eslint scripts/bump-desktop-version.mjs`
Expected: exit 0, no output.

Run: `pnpm lint`
Expected: exactly the 2 remaining `no-restricted-imports` errors in `packages/domain/src/students/value-objects/nemis-id.ts` (fixed in Task 2); no new errors anywhere.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs package.json pnpm-lock.yaml
git commit -m "chore(lint): give root scripts Node globals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Domain import guard — allow only `@nemis-desktop/shared/nemis-id`, with a guard test

**Files:**
- Create: `packages/domain/src/import-guard.test.ts`
- Modify: `packages/shared/package.json` (`exports`)
- Modify: `packages/domain/src/students/value-objects/nemis-id.ts:3`
- Modify: `packages/domain/eslint.config.mjs` (paths entry message; patterns group)
- Modify: `packages/domain/README.md` (Dependency rule paragraph)

**Interfaces:**
- Consumes: Task 1's `scripts/**` globals block (asserted not to leak).
- Produces: subpath `@nemis-desktop/shared/nemis-id` → `packages/shared/src/nemis-id.ts`.

- [ ] **Step 1: Write the guard test**

`packages/domain/src/import-guard.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Drives the repo's real flat config through ESLint's API against in-memory
// probe files, so the domain import guard (packages/domain/eslint.config.mjs)
// is tested rather than trusted.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const domainProbe = path.join(repoRoot, 'packages/domain/src/__guard_probe__.ts');

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: repoRoot });
});

async function ruleHits(source: string, filePath: string, ruleId: string): Promise<number> {
  const [result] = await eslint.lintText(source, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).length;
}

const restricted = (source: string) => ruleHits(source, domainProbe, 'no-restricted-imports');

describe('domain import guard', () => {
  it('allows the pure NEMIS ID subpath', async () => {
    expect(await restricted("import { normalizeNemisId } from '@nemis-desktop/shared/nemis-id';\nexport { normalizeNemisId };\n")).toBe(0);
  });

  it.each([
    ["the shared package root", "import { IPCError } from '@nemis-desktop/shared';\nexport { IPCError };\n"],
    ['another shared subpath', "import { x } from '@nemis-desktop/shared/errors';\nexport { x };\n"],
    ['a look-alike of the allowed subpath', "import { x } from '@nemis-desktop/shared/src/nemis-id';\nexport { x };\n"],
    ['a path under the allowed subpath', "import { x } from '@nemis-desktop/shared/nemis-id/extra';\nexport { x };\n"],
    ['electron', "import { app } from 'electron';\nexport { app };\n"],
    ['a database path', "import { x } from '../../database/connection';\nexport { x };\n"],
  ])('still bans %s', async (_label, source) => {
    expect(await restricted(source)).toBeGreaterThan(0);
  });
}, 60_000);

describe('scripts Node globals', () => {
  it('apply to files under scripts/', async () => {
    const hits = await ruleHits("console.log(process.argv);\n", path.join(repoRoot, 'scripts/__probe__.mjs'), 'no-undef');
    expect(hits).toBe(0);
  });

  it('do not leak to .mjs files outside scripts/', async () => {
    const hits = await ruleHits("console.log(process.argv);\n", path.join(repoRoot, 'packages/domain/__probe__.mjs'), 'no-undef');
    expect(hits).toBeGreaterThan(0);
  });
}, 60_000);
```

Notes for the implementer:
- `lintText` with a `filePath` lints in-memory text as if it lived at that path; the file need not exist. If a probe path is matched by the config's `ignores`, ESLint returns a single "File ignored" warning with `ruleId: null` — the counts above would then be 0, so if the "does not leak" test fails with 0 hits, check `result.messages` for an ignore warning before concluding anything.
- `packages/domain/__probe__.mjs` is deliberately outside `packages/domain/src` and outside `scripts/`; `js.configs.recommended` (applies to all files) supplies `no-undef`.
- The `describe(..., 60_000)` third argument sets the per-test timeout; the first `lintText` call loads typescript-eslint and can take several seconds on Windows.

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run: `pnpm exec vitest run --project node packages/domain/src/import-guard.test.ts`
Expected: `allows the pure NEMIS ID subpath` FAILS (received > 0, because `'@nemis-desktop/shared/*'` currently bans every subpath); every other test PASSES (the scripts block exists from Task 1). Record this output in your report.

- [ ] **Step 3: Add the subpath export**

`packages/shared/package.json` — replace the `exports` object with:

```json
  "exports": {
    ".": "./src/index.ts",
    "./nemis-id": "./src/nemis-id.ts"
  },
```

- [ ] **Step 4: Narrow the domain guard**

In `packages/domain/eslint.config.mjs`:

Replace the paths entry

```js
          {
            name: '@nemis-desktop/shared',
            message: 'Domain layer must not depend on the infra-facing shared package.',
          },
```

with

```js
          {
            name: '@nemis-desktop/shared',
            message:
              'Domain layer must not depend on the infra-facing shared package (only @nemis-desktop/shared/nemis-id is allowed).',
          },
```

In the `patterns[0].group` array, replace

```js
              '@nemis-desktop/shared',
              '@nemis-desktop/shared/*',
```

with

```js
              '@nemis-desktop/shared',
              '@nemis-desktop/shared/*',
              // Single exception: the NEMIS ID algorithm. It is pure and
              // dependency-free, and is the byte-identical twin of the server's
              // Nemis/packages/utils/src/nemis-id.ts (shared golden fixtures),
              // so the NemisId value object reuses it instead of duplicating it.
              '!@nemis-desktop/shared/nemis-id',
              // Gitignore semantics: re-including a path re-includes everything
              // under it, so re-ban deeper paths to keep the exception exact.
              '@nemis-desktop/shared/nemis-id/*',
```

- [ ] **Step 5: Point `NemisId` at the subpath**

`packages/domain/src/students/value-objects/nemis-id.ts` line 3 becomes:

```ts
import { normalizeNemisId } from '@nemis-desktop/shared/nemis-id';
```

- [ ] **Step 6: Update the README dependency rule**

In `packages/domain/README.md`, replace the paragraph under `## Dependency rule`

```
The only permitted dependency is `@nemis-desktop/types` (enums + contracts). Imports
of `electron`, `react`, `next`, `better-sqlite3`, `@nemis-desktop/shared`, or any
`database/`/`data/`/`ipc/` path are banned and enforced by ESLint
(`no-restricted-imports`). The package compiles standalone:
`pnpm --filter @nemis-desktop/domain typecheck`.
```

with

```
The only permitted dependencies are `@nemis-desktop/types` (enums + contracts) and
the pure `@nemis-desktop/shared/nemis-id` subpath (the NEMIS ID algorithm, used by
the `NemisId` value object). Imports of `electron`, `react`, `next`,
`better-sqlite3`, `@nemis-desktop/shared` (the package root or any other subpath),
or any `database/`/`data/`/`ipc/` path are banned and enforced by ESLint
(`no-restricted-imports`; see `src/import-guard.test.ts`). The package compiles
standalone: `pnpm --filter @nemis-desktop/domain typecheck`.
```

- [ ] **Step 7: Verify the guard test passes (GREEN)**

Run: `pnpm exec vitest run --project node packages/domain/src/import-guard.test.ts`
Expected: all 9 tests PASS.

If `a look-alike of the allowed subpath` or `a path under the allowed subpath` fails (i.e. the negation re-allows more than the exact subpath), do not weaken the test — report it as DONE_WITH_CONCERNS with the output; the negation pattern needs tightening.

- [ ] **Step 8: Full verification**

Run each and record the output:

1. `pnpm lint` → exit 0, no problems.
2. `pnpm typecheck` → every package `Done`, exit 0.
3. `pnpm exec vitest run --project node packages/domain packages/shared` → 23 files / 158 tests pass (baseline 22/149 + the new file's 9).
4. `pnpm exec vitest run --project node packages/application/src/mappers/students/student-mapper.test.ts packages/application/src/use-cases/academics/enroll-student.test.ts` → all pass (Vite resolves the subpath through the domain).
5. `pnpm --filter @nemis-desktop/app build:renderer` → succeeds (static export; this also runs Next's renderer lint).
6. `git diff --stat main...HEAD` (after committing) → only the files listed in Global Constraints plus the spec/plan docs.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/import-guard.test.ts packages/shared/package.json packages/domain/eslint.config.mjs packages/domain/src/students/value-objects/nemis-id.ts packages/domain/README.md
git commit -m "fix(domain): import NEMIS ID via a narrow shared subpath the guard allows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
