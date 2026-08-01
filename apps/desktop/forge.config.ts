import fs from 'node:fs';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// plugin-vite packages only the bundled .vite output — node_modules is never
// copied into the app. better-sqlite3 must stay external (native addon;
// see vite.main.config.ts), so its module directory and runtime dependencies
// are copied into the packaged app here. pnpm may expose these as symlinks,
// hence realpathSync + dereference.
const externalRuntimeModules = ['better-sqlite3', 'bindings', 'file-uri-to-path'];

// .env.production is git-ignored (machine-specific secrets/URLs) and, unlike
// source files, is never bundled by the Vite plugin — it must be listed here
// explicitly to end up next to app.asar where env.ts reads it at runtime.
// Optional: only added if present, so `pnpm make` still works without one.
const envProductionPath = path.resolve(__dirname, '.env.production');
const extraResource = fs.existsSync(envProductionPath)
  ? ['./renderer/out', './.env.production']
  : ['./renderer/out'];

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Nemis',
    executableName: 'Nemis',
    icon: path.resolve(__dirname, 'assets/icons/win', 'icon'),
    asar: true,
    extraResource,
  },
  // Skip Forge's native rebuild: this machine has no C++ toolchain, and the
  // correct Electron-ABI prebuilt binary is installed by `pnpm rebuild:electron`
  // (run it before `pnpm make`) and packaged as-is by the hook below.
  rebuildConfig: { onlyModules: [] },
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      const rootNodeModules = path.resolve(__dirname, '..', '..', 'node_modules');
      for (const moduleName of externalRuntimeModules) {
        const source = fs.realpathSync(path.join(rootNodeModules, moduleName));
        await fs.promises.cp(source, path.join(buildPath, 'node_modules', moduleName), {
          recursive: true,
          dereference: true,
        });
      }
    },
  },
  makers: [
    new MakerSquirrel({
      name: 'Nemis',
      setupExe: 'nemis-setup.exe',
      setupIcon: path.resolve(__dirname, 'assets/icons/win', 'icon.ico'),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'electron/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'electron/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
