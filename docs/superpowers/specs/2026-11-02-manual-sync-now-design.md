# Manual "Sync now" — design

Date: 2026-11-02 · Repo: desktop-client-nemis only (no server change)

## Intent

Sync on the desktop app runs on a schedule (interval, reconnect, login). Alvin
wants a user to be able to press a button and have the device sync **right
now**: send everything waiting on this computer and bring down what changed on
the server.

## What exists today, and why it does not count

- `IpcChannels.SYNC_RUN` (`electron/ipc/handlers/shared/sync.ts`) calls
  `worker.releaseBackoff({ manual: true })` then `worker.syncActive()`.
- `syncActive()` **returns immediately if a cycle is already running**
  (`#running` guard), so a click during a scheduled cycle does nothing.
- A cycle only **pulls** if 5 minutes passed since the last pull or it just
  pushed something (`pullDue`, `DesktopSyncWorker.ts` ~l.134). A click with
  nothing queued usually fetches nothing.
- A failed cycle **throws**, so the IPC call rejects and the renderer swallows
  it (`.catch(refresh)`).
- The only always-visible trigger is the status bar's "Last synced …" text
  (`components/shell/StatusBar.tsx`), which is a `<button>` styled as plain
  text: no affordance, no spinner, no result. A visible "Sync now" exists only
  on the Pending changes page.

## Goals

1. One click = a full, forced cycle: push everything eligible **and** pull,
   even if a scheduled cycle is mid-flight (wait for it, then run).
2. A clearly visible **Sync now** button in the status bar, on every portal
   (the shared `StatusBar` is mounted by all five portal layouts).
3. The person sees it working (spinning icon, "Syncing…", button disabled
   against double-clicks) and sees the outcome as a toast.

## Non-goals

- No change to the schedule, backoff schedule, or dead-letter rules.
- No server change; no new IPC channel or status field.
- No redesign of the Pending changes or Sync conflicts pages. They call
  `runSync()` too and get the stronger behaviour for free.
- Pre-existing footer quirks (`h-7 py-8`, whole footer `role="status"`) stay.

## Anti-goals

- Clicking during a server outage must not burn retry budgets — keep
  `releaseBackoff({ manual: true })` exactly as it is.
- The IPC call must not hang on a dead server.
- No error must ever reach the user as a raw `[CODE]` string or vanish silently.

## Design

### Main process

`SYNC_RUN` handler becomes:

```ts
worker.releaseBackoff({ manual: true });
await worker.pullNow();          // waits for a running cycle, forces push+pull, 30 s cap, never throws
return worker.getStatus();
```

`pullNow()` already exists for exactly this (waits on `#cycle`, resets
`#lastPullAt`, runs a full cycle, bounded by a timeout, never throws). A
failed cycle has already written `syncStatus='failed'` to `sync_metadata`, so
`getStatus()` reports it. On timeout the cycle carries on and `getStatus()`
reports `status: 'syncing'`; the status bar's 5 s poll picks up the end.
`SYNC_RUN`'s contract (returns `DesktopSyncStatus`) is unchanged.

### Renderer — `StatusBar`

- The "Last synced …" label becomes plain text (keeps its `RefreshCw` icon
  removed or swapped for a neutral one — builder's call).
- A new **Sync now** button next to it: small bordered pill, `RefreshCw` icon
  that spins (`animate-spin`) while syncing, text "Sync now" / "Syncing…",
  `disabled` + `aria-busy` while a manual sync is in flight (local state, so a
  second click cannot start a second call). Accessible name "Sync now".
- It stays clickable while offline: the backend is the authority on
  connectivity, and the click gives feedback rather than a dead button.
- After `runSync()` resolves, `applyStatus(status)` as today, then one toast
  via the notification store (`useNotificationStore()`; `ToastHost` is mounted
  in every portal layout):

| Returned status | Toast | Message |
|---|---|---|
| `isOnline === false` | warning | "You're offline. Your changes are saved on this computer and will sync when you reconnect." |
| `status === 'failed'` | error | "Sync could not finish. Your changes are still saved on this computer and will be retried." |
| `status === 'syncing'` | info | "Still syncing in the background. This can take a moment on a slow connection." |
| otherwise, `pending > 0` | info | "Synced. N change(s) are still waiting and will be retried." (en-US separators, singular/plural) |
| otherwise | success | "Everything is up to date." |

- If `runSync()` rejects (no workspace, bridge error): error toast with the
  same "could not finish" sentence, then `refresh()`.

### Known edge (accepted)

`syncStatus` is reset to `idle` only by a successful pull
(`ProvisioningImporter`). The pull runs only once the outbox is empty. If rows
one failure from dead-lettering keep their backoff timer (deliberately, see
anti-goals), the forced cycle pushes the rest but skips the pull, and an
earlier `failed` stays. The toast then says "could not finish". That is accurate,
because work is still outstanding, so we accept it.

## Left to the builder

Exact pill classes (match the footer's 11px slate palette), icon for the
plain label, test structure. Tests: handler test asserts release-then-pullNow
order and returns status; StatusBar tests cover the button's busy state and
each toast row.
