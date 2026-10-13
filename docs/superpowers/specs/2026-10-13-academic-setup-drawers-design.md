# Academic Setup Drawers — Design

Date: 2026-10-13
Branch: `academic-setup-drawers` (from `main` at c4dc3a0)
Scope: desktop-client-nemis renderer, School Admin role only. No portal-web mirror in this change.

## Goal

Put the school's academic configuration in one place. The Academic Grading page
(`components/academic-grading/AcademicGradingPage.tsx`) already opens Grading
Configuration in a drawer from a FeatureCard. Academic Years, Terms and
Assessment Periods get the same treatment: each becomes a drawer opened from a
FeatureCard on that page. Their standalone pages are deleted.

**Why:** fewer pages; the yearly setup an admin does (grading rules → years →
terms → assessment periods) lives on one screen in dependency order.

## Non-goals

- Grade Entry Windows stays a separate page (`/academic-grading/windows`).
- No changes to view models, IPC, bridge, or data shape. This is a renderer
  reorganisation; all create/update/delete/set-current behaviour is preserved.
- No portal-web parity work.
- Grade Levels, Classes, Subjects, School Profile, Settings pages in
  `AcademicFoundationPages.tsx` are untouched apart from link targets.

## Current state

| Thing | Where it lives today |
|---|---|
| Grading Configuration | `GradingConfigDrawer` opened from a FeatureCard (`activeModal: 'setup'`) |
| Academic Years | `/school-admin/academic-years` → `AcademicYearsPage` in `components/academic/AcademicFoundationPages.tsx`; create/edit in a `Modal` |
| Terms | `/school-admin/terms?yearId=` → `TermsPage` in the same file; create/edit in a `Modal`; year chosen by `initialYearId()` |
| Assessment Periods | `/school-admin/academic-grading/periods` → page wrapping `GradingPeriodsPanel` (form is already inline, no Modal) |
| Sidebar | ACADEMIC SETUP group: Grading System, Academic Years, Terms, Assessment Periods, Subjects |

The app is a static Next export (`output: 'export'`, `trailingSlash: true`), so
there are no server-side redirects. Every link to a deleted route must be
repointed in code.

## Design

### 1. New drawer components

Three new files in `apps/desktop/renderer/components/academic-grading/`:

- **`AcademicYearsDrawer.tsx`** — `Drawer size="xl"` titled "Academic Years".
  Owns the logic currently in `AcademicYearsPage` (view model
  `useAcademicFoundationViewModel`, `loadAcademicYears` on sync, create/update,
  set current, status changes).
- **`TermsDrawer.tsx`** — `Drawer size="xl"` titled "Terms". Owns the logic
  currently in `TermsPage` (year selector, `termsPerYear` from the grading
  config, create/update/delete/set current). Accepts `yearId?: string`;
  the selected year is resolved with the existing `initialYearId()` helper
  (moved here from `AcademicFoundationPages.tsx`, signature unchanged).
- **`AssessmentPeriodsDrawer.tsx`** — `Drawer size="xl"` titled "Assessment
  Periods" wrapping the existing `GradingPeriodsPanel`.

Common props for all three:

```ts
{
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (drawer: SetupDrawer, opts?: { yearId?: string }) => void;
}
```

where `type SetupDrawer = 'setup' | 'years' | 'terms' | 'periods'`.

### 2. Create/edit is a form view inside the drawer, not a Modal

The `Drawer` animates in with a framer-motion transform, and `Modal` has no
portal. A `Modal` rendered inside the drawer would be positioned relative to the
transformed drawer panel, not the viewport. Also, the Drawer's Escape listener
is on `document`, so Escape in the form would close the whole drawer.

Therefore the Years and Terms drawers have two views:

- **List view** — header action button ("Create academic year" / "Create term"),
  the table, empty/error/loading states.
- **Form view** — the create/edit form with Cancel and Save, replacing the list
  in the drawer body. Save success returns to the list. Cancel returns to the
  list. Escape while in the form view returns to the list and does **not** close
  the drawer.

  Mechanism: React's synthetic `stopPropagation` cannot stop the Drawer's
  native bubble-phase `keydown` listener on `document`. While the form view is
  mounted, it registers a native **capture-phase** `keydown` listener on
  `document` (`addEventListener('keydown', fn, true)`). On Escape it calls
  `stopImmediatePropagation()` and returns to the list. Capture-phase
  listeners on `document` run before its bubble-phase listeners, so the
  Drawer never sees the event. The listener is removed when the form view
  unmounts. A test must verify this (Escape in form view → list shown, drawer
  still open, `onClose` not called).

The view resets to the list each time the drawer opens.

### 3. Academic Years table fits the drawer width

At `xl` (`max-w-2xl`, ~672px) the current 6-column table with up to four
per-row action buttons does not fit. The list view shows columns
**Code (+ Current badge) · Period · Status · Terms · Classes · Edit**. The
status actions move into the year's **edit** form view (not the create view)
as a "Status" section below the form fields:

- **Set current** — when `status === 'ACTIVE' && !isCurrent`
- **Close** — when `status === 'ACTIVE' && !isCurrent`
- **Archive** — when `status !== 'ARCHIVED' && !isCurrent`
- **Restore** — when `status !== 'ACTIVE'`

Same conditions and same `window.confirm` prompts as today. Running a status
action returns to the list view on success.

The **Terms** column count is a button (not a Link) that calls
`onNavigate('terms', { yearId })`.

The Terms table (4 columns: Term · Period · Status · Actions, with Edit / Set
current / Delete) fits at `xl` and keeps its per-row actions.

### 4. AcademicGradingPage

- `ModalKey` becomes `SetupDrawer | null`.
- Feature grid goes from 4 to 6 cards, in dependency order:
  1. Grading Configuration → `'setup'` (unchanged)
  2. **Academic Years** → `'years'` ("Manage Years")
  3. **Terms** → `'terms'` ("Manage Terms")
  4. **Assessment Periods** → `'periods'` ("Manage Periods") — was an `href`
  5. Grade Entry Windows → href (unchanged)
  6. Grade Entry → disabled (unchanged)
- `GUIDE_STEPS` gains two steps after "Configure the Grading System":
  "Create the Academic Year" and "Add Terms", so the guide matches the card
  order. Final guide: Configure Grading System → Create Academic Year → Add
  Terms → Create Assessment Periods → Open Grade Entry Windows → Review and
  Publish.
- The page renders all four drawers; only the one matching `activeModal` is open.
- `onNavigate(drawer, opts)` sets `activeModal = drawer` and stores
  `opts.yearId` in a `termsYearId` state passed to `TermsDrawer`.

### 5. Deep links via `?open=`

New helper `apps/desktop/renderer/lib/academic-setup.ts`:

```ts
export type SetupDrawerTarget = 'years' | 'terms' | 'periods';
export function academicSetupHref(drawer: SetupDrawerTarget, opts?: { yearId?: string }): string
// → '/government/school-admin/academic-grading?open=terms&yearId=…'
```

On mount `AcademicGradingPage` reads `open` and `yearId` with the existing
`queryParam` helper (`components/teachers/shared.ts`). If `open` is one of
`years | terms | periods`, it opens that drawer (and passes `yearId` to Terms).
Unknown values are ignored. When any drawer closes, the page calls
`window.history.replaceState(null, '', pathname)` to drop the query string, so
a refresh or Back does not reopen it.

In-page cross-links never use `?open=`; they use `onNavigate` (a `<Link>` to the
same route would not remount the page, so the mount-time read would not fire).

### 6. Links repointed

| File | Old target | New target |
|---|---|---|
| `app/government/school-admin/page.tsx` (Academic Year tile) | `/academic-years` | `academicSetupHref('years')` |
| `app/government/school-admin/page.tsx` (Current Term tile) | `/terms` | `academicSetupHref('terms')` |
| `components/finance/CurrentTermNotice.tsx` | `/terms` | `academicSetupHref('terms')` |
| `components/reports/ReportsPage.tsx` | `/terms` | `academicSetupHref('terms')` |
| `components/classes/ClassesDirectoryPage.tsx` (2 links) | `/academic-years`, `/terms` | `academicSetupHref('years')`, `academicSetupHref('terms')` |
| `components/outcomes/EndOfYearOutcomesPage.tsx` | `/academic-years` | `academicSetupHref('years')` |
| `components/academic/AcademicFoundationPages.tsx` `SettingsPage` (2 links) | `/academic-years`, `/terms` | `academicSetupHref('years')`, `academicSetupHref('terms')` |
| `components/academic-grading/GradingPeriodsPanel.tsx` (2 links) | `/academic-years`, `/terms` | buttons calling optional `onNavigate('years')` / `onNavigate('terms')` |
| `TermsDrawer` empty state "Create academic year" | `/academic-years` | button calling `onNavigate('years')` |

`GradingPeriodsPanel` gets an optional `onNavigate` prop. If it is absent, the
two prompts fall back to `<Link href={academicSetupHref(...)}>`, so the
component stays usable on its own (the panel has no other host today, but the
fallback keeps its existing test contract simple).

Link text is unchanged everywhere, so existing accessible names in tests still
match.

### 7. Sidebar and header

`components/shell/sidebarConfig.ts`, ACADEMIC SETUP group:

- Remove **Academic Years**, **Terms**, **Assessment Periods**.
- Rename **Grading System** → **Academic Grading** (same href
  `/government/school-admin/academic-grading`).
- Remove now-unused icon imports (`CalendarRange`, `CalendarDays`,
  `CalendarClock`) if nothing else in the file uses them.
- Update the group comment: dependency order now lives in the page's card order.

Result: ACADEMIC SETUP = Academic Grading, Subjects.

The header title resolves from the sidebar item name (`page-titles.ts`), so the
Academic Grading page header now reads "Academic Grading", which matches its
`<h1>`. No `pageTitles` override needed.

### 8. Deletions

- `app/government/school-admin/academic-years/` (route folder)
- `app/government/school-admin/terms/` (route folder)
- `app/government/school-admin/academic-grading/periods/` (route folder)
- `AcademicYearsPage`, `TermsPage` and `initialYearId` exports from
  `components/academic/AcademicFoundationPages.tsx` (`initialYearId` moves to
  `TermsDrawer.tsx`). Remove imports that become unused (`Modal`,
  `AcademicYearStatus`, `AcademicYearRowView`, `TermRowView`, `sharedBridge`,
  `queryParam`, etc.) only if no remaining component in the file uses them.
- Update the comment in `GradingPeriodsPanel.tsx` that references the
  `/academic-grading/periods` page.

## Error handling

Unchanged from today: view-model results (`result.ok`) gate returning to the
list after save; load failures render `ErrorState` with `userMessage`; empty
states render `EmptyState`. The status actions and term delete keep their
`window.confirm` prompts. No new error paths are introduced.

## Testing

Renderer Vitest, matching existing test style (`AcademicFoundationPages.test.tsx`,
`GradingPeriodsPanel.test.tsx`).

**Moved / rewritten:**
- Years and Terms cases in `components/academic/AcademicFoundationPages.test.tsx`
  move to new `AcademicYearsDrawer.test.tsx` and `TermsDrawer.test.tsx`, with
  assertions changed from Link hrefs to `onNavigate` calls where the link became
  a button. `initialYearId` unit tests move with the helper.

**Updated hrefs:**
- `components/shell/Sidebar.test.tsx` — ACADEMIC SETUP now has Academic
  Grading + Subjects; the active-state test that uses `/terms` switches to a
  remaining route.
- `components/shell/page-titles.test.ts` — the `/terms/` case switches to a
  remaining route.
- `app/government/school-admin/dashboard.test.tsx`,
  `components/finance/CurrentTermNotice.test.tsx`,
  `components/outcomes/EndOfYearOutcomesPage.test.tsx`,
  `components/academic-grading/GradingPeriodsPanel.test.tsx` — expect the new
  `academicSetupHref(...)` targets (or `onNavigate` calls for the panel when the
  prop is given).

**New:**
- `lib/academic-setup.test.ts` — href shape with and without `yearId`.
- `AcademicGradingPage.test.tsx`:
  - renders six feature cards in the stated order;
  - each card's button opens the matching drawer;
  - `?open=terms&yearId=y1` on mount opens the Terms drawer with `y1` selected;
  - unknown `?open=` value opens nothing;
  - closing a drawer calls `history.replaceState` without the query string;
  - `onNavigate('terms', { yearId })` from the Years drawer swaps to Terms with
    that year.
- Drawer form-view tests (Years and Terms): Create shows the form view; Cancel
  returns to the list; Escape in the form view returns to the list and the
  drawer stays open; Escape in the list view closes the drawer; successful save
  returns to the list.
- Years edit view shows exactly the status actions allowed by the conditions in
  §3.

**Baseline to compare against** (from the nav-regroup work, same on `main`):
renderer has 2 pre-existing failures (`app/page.test` login, teacher
`timetable.test`); lint has 6 pre-existing errors outside the renderer. The
gate for this change is: no new failures, no new lint errors, `tsc` clean for
the renderer.

**Manual GUI check** (Alvin, in the Electron window): open each drawer from its
card; create/edit a year and a term; follow the dashboard "No current term
configured" tile and confirm the Terms drawer opens; follow the Years drawer's
term count into Terms; confirm the sidebar shows Academic Grading + Subjects.
