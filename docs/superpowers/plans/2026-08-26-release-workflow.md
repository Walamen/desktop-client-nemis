# NEMIS Desktop Release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the developer manually publish NEMIS Desktop releases to GitHub Releases via Electron Forge, with the version in `apps/desktop/package.json` bumped through simple pnpm commands (`pnpm release:patch|minor|major`, or `pnpm version:patch|minor|major` + `pnpm publish:desktop` separately).

**Architecture:** A tiny Node script (`scripts/bump-desktop-version.mjs`) reads/validates/writes the semver in `apps/desktop/package.json` (the sole source of truth) and re-syncs the lockfile. Root `package.json` exposes `version:*` (bump only), `publish:desktop` (build + `electron-forge publish`, version untouched), and `release:*` (compose the two). Electron Forge gets a `PublisherGithub` entry in `forge.config.ts` reading `GITHUB_TOKEN` from the environment, producing a draft, non-prerelease GitHub Release with every Squirrel maker artifact attached.

**Tech Stack:** Node.js (repo requires >=22) ESM script, pnpm 10 workspace scripts, Electron Forge 7.11.2 (`@electron-forge/publisher-github`), MakerSquirrel (already configured).

**Spec:** This plan implements the user's request given directly in conversation on 2026-08-26 (no separate design doc — the request itself is the exhaustive spec; key constraints repeated below).

## Global Constraints

- Do not implement GitHub Actions, CI/CD, code signing, Electron `autoUpdater`/`update-electron-app`, semantic-release, release-please, or changesets.
- `apps/desktop/package.json` `version` remains the single source of truth for the NEMIS Desktop version; the workspace root `package.json` version is never touched.
- No `npm version` — pnpm-native / a small Node script only.
- Version bumping must not create git commits or git tags.
- `GITHUB_TOKEN` must never be hardcoded or committed; it is read from the environment only.
- `publish:desktop` must reuse the existing renderer build + Squirrel 7z-fix steps used by `make` (`apps/desktop/package.json:20`) — do not skip or duplicate-diverge them.
- Publisher config: `owner: Walamen`, `repository: desktop-client-nemis`, `draft: true`, `prerelease: false`.
- Forge must upload all Squirrel maker artifacts (setup exe, `RELEASES`, `.nupkg`), not a hand-picked file list.
- Must not run a command that creates a real GitHub Release without the user's explicit approval.

---

### Task 1: Version-bump script

**Files:**
- Create: `desktop-client-nemis/scripts/bump-desktop-version.mjs`

**Interfaces:**
- Consumes: `apps/desktop/package.json` (`version` field, plain `X.Y.Z`).
- Produces: CLI `node scripts/bump-desktop-version.mjs <patch|minor|major>` — exits 0 and prints `@nemis-desktop/app version: <old> -> <new>` on success; exits 1 with a `bump-desktop-version: <message>` line on any failure (bad arg, missing/invalid file, non-semver version, lockfile sync failure). Later tasks' `version:*` scripts call this CLI directly.

- [ ] **Step 1: Write the script**

```javascript
#!/usr/bin/env node
// Bumps the version field in apps/desktop/package.json — the single source of
// truth for the NEMIS Desktop application version. Does not touch the
// workspace root package.json version, does not create git commits or tags.
//
// Usage: node scripts/bump-desktop-version.mjs <patch|minor|major>

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const desktopPkgPath = path.join(repoRoot, 'apps', 'desktop', 'package.json');

const BUMP_KINDS = ['patch', 'minor', 'major'];
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

function fail(message) {
  console.error(`bump-desktop-version: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const kind = argv[2];
  if (!BUMP_KINDS.includes(kind)) {
    fail(`expected one of ${BUMP_KINDS.join(', ')}, got ${JSON.stringify(kind ?? '')}`);
  }
  return kind;
}

function readDesktopPackage() {
  let raw;
  try {
    raw = readFileSync(desktopPkgPath, 'utf8');
  } catch (error) {
    fail(`could not read ${desktopPkgPath}: ${error.message}`);
  }
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (error) {
    fail(`${desktopPkgPath} is not valid JSON: ${error.message}`);
  }
  return pkg;
}

function nextVersion(current, kind) {
  const match = SEMVER_RE.exec(current);
  if (!match) {
    fail(
      `apps/desktop/package.json has version "${current}", which is not a plain ` +
        'X.Y.Z semantic version. Fix it manually before bumping.'
    );
  }
  const [, majorStr, minorStr, patchStr] = match;
  const major = Number(majorStr);
  const minor = Number(minorStr);
  const patch = Number(patchStr);

  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function writeDesktopPackage(pkg) {
  writeFileSync(desktopPkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function syncLockfile() {
  // No dependency ranges change when only apps/desktop's own version is
  // bumped, so this is normally a fast no-op. It exists so the lockfile
  // never silently drifts if pnpm ever ties workspace-package versions
  // into resolution metadata.
  try {
    execFileSync('pnpm', ['install', '--lockfile-only'], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch (error) {
    fail(`pnpm install --lockfile-only failed: ${error.message}`);
  }
}

const kind = parseArgs(process.argv);
const pkg = readDesktopPackage();
const currentVersion = pkg.version;
const updatedVersion = nextVersion(currentVersion, kind);

pkg.version = updatedVersion;
writeDesktopPackage(pkg);
syncLockfile();

console.log(`@nemis-desktop/app version: ${currentVersion} -> ${updatedVersion}`);
```

- [ ] **Step 2: Run it directly and verify the bump + revert**

Run: `node scripts/bump-desktop-version.mjs patch` (from `desktop-client-nemis/`)
Expected: prints `@nemis-desktop/app version: 1.0.0 -> 1.0.1`; `apps/desktop/package.json` now has `"version": "1.0.1"`; `pnpm-lock.yaml` unchanged (git diff empty) since no dependency ranges moved.

Then revert the version for the remaining tasks:
Run: `git -C desktop-client-nemis checkout -- apps/desktop/package.json`

- [ ] **Step 3: Verify failure paths**

Run: `node scripts/bump-desktop-version.mjs` (no arg)
Expected: exit 1, stderr `bump-desktop-version: expected one of patch, minor, major, got ""`, `apps/desktop/package.json` untouched.

Run: `node scripts/bump-desktop-version.mjs bogus`
Expected: exit 1, stderr `bump-desktop-version: expected one of patch, minor, major, got "bogus"`.

- [ ] **Step 4: Commit**

```bash
git add scripts/bump-desktop-version.mjs
git commit -m "chore: add desktop version bump script"
```

---

### Task 2: Root pnpm scripts (`version:*`, `publish:desktop`, `release:*`)

**Files:**
- Modify: `desktop-client-nemis/package.json:10-21` (scripts block)

**Interfaces:**
- Consumes: `scripts/bump-desktop-version.mjs` CLI (Task 1); `apps/desktop` package script `publish:forge` (Task 3, produced there — this task only wires the caller, Task 3 makes it real).
- Produces: `pnpm version:patch|minor|major`, `pnpm publish:desktop`, `pnpm release:patch|minor|major` — root-level commands the developer runs.

- [ ] **Step 1: Add the scripts**

In `desktop-client-nemis/package.json`, replace the `"scripts"` block with:

```json
  "scripts": {
    "dev": "pnpm --filter @nemis-desktop/app dev",
    "build": "pnpm --filter @nemis-desktop/app package",
    "make": "pnpm --filter @nemis-desktop/app make",
    "test": "vitest run",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "rebuild:node": "cd node_modules/better-sqlite3 && npx prebuild-install --verbose",
    "rebuild:electron": "cd node_modules/better-sqlite3 && npx prebuild-install --runtime=electron --target=42.7.0 --verbose",
    "version:patch": "node scripts/bump-desktop-version.mjs patch",
    "version:minor": "node scripts/bump-desktop-version.mjs minor",
    "version:major": "node scripts/bump-desktop-version.mjs major",
    "publish:desktop": "pnpm --filter @nemis-desktop/app run publish:forge",
    "release:patch": "pnpm run version:patch && pnpm run publish:desktop",
    "release:minor": "pnpm run version:minor && pnpm run publish:desktop",
    "release:major": "pnpm run version:major && pnpm run publish:desktop"
  },
```

- [ ] **Step 2: Verify the JSON is valid and the version:* scripts run**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` (from `desktop-client-nemis/`)
Expected: no output, exit 0.

Run: `pnpm run version:patch`
Expected: same output as Task 1 Step 2 (`@nemis-desktop/app version: 1.0.0 -> 1.0.1`). Revert again: `git checkout -- apps/desktop/package.json`.

`publish:desktop` and `release:*` are not run yet — `publish:forge` doesn't exist until Task 3, and running `release:*` would attempt a real publish (forbidden without explicit approval).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add release/version pnpm scripts"
```

---

### Task 3: `publish:forge` script + `@electron-forge/publisher-github` dependency

**Files:**
- Modify: `desktop-client-nemis/apps/desktop/package.json:13-23` (scripts block)

**Interfaces:**
- Consumes: existing `build:renderer` script and `scripts/fix-squirrel-7z.mjs` (both already present, `apps/desktop/package.json:18,20`).
- Produces: `pnpm --filter @nemis-desktop/app run publish:forge`, which `publish:desktop` (Task 2) calls; invokes `electron-forge publish`, which reads the `publishers` array added in Task 4.

- [ ] **Step 1: Install the publisher package**

Run (from `desktop-client-nemis/`): `pnpm --filter @nemis-desktop/app add -D @electron-forge/publisher-github@^7.11.2`

Expected: `apps/desktop/package.json` devDependencies gains `"@electron-forge/publisher-github": "^7.11.2"`, `pnpm-lock.yaml` updates, install succeeds with no peer-dependency errors (it's the same `7.x` line as the other `@electron-forge/*` packages already installed).

- [ ] **Step 2: Add `publish:forge`, mirroring `make`'s prep steps**

In `desktop-client-nemis/apps/desktop/package.json`, the `"scripts"` block becomes:

```json
  "scripts": {
    "dev": "concurrently -k -s first -n renderer,electron \"pnpm run dev:renderer\" \"pnpm run dev:electron\"",
    "dev:renderer": "next dev renderer -p 3010",
    "dev:electron": "wait-on tcp:3010 && electron-forge start",
    "start": "electron-forge start",
    "build:renderer": "next build renderer",
    "package": "pnpm run build:renderer && electron-forge package",
    "make": "pnpm run build:renderer && node scripts/fix-squirrel-7z.mjs && electron-forge make",
    "publish:forge": "pnpm run build:renderer && node scripts/fix-squirrel-7z.mjs && electron-forge publish",
    "typecheck": "tsc --noEmit && tsc --noEmit -p renderer/tsconfig.json",
    "generate-icons": "electron-icon-maker --input=assets/icon-master.png --output=assets"
  },
```

`publish:forge` is identical to `make` up to the last step, where `electron-forge publish` replaces `electron-forge make` — `publish` runs Forge's make pipeline internally and then hands the resulting artifacts to the configured publishers, so the renderer build and Squirrel 7z fix are not skipped or duplicated.

- [ ] **Step 3: Verify**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/desktop/package.json','utf8'))"` (from `desktop-client-nemis/`)
Expected: no output, exit 0.

Run: `pnpm --filter @nemis-desktop/app run publish:forge --help` is not meaningful (Forge doesn't take `--help` mid-pipeline usefully); instead defer functional verification to Task 5's `electron-forge make` smoke test — `publish:forge` shares its first two steps with `make` and only its final Forge subcommand differs.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore: add publish:forge script and publisher-github dependency"
```

---

### Task 4: Configure the GitHub publisher in Forge

**Files:**
- Modify: `desktop-client-nemis/apps/desktop/forge.config.ts:1-11` (imports), `:53-62` (add `publishers`)

**Interfaces:**
- Consumes: `@electron-forge/publisher-github`'s `PublisherGithub` class (installed in Task 3); `GITHUB_TOKEN` from the process environment (read internally by the publisher — not referenced by name in this file, per "never hardcode a token").
- Produces: the `publishers` array Forge's `publish` command (invoked by `publish:forge`, Task 3) reads to know where/how to publish.

- [ ] **Step 1: Add the import**

In `desktop-client-nemis/apps/desktop/forge.config.ts`, after the existing maker imports:

```typescript
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { PublisherGithub } from '@electron-forge/publisher-github';
```

- [ ] **Step 2: Add the `publishers` array**

Directly after the existing `makers: [...]` array (`forge.config.ts:53-62`), add:

```typescript
  // Publishes the artifacts from every maker above to a DRAFT, non-prerelease
  // GitHub Release on Walamen/desktop-client-nemis. Only runs when a
  // developer explicitly invokes `pnpm publish:desktop` (or `release:*`).
  // Auth comes from the GITHUB_TOKEN environment variable — never set a
  // token here. See docs/releases.md for required token permissions.
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'Walamen',
        name: 'desktop-client-nemis',
      },
      draft: true,
      prerelease: false,
    }),
  ],
```

So the tail of the config object reads `makers: [...],\n  publishers: [...],\n  plugins: [...],`.

- [ ] **Step 3: Verify the config loads and typechecks**

Run: `pnpm --filter @nemis-desktop/app exec tsc --noEmit -p . ` is covered by the existing `typecheck` script; run the narrower check:
Run: `pnpm --filter @nemis-desktop/app run typecheck`
Expected: exits 0, no new TypeScript errors (`PublisherGithub`'s config type has required `repository.owner`/`repository.name`, both provided).

Run: `node -e "require('ts-node/register'); " ` is unnecessary — Forge itself loads the config as part of `make`/`publish`; defer the runtime load check to Task 5's `electron-forge make` smoke test, which fails loudly if `forge.config.ts` has a load-time error.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/forge.config.ts
git commit -m "feat: configure electron-forge GitHub publisher"
```

---

### Task 5: Documentation + end-to-end verification

**Files:**
- Modify: `desktop-client-nemis/README.md` (add a "Releases" row + section)
- Create: `desktop-client-nemis/docs/releases.md`

**Interfaces:**
- Consumes: nothing new — this task documents Tasks 1-4's commands.
- Produces: developer-facing docs; no code interface.

- [ ] **Step 1: Add a README pointer**

In `desktop-client-nemis/README.md`, in the Commands table (after the `pnpm test` row), add:

```markdown
| `pnpm release:patch`  | Bump the desktop app's patch version and publish a draft GitHub Release |
```

And after the `## Architecture` section, add:

```markdown
## Releases

See `docs/releases.md` for the full release workflow (version bump commands,
`GITHUB_TOKEN` setup, and what to do if publishing fails partway through).
```

- [ ] **Step 2: Write `docs/releases.md`**

```markdown
# NEMIS Desktop Releases

Manual, developer-controlled release publishing to GitHub Releases via
Electron Forge. No CI/CD, no auto-updating, no code signing — those are
separate, later work.

`apps/desktop/package.json`'s `version` field is the single source of truth
for the NEMIS Desktop application version. Never edit it by hand — use the
commands below.

## Everyday release

| Change type                    | Command              | Example           |
| ------------------------------- | --------------------- | ------------------ |
| Bug fix                        | `pnpm release:patch`  | `1.0.0 -> 1.0.1`   |
| Backward-compatible feature    | `pnpm release:minor`  | `1.0.1 -> 1.1.0`   |
| Breaking / major release       | `pnpm release:major`  | `1.1.0 -> 2.0.0`   |

Each `release:*` command bumps the version, builds the renderer, runs
`electron-forge publish`, and uploads every Squirrel artifact (`nemis-setup.exe`,
`RELEASES`, `.nupkg` files) to a **draft** GitHub Release on
`Walamen/desktop-client-nemis`. Nothing is visible to the public until you
open the draft on GitHub and click **Publish release** yourself.

## Bump without publishing

Sometimes you want to bump the version and test locally before releasing:

```bash
pnpm version:patch   # or version:minor / version:major
```

This only updates `apps/desktop/package.json` (and re-syncs the lockfile if
needed) — no build, no publish, no git commit, no git tag. Test the app,
then when ready:

```bash
pnpm publish:desktop
```

This builds and publishes **whatever version is currently in
`apps/desktop/package.json`**, without changing it.

## If publishing fails

`pnpm release:patch` runs the version bump and the publish step in sequence.
If the bump succeeds but publishing fails (network error, bad token, GitHub
outage), the version in `apps/desktop/package.json` has already moved — do
**not** run `pnpm release:patch` again, since that bumps a second time
(e.g. `1.0.1 -> 1.0.2` when you only meant to retry `1.0.1`).

Instead, fix the underlying problem and rerun just the publish step:

```bash
pnpm publish:desktop
```

This is safe to rerun as many times as needed — it never changes the version.

## `GITHUB_TOKEN`

The GitHub publisher authenticates with a `GITHUB_TOKEN` environment
variable. It is never read from a file and never committed. Set it in your
shell for the session you're publishing from:

```bash
# bash
export GITHUB_TOKEN=ghp_your_token_here

# PowerShell
$env:GITHUB_TOKEN = "ghp_your_token_here"
```

**Token permissions:** the token needs write access to Releases on
`Walamen/desktop-client-nemis`:

- Fine-grained personal access token: **Contents: Read and write** on the
  `desktop-client-nemis` repository (Releases are part of the Contents API).
- Classic personal access token: the **`repo`** scope (or `public_repo` if
  the repository is public).

## Expected release artifacts

Electron Forge's Squirrel.Windows maker produces, and the publisher uploads,
all of them automatically — nothing is hand-picked:

- `nemis-setup.exe` — the installer
- `RELEASES` — the Squirrel update manifest
- `*.nupkg` — the NuGet-format update package(s)

These `RELEASES`/`.nupkg` artifacts aren't consumed by anything yet (auto-update
is future work) but Squirrel always produces them alongside the installer, and
Forge publishes the maker's full artifact list rather than a manually chosen
subset.
```

- [ ] **Step 3: Run repo-wide verification**

Run (from `desktop-client-nemis/`): `pnpm typecheck`
Expected: exits 0.

Run: `pnpm --filter @nemis-desktop/app run make`
Expected: completes successfully and produces `apps/desktop/out/make/squirrel.windows/x64/nemis-setup.exe` (plus `RELEASES` and `.nupkg` files in the same directory) — confirms `forge.config.ts` still loads correctly with the new `publishers` array and the existing make pipeline (renderer build, Squirrel 7z fix, native-module copy hook) is unaffected.

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/desktop/package.json','utf8')); JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

Confirm the version is back at its original value (no leftover bump from earlier verification steps): `git status` should show no diff in either `package.json`.

Do **not** run `pnpm publish:desktop` or any `release:*` command during verification — those create a real (draft) GitHub Release and require the user's explicit go-ahead first.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/releases.md
git commit -m "docs: document the desktop release workflow"
```
