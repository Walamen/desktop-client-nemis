# School Admin Navigation Regroup — Design

**Date:** 2026-10-07
**Repo:** `desktop-client-nemis` only, renderer only (`apps/desktop/renderer`).
No domain, application, IPC or database changes.
**Branch:** `feature/school-admin-nav-regroup` (off `main`).
**Origin:** UX audit of the School Admin sidebar and the pages it leads to,
carried out on 2026-10-07 (findings summarised in §1).

---

## 1. Why this exists

The School Admin sidebar makes the daily tasks easy to reach but hides the
yearly setup tasks that everything else depends on. The audit found:

1. **Academic Years and Terms have no sidebar entry.** They are reachable only
   through School Settings (the last group) and two small text links. The
   Years page does not link to Terms.
2. **Dead ends.** Several screens say that a year or term is missing but give
   no way to get there: End-of-Year Outcomes ("Add one under Academic Years",
   an entry that does not exist), the Classes assign modal, the Grading Periods
   drawer, the Reports error, and Record Payment. Record Payment also says
   "Loading the current term…" when no term exists at all.
3. **"Periods" means three things.** These are timetable periods, grading
   periods (hidden in a drawer, with a raw-table route at
   `/academic-grading/periods` that nothing links to), and the "Periods per
   Term" config field.
4. **The sidebar loses your place on sub-pages.** `isActive` is exact-match, so
   `/students/profile`, `/classes/detail`, `/academic-grading/windows/grades`
   and other sub-pages highlight nothing.
5. **Groups follow data types, not work.** "User Management" mixes people lists
   with lifecycle processes. REPORTS and SYSTEM each hold one item. Names
   disagree between the sidebar, the page heading and the dashboard (for
   example Schedule, General Schedule Management and Timetable). There is a
   typo ("Attendence"), and icons come from eight different sets.
6. **Pages with no menu entry:** Grade Levels, School Profile, Infrastructure &
   Alerts, and the Assessment (grading) Periods route.
7. **Group labels fail contrast:** `text-white/40` on `#020833` is about
   3.7:1, below the WCAG AA minimum of 4.5:1 for small text.

### Decisions already made (brainstorming, 2026-10-07)

| Decision | Choice |
|---|---|
| Scope of this spec | Sidebar regroup plus dead-end links. The setup checklist, current year/term shown in the layout, dashboard quick-action fixes and in-page renaming of timetable "periods" are follow-up specs. |
| portal-web parity | Change desktop first. This spec is the target structure; bringing portal-web in line is a separate follow-up. The two apps will differ for a while, and that is accepted. |
| Grouping model | Domain groups ordered by how often they are used, plus one ACADEMIC SETUP group ordered by the sequence it must be done in. |
| Setup placement and length | ACADEMIC SETUP comes straight after Overview. Groups can be collapsed, the state is remembered per device, and the group holding the current page always opens. |

---

## 2. Goals and non-goals

**Goals**

- A new admin can find and complete yearly setup (grading system → academic
  year → terms → assessment periods → subjects) from the sidebar alone, in
  that order.
- Daily tasks are no harder to reach than they are today.
- Every page reachable in the app has exactly one sidebar item that is
  highlighted while you are on it or on one of its sub-pages.
- Every "missing prerequisite" message tells the admin where to go, and links
  there whenever leaving would not lose typed data.

**Non-goals (deferred to follow-up specs)**

- A setup checklist or progress indicator on the dashboard.
- Showing the school, year or term in the sidebar header or app header (the
  header stays "Dashboard").
- Fixing the misleading dashboard quick actions (Record Attendance, Grade
  Records, Add Student/Teacher targets).
- Renaming timetable "periods" inside the Timetable page.
- A Notifications badge. `useNotificationStore` counts toast messages, not
  unread inbox notifications, so wiring it would show wrong numbers.
- A Sync Conflicts sidebar item. The status bar already links to it.
- Any change to the County, DEO, Ministry or Teacher sidebars.
- Any change to portal-web.

---

## 3. Target sidebar (INSTITUTION_ADMIN)

All hrefs are under `/government/school-admin`. Icons are from `lucide-react`.

| Group | Item (label) | href | Icon | Notes |
|---|---|---|---|---|
| — | Overview | `` (base) | `LayoutDashboard` | Exact-match only |
| ACADEMIC SETUP | Grading System | `/academic-grading` | `SlidersHorizontal` | |
| | Academic Years | `/academic-years` | `CalendarRange` | New in menu |
| | Terms | `/terms` | `CalendarDays` | New in menu |
| | Assessment Periods | `/academic-grading/periods` | `CalendarClock` | New in menu; real page (§6) |
| | Subjects | `/subjects` | `BookOpen` | Moved from ACADEMIC |
| STUDENTS | Students | `/students` | `GraduationCap` | |
| | Student Transfers | `/students/inter-school-transfer` | `ArrowRightLeft` | `badge: 'transfers'` |
| | Promotion & Outcomes | `/students/promote` | `Award` | Was "End-of-Year Outcomes" |
| STAFF & FAMILIES | Teachers & Staff | `/teachers-staff` | `UserCog` | |
| | Parents & Guardians | `/parents-guardians` | `Users` | |
| TEACHING | Classes | `/classes` | `School` | Was "Classes Management" |
| | Timetable | `/timetable` | `Clock` | Was "Schedule" |
| | Attendance | `/attendance` | `CalendarCheck` | Typo fixed |
| | Grade Entry & Results | `/academic-grading/windows` | `ClipboardCheck` | Was "Grade Windows" |
| FINANCE | Record Payment | `/financial/record-payment` | `CreditCard` | Most-used item first |
| | Fees & Billing | `/financial` | `Receipt` | Was "All Fees" |
| REPORTS & MESSAGES | Reports | `/reports` | `FileBarChart` | |
| | Notifications | `/notifications` | `Bell` | |
| | Messages | `/messages` | `MessageCircle` | |
| SCHOOL | Settings | `/settings` | `Settings` | `alsoActiveOn: ['/school-profile']` |
| | Grade Levels | `/grade-levels` | `Layers` | New in menu |
| | Infrastructure & Alerts | `/infrastructure` | `AlertTriangle` | New in menu |

**Ordering rules.** ACADEMIC SETUP follows dependency order. Grading System
comes first because the Terms page builds its "Term N" choices from
`institution_grading_configs.termsPerYear` (and silently defaults to 2 when
none exists), and Assessment Periods auto-setup reads `periodsPerTerm`. Every
other group puts its most-used item first.

**Naming rules.** No "Management" suffix. Group labels are UPPERCASE. In the
navigation, "periods" means assessment periods only. Names are chosen so the
header title (resolved from the sidebar name, §5) reads correctly on each
page. Page `<h1>`s are not renamed in this spec.

---

## 4. Config model changes (`components/shell/sidebarConfig.ts`)

```ts
export interface SidebarNavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: SidebarBadge;
  /** Extra paths (exact or prefix) on which this item counts as active. */
  alsoActiveOn?: readonly string[];
}

export interface SidebarConfig {
  headerTitle?: string;
  headerSubtitle?: string;
  dashboardItem?: SidebarNavItem;
  navGroups: readonly SidebarNavGroup[];
  /** Enables collapsible groups with per-device persistence. Default false. */
  collapsibleGroups?: boolean;
}
```

- Only `INSTITUTION_ADMIN` sets `collapsibleGroups: true`.
- The other four role configs are byte-for-byte unchanged.
- `SCHOOL_ADMIN_PAGE_TITLES` keeps only the dashboard-root override
  (`'Dashboard Overview'`). The `/attendance` override existed only because of
  the typo and is removed.

---

## 5. Active-item matching (new pure module)

New file: `components/shell/active-nav.ts`.

```ts
export function resolveActiveHref(pathname: string, config: SidebarConfig, basePath: string): string | null;
```

`basePath` is `headerConfigs[role].basePath`. *(Amended 2026-10-07 during
planning: DEO and Teacher put their home page in a group rather than in
`dashboardItem`, so the resolver needs the base path to keep that item
exact-only.)*

Rules:

1. Strip one trailing slash from `pathname` and from every candidate (the
   static export uses `trailingSlash: true`).
2. The `dashboardItem`, and any group item whose href equals `basePath`,
   match **only** on exact equality.
3. For every group item, the candidates are `href` plus `alsoActiveOn`. A
   candidate matches if `pathname === candidate` or
   `pathname.startsWith(candidate + '/')`. The segment boundary matters:
   `/students-x` must not match `/students`.
4. The match with the longest candidate wins, and its item's `href` is
   returned. Example: `/students/inter-school-transfer` beats `/students`.
5. If nothing matches, return `null`.

Consumers:

- `Sidebar.tsx`: `isActive(href) = href === resolveActiveHref(pathname, config)`.
- `page-titles.ts` does **not** use the resolver. Titles stay
  exact-match-or-override: `sidebarItemName` keeps its exact lookup, adding
  only the same trailing-slash normalisation. That way `/students/profile`
  keeps the title "Profile" and doesn't become "Students". Only highlighting
  uses prefix matching. The breadcrumb segments are unchanged.

---

## 6. Sidebar behaviour (`components/shell/Sidebar.tsx`)

**Collapsible groups** (only when `config.collapsibleGroups`):

- A group header is a `<button type="button">` with `aria-expanded` and
  `aria-controls`, pointing at the group's item list. It shows a
  `ChevronDown`/`ChevronRight` icon and responds to Enter and Space (native
  button behaviour).
- Default state: every group is open.
- Persistence uses `localStorage` key `nemis.sidebar.collapsed.<role>`, holding
  a JSON array of collapsed group labels. Every read and write is wrapped in
  `try/catch`. If parsing fails or storage throws, all groups are open.
  Unknown labels are ignored. The renderer origin is `app://renderer`,
  registered `standard: true`, so storage persists in the packaged app.
- Forced open: the group containing the active item is always rendered open,
  whatever its stored state. This doesn't change what is stored. If the admin
  collapses it explicitly while on that page, the stored state records the
  collapse, but the group stays open until they navigate away.
- A collapsed group shows the sum of its items' badge counts in the header,
  using the existing red pill style and `99+` cap.
- When `collapsibleGroups` is false, group headers stay plain text, exactly as
  today.

**Visuals** (all roles, since these are shared styles):

- Group label: `text-white/40` becomes `text-white/60`, about 7:1 on
  `#020833`.
- Item padding: `py-3` becomes `py-2.5`. The group separator `my-4` becomes
  `my-3`.
- The active item gets `aria-current="page"`.

These visual changes affect every role's sidebar slightly. They are
contrast and density fixes, not structural changes, and they are accepted.

---

## 7. Assessment Periods page

- Extract the body of `components/academic-grading/GradingPeriodsDrawer.tsx`
  (term picker, auto-setup, period list, add/edit form) into
  `components/academic-grading/GradingPeriodsPanel.tsx`. The behaviour,
  bridge calls and auto-setup logic do not change. Data loading that today
  waits on `isOpen` runs on mount instead.
- `app/government/school-admin/academic-grading/periods/page.tsx` renders a
  page header (same dark-banner style as Grading System and Grade Entry &
  Results, titled "Assessment Periods") with `GradingPeriodsPanel` below it.
  This replaces the `SchoolAdminCollectionPage` raw table.
- On `AcademicGradingPage`, the "Grading Periods" card becomes "Assessment
  Periods" and links (`href`) to `/academic-grading/periods` instead of
  opening the drawer.
- Delete `GradingPeriodsDrawer.tsx`. Its only importer is
  `AcademicGradingPage.tsx` (checked 2026-10-07), and it has no test today.
- In the panel, the "No terms configured for the current academic year."
  message gains a link to Terms (§8).

---

## 8. Dead-end links

**Rule:** if following the link would lose data the admin has typed, show the
menu path as text instead of a link.

| # | File | Today | Change |
|---|---|---|---|
| 1 | `app/government/school-admin/page.tsx` + `components/dashboard/InfoTile.tsx` | School / Academic Year / Current Term tiles show plain empty text | `InfoTile` gains optional `emptyHref`. When the tile is empty and `emptyHref` is set, the existing `emptyText` renders as a `next/link`. The tiles link to `/school-profile`, `/academic-years` and `/terms`. |
| 2 | `components/academic/AcademicFoundationPages.tsx` (`AcademicYearsPage`) | Terms column is plain number | Number links to `/terms?yearId=<id>` |
| 3 | same file (`TermsPage`) | Always preselects current/first year | Reads `yearId` from `useSearchParams()` and preselects it if it is in the list. Otherwise it falls back to today's behaviour. Follow the existing `?id=` page pattern, including any `Suspense` wrapper the static export needs. |
| 4 | `GradingPeriodsPanel.tsx` | "No terms configured…" (also shown when there is no current **year**) | If no current year exists: "No current academic year is set." plus a link to `/academic-years`. If a year exists but has no terms: the existing text plus a "Create terms" link to `/terms`. |
| 5 | `components/outcomes/EndOfYearOutcomesPage.tsx:183` | "Add one under Academic Years" | "Academic Years" becomes a link → `/academic-years` |
| 6 | `components/reports/ReportsPage.tsx:111` | Error text "No term is set as current…" | The report error state carries an optional link. This case links to `/terms` ("Set a current term"). |
| 7 | `components/finance/RecordPaymentPage.tsx:217` | "Loading the current term…" shown for loading **and** empty/error | Split the cases. Loading/idle keeps today's text. Empty shows "No current term is set — payment entry is disabled." plus a link to `/terms`. Error shows the error's `userMessage`. |
| 8 | `components/classes/ClassesDirectoryPage.tsx:686` (assign modal) | "No active academic year or term is configured yet." | Append the links "Academic Years" and "Terms" |
| 9 | `components/classes/ClassDetailPage.tsx:583` (Assign Teacher drawer) | "Add teachers from the Teachers module first." | "Teachers & Staff" becomes a link → `/teachers-staff` |
| 10 | `components/timetable/ClassSchedulePage.tsx:531` (cell editor) | "Assign them from the class detail page first." | Link → `/classes/detail?id=<selectedClassId>` |
| 11 | `components/students/add-student/ClassTermPicker.tsx:126,146` | "…create one first." | **Text only** (it is used inside the Add Student wizard and the claim panel, which hold typed data): "No classes for {grade} — create one under Teaching → Classes, then return." and "No terms in this academic year — create one under Academic Setup → Terms, then return." |

Every link uses `next/link` and the existing link style
(`text-blue-700 hover:underline`, or `text-secondary` where that page already
uses it).

---

## 9. Testing

Vitest and Testing Library, following the existing patterns in
`components/shell/*.test.tsx`.

**`active-nav.test.ts` (new):**
- exact match
- prefix match on a segment boundary
- `/students-x` does not match `/students`
- the longest match wins (transfers beats students)
- the dashboard is exact-only
- `alsoActiveOn` (`/school-profile` → Settings)
- trailing slash on the pathname and on the href
- no match returns `null`

**`Sidebar.test.tsx` (extend):**
- the school-admin groups render in the §3 order with the §3 labels
- clicking a group header collapses it (`aria-expanded` changes, items hidden)
- the collapsed state is written to `localStorage` and restored on remount
- a throwing `localStorage` falls back to all groups open
- the active item's group is forced open even if stored as collapsed
- a collapsed STUDENTS group shows the transfers badge total
- `aria-current="page"` is on the active item
- a sub-page path highlights its parent
- a non-school-admin role renders plain (non-button) group headers

**`page-titles.test.ts` and `Header.test.tsx`:** update them for the new
names. Assert that `/attendance` resolves to "Attendance" without an
override.

**Render tests:**
- `InfoTile` with `emptyHref`
- `TermsPage` preselects `?yearId`
- `RecordPaymentPage`, for each of loading, empty and error terms
- `GradingPeriodsPanel` mounts and lists terms, including the empty-terms link

**Gate before claiming done:**
- full renderer test suite
- `tsc` typecheck
- ESLint, including the renderer boundary guard
- a manual pass in the running app, covering:
  - the sidebar collapses and expands
  - the sidebar highlights correctly on sub-pages
  - every dead-end link is clicked through
  - the Assessment Periods page works end to end

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Other roles' tests break from the shared style changes | The style changes are class-only. Tests assert structure, not classes. Confirm with the full suite. |
| Header titles change for renamed items, for example `/timetable` now reads "Timetable" | Intended: it brings the header in line with the sidebar. Covered by the `page-titles` tests. |
| `useSearchParams` in a static export needs a `Suspense` boundary | Copy the existing `?id=` pages' setup exactly. |
| Removing the drawer breaks an unseen import | `grep` for `GradingPeriodsDrawer` before deleting it. The typecheck catches the rest. |
| The sidebar and portal-web drift apart | Accepted (§1 decisions). A follow-up spec aligns portal-web with §3. |
