import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const data = vi.hoisted(() => ({
  windows: [] as Record<string, unknown>[],
  periods: [] as Record<string, unknown>[],
}));

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async ({ collection }: { collection: string }) => ({
      items: collection === 'grade_entry_windows' ? data.windows : collection === 'grading_periods' ? data.periods : [],
      total: 0,
    })),
    saveSchoolAdminRecord: vi.fn(async () => ({})),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { sharedBridge } from '@/services/nemis-bridge/shared';
import { ToastHost } from '@/components/shell/ToastHost';
import { GradeEntryWindowsDrawer } from './GradeEntryWindowsDrawer';
import { CURRENT_YEAR, clearNemis, field, renderWithLayer, stubNemis, termRow } from './setup-test-support';

const win = (over: Record<string, unknown> = {}) => ({
  id: 'w1', name: 'Period 1 Entry', description: null, status: 'DRAFT',
  openDate: '2026-01-05', closeDate: '2026-01-20', gradingPeriodId: 'p1', ...over,
});
const props = () => ({ isOpen: true, onClose: vi.fn(), onNavigate: vi.fn() });
const save = () => vi.mocked(sharedBridge.saveSchoolAdminRecord);

const ACTIONS = ['Open Window', 'Close Window', 'Publish Grades', 'Reopen', 'Unpublish', 'View Grades'];
const shown = () => ACTIONS.filter((name) => screen.queryByRole('button', { name }) ?? screen.queryByRole('link', { name }));

async function renderDrawer(windows: Record<string, unknown>[], p = props()) {
  data.windows = windows;
  data.periods = [{ id: 'p1', termId: 't1', name: 'Period 1' }, { id: 'p9', termId: 't9', name: 'Other Term Period' }];
  stubNemis({ currentYear: CURRENT_YEAR, terms: [termRow(), termRow({ id: 't0', academicYearId: 'y0', name: 'Old Year Term' })] });
  await renderWithLayer(
    <>
      <GradeEntryWindowsDrawer {...p} />
      <ToastHost />
    </>,
  );
  return p;
}

afterEach(() => {
  clearNemis();
  vi.clearAllMocks();
  data.windows = [];
  data.periods = [];
});

describe('GradeEntryWindowsDrawer list view', () => {
  it('lists windows under the drawer title', async () => {
    await renderDrawer([win()]);
    expect(screen.getByRole('heading', { level: 2, name: 'Grade Entry Windows' })).toBeInTheDocument();
    expect(await screen.findByText('Period 1 Entry')).toBeInTheDocument();
  });

  it('shows the empty state when there are no windows', async () => {
    await renderDrawer([]);
    expect(await screen.findByText('No grade entry windows found.')).toBeInTheDocument();
  });

  it.each([
    ['DRAFT', ['Open Window']],
    ['OPEN', ['Close Window']],
    ['CLOSED', ['Publish Grades', 'Reopen', 'View Grades']],
    ['PUBLISHED', ['Reopen', 'Unpublish', 'View Grades']],
  ])('offers exactly the %s actions', async (status, expected) => {
    await renderDrawer([win({ status })]);
    await screen.findByText('Period 1 Entry');
    expect(shown().sort()).toEqual([...expected].sort());
  });

  it.each([
    ['DRAFT', 'Open Window', 'OPEN', 'openedAt'],
    ['OPEN', 'Close Window', 'CLOSED', 'closedAt'],
    ['CLOSED', 'Publish Grades', 'PUBLISHED', 'publishedAt'],
    ['CLOSED', 'Reopen', 'OPEN', 'openedAt'],
    ['PUBLISHED', 'Reopen', 'OPEN', 'openedAt'],
  ])('a %s window: %s saves status %s with %s', async (status, button, next, stamp) => {
    await renderDrawer([win({ status })]);
    fireEvent.click(await screen.findByRole('button', { name: button }));
    await waitFor(() =>
      expect(save()).toHaveBeenCalledWith({
        collection: 'grade_entry_windows',
        record: { id: 'w1', status: next, [stamp]: expect.any(String) },
      }),
    );
  });

  it('links View Grades to the results page for that window', async () => {
    await renderDrawer([win({ status: 'CLOSED' })]);
    expect(await screen.findByRole('link', { name: 'View Grades' })).toHaveAttribute(
      'href',
      '/government/school-admin/academic-grading/windows/grades?id=w1',
    );
  });
});

describe('GradeEntryWindowsDrawer create view', () => {
  it('only offers the current year\'s terms, and periods only after a term is chosen', async () => {
    await renderDrawer([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Create Window' }));
    expect(screen.getByRole('heading', { name: 'Create Grade Entry Window' })).toBeInTheDocument();
    expect(field('Term')).toHaveFocus();
    await screen.findByRole('option', { name: 'Term 1' });
    expect(screen.queryByRole('option', { name: 'Old Year Term' })).toBeNull();
    expect(field('Grading Period')).toBeDisabled();
    fireEvent.change(field('Term'), { target: { value: 't1' } });
    expect(await screen.findByRole('option', { name: 'Period 1' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Other Term Period' })).toBeNull();
    expect(field('Grading Period')).toBeEnabled();
  });

  it('first Escape leaves the form, second Escape closes the drawer', async () => {
    const p = await renderDrawer([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Create Window' }));
    fireEvent.keyDown(field('Window Name'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Grade Entry Window' })).toBeNull());
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('saves a DRAFT window for TEACHER and returns to the list', async () => {
    await renderDrawer([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Create Window' }));
    await screen.findByRole('option', { name: 'Term 1' });
    fireEvent.change(field('Term'), { target: { value: 't1' } });
    await screen.findByRole('option', { name: 'Period 1' });
    fireEvent.change(field('Grading Period'), { target: { value: 'p1' } });
    fireEvent.change(field('Window Name'), { target: { value: 'Period 1 Entry' } });
    fireEvent.change(field('Open Date'), { target: { value: '2026-01-05' } });
    fireEvent.change(field('Close Date'), { target: { value: '2026-01-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Window' }));
    await waitFor(() =>
      expect(save()).toHaveBeenCalledWith({
        collection: 'grade_entry_windows',
        record: {
          gradingPeriodId: 'p1', name: 'Period 1 Entry', description: null,
          openDate: '2026-01-05', closeDate: '2026-01-20', status: 'DRAFT', allowedRoles: '["TEACHER"]',
        },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Grade Entry Window' })).toBeNull());
  });
});

describe('GradeEntryWindowsDrawer unpublish view', () => {
  it('needs the exact phrase, then moves the window back to CLOSED and returns to the list', async () => {
    await renderDrawer([win({ status: 'PUBLISHED' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    expect(screen.getByRole('heading', { name: 'Unpublish Grades' })).toBeInTheDocument();
    const input = screen.getByPlaceholderText('unpublish this window');
    const confirm = screen.getByRole('button', { name: 'Unpublish' });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'unpublish' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'unpublish this window' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(save()).toHaveBeenCalledWith({ collection: 'grade_entry_windows', record: { id: 'w1', status: 'CLOSED' } }),
    );
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Unpublish Grades' })).toBeNull());
  });

  it('submits the unpublish only once when confirmed twice while the save is pending', async () => {
    await renderDrawer([win({ status: 'PUBLISHED' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    const input = screen.getByPlaceholderText('unpublish this window');
    fireEvent.change(input, { target: { value: 'unpublish this window' } });
    save().mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => expect(save()).toHaveBeenCalledTimes(1));
    expect(save()).toHaveBeenCalledTimes(1);
  });

  it('Escape leaves the confirmation without closing the drawer', async () => {
    const p = await renderDrawer([win({ status: 'PUBLISHED' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    fireEvent.keyDown(screen.getByPlaceholderText('unpublish this window'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Unpublish Grades' })).toBeNull());
    expect(p.onClose).not.toHaveBeenCalled();
    expect(save()).not.toHaveBeenCalled();
  });
});

describe('GradeEntryWindowsDrawer save feedback', () => {
  const listCalls = () =>
    vi.mocked(sharedBridge.listSchoolAdminRecords).mock.calls.filter(([req]) => req.collection === 'grade_entry_windows').length;

  it('toasts a successful lifecycle change', async () => {
    await renderDrawer([win()]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Window' }));
    expect(await screen.findByText('Window opened.')).toBeInTheDocument();
  });

  it('toasts a failed lifecycle change with the reason and leaves the list alone', async () => {
    await renderDrawer([win()]);
    await screen.findByRole('button', { name: 'Open Window' });
    const before = listCalls();
    save().mockRejectedValueOnce(new Error('[VALIDATION_FAILED] Window dates overlap'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Window' }));
    expect(await screen.findByText("Couldn't open the window. Window dates overlap")).toBeInTheDocument();
    expect(listCalls()).toBe(before);
    expect(screen.getByRole('button', { name: 'Open Window' })).toBeInTheDocument();
  });

  it('keeps the create form after a failed save, and a retry succeeds', async () => {
    await renderDrawer([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Create Window' }));
    await screen.findByRole('option', { name: 'Term 1' });
    fireEvent.change(field('Term'), { target: { value: 't1' } });
    await screen.findByRole('option', { name: 'Period 1' });
    fireEvent.change(field('Grading Period'), { target: { value: 'p1' } });
    fireEvent.change(field('Window Name'), { target: { value: 'Period 1 Entry' } });
    fireEvent.change(field('Open Date'), { target: { value: '2026-01-05' } });
    fireEvent.change(field('Close Date'), { target: { value: '2026-01-20' } });

    save().mockRejectedValueOnce(new Error('Disk full'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Window' }));
    expect(await screen.findByText("Couldn't create the window. Disk full")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create Grade Entry Window' })).toBeInTheDocument();
    expect(field('Window Name')).toHaveValue('Period 1 Entry');

    fireEvent.click(screen.getByRole('button', { name: 'Create Window' }));
    expect(await screen.findByText('Grade entry window created.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Grade Entry Window' })).toBeNull());
  });

  it('keeps the unpublish confirmation after a failed save', async () => {
    await renderDrawer([win({ status: 'PUBLISHED' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    fireEvent.change(screen.getByPlaceholderText('unpublish this window'), { target: { value: 'unpublish this window' } });
    save().mockRejectedValueOnce(new Error('[CONFLICT] Grades are being synced'));
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(await screen.findByText("Couldn't unpublish the grades. Grades are being synced")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unpublish Grades' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeEnabled();
  });
});
