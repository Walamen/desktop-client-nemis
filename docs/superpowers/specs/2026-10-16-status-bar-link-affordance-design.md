# Status bar links look clickable — design

Date: 2026-10-16
Repo: desktop-client-nemis
Follows: `2026-10-16-sync-pending-changes-design.md` (merged at dd03298)
File: `apps/desktop/renderer/components/shell/StatusBar.tsx` (+ its test)

## Problem

The status bar's "N pending changes" and "N conflicts" are `next/link`s styled
as plain 11px text. They only change on hover (pending turns blue; conflicts
has no hover style at all), so users don't discover that they open the
Pending changes and Sync conflicts pages.

## Decisions (agreed)

| # | Decision |
|---|---|
| 1 | Icon + count badge + chevron, for **both** links. |
| 2 | One local component renders both so they can't drift. |
| 3 | Screen-reader names stay "47 pending changes" / "2 conflicts". |

## Design

Add a file-local component in `StatusBar.tsx`:

```tsx
function StatusBarLink(props: {
  href: string;
  icon: LucideIcon;
  count: number;
  label: string;        // visible word after the badge
  ariaLabel: string;    // full accessible name
  tone: 'pending' | 'error';
}): JSX.Element
```

Renders a `Link` containing, in order: the icon (`w-3.5 h-3.5`), a count
badge, the label, and `ChevronRight` (`w-3 h-3`).

| Element | Classes / behaviour |
|---|---|
| Link | `inline-flex items-center gap-1.5 rounded-button px-2 py-0.5 hover:bg-slate-200 hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary`; `aria-label={ariaLabel}`; `title={ariaLabel}` |
| Badge | `inline-flex min-w-[1.25rem] justify-center rounded-button px-1.5 text-[10px] font-semibold leading-4`; `data-tone` = `pending` / `error` / `none` |
| Badge colour, count > 0, tone `pending` | `bg-pending/20 text-slate-900` (solid amber + white text is ~4.1:1, fails AA at 10px) |
| Badge colour, count > 0, tone `error` | `bg-error text-white` (~6:1) |
| Badge colour, count = 0 | `bg-slate-200 text-slate-700`, `data-tone="none"` |
| Icon colour | `text-pending` / `text-error` when count > 0, otherwise inherits |

Instances:

| Link | icon | label | ariaLabel | href |
|---|---|---|---|---|
| Pending | `CloudUpload` | `pending` | `pendingLabel(count)` → "47 pending changes" / "1 pending change" (existing helper) | `${portalBase}/sync-pending` |
| Conflicts | `AlertTriangle` | `conflict` (1) / `conflicts` | "1 conflict" / "2 conflicts" | `${portalBase}/sync-conflicts` |

`AlertTriangle` is the name the renderer already uses (13 uses); `CloudUpload`
exists in the installed lucide-react 0.563.0.

The old conflicts styling (`font-semibold text-red-700` when > 0) is replaced
by the red badge and red icon. Nothing else in the status bar changes: no
data, polling, sync-button or layout changes beyond these two links.

## Testing

`StatusBar.test.tsx`:
- Existing tests stay green unchanged (`getByRole('link', { name: '47 pending changes' })`, `'1 pending change'`, href).
- New: the pending link contains a badge showing `47` with `data-tone="pending"`; with `pending: 0` the badge shows `0` and `data-tone="none"`.
- New: the conflicts link is named "2 conflicts" (and "1 conflict" for one), links to `<portalBase>/sync-conflicts`, and its badge has `data-tone="error"` when > 0, `"none"` at 0.

## Out of scope

The sync button, online indicator and "Local database ready" item; any
change to the pages the links open.
