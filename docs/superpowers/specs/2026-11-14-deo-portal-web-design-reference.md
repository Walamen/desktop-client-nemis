# DEO portal (portal-web) — layout and design reference

**Date:** 2026-11-14
**Source:** `Nemis/apps/portal-web/src/app/government/deo/` (23 files, 9,110 lines) plus the shared components those pages import.
**Purpose:** a page-by-page record of what the web DEO portal looks like and how it behaves, so the desktop DEO portal (`apps/desktop/renderer/app/government/deo/`) can be built to match it.

This document describes the web as it is today. It does not decide how the desktop gets its data. Each page still needs its own spec for the data path, as the County pages did.

Class names are quoted exactly where the look depends on them. The same colour tokens (`primary`, `secondary`, `accent`, `active`, `pending`, `error`, `success`, `rounded-card`, `rounded-button`) exist in the desktop Tailwind config.

---

## 1. Page inventory

Twenty-two pages plus the layout. Eleven are in the web sidebar. The other eleven are reachable only by URL or by a link from another page.

| # | Web route (`/government/deo…`) | Banner title | In web sidebar | Desktop today |
|---|---|---|---|---|
| 1 | `/` | (greeting banner) | Dashboard | Generic `ScopedPortalDashboard` + `YearClosuresPanel` |
| 2 | `/schools` | Schools Management | Schools | Raw collection tables |
| 3 | `/schools/[id]` | *school name* | (row click) | Missing |
| 4 | `/school-admins` | School Admins | School Admins | `ComingSoon` |
| 5 | `/teachers` | Teacher Monitoring | Teachers | Raw collection table |
| 6 | `/students` | Students & Enrollment | Students | Raw collection table |
| 7 | `/transfers` | Student Transfer Requests | Transfers | Raw collection table |
| 8 | `/reports/automated` | Automated Reports | Generate Reports | Missing (sidebar points at `/reports`) |
| 9 | `/finance` | Finance Monitoring | Finance | Raw collection tables |
| 10 | `/messages` | Messages | Messaging | Raw collection table |
| 11 | `/notifications` | Notifications | Notifications | Raw collection table |
| 12 | `/settings` | Settings | Settings | `ComingSoon` |
| 13 | `/reports` | Reports & Compliance | no | Raw collection table |
| 14 | `/alerts` | Alerts | no | Raw collection table (and it *is* in the desktop sidebar) |
| 15 | `/analytics` | Analytics Dashboard | no | Missing |
| 16 | `/submissions` | Submissions | no | Missing |
| 17 | `/school-reports` | School Reports Review | no | Missing |
| 18 | `/infrastructure` | Infrastructure & Issues | no | Missing |
| 19 | `/incidents` | Incidents & Community Issues | no | Missing |
| 20 | `/supervision` | Supervision & Inspection | no | Missing |
| 21 | `/resources` | Approved Reports & Policies | no | Missing |
| 22 | `/data` | Data Submissions | no | Missing |

The desktop also has `sync-pending` and `sync-conflicts` under `deo/`, which have no web equivalent and are already built.

---

## 2. Shell

### 2.1 Layout (`layout.tsx`)

- Auth guard for role `DEO`. While the session loads: a centred large `Spinner` with "Loading dashboard..." (`text-gray-600`).
- Frame: `flex h-screen bg-gray-50 overflow-hidden`. Sidebar on the left (hidden below `lg`, with a slide-in mobile copy and a `bg-black/50` overlay), then a column holding `Header` and `main`.
- `main` is `flex-1 overflow-y-auto`, and the page is wrapped in `px-4 py-6 w-full`. Every page then draws its own full-width dark banner *inside* that padding, so on the web the banner sits 16px in from the sides and 24px below the header.
- `react-hot-toast` `Toaster` is mounted, and the `useNotifications()` hook is started here.

The desktop layout already has the same frame (RouteGuard, Sidebar, Header, StatusBar, ToastHost). Its `main` has no padding; the desktop County pages draw the banner edge to edge.

### 2.2 Sidebar (`sidebarConfig.ts`, `deo` entry)

Header title "Nemis", subtitle "DEO Portal".

| Group | Items (icon) |
|---|---|
| OVERVIEW | Dashboard (LayoutDashboard) |
| MAIN | Schools (Building2), School Admins (UserCog), Teachers (GraduationCap), Students (Users), Transfers (ArrowRightLeft) |
| REPORTS | Generate Reports (FileBarChart) → `/reports/automated`, Finance (DollarSign) |
| COMMUNICATION | Messaging (MessageSquare, unread-messages badge), Notifications (Bell, unread-notifications badge) |
| SYSTEM | Settings (Settings) |

Desktop sidebar differences today: the REPORTS item is named "Reports" and points at `/reports`; COMMUNICATION has a third item "Alerts"; no badges.

### 2.3 Header (`Header.tsx`, `deo` entry)

- White sticky bar, `border-b border-gray-200`, `px-2 lg:px-6 py-2`.
- Left: page title (`text-lg font-bold text-primary-500`) over a breadcrumb (`text-xs font-semibold text-gray-600`), built as `Home / DEO / <Path Segments>`.
- Right: notification bell, message dropdown (links to `/messages`), then the profile button (avatar, full name, static role label "DEO", chevron) with a dropdown for Edit Profile and Logout.

Header titles by route:

| Route | Title |
|---|---|
| `/` | Dashboard Overview |
| `/schools` | Schools |
| `/school-admins` | School Admins |
| `/teachers` | Teachers |
| `/students` | Students & Enrollment |
| `/school-reports` | School Reports |
| `/reports/automated` | Generate Reports |
| `/infrastructure` | Infrastructure Report |
| `/finance` | Finance |
| `/messages` | Messages |
| `/notifications` | Notifications |
| `/settings` | Settings |
| anything else (e.g. `/transfers`, `/schools/[id]`) | "DEO Portal" (fallback) |

---

## 3. Shared design language

Every DEO page is built from the same few parts. Section 4 refers back to these by name.

### 3.1 Page frame

```
<div className="min-h-screen bg-slate-100 font-['Sora']">
  <Banner />
  <div className="px-6 py-6 space-y-5"> …sections… </div>
</div>
```

Font is Sora on every page. Background is `slate-100`. Sections are stacked with a 20px gap.

### 3.2 Banner

`bg-slate-900 text-white px-6 py-5 flex items-center justify-between`

- Left: an eyebrow (`text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5`, normally "DEO Portal") over the page title (`text-xl font-bold text-white`).
- Right, on most pages, the **district block**: label "District" (`text-xs text-slate-400 uppercase tracking-widest`) over a value (`text-sm font-semibold text-slate-200 mt-0.5`). On the web the value is the hard-coded text "Buchanan · Grand Bassa" on every page that shows it.
- Some pages replace or extend the right side with **banner buttons**: `inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700`.
- Simple pages (Messages, Notifications, Settings, Data, Resources, Supervision, Incidents) have the left side only.

### 3.3 Cards

Two card looks are mixed across the portal:

| Name used below | Classes | Where |
|---|---|---|
| **Square card** | `bg-white border border-gray-300 p-6` (no radius, no shadow; some use `border-slate-300`) | Schools, School Admins, Students, Finance overview, Generate Reports, Notifications, Settings profile |
| **Rounded card** | `bg-white rounded-2xl shadow-sm border border-gray-200 p-6` | Teachers table, School detail, Alerts, Analytics, Submissions, School Reports, Infrastructure, Reports & Compliance |
| **`Card` from `@nemis/ui`** | `bg-white border border-slate-300 rounded-card overflow-hidden`, body `p-6`; optional title strip `px-6 py-4 border-b bg-secondary/20` with `text-lg font-semibold text-slate-600` | Dashboard, KPI cards on School Admins / Teachers / Students |

### 3.4 KPI cards

Four variants are in use:

1. **Plain number** (`Card`): value `text-3xl font-bold` (colour varies), label `text-sm font-medium text-gray-900`. School Admins, Teachers, Students.
2. **Label-first** (Dashboard): uppercase label `text-sm font-semibold text-gray-400`, value `text-3xl font-bold`, subtitle `text-xs text-gray-500 font-semibold`. No icon is drawn.
3. **Icon tile on top** (rounded card): a `w-11 h-11 rounded-xl` tinted tile with a `w-5 h-5` icon, then value `text-3xl font-bold text-gray-900`, label `text-sm font-medium text-gray-500 mt-1`. Reports & Compliance, Infrastructure.
4. **Icon left, compact**: `p-2`/`p-3 rounded-lg` tinted tile beside a small label and a `text-lg`/`text-2xl` bold value. Generate Reports (`SummaryCard`), Submissions, School Reports.

KPI grids are `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6` unless noted.

### 3.5 Filter pills and tabs

| Style | Active | Inactive | Where |
|---|---|---|---|
| Square pill | `bg-secondary text-white` | `bg-gray-100 text-gray-700 hover:bg-gray-200` (`px-4 py-2 text-sm font-medium`) | Schools, School Admins, Finance status, Transfers |
| Rounded-xl pill | `bg-sky-700 text-white` | `bg-gray-100 text-gray-700` (`rounded-xl`) | Teachers |
| Rounded-full pill | `bg-sky-700 text-white` or `bg-slate-900 text-white` | `bg-gray-100 text-gray-700` | Reports & Compliance, Infrastructure |
| Underline tabs | `text-sky-700 border-b-2 border-sky-700` | `text-gray-500 hover:text-gray-700` (`pb-3 text-sm font-medium`, on a `border-b border-gray-200` row) | Finance, School Reports |
| Segmented control | `bg-white text-slate-900 shadow-sm` inside `bg-gray-100 rounded-xl p-1` | `text-gray-600` | Submissions |

### 3.6 Tables

- Wrapper `overflow-x-auto`, table `w-full`.
- Head: `bg-gray-50 border-b border-gray-200`; cells `px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider` (report tables use `px-4 py-3 … font-medium text-gray-500`).
- Body: `divide-y divide-gray-200`; rows `hover:bg-gray-50 transition-colors`; cells `px-6 py-4 text-sm`. Primary column `font-semibold text-gray-900`, secondary line `text-xs text-gray-500`.
- **Progress cell**: a `bg-gray-200 rounded-full h-2` track (`max-w-[60px]` or `[72px]`) with a coloured fill, followed by the percentage in `text-sm font-semibold text-gray-900`.
- **Status chip**: `inline-flex px-3 py-1 text-xs font-semibold` — square on Schools and School Admins, `rounded-full` elsewhere.

### 3.7 Colour meaning

| Meaning | Classes |
|---|---|
| Good / compliant / approved / active | `bg-active text-slate-100`, or `bg-green-50 text-green-700`, `bg-emerald-50 text-emerald-700`, `bg-green-100 text-green-800` |
| Needs review / pending / warning | `bg-pending text-slate-100`, or `bg-amber-50 text-amber-700`, `bg-yellow-100 text-yellow-800` |
| Flagged / rejected / critical | `bg-error text-slate-100`, or `bg-red-50 text-red-700`, `bg-red-100 text-red-800` |
| High severity | `bg-orange-50 text-orange-700` |
| Low severity / info | `bg-blue-50 text-blue-700`, `bg-sky-50 text-sky-700` |
| Neutral / missing / no data | `bg-slate-100 text-slate-700`, `bg-gray-100 text-gray-700` |
| Under review | `bg-violet-50 text-violet-700` |
| Escalated | `bg-red-50 text-red-700` (infrastructure), `bg-purple-100 text-purple-700` (school reports) |

Attendance thresholds differ by page:

| Page | Green | Amber | Red |
|---|---|---|---|
| Schools list (bar) | ≥ 80 | ≥ 70 | below 70 |
| Dashboard "Schools at a Glance", Students table, Teachers bar, report tables | ≥ 90 | ≥ 75 | below 75 |
| Analytics KPI and comparison chart | ≥ 85 | ≥ 75 | below 75 |

### 3.8 Loading, empty, error, and no-district states

- **Skeleton**: `animate-pulse space-y-3` with 3–8 grey blocks (`h-12`/`h-16 bg-gray-100 rounded`).
- **Spinner**: `w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin` (Transfers, Finance tabs, Generate Reports).
- **Empty**: centred `py-12`, a `w-12 h-12 text-gray-400` icon, one line `text-gray-600 text-sm`.
- **Error**: same block with `AlertTriangle` in `text-red-400` and "Failed to load …".
- **No district assigned** (every page except Messages, Data, Resources, Supervision, Incidents): replaces the whole page with a centred `h-64` block — `AlertTriangle w-12 h-12 text-yellow-500` and "No district assigned to your account." The Dashboard has a fuller version (4.1). Transfers shows only the sentence, in `text-sm text-slate-500`, on the page background.

### 3.9 Pagination

Two forms:

- **Chevron pair**: "Page X of Y (N total)" on the left; two bordered icon buttons (`ChevronLeft`, `ChevronRight`) on the right, `disabled:opacity-40`. Dashboard tables, Alerts.
- **Numbered**: "Showing a–b of N", chevrons, and page numbers with ellipses; current page `bg-slate-900 text-white`. Submissions only.
- School Reports uses text buttons "Previous" / "Next".

### 3.10 Charts

Recharts throughout, except two hand-built charts on Students (CSS bars and an SVG ring) and the CSS bars on Finance and School detail.

Shared chart styling: grid `strokeDasharray="3 3"` in `#e5e7eb`; axes `#6b7280` at 11–12px; white tooltip with a grey border and 8px radius.

Report chart palette (`components/reports/ReportCharts.tsx`): navy `#000e21` (totals, trend lines), blue `#0367A0` (male, primary metric), mid blue `#1874A8`, green `#146316` (present, pass, compliant), amber `#a6731c` (female, late, unqualified), red `#c10021` (absent, fail, non-compliant), slate `#CBD5E1` (background bars).

---

## 4. Pages

### 4.1 Dashboard — `/`

**Banner.** Holds the `DEOBanner` component instead of an eyebrow and title, and only once the overview has loaded:

- A 64px avatar inside a `border-4 border-blue-900 rounded-full` ring.
- "Good afternoon," (`text-sm text-white/80 font-semibold`) — fixed text, not time-based.
- The DEO's full name (`text-2xl font-semibold`).
- One line: "District Education Officer · District · County · Date, November 14, 2026" (`text-sm text-white/90 font-semibold`). The words "District" and "County" are literal placeholders on the web, not the real names.

**Body, top to bottom:**

1. **Success strip** (only when a message is set): `bg-green-50 border border-green-200 text-green-800 px-4 py-3`, check icon, text, and a × to dismiss.
2. **KPI grid**, 4 label-first cards: Total Schools ("In District"), Total Students ("District enrollment"), Total Teachers ("Across all schools"), Fee Compliance as a percentage ("Average across schools"). Loading shows 8 skeleton cards. On error: a red strip "Failed to load dashboard data." with an underlined "Retry".
3. **Two columns** (`lg:grid-cols-2 gap-6`):
   - **Alerts & Actions**: white card, `rounded-lg border border-gray-300`. Header strip `bg-secondary/20 p-6` with the title (`text-lg font-bold text-gray-700`) and a count chip "N Items" (`rounded-button bg-active text-slate-100`). List is `max-h-[400px] overflow-y-auto`, divided. Each row is tinted by severity with a 4px left border, a severity icon, title (`text-sm font-semibold`), description (`text-xs text-gray-600`), and a chip on the right. Chip wording: CRITICAL → "Critical", HIGH → "Pending", MEDIUM → "Needs Review", LOW → "Info". Empty: "No alerts or incidents".
   - **Schools at a Glance**: same card and header strip, with a "View All →" text button on the right (no action wired). Table, sticky head, `max-h-[400px]`: School (name over level), Students, Attend. (coloured percentage), Status (chip: Compliant green, Needs Review orange, Flagged red). Empty: "No schools found".
4. **Two chart cards** (`Card` with title strip): "Enrollment Trend (6 Months)" — line chart, navy `#020b33`, 300px tall; "Gender Distribution" — ring chart (inner 60, outer 90), male `#0367A0`, female `#a6731c`, total in the centre, legend with percentages below.
5. **School Performance** (`Card`): inner heading "School Performance (%)", then a line chart of attendance rate, blue `#3b82f6`, 0–100% axis, with a dashed green "80% Target" reference line.
6. **Detailed School Performance** (`Card`): search box (magnifier icon, "Search schools...") and a status select (All Status / Good / Warning / Critical). Table: School, Enrollment, Attendance %, Teachers, Last Submission, Status (rounded chip: Good green, Warning yellow, Critical red). 10 rows per page, chevron pagination "Page X of Y (N schools)". Empty: "No schools found."
7. **Data Submission Monitoring** (`Card`): table with School, Student, Type, Date. 10 per page, chevron pagination. Empty: "No submissions found."
8. **Incident Monitoring** (white `rounded-lg border border-slate-300 p-6`): severity select (All Severities / Critical / High / Medium / Low) with count chips beside it ("2 Critical", "1 High"…, shown only when above zero). Each incident is a tinted bordered row: severity chip, date, title, description, and a white "Mark Reviewed" button on the right. Empty: green check icon and "No open incidents".
9. **Quick Actions** (same card): three bordered link tiles in a row, each with a 40px `bg-slate-200` icon tile, a title and a caption — "Send Broadcast / Message all schools", "Generate Report / Create district reports", "Schedule Visit / Plan school inspections". Hover: `border-sky-300 bg-sky-50`.

**No-district state.** A centred `max-w-md` card: amber warning tile, heading "No District Assignment", an explanation, a blue "What to do next:" box with three bullets (contact your County Administrator; request assignment to a district; once assigned, you'll have full dashboard access), and a footnote about DEOs being reassigned by County Administrators.

### 4.2 Schools — `/schools`

**Banner:** "DEO Portal" / "Schools Management", district block.

**Body:** one square card.

- Heading "Schools in District" (`text-lg font-bold`), with "N schools · Click a school to view details" below (`text-sm text-gray-600`).
- Square filter pills: All, Compliant, Needs Review, Flagged, Primary, Secondary. Counts are computed but not shown.
- Table; the whole row is clickable and goes to the school detail page.

| Column | Content |
|---|---|
| School | Name, `text-sm font-semibold` |
| Level | Plain text |
| Principal | Name from school metadata |
| Students | Number with thousands separator |
| Teachers | Number |
| Attendance | Progress cell (thresholds 80 / 70) |
| Reports | A row of dots, `w-2 h-2 rounded-full`: green for submitted, grey for outstanding |
| Status | Square chip: Compliant `bg-active`, Needs Review `bg-pending`, Flagged `bg-error`, all with `text-slate-100` |
| (last) | `ChevronRight` in grey |

Empty: `Building2` icon, "No schools found". Error: "Failed to load schools. Please try again."

### 4.3 School detail — `/schools/[id]`

**Banner:** on the left, a back button ("← Schools", uppercase, `text-slate-400 hover:text-white`), a thin vertical divider, then the eyebrow "DEO Portal · School Detail" over the school name. On the right, a chip `rounded-full bg-emerald-900 text-emerald-300` that always reads "Compliant".

**Body (rounded cards):**

1. **Header card**: a 64px `bg-slate-100 rounded-2xl` tile with `Building2`; school name (`text-xl font-bold text-slate-900`); a line "Level · Address · Est. 2001"; "Principal: name" in `text-sky-700 font-medium`.
2. **Four KPI cards**, each with a 40px tinted icon tile, a `text-3xl` value, a label, and a `text-xs text-sky-600` caption:
   - Total Students (purple, GraduationCap) — "District enrollment"
   - Total Teachers (pink, Users) — "Active staff"
   - Attendance % (green, CheckCircle) — "School average"
   - Performance Avg % (cyan, TrendingUp) — "Academic metrics"
3. **Two columns**:
   - **Enrollment by Grade**: one row per grade — grade label and count, then a `h-8` rounded bar in `bg-sky-600` with the count printed inside, scaled to the largest grade. Empty: "No enrollment data available".
   - **Gender Distribution**: two rows, Male (`bg-blue-500`) and Female (`bg-pink-500`), each a `h-6` rounded bar with the count on the right.
4. **Two columns**:
   - **Fee Compliance**: a `h-4` bar in `bg-orange-500`, the percentage in `text-2xl font-bold`, caption "Fees collected relative to target".
   - **Reports**: dots (`w-3 h-3`), "x/y submitted", caption "All required reports submitted".

Loading and not-found share one line: "School not found or loading...".

### 4.4 School Admins — `/school-admins`

**Banner:** "DEO Portal" / "School Admins", district block.

**Body:**

1. **Three plain-number KPI cards** (`md:grid-cols-3`): Total Admins (grey-900), Active (`text-active`), Suspended (`text-pending`).
2. **Directory card** (square): heading "School Admin Directory" on the left, square pills on the right — All, Active, Suspended.
3. **One bordered row per school admin** (`border border-gray-200 rounded-sm p-4`), stacked with `space-y-4`:
   - Left: avatar (medium), name (`text-base font-semibold`), "Principal · School name" (`text-sm text-gray-600`), "ID: ADM-XXX · Joined: Mon DD, YYYY" (`text-xs text-gray-500`).
   - Below that, three small status lines, each with a 6px dot: "Submitted N reports this month" (green), "N open infrastructure issues" (red when above zero, otherwise green), "Last active: …" (green).
   - Right: a square chip with a check icon — "Active" (`bg-active`) or "Suspended" (`bg-error`) — then two grey icon buttons, message (`MessageSquare`) and flag (`Flag`, turns red on hover). Neither button does anything on the web.

Empty: `Users` icon, "No school admins found". Error: "Failed to load school admins."

There is one row per school, not per user: the admin is the school's `INSTITUTION_ADMIN` user, or the principal name from metadata when there is none.

### 4.5 Teachers — `/teachers`

**Banner:** "DEO Portal" / "Teacher Monitoring", district block.

**Body:**

1. **Four plain-number KPI cards**: Total Teachers (grey-900), Grades Pending (`text-pending`), On Leave (`text-pending`), Low Attendance (`text-error`).
2. **View switch**: two rounded-xl pills, "Individual Teachers" and "By School".
3. **Rounded card** "Teacher Overview" with rounded-xl pills on the right: All, Grades Pending, Low Attendance, On Leave.

**Individual view table:**

| Column | Content |
|---|---|
| Teacher | 40px grey circle with initials; name; employee number below |
| School | School name |
| Subject | First subject, else first class's grade level, else "General" |
| Attendance | Progress cell (thresholds 90 / 75) |
| Grades | Rounded chip with a check icon: "Pending" amber or "Submitted" green |
| Status | Rounded chip: On Leave (grey), Pending Approval (amber), Low Attendance (red), Active (green), Inactive (grey) — checked in that order |

**By School view table:**

| Column | Content |
|---|---|
| School | Name; first three subjects below, or "No subjects linked" |
| Teachers | Count |
| Avg Attendance | Progress cell |
| Pending Grades | Count |
| Low Attendance | Count |
| Status | "Needs Attention" amber when any of pending grades, low attendance, or on leave is above zero; otherwise "Stable" green |

The filter pills apply to both views. Empty: "No teachers found" / "No school groupings available for this filter."

### 4.6 Students — `/students`

**Banner:** "DEO Portal" / "Students & Enrollment", district block.

**Body:**

1. **Four plain-number KPI cards**: Total Enrollment (grey-900), Male Students (`text-secondary`), Female Students (`text-pending`), Avg Attendance % (grey-900).
2. **Two square cards**:
   - **Enrollment Trend**: a 200px area of plain CSS bars (`bg-[#0ea5e9] rounded-t`), last six periods, each with its label below. Bars scale to the tallest, minimum 12px. Empty: "No data available".
   - **Gender Split**: a 160px SVG ring (stroke 20) — male `#025981`, female `#913d05` — with a legend to the right: coloured dot plus "Male: N" / "Female: N".
3. **Enrollment by School** (square card) table:

| Column | Content |
|---|---|
| School | Name |
| Level | Rounded chip: Primary `bg-purple-100 text-purple-700`, anything else `bg-indigo-100 text-indigo-700` |
| Total | Enrolment |
| Teachers | Count |
| Last Submission | "Mon DD, YYYY" or "No submission" |
| Attendance | Coloured percentage (90 / 75) |
| Status | Rounded chip: Good green, Warning amber, Critical red |

4. **Dropout Alerts** (rounded card, only when there are any): rows in `bg-red-50 border border-red-100 rounded-lg p-4` — a red circular `TrendingDown` icon, school name, "Reason: …", and "N students at risk" in red on the right. A school is listed when it has pupils and attendance is below 80%, or its status is Critical, or it has no submission on record. Sorted worst attendance first.

This page lists schools, not individual pupils.

### 4.7 Transfers — `/transfers`

**Banner** (different from the rest): an `ArrowRightLeft` icon beside the eyebrow "District Management"; title "Student Transfer Requests"; and, when any are pending, a line "N pending request(s) awaiting review" in `text-xs text-amber-400`. No district block.

**Body** is narrow and centred: `max-w-3xl mx-auto`.

1. **Filter pills** (`px-4 py-1.5 text-xs font-semibold`): All, Pending, Approved, Rejected, Cancelled. Active `bg-secondary text-white`; inactive white with a slate border. Starts on Pending.
2. **One card per transfer** (`bg-white rounded-2xl shadow-sm`), collapsed by default:
   - Header (a full-width button): pupil name with the status chip beside it (Pending amber, Approved emerald, Rejected red, Cancelled slate, Lapsed violet — lapsed is checked first); below, a `Building2` icon and "From school → To school" (destination in `font-medium text-slate-700`); a chevron on the right.
   - Expanded: a two-column grid of labelled fields (labels `text-xs text-slate-400 uppercase tracking-widest`): **Student** (name, NEMIS ID, grade), **Requested** (date, plus "Transfer by: date"), **Requested Grade** (when set), **Reason** (full width), **Review Notes** (full width, italic, when present).
   - For a pending request: a "Review Notes (optional)" textarea (2 rows, placeholder "Add a note for the school admin…"), then two equal buttons — **Reject** (`text-red-700 bg-red-50 border border-red-200 rounded-xl`, XCircle) and **Approve** (`text-white bg-emerald-700 rounded-xl`, CheckCircle2).
   - A failed action shows a red strip inside the card with the server's message.

Empty: a white bordered box with a `Clock` icon and "No pending transfer requests." or "No transfer requests found."

### 4.8 Generate Reports — `/reports/automated`

**Banner:** "DEO Portal" / "Automated Reports". Right side: two banner buttons — **Filters** (Building2 icon, chevron that flips when open) and **Refresh** (icon spins while loading).

**Body:**

1. **Filter panel** (square card, `p-4`, only when Filters is open): "School Filter" select (All Schools + each school). For the Attendance report only, a "Time Period" select: Last 7 Days, Last 4 Weeks, Last 3 Months.
2. **Report type selector**: four tiles (`grid-cols-2 lg:grid-cols-4 gap-4`) — Enrollment (Users), Attendance (Calendar), Academic (GraduationCap), Staff & Compliance (ClipboardCheck). Each has a 40px `bg-slate-700` square with a white icon, the name, and the caption "Report". Selected: `border-secondary border-2 bg-sky-50 shadow-md`, name in `text-secondary`.
3. **Export toolbar** (square card, `p-4`): left — `FileText` icon, "<Type> Report", "• Generated <date time>"; right — "Export as:" and three white bordered buttons, **PDF** (Download), **Excel** (FileSpreadsheet), **Word** (FileType), disabled until a report is loaded.
4. Loading: spinner with "Generating report...". Error: a red rounded box, "Failed to load report / Please try again or contact support."
5. **The report**, one of four views. Each is: compact icon-left summary cards → charts in square cards (`p-4`) → a table card with a `bg-slate-50` title strip.

| Report | Summary cards | Charts | Table columns |
|---|---|---|---|
| **Enrollment** | 5: Total Schools, Total Students, Male Students, Female Students, Gender Ratio (suffix "M:F") | Gender ring (1 column) + Grade Level bars (2 columns); Enrollment Trend line, full width | "Enrollment by School": School, Code, Total, Male (blue), Female (pink) |
| **Attendance** | 6: Total Schools, Total Records, Present, Absent, Late, Attendance Rate % | Attendance Status pie + Attendance Trend line | "Attendance by School": School, Students, Records, Present (green), Absent (red), Late (yellow), Rate (chip: ≥90 green, ≥75 yellow, else red) |
| **Academic** | 6: Total Schools, Total Grades, Average Score %, Pass Rate %, Passed, Failed | Pass/Fail ring + Subject Performance horizontal bars | "Performance by School": School, Code, Grades, Avg Score, Pass Rate (chip: ≥80 green, ≥60 yellow, else red) |
| **Staff & Compliance** | Two rows of 4: Total Schools, Total Students, Total Teachers, Compliance Rate %; then Total Staff, Qualified Teachers, Qualification Rate %, Teacher:Student Ratio ("1:N") | Compliance Status ring, Teacher Qualification pie, School Compliance bars (3 columns) | "Staff Details by School": School, Students, Staff, Teachers, Qualified, Ratio, Status (Compliant green / Non-Compliant red) |

The DEO has four report types. The County version has a fifth (Financial), which the DEO page does not offer.

### 4.9 Finance — `/finance`

**Banner:** "DEO Portal · Finance" / "Finance Monitoring", district block.

**Body:** underline tabs — **Overview**, **Flagged Activity**, **Audit Logs**.

**Overview tab:**

1. **Four KPI cards** (square, `shadow-sm`; value first, label `text-sm font-medium text-gray-500`): District Allocation, Collected, Collection Rate %, Outstanding. Money is shown compact in LRD (e.g. "LRD 1.2M").
2. **Two square cards** (`xl:grid-cols-2`):
   - **Budget Utilization**: three labelled `h-3` rounded bars with the percentage on the right — Collection Rate (teal-600), Coverage Across Schools (sky-500), Outstanding Exposure (amber-500). Below, three small tiles (`rounded-2xl bg-slate-50 border border-slate-200`): Schools Tracked, Schools Billing, Behind Target.
   - **Monthly Collection Trend**: heading with a small tag on the right ("Live payment totals", CircleDollarSign icon). A 256px area of CSS bars (`bg-pending rounded-t-2xl`, up to 68px wide) with the compact amount above each bar and the period below. Empty: "No completed payments recorded in the last six months."
3. **Schools table card** (square): square pills — ALL, On Track, At Risk, Behind, No Data. Table, `min-w-[1100px]`:

| Column | Content |
|---|---|
| School | Name over school code |
| Principal | Name |
| Allocation | Full LRD amount |
| Collected | Teal-700 |
| Outstanding | Amber-700 |
| Compliance | Percentage and collected amount above a `h-2.5` bar; fill by status — On Track emerald, At Risk amber, Behind orange, No Data slate |
| Students | Count |
| Last Payment | "Mon DD, YYYY" or "No payment yet" |
| Status | Rounded chip, same colours |
| Action | "View School" (`rounded-xl bg-sky-50 text-sky-700`) → school detail |

   Status comes from the collection rate: On Track at 80% and above, At Risk at 50–79%, Behind below 50%, No Data when nothing is billed. Rows are sorted best rate first.

   Empty: `Clock3` icon, "No schools matched the current finance filter."

**Flagged Activity tab:** an amber notice box (TriangleAlert): "Schools with a collection rate below 30% are flagged for follow-up." Then a rounded table: School (name over code), Expected, Collected (teal), Outstanding (amber) — all right-aligned — Rate (a 96px bar: ≥70 emerald, ≥30 amber, else red, with the percentage), Status ("Flagged" red chip with icon, or "Monitor" grey chip). Empty: "No schools with concerning activity".

**Audit Logs tab:** a rounded table: Time ("Mon DD, HH:MM"), User (name or email), Action (sky rounded chip), Entity ("type #first-8-of-id"). Last 50 entries. Empty: "No finance audit entries found".

### 4.10 Messages — `/messages`

**Banner:** "DEO Portal" / "Messages" (no district block). Opening the page clears the unread-messages count.

**Body:** one two-pane panel, `flex h-[calc(100vh-140px)] border border-slate-300 bg-white shadow-sm`.

**Left pane** (`w-80`, right border):

- Header: `MessageSquare` icon, "Messages", and "N contacts" on the right in grey.
- Search box ("Search school admins…"), hidden when only County Admin is selected.
- Three equal filter buttons: All, County Admin, School Admin. Active `bg-primary text-white`.
- Contact list:
  - **County Admin, pinned first**: amber 44px circle with initials, a small `Crown` icon before the name, "County Admin" in `text-amber-700`, last message preview, amber unread counter. Selected: `bg-amber-50` with an amber left border.
  - A grey section strip "SCHOOL ADMINS (N)".
  - **School admins**: those with a conversation first (newest first), then the rest alphabetically. A contact with a conversation shows avatar, name, relative time ("5m", "2h", "3d"), "ROLE · School", last message, and an unread counter (`bg-accent`). A contact without one shows a grey initials circle, name, and school. Selected: `bg-blue-50` with an `accent` left border.
  - A green dot on the avatar and the word "Active" for anyone online.

**Right pane:**

- Nothing selected: centred icon, "Select someone to message", "Choose a person from the list on the left".
- Thread header (`bg-gray-50`, bottom border): 36px `bg-primary` initials circle, name, "ROLE · School", then "Active now" (green dot) or "Offline".
- Messages on `bg-gray-50/30`. Own messages right-aligned, `bg-primary text-white rounded-2xl rounded-tr-sm`; others left-aligned, white with a border and `rounded-tl-sm`, with the sender's name above. Time below each. Bubbles are at most 70% wide.
- Composer: a 2-row textarea ("Type a message… (Enter to send, Shift+Enter for new line)") and a 40px `bg-primary rounded-xl` send button. Hint below: "Press Enter to send · Shift+Enter for new line".

The panel lists only two kinds of contact from the server's eligible-recipients list: the County Admin and School Admins.

### 4.11 Notifications — `/notifications`

**Banner:** "DEO Portal" / "Notifications".

**Body** (the `DeoNotificationsPanel`):

1. A second heading "Notifications" (`text-2xl font-bold`) over "DEO Portal · <District> · <County>" (real names here). On the right, a **Mark All as Read** button (`bg-slate-300 border border-slate-400`, check icon), disabled when nothing is unread.
2. The unread count as a large number (`text-3xl font-bold`) over "Unread notifications".
3. Filter pills, each with a count: All, Unread, then Alert, Warning, Report, Info, Message, Announcement (a type is shown only when it has at least one item). Active `bg-primary text-white`; inactive white with a border.
4. One tinted card per notification (`border px-5 py-5 shadow-sm`): a 48px `rounded-2xl` icon tile, the title (`text-lg font-semibold`) with a coloured dot when unread, the message, and a line with the source name and a relative time ("5 minutes ago"). On the right: **Mark as Read** (white rounded-full, only when unread) and **Open** (`bg-primary` rounded-full, only when the notification has a link; opening also marks it read).

| Type | Card tint | Icon |
|---|---|---|
| ALERT | red-50 | ShieldAlert |
| WARNING | amber-50 | TriangleAlert |
| REPORT | indigo-50 | FileText |
| MESSAGE | sky-50 | MessageSquare |
| ANNOUNCEMENT | teal-50 | Megaphone |
| SUCCESS | emerald-50 | CheckCircle2 |
| other (INFO) | gray-50 | Info |

Empty: `Bell` icon, "No notifications yet." or "No notifications match this filter."

### 4.12 Settings — `/settings`

**Banner:** "DEO Portal" / "Settings".

**Body** (the `DeoSettingsPanel`, one form):

1. Heading "Settings" over "DEO Portal · <District> · <County>".
2. A feedback strip after saving: emerald "Settings saved successfully." or red "Unable to save settings right now. Please check your inputs and try again."
3. **Profile Information** (square card with a title row):
   - A 96px `rounded-3xl` navy gradient tile with the first initial; the full name (`text-3xl font-bold`); the role label (`text-lg text-gray-600`); a small slate tag with the district name.
   - Two-column field grid. Labels `text-xs font-semibold uppercase tracking-wide text-gray-500`; inputs square, `border border-gray-300 px-4 py-3 text-sm`. Editable: First Name, Last Name, Phone. Read-only (grey): Email, Employee ID, District, County.
   - Full-width "Office Address" textarea, 3 rows.
4. **Security** (rounded card, `LockKeyhole` icon): Current Password ("Required only when changing password") and New Password ("Leave blank to keep your current password").
5. **Notification Preferences** (square card, `Settings2` icon): seven rows, each a label, a one-line description, and a switch (`h-7 w-12 rounded-full`, on = `bg-primary`, off = `bg-gray-300`):

| Switch | Description | Default |
|---|---|---|
| Report Submission Alerts | Notify when schools submit reports. | on |
| Missing Report Alerts | Notify when reports are overdue. | on |
| Infrastructure Issue Alerts | Notify on new district infrastructure issues. | on |
| Low Attendance Alerts | Notify when attendance drops below district thresholds. | on |
| Message Notifications | Notify on new direct school messages. | on |
| Finance Alerts | Notify on fee compliance and finance issues. | off |
| District Announcements | Keep district-wide announcement activity in your feed. | on |

6. **Save Changes** button, bottom right: `bg-primary px-5 py-3 text-sm font-semibold text-white`, `Save` icon (spinner while saving).

### 4.13 Reports & Compliance — `/reports`

**Banner:** "DEO Portal" / "Reports & Compliance", district block.

**Body:**

1. **Four icon-tile KPI cards** (`xl:grid-cols-4`): Approved (green, CheckCircle2), Pending (amber, Clock3), Rejected (red, XCircle), Missing (slate, FileWarning).
2. **Filter card** (rounded) with two rows of rounded-full pills:
   - Status, each with an icon and a count: All, Approved, Pending, Rejected, Missing. Active `bg-sky-700 text-white`; inactive pills keep their status tint.
   - Record type: "All" plus every type present in the data. Active `bg-slate-900 text-white`.
3. **Table card** (rounded, `min-w-[980px]`):

| Column | Content |
|---|---|
| School | Name over code |
| Record Type | Text |
| Period | Text |
| Submitted By / Record | Name over a note |
| Date | "Mon DD, YYYY" or "Not submitted" |
| Status | Rounded chip: Approved green, Pending amber, Rejected red, Missing slate |
| Actions | Two 36px `rounded-xl` icon buttons: Eye (cyan) and Download (grey). Both open the school detail page. |

Empty: "No compliance records matched your filters."

### 4.14 Alerts — `/alerts`

**Banner:** "DEO Portal" / "Alerts", district block.

**Body:** one rounded card.

- Heading "System Alerts" with a `Filter` icon and a select on the right: Open Alerts (default), Resolved, All Alerts.
- Each alert is a tinted bordered row (`p-4 rounded-xl border`), dimmed to 60% when resolved: a `Bell` icon, a severity chip (rounded-full), the type in grey uppercase (underscores turned into spaces), the date, and a green "Resolved" chip when resolved. Then the title, the description, and "Resolved on <date>". An open alert has a white **Resolve** button on the right.
- Severity tints: CRITICAL red, HIGH orange, MEDIUM yellow, anything else blue.
- 15 per page, chevron pagination above a top border.

Empty: green check icon, "No open alerts — all clear!" or "No alerts found."

### 4.15 Analytics — `/analytics`

**Banner:** "DEO Portal" / "Analytics Dashboard". Right side: an academic-year select (current and two previous, e.g. "2026/2027"), a term select (Term 1–3) — both dark (`bg-slate-800 text-white border-slate-600 rounded-lg`) — then "Updated HH:MM:SS" in grey, then a **Refresh** banner button. The two selects do not change what is shown.

**Body:**

1. **Error strip** (when a load fails): red rounded box, "Failed to load some analytics data." with "Retry".
2. **Five KPI cards** (`lg:grid-cols-5 gap-4`, rounded, `hover:shadow-md`): uppercase label, `text-2xl` value, an optional trend (green ▲ or red ▼ with a figure) and a caption, with a 44px tinted icon tile on the right.
   - Total Enrollment — "Active students", trend vs the previous month
   - Avg Attendance — "Current month"; value and tile coloured green ≥85, amber ≥75, red below
   - Gender Ratio — "52:48", caption "52% male / 48% female"
   - Schools Performing Well — "Attendance ≥ 80%", green
   - Underperforming — "Warning + Critical", red when above zero
3. **Enrollment row** (two rounded cards): "Enrollment Trend (6 Months)" (line chart) and "Top 10 Schools by Enrollment" (horizontal bars, `#3b82f6`, 350px, names cut at 16 characters).
4. **Attendance row**: "Attendance Rate Trend (6 Months)" (line with the 80% target) and "School Attendance Comparison" — horizontal bars for the 15 lowest schools, coloured red below 75, amber 75–85, green above, with a small legend and dashed reference lines at 75% and 85%.
5. **Gender row** (1 + 2 columns): the ring chart, and "Gender Breakdown" — Male (`bg-blue-500`) and Female (`bg-purple-500`) `h-3` bars with "count (percent)", then a "Total Students" line above a top border.
6. **Performance Insights** (rounded card): `Lightbulb` icon, "Auto-generated insights based on current district data". A stack of one-line tinted rows, each with an icon: success (green, CheckCircle), warning (amber, AlertTriangle), danger (red, ShieldAlert), info (blue, Info). Empty: "All metrics are within normal ranges."
7. **Teacher Analytics** (rounded card): four tinted mini-tiles — Total Teachers (violet), Active (green), Inactive (red), Avg per School (blue). Then "Top Schools by Teacher Count": School, Teachers, Distribution (a violet `h-2` bar with the percentage).
8. **School Comparison** (rounded card): a grouped horizontal bar chart of the top 12 schools — Enrollment (`#3b82f6`), Attendance % (`#10b981`), Teachers (`#8b5cf6`), 400px tall, with a legend.

Insight rules, in order: enrolment up or down vs the previous month; attendance moved more than 5 points; district attendance below 75%; count of Critical schools; count of Warning schools; schools with no submission in 7 days; open incidents (red above 3); pending submissions; gender gap above 20 points.

### 4.16 Submissions — `/submissions`

**Banner:** "DEO Portal" / "Submissions". Right: the district block, then a **Refresh** banner button.

**Body:**

1. **Five compact KPI cards** (`grid-cols-2 lg:grid-cols-5 gap-4`): Total Submissions (blue, ClipboardList), Pending (yellow, Clock), Approved (green, CheckCircle), Rejected (red, XCircle), Overdue (orange, AlertCircle).
2. **Toolbar card** (rounded), two rows:
   - Segmented control (All / Pending / Approved / Rejected, each with an icon); a search box ("Search by school or student name..."); a "Newest first" / "Oldest first" toggle button.
   - "All Schools" select, "All Types" select, From and To date inputs, and a "Clear all filters" link when any filter is on.
3. **Table card** (rounded):

| Column | Content |
|---|---|
| School | Name |
| Student | Name |
| Type | Capitalised |
| Grade | Grade level |
| Status | Rounded chip with icon: APPROVED green, REJECTED red, WITHDRAWN grey, otherwise yellow |
| Date | Local date |
| Compliance | Chip: "Overdue" red (pending more than 30 days), "Late" amber (more than 21 days), "On Time" green |
| Actions | "View" (sky, Eye), a download icon, and for pending rows small solid **Approve** (green) and **Reject** (red) buttons |

   Overdue rows are tinted `bg-red-50/50`, late rows `bg-amber-50/40`. Clicking a row opens the detail modal. 15 per page, numbered pagination.

4. **Submission Details modal** (`Modal` from `@nemis/ui`):
   - A tinted status box (emerald / red / slate / amber) with a status icon, "<Type> submission for <name>", "Submitted on <date>", and a status badge.
   - A compliance pill: "On Time", "Late (Nd)", "Overdue (Nd)", or "Resolved".
   - A two-column grid of detail tiles (`rounded-lg bg-gray-50 p-3`: small icon, uppercase label, value): School, Student or Teacher, Submission Type, Grade Level, Submitted On, and — when present — Date of Birth, Gender, NEMIS ID, Employee Number, Position, Employment Type, Email, Phone, Reviewed By.
   - Optional blocks: Guardian Information (name, relationship, phone, email), Previous School (blue), Documents (paperclip, links), Review Notes.
   - For a pending submission: a "Review Notes" textarea (4 rows).
   - Footer: **Download** (bordered), and for pending, **Reject** (red) and **Approve** (emerald).

### 4.17 School Reports Review — `/school-reports`

**Banner:** "DEO Portal" / "School Reports Review", district block.

**Body:**

1. **Four compact KPI cards** (`md:grid-cols-4 gap-4`, rounded, `p-4`): Pending Review (blue, FileText), Flagged Schools (red, Flag), Schools Reported Today as "x/y" (green, School), District Attendance Rate % (purple, Users).
2. **Underline tabs** with count chips: Pending Review, Flagged Schools, Attendance Summary.

**Pending Review tab** — a rounded card with a title row ("Reports Awaiting Review", and a "Refresh" text button):

| Column | Content |
|---|---|
| School | Name over code |
| Report | Title over a truncated description |
| Type | Weekly Summary, Attendance, Incident, Monthly Performance, Compliance, Academic, Operational |
| Submitted | Date and time, "by <name>" below |
| Actions | Three icon buttons: Eye (view), CheckCircle (approve, green on hover), XCircle (reject, red on hover) |

10 per page, "Previous" / "Next". Empty: green check, "No pending reports to review".

**Flagged Schools tab** — a rounded card, "Flagged Schools" / "Schools requiring immediate attention". A divided list: a circular flag icon tinted by severity (CRITICAL red, HIGH orange, otherwise yellow), school name, code, description, "Flagged: <date time>", and a severity chip on the right. Empty: "No flagged schools".

**Attendance Summary tab:**

- A rounded card "District Attendance Summary" with four tinted tiles: Total Schools (blue), Reported (green), Not Reported (red), Attendance Rate (purple).
- A rounded table card "School-by-School Breakdown": School (name over code), Students, Present (green), Absent (red), Rate (coloured, 90 / 75), Status ("Submitted" green or "Not Submitted" red).

**Modals** (hand-built overlays, `fixed inset-0 bg-black/50`, white `rounded-xl` box):

- **Report Details** (`max-w-2xl`): status chip (Submitted blue, Under Review yellow, Approved green, Rejected red, Escalated purple) and the type; title and description; a grey two-column box (School, Code, Submitted, By); a Comments list (name, role, time, text). Footer: **Escalate to County** (purple, left); **Close**, **Reject** (red), **Approve** (green) on the right.
- **Review** (`max-w-md`): three choice buttons — Approve (green), Reject (red), Request Correction (yellow) — a "Comments (optional)" textarea, then **Cancel** and **Submit Review** (coloured to match the choice).
- **Escalate to County** (`max-w-md`): one explanatory line, a required "Reason for Escalation *" textarea, then **Cancel** and **Escalate Report** (purple, disabled until a reason is typed).

### 4.18 Infrastructure & Issues — `/infrastructure`

**Banner:** "DEO Portal" / "Infrastructure & Issues", district block.

**Body:**

1. **Four icon-tile KPI cards**: Total Issues (grey, Wrench), Critical (red, AlertTriangle), Open / Under Review (slate, Clock3), Escalated (amber, ArrowUpRight).
2. **Filter card** (rounded, one row, two groups of rounded-full pills with counts):
   - Severity: All, Critical, High, Medium, Low. Active `bg-sky-700`.
   - Status: Open, Under Review, Escalated. Active `bg-slate-900`. There is no "All" pill here; once a status is picked it cannot be cleared.
3. **One card per issue** (`rounded-2xl border p-6 shadow-sm`), tinted by severity (CRITICAL red, HIGH orange, MEDIUM amber, LOW white):
   - Top: a 48px icon tile (shield for inspection, building for staff, alert for capacity, otherwise wrench), the issue title (`text-xl font-bold`), "School · Category". On the right, a severity chip and a status chip (Open sky, Under Review violet, Escalated red, Resolved green).
   - A white note box: "Note: …".
   - Bottom: "Reported: <date>" and "School-linked issue" or "District-level issue". On the right, the actions:
     - **View School** (white, bordered) when the issue belongs to a school.
     - **Review** (Eye) when Open.
     - **Resolve** (green text, CheckCircle) when Open or Under Review.
     - **Escalate** (`bg-sky-700 text-white`, ArrowUpCircle) when Open or Under Review *and* High or Critical.
     - A dark "Escalated to County" tag when Escalated.
4. **Action modal** (`Modal`): the title depends on the action — "Review Infrastructure Issue", "Resolve Infrastructure Issue", "Escalate to County". It shows the issue title, then either a "Comments (Optional)" textarea or, for escalation, a required "Reason for Escalation *" textarea with the line "This issue will be sent to the County Education Office for immediate attention." Footer: **Cancel** and a `bg-sky-700` confirm button — "Mark as Under Review", "Mark as Resolved", or "Escalate to County".

Empty: `Wrench` icon, "No infrastructure issues matched your filters."

### 4.19 – 4.22 The four simple list pages

Incidents, Supervision, Resources and Data share one template:

- **Banner:** "DEO Portal" over the title, nothing on the right.
- **Body:** a single card, `bg-white rounded-2xl shadow-sm overflow-hidden`, with a header strip (`px-5 py-4 border-b border-slate-100`) holding an uppercase grey section label, then a `p-5` area with a stack of item boxes (`border border-slate-100 rounded-xl p-4 hover:bg-slate-50`).
- Loading, error and empty states: a centred 40px icon in `text-slate-300` (red for errors) over one line of `text-slate-500 text-sm`.
- No "no district" guard on these four.

| Page | Title | Section label | Item content | Empty text |
|---|---|---|---|---|
| `/incidents` | Incidents & Community Issues | Reported Incidents | Title, description, "Reported: Mon DD, YYYY", a severity chip (CRITICAL red, HIGH orange, MEDIUM amber, else sky) and an "Open" / "Resolved" chip | No incidents reported. |
| `/supervision` | Supervision & Inspection | Supervision Reports | Title, "Date: …", a status chip (completed emerald, in_progress amber, else slate), and a "View Report →" link on the right when a file exists | No supervision reports available. |
| `/resources` | Approved Reports & Policies | District Resources | Title, "Published: …", a type chip (REPORT sky, otherwise violet), and a "Download →" link on the right | No approved resources available. |
| `/data` | Data Submissions | Enrollment, Attendance & Teacher Data | "<Type> Data", "Submitted: …", a status chip (approved emerald, submitted sky, pending county validation amber, else slate) | No data submissions found. |

---

## 5. Web placeholders and inconsistencies

These are facts about the web page as built. The County port rule so far has been: copy the web's behaviour, but never copy hard-coded fake values. Each item below needs that call made when its page is specified.

**Hard-coded values shown as if they were data**

- "Buchanan · Grand Bassa" as the district on Schools, School Admins, Teachers, Students, Finance, Reports & Compliance, Alerts, Submissions, School Reports, Infrastructure.
- Dashboard banner: "Good afternoon," at any hour; the literal words "District" and "County" in place of the names.
- School detail: the banner chip always says "Compliant"; "Est. 2001"; address falls back to "Buchanan City"; when the server sends no gender split, male is shown as 51% of the total; the Reports caption always says "All required reports submitted"; total reports falls back to 3.
- School Admins: the ID is made up from the first three characters of the school id ("ADM-XXX"); "Last active" falls back to "Recently"; the role is always "Principal"; "Joined" is the school's creation date.

**Controls that do nothing**

- Dashboard: "View All →" on Schools at a Glance; "Send Broadcast" links to `/communications`, which does not exist; "Schedule Visit" just opens the Schools list.
- School Admins: the message and flag buttons.
- Analytics: the academic-year and term selects.
- Reports & Compliance: the Download button opens the school page, same as the Eye button.
- Submissions: "Download" saves the row as a JSON file.

**Other things to know**

- Dashboard KPI loading shows 8 skeleton cards for a 4-card grid.
- Schools: the Primary and Secondary tab counts match "Primary" / "Secondary" only, while the filter also accepts the upper-case spellings.
- School Admins: the "Suspended" chip uses a check icon.
- Submissions: status counts and filters work on the current page of 15 only, while the Total card uses the server total.
- School Reports: the tab type includes "reviewed" but no such tab is drawn.
- Infrastructure: the status filter has no way back to "all".
- Notifications and Settings draw the page title twice (banner, then again inside the panel).
- School detail reads from the district schools list; there is no single-school request.
- Finance uses three different cut-offs: the school status is On Track at 80% and above, At Risk at 50–79%, Behind below 50% (No Data when nothing is billed); the Flagged Activity tab flags below 30% and colours its bar at 70 / 30; County finance uses 70 / 40.

---

## 6. Desktop pieces that already exist

Built for the County or School Admin portals and likely to be reused or adapted:

| Web piece | Desktop equivalent |
|---|---|
| Dark banner + Sora page frame | Used by `app/government/county/*` pages |
| Generate Reports page, charts, PDF / Excel / Word export | `components/county/reports/` (`GenerateReportsPage`, `ReportCharts`, report views), `lib/reports/automatedReportExport.ts`, `system:save-file` IPC |
| Messages two-pane panel | `components/county/messaging/` (`CountyMessagesPanel`, `MessageThread`, `MessageBubble`, `ConversationListItem`, `SidebarContactItem`) |
| Notifications page | `components/county/notifications/CountyNotificationsPage.tsx` |
| Settings page | `components/county/settings/CountySettingsPage.tsx` |
| Transfer status chip, transfer rows and forms | `components/transfers/` |
| Enrolment trend chart | `components/county/charts/EnrollmentTrendChart.tsx` |
| Finance display helpers | `components/county/finance/finance-display.ts` |
| `Card`, `Avatar`, `Modal`, `Textarea`, `Badge`, `Spinner`, `Table`, `EmptyState`, `ErrorState`, `Skeleton`, `ProgressBar` | `@nemis-desktop/ui` |
| School detail on a dynamic route (`/schools/[id]`) | Desktop uses query routes: `schools/details?id=` (static export) |
