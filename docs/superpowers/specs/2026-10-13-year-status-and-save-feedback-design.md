# Year Status Guard and Setup Save Feedback — Design

Date: 2026-10-13
Branch: `year-status-and-save-feedback` (from `main` at 3f0e5dc; first commit 41934c3 = Alvin's own
Active/Inactive badge + `xl` Grading Config drawer edits, committed as-is)
Scope: desktop-client-nemis renderer, school-admin Academic Grading setup drawers only.

## Goal

1. **Year status guard.** In the Academic Years drawer's edit view, Set current / Close / Archive /
   Restore apply immediately and silently discard unsaved edits to the year's code and dates.
   Disable them while the form has unsaved changes, and say why.
2. **No silent failed saves.** The setup screens that call `sharedBridge.saveSchoolAdminRecord` /
   `deleteSchoolAdminRecord` directly give no feedback when a save fails. Give them the same toast
   feedback the Years and Terms drawers already get from the view-model command pipeline.

**Why:** Alvin chose both fixes after the drawer work's final reviews flagged them (2026-10-13).

## Non-goals

- No change to the Years/Terms drawers' save feedback — they already toast via
  `executeCommand` (`packages/presentation/src/core/async-runner.ts`), which calls
  `notifications.success/error`.
- No change to screens outside Academic Grading that call the bridge directly (finance, messaging,
  notifications, teacher grades, `SchoolAdminModulePages`).
- No change to save payloads, lifecycle rules, view-model, IPC or bridge code.
- The year status buttons' visibility rules and `window.confirm` prompts are unchanged.

## Current state

- Toasts: `useNotificationStore()` (`lib/presentation/hooks/shared.ts`) returns the presentation
  layer's `NotificationStore` with `success(message)`, `info`, `warning`, `error(message)`;
  `ToastHost` is mounted in `app/government/school-admin/layout.tsx`.
- IPC errors reach the renderer as `Error`s whose message is `[CODE] text`;
  `lib/errors/parseIpcError.ts` → `parseIpcError(err): { code, message } | null`.
- Silent sites (no catch, no feedback):
  - `components/academic-grading/GradeEntryWindowsDrawer.tsx` — `createWindow` (try/finally only),
    `transition` (Open / Close / Publish / Reopen), `confirmUnpublish` (try/finally only).
  - `components/academic-grading/GradingPeriodsPanel.tsx` — `submit`, `remove`, `autoSetup`
    (try/finally only; saves periods one at a time in a loop).
- `components/academic-grading/GradingConfigDrawer.tsx` already catches and shows an inline red
  box, but with the raw `cause.message` (so `[VALIDATION_FAILED] …` text), and gives no success
  feedback (it just closes).
- `components/academic-grading/AcademicYearsDrawer.tsx` edit view: a form (code, start date, end
  date) and, below it, a Status section whose buttons call `setCurrent` / `setStatus` immediately.

## Design

### 1. Year status guard (`AcademicYearsDrawer.tsx`)

In `AcademicYearsManager`, derive

```ts
const dirty =
  editing !== null &&
  (code !== editing.code || startDate !== editing.startDate || endDate !== editing.endDate);
```

In the edit view's Status section:
- Set current / Close / Archive / Restore get `disabled={dirty}` (their show/hide conditions are
  unchanged).
- When `dirty`, render above the buttons:
  `<p role="status" className="text-sm text-amber-700">Save or cancel your changes before changing this year's status.</p>`
- Reverting the fields to their saved values clears `dirty` and re-enables the buttons. Saving
  returns to the list (existing behaviour), so the next edit starts clean.

### 2. `useSaveFeedback` helper

New `components/academic-grading/save-feedback.ts`:

```ts
export type SaveOutcome<T> = { ok: true; value: T } | { ok: false };

/** Readable detail of a failed save: the IPC message without its `[CODE]` prefix, else the
 * error's own message, else ''. */
export function describeSaveError(error: unknown): string;

/** Runs a setup-screen save with toast feedback: success → `notifications.success(success)`;
 * failure → `notifications.error(failure + (detail ? ' ' + detail : ''))`. Never throws. */
export function useSaveFeedback(): <T>(
  action: () => Promise<T>,
  messages: { success: string; failure: string },
) => Promise<SaveOutcome<T>>;
```

`describeSaveError`: `parseIpcError(error)?.message.trim()` if non-empty; else, for an `Error`
whose message does not start with `[`, its trimmed message; else `''`. (A bracketed message that
`parseIpcError` didn't recognise is not shown raw.)

`useSaveFeedback` reads the store with `useNotificationStore()` and returns a `useCallback`-stable
runner.

### 3. Wiring

Messages are verbatim. On failure every screen stays where it is (form or confirmation view still
open, values intact) so the admin can retry.

**`GradeEntryWindowsDrawer.tsx`** (wrap each `saveSchoolAdminRecord` + reload):

| Action | success | failure |
|---|---|---|
| Create | `Grade entry window created.` | `Couldn't create the window.` |
| Open Window | `Window opened.` | `Couldn't open the window.` |
| Close Window | `Window closed.` | `Couldn't close the window.` |
| Publish Grades | `Grades published.` | `Couldn't publish the grades.` |
| Reopen | `Window reopened.` | `Couldn't reopen the window.` |
| Unpublish | `Grades unpublished.` | `Couldn't unpublish the grades.` |

- Create: return to the list (and reset the form) only when `ok`. `creating` still resets in
  `finally`.
- `transition(win, changes, messages)` takes the message pair; it reloads the list only when `ok`.
- Unpublish: return to the list only when `ok`; `unpublishing` still resets in `finally`.

**`GradingPeriodsPanel.tsx`:**

| Action | success | failure |
|---|---|---|
| Save period (create or edit) | `Period saved.` | `Couldn't save the period.` |
| Delete period | `Period deleted.` | `Couldn't delete the period.` |

- `submit`: `resetForm()` + reload only when `ok`.
- `remove`: reload only when `ok` (the `window.confirm` stays before the save).
- `autoSetup`: keep saving one period at a time; stop at the first failure. It does **not** use
  `runSave` per period (that would toast once per period). Instead it wraps the loop itself:
  - all saved → `notifications.success('Assessment periods created.')`
  - failure after `n` of `count` saved → `notifications.error(`Couldn't finish setting up periods — ${n} of ${count} were created.` + (detail ? ' ' + detail : ''))`, with `detail = describeSaveError(err)`.
  - Reload the term's periods in both cases (so partially created periods show). `settingUp`
    still resets in `finally`.

**`GradingConfigDrawer.tsx`:**
- On failure keep the inline red box, but its text becomes
  `describeSaveError(cause) || 'Unable to save configuration.'`.
- On success add `notifications.success('Grading configuration saved.')` before `onClose()`.
- It does not use `runSave` (it keeps its inline error), but uses `describeSaveError` and
  `useNotificationStore` directly.

## Error handling summary

After this change every save on the Academic Grading page reports its outcome: Years/Terms via the
command pipeline (unchanged), Windows/Periods via `useSaveFeedback`, Grading Configuration via its
inline box plus a success toast. No save throws an unhandled rejection from these screens.

## Testing

Renderer Vitest. Toasts are asserted through the real notification store: render inside
`PresentationProvider` (via `renderWithLayer` from `setup-test-support.tsx`) and include
`<ToastHost />` in the rendered tree, or read the store state — the plan picks one per test file
and uses it consistently.

- **`save-feedback.test.ts(x)`:** `describeSaveError` — `[VALIDATION_FAILED] Dates overlap` →
  `Dates overlap`; plain `Error('Disk full')` → `Disk full`; `Error('[WEIRD] x')` → `''`;
  non-Error → `''`. `useSaveFeedback` — success toasts the success text and returns
  `{ ok: true, value }`; an IPC failure toasts `"<failure> <detail>"` and returns `{ ok: false }`;
  a detail-less failure toasts just `failure`; the runner never throws.
- **`AcademicYearsDrawer.test.tsx`:** edit an ACTIVE non-current year → buttons enabled, no warning;
  change the code → Set current / Close / Archive disabled and the warning shown; change it back →
  enabled again and the warning gone; existing status tests still pass.
- **`GradeEntryWindowsDrawer.test.tsx`:** a failed Open Window (save rejects with
  `Error('[VALIDATION_FAILED] Window dates overlap')`) shows `Couldn't open the window. Window dates overlap.`
  and the list doesn't reload; a successful Open shows `Window opened.`; a failed Create keeps the
  create view with values; a failed Unpublish keeps the confirmation view.
- **`GradingPeriodsPanel.test.tsx`:** a failed save keeps the form open and toasts
  `Couldn't save the period. …`; a failed delete toasts `Couldn't delete the period.`; auto setup
  failing on the 2nd of 3 saves toasts `Couldn't finish setting up periods — 1 of 3 were created.`
  and reloads.
- **`GradingConfigDrawer`** (new test file if none exists): a failed save shows the readable
  message (no `[CODE]`) inline; a successful save toasts `Grading configuration saved.` and closes.

## Verification (definition of done)

- `pnpm --filter @nemis-desktop/app typecheck` passes; `pnpm lint` exits 0.
- Renderer suite: only the 2 known pre-existing failures (`app/page.test` login, teacher
  `timetable.test`) + the known Sidebar logout unhandled error.

## Manual GUI check (Alvin)

1. Edit a year, change its end date → the status buttons grey out with the warning; undo the change
   → they come back.
2. With the app offline or a forced validation error (e.g. a window whose close date is before its
   open date, if the backend rejects it), an action shows a red toast with a readable reason; a
   normal Open/Publish shows a green toast.
