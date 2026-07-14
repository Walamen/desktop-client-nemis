# NEMIS Desktop Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the flat Electron Forge scaffold into a pnpm-workspace foundation: secure Electron main/preload, Next.js 15 static-export renderer with the NEMIS shell layout, typed IPC (`window.nemis.system.getVersion()`), logging, env config, error taxonomy, and full tooling (TS strict, ESLint 9, Prettier).

**Architecture:** Two coordinated builds inside `apps/desktop`: Electron Forge's Vite plugin builds `electron/main` + `electron/preload` (no Vite renderer entry); Next.js builds the renderer (dev: `next dev` on port 3010 loaded via `loadURL`; prod: `output: 'export'` static files served over a custom `app://` protocol). Workspace packages `@nemis-desktop/types` (IPC contract), `@nemis-desktop/shared` (errors/constants), `@nemis-desktop/ui` (stub) are source-only TS consumed by both bundlers.

**Tech Stack:** Electron 43, Electron Forge 7.11, Vite 5, Next.js 15.1, React 19, Tailwind 3.4, TypeScript 5.7, pnpm workspaces, ESLint 9 flat config, Prettier 3, electron-log 5, Lucide.

**Spec:** `docs/superpowers/specs/2026-07-14-phase1-foundation-design.md`

## Global Constraints

- Security flags are non-negotiable from the first window: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. Forge fuses stay exactly as scaffolded (RunAsNode off, cookie encryption on, NODE_OPTIONS off, inspect args off, ASAR integrity on, only-load-from-ASAR on).
- Design tokens verbatim: primary `#020833`, secondary `#0367A0`, accent `#6494b1`, success `#097a0b`, active `#146316`, error `#c10021`; card radius `16px`; pill buttons (`rounded-full`); 8-point spacing; no shadows.
- Named exports everywhere EXCEPT where a framework demands default exports (Next.js `layout.tsx`/`page.tsx`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `forge.config.ts`, Vite configs, ESLint config).
- `any` is forbidden. TypeScript strict mode everywhere.
- DO NOT add: SQLite, Prisma, sync, REST clients, repositories, business modules, auth, offline logic.
- Renderer dev server port is fixed: **3010**.
- All commands below run from the repo root `desktop-client-nemis/` unless stated otherwise. Shell is PowerShell-compatible.
- Package versions: electron `43.1.0` (exact), `@electron-forge/*` `^7.11.2`, vite `^5.4.21`, next `^15.1.3`, react/react-dom `^19.0.0`, tailwindcss `^3.4.17`, typescript `^5.7.3`, eslint `^9.18.0`, typescript-eslint `^8.20.0`, prettier `^3.4.2`, electron-log `^5.2.4`, lucide-react `^0.563.0`, dotenv `^16.4.7`, concurrently `^9.1.2`, wait-on `^8.0.2`.

**Documented deviations from the spec tree (agreed during planning):**

1. `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, and `renderer/tsconfig.json` live **inside `apps/desktop/renderer/`** (Next.js requires its config in the project root it serves; we run `next dev renderer`).
2. Electron path alias is **`@app/*` → `apps/desktop/electron/*`** instead of `@main/*`/`@preload/*` — the spec's `@electron/*`-style alias would shadow the npm package scope `@electron/` (e.g. `@electron/fuses`), and `ipc/`, `security/`, `config/` sit beside `main/`, not under it.

---

### Task 1: Baseline commit and repo hygiene

**Files:**

- Commit: all existing untracked scaffold files (as-is baseline)
- Create: `.editorconfig`, `.prettierrc`, `.prettierignore`, `.npmrc`
- Overwrite: `.gitignore`

**Interfaces:**

- Consumes: nothing.
- Produces: a git baseline so the restructure is a reviewable diff; `.npmrc` with `node-linker=hoisted` (required for Electron Forge packaging under pnpm).

- [ ] **Step 1: Commit the existing scaffold as a baseline**

```bash
git add -A
git commit -m "chore: baseline Electron Forge scaffold before Phase 1 restructure

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Overwrite `.gitignore`**

```gitignore
# Dependencies
node_modules/

# Build output
.vite/
.next/
out/
dist/
*.tsbuildinfo

# Logs
*.log

# Environment
.env
.env.*
!.env.example

# OS
Thumbs.db
.DS_Store
```

- [ ] **Step 3: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 5: Create `.prettierignore`**

```
node_modules/
.vite/
.next/
out/
dist/
pnpm-lock.yaml
package-lock.json
CHANGELOG.md
```

- [ ] **Step 6: Create `.npmrc`**

```ini
node-linker=hoisted
```

(Electron Forge's packager cannot follow pnpm's default symlinked `node_modules`; hoisted layout is the Forge-documented fix.)

- [ ] **Step 7: Commit**

```bash
git add .gitignore .editorconfig .prettierrc .prettierignore .npmrc
git commit -m "chore: add repo hygiene configs (.editorconfig, prettier, npmrc, gitignore)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: pnpm workspace root

**Files:**

- Overwrite: `package.json` (root — replaces the scaffold's app package.json)
- Create: `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`
- Delete: `package-lock.json`, `.eslintrc.json` (replaced by flat config)

**Interfaces:**

- Consumes: Task 1's `.npmrc`.
- Produces: workspace root scripts (`dev`, `make`, `typecheck`, `lint`, `format`, `format:check`); `tsconfig.base.json` that every package extends; root ESLint flat config covering all packages.

- [ ] **Step 1: Overwrite root `package.json`**

```json
{
  "name": "nemis-desktop-workspace",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "pnpm --filter @nemis-desktop/app dev",
    "build": "pnpm --filter @nemis-desktop/app package",
    "make": "pnpm --filter @nemis-desktop/app make",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "@eslint/js": "^9.18.0",
    "eslint": "^9.18.0",
    "eslint-config-prettier": "^10.0.1",
    "eslint-plugin-react": "^7.37.4",
    "eslint-plugin-react-hooks": "^5.1.0",
    "prettier": "^3.4.2",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.20.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

- [ ] **Step 4: Create `eslint.config.mjs`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.vite/**',
      '**/.next/**',
      '**/out/**',
      '**/dist/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/desktop/renderer/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  prettier,
);
```

- [ ] **Step 5: Delete superseded files**

```bash
git rm package-lock.json .eslintrc.json
```

- [ ] **Step 6: Install and verify**

```bash
pnpm install
pnpm exec eslint --version
pnpm exec tsc --version
```

Expected: install succeeds; eslint prints `v9.x`; tsc prints `Version 5.7.x`.

- [ ] **Step 7: Format the tree and commit**

```bash
pnpm format
git add -A
git commit -m "chore: convert to pnpm workspace with root TS/ESLint/Prettier config

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Workspace packages — types, shared, ui

**Files:**

- Create: `packages/types/package.json`, `packages/types/tsconfig.json`, `packages/types/src/index.ts`, `packages/types/src/ipc.ts`, `packages/types/src/api.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/errors.ts`, `packages/shared/src/constants.ts`
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`

**Interfaces:**

- Consumes: `tsconfig.base.json` from Task 2.
- Produces (used by every later task):
  - `@nemis-desktop/types`: `IpcChannels.SYSTEM_GET_VERSION` (= `'system:get-version'`), `type IpcChannel`, `interface IpcErrorPayload { code: string; message: string }`, `type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorPayload }`, `interface SystemApi { getVersion(): Promise<string> }`, `interface NemisApi { system: SystemApi }`.
  - `@nemis-desktop/shared`: `class ApplicationError extends Error` (readonly `code: string`), `class IPCError extends ApplicationError` (code `'IPC_ERROR'`), `class ConfigurationError extends ApplicationError` (code `'CONFIGURATION_ERROR'`), `function toIpcErrorPayload(error: unknown): IpcErrorPayload`, `const APP_NAME = 'NEMIS Desktop'`.

- [ ] **Step 1: Create `packages/types/package.json`**

```json
{
  "name": "@nemis-desktop/types",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/types/src/ipc.ts`**

```ts
export const IpcChannels = {
  SYSTEM_GET_VERSION: 'system:get-version',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export interface IpcErrorPayload {
  code: string;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorPayload };
```

- [ ] **Step 4: Create `packages/types/src/api.ts`**

```ts
export interface SystemApi {
  getVersion(): Promise<string>;
}

export interface NemisApi {
  system: SystemApi;
}
```

- [ ] **Step 5: Create `packages/types/src/index.ts`**

```ts
export * from './ipc';
export * from './api';
```

- [ ] **Step 6: Create `packages/shared/package.json`**

```json
{
  "name": "@nemis-desktop/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nemis-desktop/types": "workspace:*"
  }
}
```

- [ ] **Step 7: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 8: Create `packages/shared/src/errors.ts`**

```ts
import type { IpcErrorPayload } from '@nemis-desktop/types';

export class ApplicationError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class IPCError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('IPC_ERROR', message, options);
  }
}

export class ConfigurationError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('CONFIGURATION_ERROR', message, options);
  }
}

/**
 * Converts any thrown value into a payload safe to send across IPC.
 * Unknown errors are masked so internals never leak to the renderer.
 */
export function toIpcErrorPayload(error: unknown): IpcErrorPayload {
  if (error instanceof ApplicationError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'UNEXPECTED_ERROR', message: 'An unexpected error occurred.' };
}
```

- [ ] **Step 9: Create `packages/shared/src/constants.ts`**

```ts
export const APP_NAME = 'NEMIS Desktop';
```

- [ ] **Step 10: Create `packages/shared/src/index.ts`**

```ts
export * from './errors';
export * from './constants';
```

- [ ] **Step 11: Create `packages/ui/package.json`**

```json
{
  "name": "@nemis-desktop/ui",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 12: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 13: Create `packages/ui/src/index.ts`**

```ts
/**
 * Placeholder barrel for the shared UI package.
 * Shared components arrive in a later phase; this keeps the package
 * installable and type-checkable from Phase 1.
 */
export const UI_PACKAGE_PLACEHOLDER = true;
```

- [ ] **Step 14: Link workspace and verify typecheck**

```bash
pnpm install
pnpm -r typecheck
```

Expected: `@nemis-desktop/types`, `@nemis-desktop/shared`, `@nemis-desktop/ui` each report no TypeScript errors.

- [ ] **Step 15: Verify lint passes on the new packages**

```bash
pnpm lint
```

Expected: exit code 0.

- [ ] **Step 16: Commit**

```bash
git add packages pnpm-lock.yaml
git commit -m "feat: add workspace packages — IPC contract types, shared errors, ui stub

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Next.js renderer shell (`apps/desktop/renderer`)

**Files:**

- Create: `apps/desktop/package.json` (renderer deps only; Electron deps arrive in Task 5)
- Create: `apps/desktop/renderer/next.config.ts`, `apps/desktop/renderer/postcss.config.mjs`, `apps/desktop/renderer/tailwind.config.ts`, `apps/desktop/renderer/tsconfig.json`
- Create: `apps/desktop/renderer/styles/globals.css`, `apps/desktop/renderer/app/layout.tsx`, `apps/desktop/renderer/app/page.tsx`
- Create: `apps/desktop/renderer/layouts/AppShell.tsx`, `apps/desktop/renderer/layouts/Sidebar.tsx`, `apps/desktop/renderer/layouts/Header.tsx`
- Create: `apps/desktop/renderer/hooks/useAppVersion.ts`, `apps/desktop/renderer/services/system.ts`, `apps/desktop/renderer/types/global.d.ts`
- Create: `apps/desktop/renderer/components/.gitkeep`, `apps/desktop/renderer/store/.gitkeep`, `apps/desktop/renderer/lib/.gitkeep`
- Delete: old scaffold files `src/`, `index.html`, `forge.config.ts`, `forge.env.d.ts`, `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`, `tsconfig.json` (root)

**Interfaces:**

- Consumes: `@nemis-desktop/types` (`NemisApi` for `window.nemis` typing).
- Produces: `next dev renderer -p 3010` serves the shell; `next build renderer` emits static export at `apps/desktop/renderer/out/`; the page displays the value of `window.nemis.system.getVersion()` (or a graceful "bridge unavailable" message outside Electron). Scripts `dev:renderer` and `build:renderer` used by Tasks 5 and 8.

- [ ] **Step 1: Create `apps/desktop/package.json`**

```json
{
  "name": "@nemis-desktop/app",
  "productName": "NEMIS Desktop",
  "version": "1.0.0",
  "description": "NEMIS Desktop client — offline-first Electron shell for the NEMIS platform",
  "private": true,
  "main": ".vite/build/main.js",
  "author": {
    "name": "walamen412",
    "email": "alvin@walamen.com"
  },
  "license": "MIT",
  "scripts": {
    "dev:renderer": "next dev renderer -p 3010",
    "build:renderer": "next build renderer",
    "typecheck": "tsc --noEmit -p renderer/tsconfig.json"
  },
  "dependencies": {
    "@nemis-desktop/shared": "workspace:*",
    "@nemis-desktop/types": "workspace:*",
    "@nemis-desktop/ui": "workspace:*",
    "lucide-react": "^0.563.0",
    "next": "^15.1.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.6",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17"
  }
}
```

- [ ] **Step 2: Create `apps/desktop/renderer/next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@nemis-desktop/types', '@nemis-desktop/shared', '@nemis-desktop/ui'],
};

export default nextConfig;
```

(`output: 'export'` — no server inside Electron. `trailingSlash` makes every route a `<route>/index.html` file, which the `app://` protocol handler maps trivially. `transpilePackages` lets Next compile the source-only workspace packages.)

- [ ] **Step 3: Create `apps/desktop/renderer/postcss.config.mjs`**

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(dirname, 'tailwind.config.ts') },
    autoprefixer: {},
  },
};
```

(Explicit config path: `next dev renderer` runs with cwd `apps/desktop`, so Tailwind would otherwise fail to find its config inside `renderer/`.)

- [ ] **Step 4: Create `apps/desktop/renderer/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: {
    relative: true,
    files: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './layouts/**/*.{ts,tsx}'],
  },
  theme: {
    extend: {
      colors: {
        primary: '#020833',
        secondary: '#0367A0',
        accent: '#6494b1',
        success: '#097a0b',
        active: '#146316',
        error: '#c10021',
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create `apps/desktop/renderer/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "allowJs": true,
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "out"]
}
```

- [ ] **Step 6: Create `apps/desktop/renderer/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  height: 100%;
}
```

- [ ] **Step 7: Create `apps/desktop/renderer/types/global.d.ts`**

```ts
import type { NemisApi } from '@nemis-desktop/types';

declare global {
  interface Window {
    /** Exposed by the Electron preload script; absent in a plain browser. */
    nemis?: NemisApi;
  }
}

export {};
```

- [ ] **Step 8: Create `apps/desktop/renderer/services/system.ts`**

```ts
export async function getAppVersion(): Promise<string> {
  if (typeof window === 'undefined' || !window.nemis) {
    throw new Error('Desktop bridge unavailable (running outside Electron).');
  }
  return window.nemis.system.getVersion();
}
```

- [ ] **Step 9: Create `apps/desktop/renderer/hooks/useAppVersion.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';
import { getAppVersion } from '@/services/system';

interface AppVersionState {
  version: string | null;
  error: string | null;
}

export function useAppVersion(): AppVersionState {
  const [state, setState] = useState<AppVersionState>({ version: null, error: null });

  useEffect(() => {
    let cancelled = false;
    getAppVersion()
      .then((version) => {
        if (!cancelled) setState({ version, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            version: null,
            error: err instanceof Error ? err.message : 'Failed to load version.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
```

- [ ] **Step 10: Create `apps/desktop/renderer/layouts/Sidebar.tsx`**

```tsx
import { GraduationCap, LayoutDashboard, School, Settings, Users } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Schools', icon: School },
  { label: 'Students', icon: Users },
  { label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-primary text-white">
      <div className="flex items-center gap-3 px-6 py-6">
        <GraduationCap className="h-8 w-8" aria-hidden />
        <div>
          <p className="text-sm font-semibold tracking-wide">NEMIS</p>
          <p className="text-xs text-white/60">Desktop Client</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-4" aria-label="Main navigation">
        {NAV_ITEMS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            disabled
            className="flex w-full items-center gap-3 rounded-full px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      <p className="px-6 py-4 text-xs text-white/40">Phase 1 — Foundation</p>
    </aside>
  );
}
```

- [ ] **Step 11: Create `apps/desktop/renderer/layouts/Header.tsx`**

```tsx
export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
      <h1 className="text-lg font-semibold text-primary">
        National Education Management Information System
      </h1>
      <span className="rounded-full bg-slate-100 px-4 py-1 text-xs text-slate-500">
        Foundation build
      </span>
    </header>
  );
}
```

- [ ] **Step 12: Create `apps/desktop/renderer/layouts/AppShell.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Header } from '@/layouts/Header';
import { Sidebar } from '@/layouts/Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 13: Create `apps/desktop/renderer/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { AppShell } from '@/layouts/AppShell';

export const metadata: Metadata = {
  title: 'NEMIS Desktop',
  description: 'Offline-first desktop client for the NEMIS platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 14: Create `apps/desktop/renderer/app/page.tsx`**

```tsx
'use client';

import { useAppVersion } from '@/hooks/useAppVersion';

export default function HomePage() {
  const { version, error } = useAppVersion();

  return (
    <section className="max-w-xl rounded-card border border-slate-200 bg-white p-8">
      <h2 className="text-xl font-semibold text-primary">Welcome to NEMIS Desktop</h2>
      <p className="mt-2 text-sm text-slate-600">
        Offline-first desktop client for the Republic of Liberia&apos;s national education platform.
      </p>
      <dl className="mt-6 text-sm">
        <dt className="font-medium text-slate-500">Application version</dt>
        <dd className="mt-1 text-slate-900" data-testid="app-version">
          {error ? <span className="text-error">{error}</span> : (version ?? 'Loading…')}
        </dd>
      </dl>
    </section>
  );
}
```

- [ ] **Step 15: Create placeholder folders**

Create empty files: `apps/desktop/renderer/components/.gitkeep`, `apps/desktop/renderer/store/.gitkeep`, `apps/desktop/renderer/lib/.gitkeep`.

- [ ] **Step 16: Remove the old scaffold files**

```bash
git rm -r src index.html forge.config.ts forge.env.d.ts vite.main.config.ts vite.preload.config.ts vite.renderer.config.ts tsconfig.json
```

- [ ] **Step 17: Install and run the renderer dev server**

```bash
pnpm install
pnpm --filter @nemis-desktop/app dev:renderer
```

(Run in background.) Then verify:

```powershell
curl.exe -s http://localhost:3010/ | Select-String -Pattern "NEMIS Desktop"
```

Expected: HTML containing "NEMIS Desktop" / "Welcome to NEMIS Desktop". The version field shows the bridge-unavailable error in a plain browser — that is correct behavior. Stop the dev server afterwards.

- [ ] **Step 18: Verify static export builds**

```bash
pnpm --filter @nemis-desktop/app build:renderer
```

Expected: build succeeds; `apps/desktop/renderer/out/index.html` exists.

- [ ] **Step 19: Verify typecheck and lint**

```bash
pnpm --filter @nemis-desktop/app typecheck
pnpm lint
```

Expected: both exit 0 (Next generates `renderer/next-env.d.ts` during Step 17/18, which typecheck needs).

- [ ] **Step 20: Commit**

```bash
git add -A
git commit -m "feat: add Next.js 15 renderer shell with NEMIS design tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Electron main + preload + config + logging (dev mode)

**Files:**

- Modify: `apps/desktop/package.json` (add Electron deps + scripts)
- Create: `apps/desktop/forge.config.ts`, `apps/desktop/vite.main.config.ts`, `apps/desktop/vite.preload.config.ts`, `apps/desktop/tsconfig.json`
- Create: `apps/desktop/electron/config/env.ts`, `apps/desktop/electron/services/logger.ts`, `apps/desktop/electron/windows/mainWindow.ts`, `apps/desktop/electron/main/main.ts`, `apps/desktop/electron/preload/preload.ts` (stub)
- Create: `apps/desktop/.env.example`

**Interfaces:**

- Consumes: Task 4's `dev:renderer` script and port 3010; `ConfigurationError` from `@nemis-desktop/shared`.
- Produces:
  - `loadConfig(): AppConfig` where `interface AppConfig { readonly isDev: boolean; readonly rendererDevUrl: string; readonly logLevel: LogLevel }` and `type LogLevel = 'debug' | 'info' | 'warn' | 'error'` (from `electron/config/env.ts`).
  - `initLogger(options: { isDev: boolean; level: LogLevel }): void` and `logger` (electron-log instance) from `electron/services/logger.ts`.
  - `createMainWindow(config: AppConfig): BrowserWindow` from `electron/windows/mainWindow.ts`.
  - `pnpm dev` (root) launches Next dev + Electron together.
  - Path alias `@app/*` → `electron/*` (tsconfig paths + Vite resolve alias).

- [ ] **Step 1: Add Electron dependencies and scripts to `apps/desktop/package.json`**

Merge into the existing file (keep everything from Task 4):

```json
{
  "scripts": {
    "dev": "concurrently -k -s first -n renderer,electron \"pnpm run dev:renderer\" \"pnpm run dev:electron\"",
    "dev:renderer": "next dev renderer -p 3010",
    "dev:electron": "wait-on tcp:3010 && electron-forge start",
    "start": "electron-forge start",
    "build:renderer": "next build renderer",
    "package": "pnpm run build:renderer && electron-forge package",
    "make": "pnpm run build:renderer && electron-forge make",
    "typecheck": "tsc --noEmit && tsc --noEmit -p renderer/tsconfig.json"
  },
  "dependencies": {
    "dotenv": "^16.4.7",
    "electron-log": "^5.2.4",
    "electron-squirrel-startup": "^1.0.1"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.11.2",
    "@electron-forge/maker-deb": "^7.11.2",
    "@electron-forge/maker-rpm": "^7.11.2",
    "@electron-forge/maker-squirrel": "^7.11.2",
    "@electron-forge/maker-zip": "^7.11.2",
    "@electron-forge/plugin-auto-unpack-natives": "^7.11.2",
    "@electron-forge/plugin-fuses": "^7.11.2",
    "@electron-forge/plugin-vite": "^7.11.2",
    "@electron/fuses": "^1.8.0",
    "@types/electron-squirrel-startup": "^1.0.2",
    "concurrently": "^9.1.2",
    "electron": "43.1.0",
    "vite": "^5.4.21",
    "wait-on": "^8.0.2"
  }
}
```

Note the `typecheck` script now covers both the electron tsconfig (Step 5) and the renderer tsconfig.

- [ ] **Step 2: Create `apps/desktop/forge.config.ts`**

```ts
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'nemis-desktop',
    executableName: 'nemis-desktop',
    asar: true,
    extraResource: ['./renderer/out'],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ name: 'nemis_desktop', setupExe: 'nemis-desktop-setup.exe' }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
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
```

(`renderer: []` — Next.js owns the renderer build. `extraResource: ['./renderer/out']` ships the static export to `<resources>/out` in packaged builds, used by Task 8.)

- [ ] **Step 3: Create `apps/desktop/vite.main.config.ts`**

```ts
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'electron'),
    },
  },
});
```

- [ ] **Step 4: Create `apps/desktop/vite.preload.config.ts`**

```ts
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'electron'),
    },
  },
});
```

- [ ] **Step 5: Create `apps/desktop/tsconfig.json`** (electron + build configs)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "@app/*": ["electron/*"]
    }
  },
  "include": [
    "electron/**/*.ts",
    "forge.config.ts",
    "vite.main.config.ts",
    "vite.preload.config.ts"
  ]
}
```

- [ ] **Step 6: Create `apps/desktop/electron/config/env.ts`**

```ts
import path from 'node:path';
import { app } from 'electron';
import dotenv from 'dotenv';
import { ConfigurationError } from '@nemis-desktop/shared';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  readonly isDev: boolean;
  readonly rendererDevUrl: string;
  readonly logLevel: LogLevel;
}

let cachedConfig: AppConfig | null = null;

/**
 * Loads and validates configuration once per process.
 * Env files are optional overrides; safe defaults are built in.
 * Throws ConfigurationError on invalid values (fail fast at startup).
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const isDev = !app.isPackaged;
  const envFile = isDev ? '.env.development' : '.env.production';
  dotenv.config({ path: path.join(app.getAppPath(), envFile) });

  const logLevel = process.env.NEMIS_LOG_LEVEL ?? (isDev ? 'debug' : 'info');
  if (!isLogLevel(logLevel)) {
    throw new ConfigurationError(
      `Invalid NEMIS_LOG_LEVEL "${logLevel}". Expected one of: ${LOG_LEVELS.join(', ')}.`,
    );
  }

  cachedConfig = {
    isDev,
    rendererDevUrl: process.env.NEMIS_RENDERER_DEV_URL ?? 'http://localhost:3010',
    logLevel,
  };
  return cachedConfig;
}

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}
```

- [ ] **Step 7: Create `apps/desktop/.env.example`**

```ini
# Optional overrides — safe defaults are built into electron/config/env.ts.
# Copy to .env.development (dev) or .env.production (packaged) to override.
NEMIS_LOG_LEVEL=debug
NEMIS_RENDERER_DEV_URL=http://localhost:3010
```

- [ ] **Step 8: Create `apps/desktop/electron/services/logger.ts`**

```ts
import log from 'electron-log/main';
import type { LogLevel } from '@app/config/env';

/**
 * Console transport always on (development visibility).
 * File transport only in production builds.
 */
export function initLogger(options: { isDev: boolean; level: LogLevel }): void {
  log.initialize();
  log.transports.console.level = options.level;
  log.transports.file.level = options.isDev ? false : options.level;
}

export const logger = log;
```

- [ ] **Step 9: Create `apps/desktop/electron/windows/mainWindow.ts`**

```ts
import path from 'node:path';
import { BrowserWindow } from 'electron';
import type { AppConfig } from '@app/config/env';

export const RENDERER_ORIGIN = 'app://renderer/';

export function createMainWindow(config: AppConfig): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#020833',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  if (config.isDev) {
    void window.loadURL(config.rendererDevUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadURL(RENDERER_ORIGIN);
  }

  return window;
}
```

- [ ] **Step 10: Create `apps/desktop/electron/preload/preload.ts`** (stub — full bridge in Task 6)

```ts
// Preload runs sandboxed with contextIsolation. The typed window.nemis
// bridge is registered here (see Task 6).
```

- [ ] **Step 11: Create `apps/desktop/electron/main/main.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { loadConfig } from '@app/config/env';
import { initLogger, logger } from '@app/services/logger';
import { createMainWindow } from '@app/windows/mainWindow';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const config = loadConfig();

app.whenReady().then(() => {
  initLogger({ isDev: config.isDev, level: config.logLevel });
  logger.info(`NEMIS Desktop starting (dev=${config.isDev})`);

  createMainWindow(config);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(config);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 12: Install and typecheck**

```bash
pnpm install
pnpm --filter @nemis-desktop/app typecheck
pnpm lint
```

Expected: both pass with exit 0.

- [ ] **Step 13: Launch dev mode and verify the Electron window**

```bash
pnpm dev
```

(Run in background; allow ~30-60s for Next to compile.) Expected: an Electron window opens showing the NEMIS shell (dark `#020833` sidebar, header, welcome card). The version field shows "Desktop bridge unavailable" — correct until Task 6 wires IPC. Stop the process afterwards.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: add Electron main/preload with typed config, logging, and dev orchestration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: IPC vertical slice — `window.nemis.system.getVersion()`

**Files:**

- Create: `apps/desktop/electron/services/systemService.ts`, `apps/desktop/electron/security/validateIpc.ts`, `apps/desktop/electron/ipc/registrar.ts`
- Overwrite: `apps/desktop/electron/preload/preload.ts` (full bridge)
- Modify: `apps/desktop/electron/main/main.ts` (register handlers)

**Interfaces:**

- Consumes: `IpcChannels`, `IpcChannel`, `IpcResult`, `NemisApi` from `@nemis-desktop/types`; `IPCError`, `toIpcErrorPayload` from `@nemis-desktop/shared`; `logger` from `@app/services/logger`.
- Produces:
  - `getAppVersion(): string` from `electron/services/systemService.ts`.
  - `assertNoArgs(args: readonly unknown[]): void` from `electron/security/validateIpc.ts` (throws `IPCError`).
  - `registerIpcHandlers(): void` from `electron/ipc/registrar.ts` — every handler wrapped in validation + error mapping, always returning `IpcResult<T>`.
  - Renderer-visible `window.nemis: NemisApi` via contextBridge.

- [ ] **Step 1: Create `apps/desktop/electron/services/systemService.ts`**

```ts
import { app } from 'electron';

export function getAppVersion(): string {
  return app.getVersion();
}
```

- [ ] **Step 2: Create `apps/desktop/electron/security/validateIpc.ts`**

```ts
import { IPCError } from '@nemis-desktop/shared';

/** Rejects IPC calls that pass unexpected arguments. Never trust renderer input. */
export function assertNoArgs(args: readonly unknown[]): void {
  if (args.length > 0) {
    throw new IPCError(`Expected no arguments, received ${args.length}.`);
  }
}
```

- [ ] **Step 3: Create `apps/desktop/electron/ipc/registrar.ts`**

```ts
import { ipcMain } from 'electron';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcChannel, IpcResult } from '@nemis-desktop/types';
import { toIpcErrorPayload } from '@nemis-desktop/shared';
import { logger } from '@app/services/logger';
import { assertNoArgs } from '@app/security/validateIpc';
import { getAppVersion } from '@app/services/systemService';

type Validator = (args: readonly unknown[]) => void;

export function registerIpcHandlers(): void {
  handle(IpcChannels.SYSTEM_GET_VERSION, assertNoArgs, () => getAppVersion());
}

/**
 * Binds a channel with mandatory input validation and error mapping.
 * Handlers never leak raw errors: everything crosses IPC as IpcResult<T>.
 */
function handle<T>(channel: IpcChannel, validate: Validator, handler: () => T | Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      validate(args);
      return { ok: true, data: await handler() };
    } catch (error) {
      logger.error(`IPC handler failed for channel "${channel}"`, error);
      return { ok: false, error: toIpcErrorPayload(error) };
    }
  });
}
```

- [ ] **Step 4: Overwrite `apps/desktop/electron/preload/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcChannel, IpcResult, NemisApi } from '@nemis-desktop/types';

async function invoke<T>(channel: IpcChannel): Promise<T> {
  const result = (await ipcRenderer.invoke(channel)) as IpcResult<T>;
  if (!result.ok) {
    throw new Error(`[${result.error.code}] ${result.error.message}`);
  }
  return result.data;
}

const nemisApi: NemisApi = {
  system: {
    getVersion: () => invoke<string>(IpcChannels.SYSTEM_GET_VERSION),
  },
};

contextBridge.exposeInMainWorld('nemis', nemisApi);
```

- [ ] **Step 5: Register handlers in `apps/desktop/electron/main/main.ts`**

Add the import and call `registerIpcHandlers()` before `createMainWindow(config)`:

```ts
import { registerIpcHandlers } from '@app/ipc/registrar';
```

Inside `app.whenReady().then(() => { ... })`, after `logger.info(...)`:

```ts
registerIpcHandlers();
```

- [ ] **Step 6: Typecheck and lint**

```bash
pnpm --filter @nemis-desktop/app typecheck
pnpm lint
```

Expected: exit 0.

- [ ] **Step 7: Verify the IPC round-trip**

```bash
pnpm dev
```

(Background.) Expected: the welcome card's "Application version" now shows `1.0.0` (from `app.getVersion()`), not the bridge-unavailable error. Stop the process.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add typed IPC architecture with system.getVersion proof endpoint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Security hardening — navigation guards and Node-isolation verification

**Files:**

- Create: `apps/desktop/electron/security/hardenWindow.ts`
- Modify: `apps/desktop/electron/main/main.ts`

**Interfaces:**

- Consumes: `logger` from `@app/services/logger`; `RENDERER_ORIGIN` from `@app/windows/mainWindow`; `AppConfig`.
- Produces: `hardenWebContents(contents: WebContents, allowedUrlPrefixes: readonly string[]): void` — denies all `window.open`, blocks navigation outside allowed prefixes.

- [ ] **Step 1: Create `apps/desktop/electron/security/hardenWindow.ts`**

```ts
import type { WebContents } from 'electron';
import { logger } from '@app/services/logger';

/**
 * Locks a WebContents down to the application's own origins:
 * denies every new-window request and blocks navigation to
 * any URL that does not start with an allowed prefix.
 */
export function hardenWebContents(
  contents: WebContents,
  allowedUrlPrefixes: readonly string[],
): void {
  contents.setWindowOpenHandler(({ url }) => {
    logger.warn(`Blocked attempt to open a new window: ${url}`);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    const allowed = allowedUrlPrefixes.some((prefix) => url.startsWith(prefix));
    if (!allowed) {
      logger.warn(`Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });
}
```

- [ ] **Step 2: Apply hardening in `apps/desktop/electron/main/main.ts`**

Add imports:

```ts
import { hardenWebContents } from '@app/security/hardenWindow';
import { createMainWindow, RENDERER_ORIGIN } from '@app/windows/mainWindow';
```

(Replace the existing `createMainWindow` import line.) Then change window creation inside `whenReady` and the `activate` handler to:

```ts
const allowedUrlPrefixes = config.isDev ? [config.rendererDevUrl] : [RENDERER_ORIGIN];

const mainWindow = createMainWindow(config);
hardenWebContents(mainWindow.webContents, allowedUrlPrefixes);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const window = createMainWindow(config);
    hardenWebContents(window.webContents, allowedUrlPrefixes);
  }
});
```

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm --filter @nemis-desktop/app typecheck
pnpm lint
```

Expected: exit 0.

- [ ] **Step 4: Verify Node isolation and guards in the running app**

```bash
pnpm dev
```

In the detached DevTools console of the Electron window, run:

```js
({
  req: typeof window.require,
  proc: typeof window.process,
  nemis: typeof window.nemis,
  opened: window.open('https://example.com'),
});
```

Expected: `req: 'undefined'`, `proc: 'undefined'`, `nemis: 'object'`, `opened: null`, and the main-process log shows `Blocked attempt to open a new window: https://example.com/`. Stop the process.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: harden renderer — deny popups, restrict navigation, verify node isolation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Production serving (`app://` protocol) and packaged build

**Files:**

- Create: `apps/desktop/electron/security/csp.ts`, `apps/desktop/electron/main/appProtocol.ts`
- Modify: `apps/desktop/electron/main/main.ts`

**Interfaces:**

- Consumes: `RENDERER_ORIGIN` (= `'app://renderer/'`) from `@app/windows/mainWindow`; `logger`.
- Produces:
  - `PRODUCTION_CSP: string` and `withCsp(response: Response): Response` from `electron/security/csp.ts`.
  - `registerAppProtocolScheme(): void` (must run before `app.whenReady`) and `registerAppProtocolHandler(): void` (after ready, production only) from `electron/main/appProtocol.ts`.

- [ ] **Step 1: Create `apps/desktop/electron/security/csp.ts`**

```ts
/**
 * Applied to every production app:// response.
 * 'unsafe-inline' for scripts is required by Next.js static-export
 * hydration payloads — tracked as accepted Phase 1 debt.
 */
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ');

export function withCsp(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', PRODUCTION_CSP);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
```

- [ ] **Step 2: Create `apps/desktop/electron/main/appProtocol.ts`**

```ts
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { withCsp } from '@app/security/csp';
import { logger } from '@app/services/logger';

export const APP_SCHEME = 'app';

/** Must be called before app.whenReady(). */
export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/**
 * Serves the Next.js static export (shipped via extraResource to
 * <resources>/out) on app://renderer/. trailingSlash exports mean every
 * route maps to <route>/index.html.
 */
export function registerAppProtocolHandler(): void {
  const rendererRoot = path.join(process.resourcesPath, 'out');

  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    let relativePath = decodeURIComponent(pathname);
    if (relativePath.endsWith('/')) {
      relativePath += 'index.html';
    }

    const filePath = path.normalize(path.join(rendererRoot, relativePath));
    if (filePath !== rendererRoot && !filePath.startsWith(rendererRoot + path.sep)) {
      logger.warn(`Blocked app:// request outside renderer root: ${request.url}`);
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const response = await net.fetch(pathToFileURL(filePath).toString());
      return withCsp(response);
    } catch (error) {
      logger.warn(`app:// asset not found: ${request.url}`, error);
      return new Response('Not Found', { status: 404 });
    }
  });
}
```

- [ ] **Step 3: Wire the protocol into `apps/desktop/electron/main/main.ts`**

Add import:

```ts
import { registerAppProtocolScheme, registerAppProtocolHandler } from '@app/main/appProtocol';
```

Immediately after `const config = loadConfig();` (before `whenReady`):

```ts
if (!config.isDev) {
  registerAppProtocolScheme();
}
```

Inside `whenReady`, before `registerIpcHandlers();`:

```ts
if (!config.isDev) {
  registerAppProtocolHandler();
}
```

- [ ] **Step 4: Typecheck and lint**

```bash
pnpm --filter @nemis-desktop/app typecheck
pnpm lint
```

Expected: exit 0.

- [ ] **Step 5: Build a packaged app and run it**

```bash
pnpm --filter @nemis-desktop/app package
```

Expected: `next build renderer` succeeds, then Forge packages to `apps/desktop/out/nemis-desktop-win32-x64/`. Run the executable:

```powershell
& "apps\desktop\out\nemis-desktop-win32-x64\nemis-desktop.exe"
```

Expected: window opens from the static export (no dev server running), shell renders with styles, version shows `1.0.0`. Close the app.

- [ ] **Step 6: Build distributables**

```bash
pnpm make
```

Expected: Squirrel setup produced under `apps/desktop/out/make/squirrel.windows/x64/` (this step takes several minutes).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: serve static renderer over app:// protocol with CSP; production packaging

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Docs, CLAUDE.md alignment, and final acceptance sweep

**Files:**

- Modify: `CLAUDE.md` (primary color `#000e21` → `#020833`; replace the outdated `src/` Code Organization section with the actual workspace tree)
- Overwrite: `README.md` (real dev/build instructions)
- Create: `docs/architecture.md`

**Interfaces:**

- Consumes: everything built in Tasks 1-8.
- Produces: accurate onboarding docs; all acceptance criteria verified in one sweep.

- [ ] **Step 1: Update `CLAUDE.md`**

Edit two places only (surgical changes):

1. Replace `#000e21` with `#020833` (Primary Color).
2. Replace the `# Code Organization` section's `src/...` tree with:

```
apps/

    desktop/

        electron/

            main/
            preload/
            ipc/
            security/
            windows/
            services/
            config/

        renderer/

            app/
            components/
            layouts/
            hooks/
            store/
            lib/
            services/
            styles/
            types/

packages/

    shared/
    types/
    ui/

docs/
```

- [ ] **Step 2: Overwrite `README.md`**

```markdown
# NEMIS Desktop

Offline-first Electron desktop client for NEMIS (National Education Management
Information System), the national education platform of the Republic of Liberia.
The desktop client extends the production web platform; it does not replace it.

## Workspace

pnpm workspace:

- `apps/desktop` — the Electron application (Forge + Vite for main/preload, Next.js 15 static export for the renderer)
- `packages/types` — shared IPC contract types
- `packages/shared` — error taxonomy and constants
- `packages/ui` — shared UI components (placeholder in Phase 1)

## Prerequisites

- Node.js >= 22
- pnpm >= 10

## Commands

| Command             | Description                                         |
| ------------------- | --------------------------------------------------- |
| `pnpm install`      | Install all workspace dependencies                  |
| `pnpm dev`          | Start Next.js dev server (port 3010) + Electron     |
| `pnpm build`        | Static-export the renderer and package the app      |
| `pnpm make`         | Build platform distributables (Squirrel on Windows) |
| `pnpm typecheck`    | TypeScript strict checks across the workspace       |
| `pnpm lint`         | ESLint across the workspace                         |
| `pnpm format:check` | Prettier check                                      |

## Architecture

See `docs/architecture.md` and the Phase 1 spec in
`docs/superpowers/specs/2026-07-14-phase1-foundation-design.md`.
```

- [ ] **Step 3: Create `docs/architecture.md`**

```markdown
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

All IPC is typed by `@nemis-desktop/types`:

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
```

- [ ] **Step 4: Full acceptance sweep**

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @nemis-desktop/app build:renderer
```

Expected: all exit 0. (Electron launch, IPC round-trip, node isolation, and packaged build were verified in Tasks 5-8; re-run `pnpm dev` for a final visual confirmation if anything changed since.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: align CLAUDE.md with Phase 1 structure; add README and architecture doc

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Acceptance Criteria (from the spec — verify all before declaring done)

- [ ] Electron launches; Next.js renderer loads (dev and packaged prod)
- [ ] TailwindCSS styles render; shell layout (sidebar/header/content) visible
- [ ] `window.nemis.system.getVersion()` round-trips and displays the version
- [ ] Node APIs inaccessible from the renderer (`window.require`/`window.process` undefined)
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm --filter @nemis-desktop/app package` produces a working app; `pnpm make` succeeds

## Known Technical Debt (accepted for Phase 1)

- `packages/ui` is an empty compilable stub
- Fixed renderer dev port (3010)
- No automated test harness yet (arrives with the first logic-bearing phase)
- CSP allows `'unsafe-inline'` scripts (Next.js static-export hydration requirement)
- ESLint runs non-type-aware (fast); type-aware linting deferred
- No single-instance lock, auto-update, or crash reporting yet
