# NEMIS Desktop Releases

Manual, developer-controlled release publishing to GitHub Releases via
Electron Forge. No CI/CD, no auto-updating, no code signing — those are
separate, later work.

`apps/desktop/package.json`'s `version` field is the single source of truth
for the NEMIS Desktop application version. Never edit it by hand — use the
commands below.

## Everyday release

| Change type                  | Command               | Example         |
| ----------------------------- | ---------------------- | ---------------- |
| Bug fix                      | `pnpm release:patch`  | `1.0.0 -> 1.0.1` |
| Backward-compatible feature  | `pnpm release:minor`  | `1.0.1 -> 1.1.0` |
| Breaking / major release     | `pnpm release:major`  | `1.1.0 -> 2.0.0` |

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
```

```powershell
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

The `RELEASES`/`.nupkg` artifacts aren't consumed by anything yet (automatic
updates are future work), but Squirrel always produces them alongside the
installer, and Forge publishes the maker's full artifact list rather than a
manually chosen subset.

## Command reference

```bash
# Patch release (bug fix)
pnpm release:patch

# Minor release (backward-compatible feature)
pnpm release:minor

# Major release (breaking change)
pnpm release:major

# Bump only, no publish
pnpm version:patch
pnpm version:minor
pnpm version:major

# Publish whatever version is currently set, no bump
pnpm publish:desktop
```
