# Manual "Sync now" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visible status-bar **Sync now** button that always runs a full push + pull right away and tells the person what happened.

**Architecture:** The main-process `SYNC_RUN` handler switches from `syncActive()` (skips while a cycle runs, pulls only every 5 min, throws on failure) to the existing `pullNow()` (waits for a running cycle, forces push + pull, 30 s cap, never throws). The renderer `StatusBar` gains a real button with busy state, and turns the returned `DesktopSyncStatus` into one toast through the notification store.

**Tech Stack:** Electron main (TypeScript), Next.js renderer (React, lucide-react, Tailwind), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-02-manual-sync-now-design.md`

## Global Constraints

- Keep `worker.releaseBackoff({ manual: true })` before the sync, unchanged (retry-budget guard).
- `SYNC_RUN` still takes no args and returns `DesktopSyncStatus`; no new IPC channel, no type changes.
- Toast copy is fixed by the spec's table (verbatim below in Task 2).
- Counts use en-US thousands separators (`toLocaleString('en-US')`), matching the existing `formatCount` in `StatusBar.tsx`.
- Test command (from repo root): `npx vitest run <paths>`.

## Review Focus

1. **Double click / click during a scheduled cycle** — only one IPC call per click burst; the button is disabled while busy. *(Task 2 test: `disables the button while a sync is running`.)*
2. **Bridge rejects** (no active workspace, IPC error) — error toast, never a raw `[CODE]` string, button re-enabled. *(Task 2 test: `shows an error toast when the sync call fails`.)*
3. **Offline click** — the button stays enabled and gives a warning toast instead of a dead click. *(Task 2 test: offline row.)*
4. **Server hangs** — the handler resolves within `pullNow`'s 30 s cap and reports `syncing`. *(Task 1 relies on `pullNow`'s own timeout; Task 2 test: `syncing` row.)*
5. **Last-synced label still updates other screens** — `applyStatus` is still called with the returned status, so `useRevalidateOnSync` fires. *(Task 2 test: `refreshes the status after a manual sync`.)*

---

### Task 1: `SYNC_RUN` runs a forced, waiting, non-throwing cycle

**Files:**
- Modify: `apps/desktop/electron/ipc/handlers/shared/sync.ts:11-17`
- Test: `apps/desktop/electron/ipc/handlers/shared/sync.test.ts`

**Interfaces:**
- Consumes: `DesktopSyncWorker.releaseBackoff(options?: { manual?: boolean }): void`, `DesktopSyncWorker.pullNow(timeoutMs?: number): Promise<boolean>`, `DesktopSyncWorker.getStatus(): DesktopSyncStatus`.
- Produces: `SYNC_RUN` resolves to `DesktopSyncStatus` and does not reject when the cycle fails.

- [ ] **Step 1: Update the failing test** — rename `releases backoff before a manual sync` to `releases backoff, then forces a full sync, then reports status`. The worker mock has `releaseBackoff`, `pullNow: vi.fn(async () => { order.push('pull'); return true; })`, and `getStatus: vi.fn(() => { order.push('status'); return { pending: 0 }; })`, and **no** `syncActive`. Assert:
  ```ts
  expect(await calls.get(IpcChannels.SYNC_RUN)!.handler()).toEqual({ pending: 0 });
  expect(order).toEqual(['release', 'pull', 'status']);
  expect(worker.releaseBackoff).toHaveBeenCalledWith({ manual: true });
  expect(worker.pullNow).toHaveBeenCalledWith();
  ```
  Add `reports status instead of rejecting when the sync could not finish`: `pullNow` resolves `false`, `getStatus` returns `{ status: 'failed' }`, and the handler resolves to `{ status: 'failed' }`.
- [ ] **Step 2: Run** `npx vitest run apps/desktop/electron/ipc/handlers/shared/sync.test.ts` — expected FAIL (`syncActive is not a function` / order mismatch).
- [ ] **Step 3: Implement** — in the handler, replace `await worker.syncActive();` with `await worker.pullNow();` (default timeout). Update the comment: a person pressing "Sync now" expects everything attempted *and* fresh data; `pullNow` waits for a cycle already running instead of skipping, forces the pull, is time-bounded, and never throws (a failed cycle is reported through `getStatus().status === 'failed'`).
- [ ] **Step 4: Run** the same command — expected PASS (3 tests).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/desktop/electron/ipc/handlers/shared/sync.ts apps/desktop/electron/ipc/handlers/shared/sync.test.ts
  git commit -m "fix(desktop): Sync now waits for a running cycle and always pulls"
  ```

### Task 2: Visible Sync now button with outcome toast

**Files:**
- Modify: `apps/desktop/renderer/components/shell/StatusBar.tsx` (the `<button>` at ~l.75-82, plus a new helper in the same file)
- Test: `apps/desktop/renderer/components/shell/StatusBar.test.tsx`

**Interfaces:**
- Consumes: `nemisBridge.runSync(): Promise<DesktopSyncStatus>` (Task 1 behaviour); `useNotificationStore()` from `../../lib/presentation/hooks/shared`, exposing `success|info|warning|error(message: string): string`.
- Produces: `export function describeManualSync(status: DesktopSyncStatus): { kind: 'success' | 'info' | 'warning' | 'error'; message: string }` in `StatusBar.tsx`. It is exported for tests only.

Exact copy, checked in this order:

| Condition | kind | message |
|---|---|---|
| `!status.isOnline` | warning | `You're offline. Your changes are saved on this computer and will sync when you reconnect.` |
| `status.status === 'failed'` | error | `Sync could not finish. Your changes are still saved on this computer and will be retried.` |
| `status.status === 'syncing'` | info | `Still syncing in the background. This can take a moment on a slow connection.` |
| `status.pending > 0` | info | `Synced. ${formatCount(n)} change is still waiting and will be retried.` / `… changes are still waiting …` |
| otherwise | success | `Everything is up to date.` |

`runSync()` rejecting → `error` with the `failed` sentence, then `refresh()`.

- [ ] **Step 1: Write failing tests.** Extend the `shared` mock with `useNotificationStore: () => notifications`, where `notifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }` is created with `vi.hoisted`. Reset these mocks and `runSync` in `beforeEach`, and expose `runSync` as a hoisted mock in the `nemis-bridge` mock. Tests:
  - `describeManualSync` table test covering all five rows plus singular (`pending: 1` → `1 change is`) and `pending: 1250` → `1,250 changes are`.
  - `shows a Sync now button` — `getByRole('button', { name: 'Sync now' })` is present and enabled while `isOnline` is false in the connectivity store.
  - `disables the button while a sync is running` — `runSync` returns a deferred promise. After a click, the button `toBeDisabled()`, has `aria-busy="true"` and shows `Syncing…`. A second click leaves `runSync` called once. After resolving, the button is enabled again.
  - `shows the outcome toast after a manual sync` — `runSync` resolves `{...status(0), lastSyncAt: '2026-11-02T09:00:00Z'}`, and `notifications.success` is called with `Everything is up to date.`.
  - `shows an error toast when the sync call fails` — `runSync` rejects `new Error('[NO_WORKSPACE] x')`. `notifications.error` is called with the `failed` sentence exactly, and the button is enabled afterwards.
  - `refreshes the status after a manual sync` — after a resolved click with `pending: 3`, the `3 pending changes` link appears.
  - Update the existing first test. "Not synced yet" must still render, now as plain text and no longer inside a button.
- [ ] **Step 2: Run** `npx vitest run apps/desktop/renderer/components/shell/StatusBar.test.tsx` — expected FAIL (no `Sync now` button, `describeManualSync` not exported).
- [ ] **Step 3: Implement.**
  - The sync label becomes a `<span className="flex items-center gap-1.5">` showing `localSync?.status === 'syncing' ? 'Syncing' : syncLabel` with a neutral icon (`History` from lucide-react, `w-3.5 h-3.5`).
  - New `<button type="button">`: a pill in the footer palette (`rounded-full border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-60 disabled:cursor-wait`), with `aria-busy={busy}`, `disabled={busy}`, a `RefreshCw` icon getting `animate-spin` while busy, and the label `busy ? 'Syncing…' : 'Sync now'`. `busy` is local `useState`. The click handler returns early if busy, otherwise sets busy, awaits `runSync()`, then calls `applyStatus` and toasts `describeManualSync(status)`. On rejection it shows the error toast and calls `refresh()`. `finally` clears busy.
- [ ] **Step 4: Run** the same command — expected PASS. Then run `npx vitest run apps/desktop/renderer/components/sync apps/desktop/electron/ipc/handlers/shared/sync.test.ts` , `npx eslint apps/desktop/renderer/components/shell/StatusBar.tsx apps/desktop/electron/ipc/handlers/shared/sync.ts`, and `pnpm --filter @nemis-desktop/app typecheck` — expected PASS / 0 errors.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/desktop/renderer/components/shell/StatusBar.tsx apps/desktop/renderer/components/shell/StatusBar.test.tsx
  git commit -m "feat(desktop): visible Sync now button with outcome toast in the status bar"
  ```
