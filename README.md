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
