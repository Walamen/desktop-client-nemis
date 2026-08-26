#!/usr/bin/env node
// Bumps the version field in apps/desktop/package.json — the single source of
// truth for the NEMIS Desktop application version. Does not touch the
// workspace root package.json version, does not create git commits or tags.
//
// Usage: node scripts/bump-desktop-version.mjs <patch|minor|major>

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

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
    // A fixed, literal command (no interpolated input) — execSync's shell
    // step is safe here and sidesteps Node's DEP0190 warning, which only
    // fires when an args array is combined with { shell: true }.
    execSync('pnpm install --lockfile-only', {
      cwd: repoRoot,
      stdio: 'inherit',
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
