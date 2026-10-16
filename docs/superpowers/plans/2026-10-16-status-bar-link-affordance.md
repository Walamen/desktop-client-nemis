# Status Bar Link Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the status bar's "pending changes" and "conflicts" links look clickable at rest with an icon, a count badge and a chevron.

**Architecture:** One file-local `StatusBarLink` component in `StatusBar.tsx` renders both links; accessible names stay the full phrases via `aria-label`. Badge tone is exposed as `data-tone` so tests don't depend on class names.

**Tech Stack:** Next.js renderer, React 19, Tailwind (tokens `pending`, `error`, `secondary`, `rounded-button`), lucide-react 0.563.0, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-16-status-bar-link-affordance-design.md`

## Global Constraints

- Branch `feature/status-bar-link-affordance`. Never stage `apps/desktop/renderer/app/government/school-admin/students/createbulk/page.tsx` (user's uncommitted edit); never `git add -A` / `git add .`.
- Accessible names: pending "47 pending changes" / "1 pending change"; conflicts "2 conflicts" / "1 conflict".
- Badge, count > 0: pending `bg-pending/20 text-slate-900`; error `bg-error text-white`. Count = 0: `bg-slate-200 text-slate-700`. `data-tone` = `pending` / `error` / `none`.
- Link classes: `inline-flex items-center gap-1.5 rounded-button px-2 py-0.5 hover:bg-slate-200 hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary`.
- Icons: `CloudUpload` (pending), `AlertTriangle` (conflicts), `ChevronRight` (both), all `aria-hidden`.
- No other status-bar behaviour changes.
- Test command: `pnpm vitest run apps/desktop/renderer/components/shell/StatusBar.test.tsx`; also `pnpm typecheck`, `npx eslint apps/desktop/renderer/components/shell`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Zero counts** — both badges show `0` in neutral grey and the links still work (a user may click to confirm nothing is pending). Tests in Tasks 1 and 2.
2. **Singular wording** — "1 pending change" / "1 conflict" names. Tests in Tasks 1 and 2.
3. **Keyboard users** — the link must show a visible focus ring; verified by the class constraint above (reviewer checks the class list; no jsdom test for focus styles).
4. **Bridge unavailable** (status never loads) — both links render with `0`, as today. Covered by the existing first test plus Task 1's zero test.
5. **Large counts** (e.g. 1,250) — the badge must grow rather than clip: `min-w` not fixed width. Reviewer checks; no test.

---

### Task 1: StatusBarLink component + pending link

**Files:**
- Modify: `apps/desktop/renderer/components/shell/StatusBar.tsx`
- Test: `apps/desktop/renderer/components/shell/StatusBar.test.tsx`

**Interfaces:**
- Produces: file-local `StatusBarLink({ href, icon, count, label, ariaLabel, tone }: { href: string; icon: LucideIcon; count: number; label: string; ariaLabel: string; tone: 'pending' | 'error' })` — Task 2 uses it for conflicts.

- [ ] **Step 1: Write the failing tests** — add to the `describe('StatusBar', …)` block in `StatusBar.test.tsx` (add `within` to the `@testing-library/react` import):

```tsx
  it('shows the pending count in an amber badge', async () => {
    getSyncStatus.mockResolvedValue(status(47));
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '47 pending changes' });
    expect(within(link).getByText('47')).toHaveAttribute('data-tone', 'pending');
    expect(within(link).getByText('pending')).toBeInTheDocument();
  });

  it('shows a neutral badge when nothing is pending', async () => {
    getSyncStatus.mockResolvedValue(status(0));
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '0 pending changes' });
    expect(within(link).getByText('0')).toHaveAttribute('data-tone', 'none');
    expect(link).toHaveAttribute('href', '/government/teacher/sync-pending');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/desktop/renderer/components/shell/StatusBar.test.tsx`
Expected: the two new tests FAIL (no `data-tone` badge / text "47" is not a separate element); the 3 existing tests pass.

- [ ] **Step 3: Implement** — in `StatusBar.tsx`:

Change the lucide import to:
```tsx
import {
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  CloudUpload,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
```

Replace the pending `<Link …>{pendingLabel(…)}</Link>` with:
```tsx
        <StatusBarLink
          href={`${portalBase}/sync-pending`}
          icon={CloudUpload}
          count={localSync?.pending ?? 0}
          label="pending"
          ariaLabel={pendingLabel(localSync?.pending ?? 0)}
          tone="pending"
        />
```

Add below the `StatusBar` component (above `pendingLabel`):
```tsx
type StatusBarTone = 'pending' | 'error';

const BADGE_TONE: Record<StatusBarTone, string> = {
  pending: 'bg-pending/20 text-slate-900',
  error: 'bg-error text-white',
};
const ICON_TONE: Record<StatusBarTone, string> = {
  pending: 'text-pending',
  error: 'text-error',
};

/** A status-bar count that opens a page. The icon, badge and chevron make it
 * read as clickable at rest, not only on hover; the full phrase stays the
 * accessible name. */
function StatusBarLink({
  href,
  icon: Icon,
  count,
  label,
  ariaLabel,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  count: number;
  label: string;
  ariaLabel: string;
  tone: StatusBarTone;
}) {
  const active = count > 0;
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex items-center gap-1.5 rounded-button px-2 py-0.5 hover:bg-slate-200 hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
    >
      <Icon aria-hidden="true" className={`w-3.5 h-3.5 ${active ? ICON_TONE[tone] : ''}`} />
      <span
        data-tone={active ? tone : 'none'}
        className={`inline-flex min-w-[1.25rem] justify-center rounded-button px-1.5 text-[10px] font-semibold leading-4 ${
          active ? BADGE_TONE[tone] : 'bg-slate-200 text-slate-700'
        }`}
      >
        {count}
      </span>
      {label}
      <ChevronRight aria-hidden="true" className="w-3 h-3" />
    </Link>
  );
}
```

- [ ] **Step 4: Run tests** — same command → 5/5 PASS, clean output. Then `pnpm typecheck` and `npx eslint apps/desktop/renderer/components/shell` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/shell/StatusBar.tsx apps/desktop/renderer/components/shell/StatusBar.test.tsx
git commit -m "feat(shell): pending changes link shows icon, count badge and chevron

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Conflicts link uses StatusBarLink

**Files:**
- Modify: `apps/desktop/renderer/components/shell/StatusBar.tsx`
- Test: `apps/desktop/renderer/components/shell/StatusBar.test.tsx`

**Interfaces:**
- Consumes: `StatusBarLink` and `StatusBarTone` from Task 1 (same file).

- [ ] **Step 1: Write the failing tests** — add to the same `describe`:

```tsx
  it('shows conflicts in a red badge linking to the conflicts page', async () => {
    getSyncStatus.mockResolvedValue({ ...status(0), conflicts: 2 });
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '2 conflicts' });
    expect(link).toHaveAttribute('href', '/government/teacher/sync-conflicts');
    expect(within(link).getByText('2')).toHaveAttribute('data-tone', 'error');
  });

  it('uses the singular for one conflict and a neutral badge for none', async () => {
    getSyncStatus.mockResolvedValue({ ...status(0), conflicts: 1 });
    const { unmount } = render(<StatusBar />);
    expect(await screen.findByRole('link', { name: '1 conflict' })).toBeInTheDocument();
    unmount();

    getSyncStatus.mockResolvedValue(status(0));
    render(<StatusBar />);
    const none = await screen.findByRole('link', { name: '0 conflicts' });
    expect(within(none).getByText('0')).toHaveAttribute('data-tone', 'none');
  });
```

- [ ] **Step 2: Run to verify failure** — same command. Expected: the two new tests FAIL (conflicts link has no `aria-label`, so its name is "2 conflicts" only by text and has no badge; the singular test fails on "1 conflicts").

- [ ] **Step 3: Implement** — add `AlertTriangle` to the lucide import list, then replace the conflicts `<Link className={…}>…</Link>` with:

```tsx
        <StatusBarLink
          href={`${portalBase}/sync-conflicts`}
          icon={AlertTriangle}
          count={localSync?.conflicts ?? 0}
          label={conflictWord(localSync?.conflicts ?? 0)}
          ariaLabel={`${localSync?.conflicts ?? 0} ${conflictWord(localSync?.conflicts ?? 0)}`}
          tone="error"
        />
```

and add next to `pendingLabel`:

```tsx
function conflictWord(count: number): string {
  return count === 1 ? 'conflict' : 'conflicts';
}
```

- [ ] **Step 4: Run tests** — same command → 7/7 PASS, clean output. Then `pnpm typecheck` and `npx eslint apps/desktop/renderer/components/shell` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/shell/StatusBar.tsx apps/desktop/renderer/components/shell/StatusBar.test.tsx
git commit -m "feat(shell): conflicts link shows icon, count badge and chevron

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
