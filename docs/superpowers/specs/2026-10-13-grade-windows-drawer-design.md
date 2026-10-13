# Grade Entry Windows Drawer — Design

Date: 2026-10-13
Branch: `grade-windows-drawer` (from `main` at 458afad)
Scope: desktop-client-nemis renderer, School Admin role only. Follows
`2026-10-13-academic-setup-drawers-design.md` (same patterns, same page).

## Goal

The Academic Grading page opens Grading Configuration, Academic Years, Terms
and Assessment Periods in drawers. **Grade Entry Windows** is the last card
that still navigates to its own page. Move it into a drawer the same way, and
delete the standalone windows page.

**Why:** Alvin tested the drawer work and wants every setup card on that page
to behave the same — one place, no page hops.

## Decisions (agreed with Alvin)

- The read-only **View Grades results page stays a page**
  (`/government/school-admin/academic-grading/windows/grades?id=…`,
  `WindowGradesPage`). Its wide results table needs full width. Only its
  "Back to Windows" link changes.
- The sidebar's **"Grade Entry & Results"** item (TEACHING group) **stays** and
  opens the Windows drawer.

## Non-goals

- No change to window data, lifecycle rules, or the `grade_entry_windows`
  collection API. No view-model / IPC / bridge changes.
- `WindowGradesPage` behaviour is unchanged apart from its back link.
- No portal-web changes.

## Current state

`components/academic-grading/GradeWindowsPage.tsx` (route
`app/government/school-admin/academic-grading/windows/page.tsx`):

- Loads all windows (`listAllWindows()`), the current academic year
  (`useAcademicYearViewModel().store.current`) and its terms
  (`foundation.loadTerms(yearId)`); revalidates on sync.
- Lists windows as cards: name, description, status chip (`WINDOW_STATUS_CHIP`)
  with a coloured left rail (`WINDOW_STATUS_RAIL`), open/close dates
  (`formatDateShort`). Empty state: "No grade entry windows found."; loading
  spinner while `windows === null`.
- Per-status actions (each a `saveSchoolAdminRecord` on
  `grade_entry_windows` followed by a reload):
  - `DRAFT` → **Open Window** → `{ status: 'OPEN', openedAt: now }`
  - `OPEN` → **Close Window** → `{ status: 'CLOSED', closedAt: now }`
  - `CLOSED` → **Publish Grades** → `{ status: 'PUBLISHED', publishedAt: now }`, **Reopen** → `{ status: 'OPEN', openedAt: now }`
  - `PUBLISHED` → "Grades Published" label, **Unpublish** (confirmation), **Reopen**
  - `CLOSED` or `PUBLISHED` → **View Grades** link to `/government/school-admin/academic-grading/windows/grades?id=<id>`
- **Create Window** opens a hand-rolled `fixed inset-0 z-50` overlay form:
  Term `<select>` (current year's terms) → Grading Period `<select>` (disabled
  until a term is chosen; loaded by `listPeriodsForTerm(termId)`) → Window Name
  (required) → Description (optional) → Open Date / Close Date (required).
  Save writes `{ gradingPeriodId, name, description || null, openDate,
  closeDate, status: 'DRAFT', allowedRoles: JSON.stringify(['TEACHER']) }`.
- **Unpublish** opens a hand-rolled overlay: the admin must type the exact
  phrase `unpublish this window`; the confirm button is disabled until it
  matches; Enter also confirms when it matches. Confirm saves
  `{ status: 'CLOSED' }`.

Inbound links to `/government/school-admin/academic-grading/windows`:
`AcademicGradingPage.tsx` (the card's `href`), `WindowGradesPage.tsx` (Back to
Windows), `components/shell/sidebarConfig.ts` (Grade Entry & Results), plus
`Sidebar.test.tsx` and `page-titles.test.ts`.

The overlays have the same problem the Years/Terms `Modal`s had: inside the
ui `Drawer` (framer-motion transform, document-level Escape listener) a
`fixed` overlay is positioned relative to the drawer panel and Escape would
close the whole drawer.

## Design

### 1. `GradeEntryWindowsDrawer`

New `components/academic-grading/GradeEntryWindowsDrawer.tsx`, built like
`AcademicYearsDrawer` / `TermsDrawer`:

- `export function GradeEntryWindowsDrawer({ isOpen, onClose, onNavigate }: SetupDrawerProps)`
  renders `<Drawer isOpen onClose title="Grade Entry Windows" size="xl">` with
  an inner manager keyed by `useOpenSession(isOpen)`, so every open starts on
  the list view.
- Views: `'list' | 'create' | 'unpublish'`. While the view is not `list`,
  `useEscapeCapture(true, backToList)` makes Escape return to the list instead
  of closing the drawer.
- **List view**: a "Create Window" button, then the window cards exactly as
  today (same fields, chips/rails, status-gated buttons, labels, loading and
  empty states). **View Grades** stays a `next/link` to the results page.
  Unpublish switches to the `unpublish` view for that window.
- **Create view**: today's form fields, labels, placeholders, `required`
  rules and disabled-until-term-chosen behaviour, rendered in the drawer body
  with Cancel and Save. Save success → reset the form, reload, back to list.
- **Unpublish view**: heading "Unpublish Grades", today's explanatory text,
  the phrase input (`unpublish this window`, Enter-to-confirm when it matches),
  Cancel and a confirm button disabled until the phrase matches. Confirm →
  save `{ status: 'CLOSED' }`, reload, back to list.
- Data loading and every save payload move over unchanged from
  `GradeWindowsPage` (including the `allowedRoles` comment).
- `onNavigate` is accepted for interface parity with the other drawers. The
  drawer has no cross-drawer link today, so it is unused: name it `_onNavigate`
  or omit it from destructuring, whichever the repo's lint config accepts
  without a disable comment.

### 2. Academic Grading page

- `lib/academic-setup.ts`: `SetupDrawerTarget` gains `'windows'`;
  `parseSetupDrawerTarget` accepts it; `academicSetupHref('windows')` →
  `/government/school-admin/academic-grading?open=windows`.
- `AcademicGradingPage.tsx`:
  - The Grade Entry Windows `FeatureCard` switches from `href` to
    `onClick={() => navigate('windows')}` (action label "Manage Windows"
    unchanged).
  - Renders `<GradeEntryWindowsDrawer isOpen={activeModal === 'windows'} onClose={close} onNavigate={navigate} />`.
- **React to `?open=` changes, not just the first render.** Replace the
  mount-only `queryParam('open')` / `queryParam('yearId')` read with
  `useSearchParams()` from `next/navigation`, in an effect keyed on the
  `open` and `yearId` values: when `open` parses to a target, set
  `termsYearId` from `yearId` and open that drawer. Reason: the sidebar is a
  persistent layout, so clicking "Grade Entry & Results" while already on
  Academic Grading is a soft navigation that never remounts the page. A
  null/invalid `open` does nothing (it must not close an open drawer).
  `close` keeps clearing the query with `window.history.replaceState(null,
  '', window.location.pathname)`; Next syncs `useSearchParams` with it, and a
  cleared value opens nothing.
- `app/government/school-admin/academic-grading/page.tsx` wraps
  `<AcademicGradingPage />` in `<Suspense>` — required by Next for
  `useSearchParams` in a statically exported route (the build fails without
  it). Fallback: `null`.
- `close` also reloads the page's own `grade_entry_windows` list (a stable
  `loadWindows` callback, also used for revalidate-on-sync), so the Active /
  Draft / Published / Total Windows stat cards reflect changes made in the
  Windows drawer once any drawer is closed.
- Quick Start Guide text is unchanged.

### 3. Links and sidebar

- `WindowGradesPage.tsx` "Back to Windows" → `academicSetupHref('windows')`.
- `sidebarConfig.ts`, TEACHING group:
  `{ name: 'Grade Entry & Results', href: academicSetupHref('windows'), icon: ClipboardCheck, alsoActiveOn: ['/government/school-admin/academic-grading/windows'] }`.
  `resolveActiveHref` compares pathnames only (no query), so without
  `alsoActiveOn` the results page would highlight "Academic Grading"; the
  longer `/academic-grading/windows` prefix wins and keeps "Grade Entry &
  Results" highlighted there. On `/academic-grading` itself "Academic
  Grading" stays highlighted (that is the page you are on).
- Header title: `resolvePageTitle` matches sidebar hrefs exactly by pathname,
  so the results route keeps its current title resolution (last segment,
  "Grades"); nothing else depends on the deleted route's title.

### 4. Deletions

- `app/government/school-admin/academic-grading/windows/page.tsx`
  (the `windows/grades/` route folder stays).
- `components/academic-grading/GradeWindowsPage.tsx`.
- `rm -rf apps/desktop/renderer/.next/types` before typechecking (stale
  generated route types are included by the renderer tsconfig).

## Error handling

Unchanged from today: the lifecycle saves and the create save have no
try/catch beyond the existing `finally { setCreating(false) }`. The
collections bridge passes IPC calls straight through with no toast, so a
failed lifecycle save leaves the list unchanged with no message (same as the
old page). The create view stays on the form on failure (only success returns
to the list), and unpublish stays on its confirmation view. User-visible error
feedback across the setup drawers is a follow-up.

## Testing

Renderer Vitest, matching the existing drawer tests
(`AcademicYearsDrawer.test.tsx`, `setup-test-support.tsx`). `sharedBridge` is
mocked per file; window rows come from `listSchoolAdminRecords`
(`collection: 'grade_entry_windows'`).

**New `GradeEntryWindowsDrawer.test.tsx`:**
- Renders title "Grade Entry Windows"; lists window names; empty state text.
- Each status shows exactly its buttons: DRAFT → Open Window; OPEN → Close
  Window; CLOSED → Publish Grades, Reopen, View Grades; PUBLISHED → Unpublish,
  Reopen, View Grades.
- Clicking Open Window / Close Window / Publish Grades / Reopen saves the
  right `status` (and that a timestamp field is set) for that window id.
- View Grades `href` is `/government/school-admin/academic-grading/windows/grades?id=<id>`.
- Create: button shows the create view; Grading Period select is disabled
  until a term is chosen; Escape in the form returns to the list without
  calling `onClose`; a filled save writes `status: 'DRAFT'` and
  `allowedRoles: '["TEACHER"]'` and returns to the list.
- Unpublish: confirm disabled until the input equals `unpublish this window`
  exactly; then saves `{ id, status: 'CLOSED' }` and returns to the list;
  Escape returns to the list.

**`AcademicGradingPage.test.tsx`:**
- Mock `next/navigation` (`useSearchParams` reading the current
  `window.location.search`, plus anything else the page imports from it), as
  `app/government/teacher/grades/grades.test.tsx` does.
- "Manage Windows" opens the "Grade Entry Windows" drawer (heading level 2).
- `?open=windows` on first render opens it.
- **Soft navigation:** render with no query, then set the URL to
  `?open=windows` and rerender → the drawer opens (the sidebar-click case).
- Existing `?open=` / close / cross-drawer tests keep passing.

**Updated:**
- `lib/academic-setup.test.ts`: `windows` href case; parser accepts `windows`.
- `Sidebar.test.tsx`: "Grade Entry & Results" href is
  `/government/school-admin/academic-grading?open=windows`; it is
  `aria-current="page"` on `/government/school-admin/academic-grading/windows/grades`.
- `page-titles.test.ts`: the breadcrumb test that used
  `/academic-grading/windows` switches to
  `/government/school-admin/academic-grading/windows/grades` (title "Grades",
  segments School Admin › Academic Grading › Windows › Grades).

## Verification (definition of done)

- `pnpm --filter @nemis-desktop/app typecheck` passes.
- `pnpm lint` exits 0.
- Renderer suite: only the 2 known pre-existing failures (`app/page.test`
  login, teacher `timetable.test`) plus the known Sidebar logout unhandled
  error.
- `pnpm --filter @nemis-desktop/app build:renderer` succeeds (proves the
  Suspense boundary); the route list has `/academic-grading` and
  `/academic-grading/windows/grades`, not `/academic-grading/windows`.
- `git grep -n "academic-grading/windows" -- apps/desktop/renderer ':!*.test.*'`
  shows only the `/windows/grades` route references (the View Grades link)
  and the sidebar's `alsoActiveOn` prefix — no link to the deleted
  `/academic-grading/windows` page.

## Manual GUI check (Alvin)

1. Academic Grading → "Manage Windows" opens the drawer; create a window
   (term → period → name → dates); it appears as DRAFT.
2. Open → Close → Publish → Unpublish (type the phrase) → Reopen on one window.
3. View Grades opens the results page; "Back to Windows" returns with the
   drawer open.
4. While on Academic Grading, click sidebar "Grade Entry & Results" → the
   drawer opens. On the results page that sidebar item is highlighted.
