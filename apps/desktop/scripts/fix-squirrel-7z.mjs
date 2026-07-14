// electron-winstaller's vendor dir ships 7z-x64.exe, but Squirrel.exe spawns 7z.exe.
// Copy the binaries into place (idempotent). Runs before `electron-forge make`.
// Uses only explicit node: imports so ESLint needs no node-globals config.
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function resolveVendorDir() {
  try {
    return path.join(path.dirname(require.resolve('electron-winstaller/package.json')), 'vendor');
  } catch {
    // electron-winstaller not installed (e.g. non-Windows build) — nothing to fix.
    return null;
  }
}

const vendorDir = resolveVendorDir();
if (vendorDir !== null) {
  // Copy failures (permissions, disk) propagate and fail the make script loudly.
  for (const [source, target] of [
    ['7z-x64.exe', '7z.exe'],
    ['7z-x64.dll', '7z.dll'],
  ]) {
    const sourcePath = path.join(vendorDir, source);
    const targetPath = path.join(vendorDir, target);
    if (existsSync(sourcePath) && !existsSync(targetPath)) {
      copyFileSync(sourcePath, targetPath);
    }
  }
}
