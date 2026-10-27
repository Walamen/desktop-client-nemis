import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })) },
}));

import { statusVariant } from '@/components/academic/foundation-ui';
import { AcademicYearsDrawer } from './AcademicYearsDrawer';
import { clearNemis, field, renderWithLayer, stubNemis, yearRow } from './setup-test-support';

const props = () => ({ isOpen: true, onClose: vi.fn(), onNavigate: vi.fn() });

afterEach(() => {
  clearNemis();
  vi.restoreAllMocks();
});

describe('AcademicYearsDrawer list view', () => {
  it('opens Terms for a year from its term count', async () => {
    stubNemis();
    const p = props();
    await renderWithLayer(<AcademicYearsDrawer {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: '3 terms in 2024/2025' }));
    expect(p.onNavigate).toHaveBeenCalledWith('terms', { yearId: 'y0' });
  });

  it('uses the singular for a year with one term', async () => {
    stubNemis({ years: [yearRow({ termCount: 1 })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    expect(await screen.findByRole('button', { name: '1 term in 2025/2026' })).toBeInTheDocument();
  });

  it('keeps status actions out of the table', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await screen.findByRole('button', { name: 'Edit 2024/2025' });
    for (const name of ['Set current', 'Close', 'Archive', 'Restore']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('closes the drawer on Escape', async () => {
    stubNemis();
    const p = props();
    await renderWithLayer(<AcademicYearsDrawer {...p} />);
    await screen.findByRole('button', { name: 'Edit 2024/2025' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AcademicYearsDrawer form view', () => {
  it('swaps to the create form and back on Cancel', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create academic year' }));
    expect(screen.getByRole('heading', { name: 'Create Academic Year' })).toBeInTheDocument();
    expect(field('Academic year code')).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Edit 2024/2025' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Edit 2024/2025' })).toBeInTheDocument();
  });

  it('first Escape leaves the form, second Escape closes the drawer', async () => {
    stubNemis();
    const p = props();
    await renderWithLayer(<AcademicYearsDrawer {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create academic year' }));
    fireEvent.keyDown(field('Academic year code'), { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Edit 2024/2025' })).toBeInTheDocument();
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a year and returns to the list', async () => {
    const create = vi.fn(async () => yearRow({ id: 'y2', code: '2026/2027', isCurrent: false, termCount: 0, classCount: 0 }));
    stubNemis({ academicYear: { create } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create academic year' }));
    fireEvent.change(field('Academic year code'), { target: { value: '2026/2027' } });
    fireEvent.change(field('Start date'), { target: { value: '2026-09-01' } });
    fireEvent.change(field('End date'), { target: { value: '2027-07-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ code: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31' })));
    expect(await screen.findByRole('button', { name: 'Edit 2024/2025' })).toBeInTheDocument();
  });

  it('stays on the form with the typed values when the save fails', async () => {
    const create = vi.fn(async () => { throw new Error('Year overlaps 2025/2026'); });
    stubNemis({ academicYear: { create } });
    const p = props();
    await renderWithLayer(<AcademicYearsDrawer {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create academic year' }));
    fireEvent.change(field('Academic year code'), { target: { value: '2026/2027' } });
    fireEvent.change(field('Start date'), { target: { value: '2026-09-01' } });
    fireEvent.change(field('End date'), { target: { value: '2027-07-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Create Academic Year' })).toBeInTheDocument();
    expect(field('Academic year code')).toHaveValue('2026/2027');
    expect(p.onClose).not.toHaveBeenCalled();
  });
});

describe('AcademicYearsDrawer status (edit view, read-only)', () => {
  const openEdit = async (code: string) => {
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${code}` }));
    expect(screen.getByRole('heading', { name: 'Edit Academic Year' })).toBeInTheDocument();
  };
  const STATUS_ACTIONS = ['Set current', 'Close', 'Archive', 'Restore'];

  it.each(['SETUP', 'ACTIVE', 'CLOSED', 'REOPENED'])('renders no status buttons for a %s year', async (status) => {
    stubNemis({ years: [yearRow({ id: 'y9', code: '2027/2028', isCurrent: status === 'ACTIVE', status })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    for (const name of STATUS_ACTIONS) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it.each(['SETUP', 'REOPENED'])('shows the %s status badge in the list', async (status) => {
    stubNemis({ years: [yearRow({ id: 'y9', code: '2027/2028', isCurrent: false, status })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    expect(await screen.findByText(status)).toBeInTheDocument();
    expect(statusVariant(status)).not.toBe('neutral');
  });

  it('does not offer a make-current checkbox when creating', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create academic year' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('AcademicYearsDrawer start (online only)', () => {
  const SETUP = yearRow({ id: 'y9', code: '2027/2028', isCurrent: false, status: 'SETUP', termCount: 0, classCount: 0 });
  const CLOSED = yearRow({ id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED' });
  const ACTIVE = yearRow({ id: 'y1', code: '2025/2026', isCurrent: true, status: 'ACTIVE' });
  const START = 'Start this year';

  const openEdit = async (code: string) => {
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${code}` }));
  };

  it('offers Start on a SETUP year when no year is ACTIVE', async () => {
    stubNemis({ years: [CLOSED, SETUP] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    expect(screen.getByRole('button', { name: START })).toBeEnabled();
  });

  it('hides Start when another year is ACTIVE', async () => {
    stubNemis({ years: [ACTIVE, SETUP] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    expect(screen.queryByRole('button', { name: START })).toBeNull();
  });

  it.each(['ACTIVE', 'CLOSED', 'REOPENED'])('hides Start on a %s year', async (status) => {
    stubNemis({ years: [yearRow({ id: 'y8', code: '2026/2027', isCurrent: false, status })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2026/2027');
    expect(screen.queryByRole('button', { name: START })).toBeNull();
  });

  it('confirms, starts the year and reports it', async () => {
    const start = vi.fn(async () => ({ data: null, refreshed: true }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubNemis({ years: [SETUP], academicYear: { start } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: START }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('y9'));
    expect(confirm).toHaveBeenCalledWith(
      'Start 2027/2028? Teachers can record grades and attendance once it starts, and it becomes the year every dashboard shows.',
    );
    expect(await screen.findByText('2027/2028 started.')).toBeInTheDocument();
  });

  it('says the year will appear after the next sync when the refresh did not finish', async () => {
    const start = vi.fn(async () => ({ data: null, refreshed: false }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubNemis({ years: [SETUP], academicYear: { start } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: START }));
    expect(await screen.findByText('2027/2028 started. It will appear here after the next sync.')).toBeInTheDocument();
  });

  it('does nothing when the confirmation is declined', async () => {
    const start = vi.fn(async () => ({ data: null, refreshed: true }));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    stubNemis({ years: [SETUP], academicYear: { start } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: START }));
    expect(start).not.toHaveBeenCalled();
  });

  it('shows the offline message when the start cannot reach the server', async () => {
    const start = vi.fn(async () => { throw new Error("[OFFLINE] You're offline. Connect to the internet to do this."); });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubNemis({ years: [SETUP], academicYear: { start } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: START }));
    expect(await screen.findByText("You're offline. Connect to the internet to do this.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit Academic Year' })).toBeInTheDocument();
  });

  it('falls back to the generic start failure text when the error message is empty', async () => {
    const start = vi.fn(async () => { throw new Error('[REMOTE_REJECTED] '); });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubNemis({ years: [SETUP], academicYear: { start } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: START }));
    expect(await screen.findByText('The academic year could not be started. Please try again.')).toBeInTheDocument();
  });
});

describe('AcademicYearsDrawer close, reopen and corrections', () => {
  const open = async (code: string) => {
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${code}` }));
    await screen.findByRole('heading', { name: 'Edit Academic Year' });
  };

  it('links Close this year on the ACTIVE year to the workflow', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await open('2025/2026');
    expect(screen.getByRole('link', { name: 'Close this year' })).toHaveAttribute(
      'href',
      '/government/school-admin/academic-years/close?yearId=y1',
    );
  });

  it('reopens a CLOSED year with a reason', async () => {
    const reopenYear = vi.fn(async () => ({ data: null, refreshed: true }));
    stubNemis();
    (window as unknown as { nemis: Record<string, unknown> }).nemis.academicYearClose = { reopenYear };
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await open('2024/2025');
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen year' }));
    expect(reopenYear).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByText('Why are you reopening this year?').parentElement!.querySelector('textarea')!, { target: { value: 'Wrong mark' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen year' }));
    await waitFor(() => expect(reopenYear).toHaveBeenCalledWith({ yearId: 'y0', reason: 'Wrong mark' }));
  });

it('says the device will show the reopen after sync when not refreshed', async () => {    const reopenYear = vi.fn(async () => ({ data: null, refreshed: false }));    stubNemis();    (window as unknown as { nemis: Record<string, unknown> }).nemis.academicYearClose = { reopenYear };    await renderWithLayer(<AcademicYearsDrawer {...props()} />);    await open('2024/2025');    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));    fireEvent.change(screen.getByText('Why are you reopening this year?').parentElement!.querySelector('textarea')!, { target: { value: 'Wrong mark' } });    fireEvent.click(screen.getByRole('button', { name: 'Reopen year' }));    expect(await screen.findByText('Reopened. This device will show it after the next sync.')).toBeInTheDocument();  });
  it('links Corrections on a REOPENED year to the corrections screen', async () => {
    stubNemis({ years: [yearRow({ id: 'y5', code: '2023/2024', isCurrent: false, status: 'REOPENED' })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await open('2023/2024');
    expect(screen.getByRole('link', { name: 'Corrections' })).toHaveAttribute(
      'href',
      '/government/school-admin/academic-years/corrections?yearId=y5',
    );
  });
});

describe('AcademicYearsDrawer copy structure (SETUP year only)', () => {
  const SETUP = yearRow({ id: 'y9', code: '2027/2028', isCurrent: false, status: 'SETUP', termCount: 0, classCount: 0 });
  const CLOSED = yearRow({ id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED', startDate: '2024-09-01' });
  const ACTIVE = yearRow({ id: 'y1', code: '2025/2026', isCurrent: true, status: 'ACTIVE', startDate: '2025-09-01' });
  const COPY = 'Copy structure from another year';
  const CONFIRM =
    'Copy classes, subjects, teacher assignments, terms and grading periods from 2025/2026 into 2027/2028? Dates move forward by the gap between the two years; check them before starting the year.';
  const REFUSAL = 'Copy only into a year that is being set up and has no terms or classes yet.';

  const openEdit = async (code: string) => {
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${code}` }));
    await screen.findByRole('heading', { name: 'Edit Academic Year' });
  };

  it.each(['ACTIVE', 'CLOSED', 'REOPENED'])('offers no copy on a %s year', async (status) => {
    stubNemis({ years: [yearRow({ id: 'y8', code: '2026/2027', isCurrent: false, status }), CLOSED] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2026/2027');
    expect(screen.queryByRole('button', { name: COPY })).toBeNull();
  });

  it('offers copy on a SETUP year, listing only non-SETUP years, newest first', async () => {
    stubNemis({ years: [CLOSED, SETUP, ACTIVE] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: COPY }));
    const select = field('Copy from');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['2025/2026', '2024/2025']);
    expect(select).toHaveValue('y1');
  });

  it('works offline: the copy button is not gated on connectivity', async () => {
    stubNemis({ years: [CLOSED, SETUP] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    expect(screen.getByRole('button', { name: COPY })).toBeEnabled();
  });

  it('confirms with the exact copy, copies, and reports success', async () => {
    const copyStructure = vi.fn(async () => ({ classes: 2, terms: 3, gradingPeriods: 6 }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubNemis({ years: [CLOSED, SETUP, ACTIVE], academicYear: { copyStructure } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: COPY }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy structure' }));
    await waitFor(() => expect(copyStructure).toHaveBeenCalledWith({ targetYearId: 'y9', sourceYearId: 'y1' }));
    expect(confirm).toHaveBeenCalledWith(CONFIRM);
    expect(await screen.findByText('Structure copied. Check the term and period dates.')).toBeInTheDocument();
  });

  it('copies from the year picked in the select', async () => {
    const copyStructure = vi.fn(async () => ({ classes: 0, terms: 0, gradingPeriods: 0 }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubNemis({ years: [CLOSED, SETUP, ACTIVE], academicYear: { copyStructure } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: COPY }));
    fireEvent.change(field('Copy from'), { target: { value: 'y0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy structure' }));
    await waitFor(() => expect(copyStructure).toHaveBeenCalledWith({ targetYearId: 'y9', sourceYearId: 'y0' }));
  });

  it('does nothing when the confirmation is declined', async () => {
    const copyStructure = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    stubNemis({ years: [CLOSED, SETUP], academicYear: { copyStructure } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: COPY }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy structure' }));
    expect(copyStructure).not.toHaveBeenCalled();
  });

  it('shows the refusal inline when the year already has terms or classes', async () => {
    const copyStructure = vi.fn(async () => { throw new Error('[VALIDATION_FAILED] The provided data failed validation.\u001FtargetYearId'); });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubNemis({ years: [CLOSED, SETUP], academicYear: { copyStructure } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: COPY }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy structure' }));
    expect(await screen.findByText(REFUSAL)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit Academic Year' })).toBeInTheDocument();
  });

  it('shows the generic failure when validation fails on something other than the target year', async () => {
    const copyStructure = vi.fn(async () => { throw new Error('[VALIDATION_FAILED] The provided data failed validation.\u001Fdate'); });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubNemis({ years: [CLOSED, SETUP], academicYear: { copyStructure } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: COPY }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy structure' }));
    expect(await screen.findByText('The structure could not be copied. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(REFUSAL)).not.toBeInTheDocument();
  });

  it('does not report a failed copy when only the refresh afterwards fails', async () => {
    const copyStructure = vi.fn(async () => ({ classes: 1, terms: 1, gradingPeriods: 0 }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const list = vi.fn()
      .mockResolvedValueOnce([CLOSED, SETUP])
      .mockRejectedValue(new Error('[UNEXPECTED_ERROR] An unexpected error occurred.'));
    stubNemis({ years: [CLOSED, SETUP], academicYear: { copyStructure, list } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: COPY }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy structure' }));
    await waitFor(() => expect(copyStructure).toHaveBeenCalled());
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText('The structure could not be copied. Please try again.')).not.toBeInTheDocument();
  });

  it('shows a generic failure for any other error', async () => {
    const copyStructure = vi.fn(async () => { throw new Error('[UNEXPECTED_ERROR] An unexpected error occurred.'); });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubNemis({ years: [CLOSED, SETUP], academicYear: { copyStructure } });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    fireEvent.click(screen.getByRole('button', { name: COPY }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy structure' }));
    expect(await screen.findByText('The structure could not be copied. Please try again.')).toBeInTheDocument();
  });

  it('offers nothing to copy from when every other year is still in setup', async () => {
    stubNemis({ years: [SETUP] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2027/2028');
    expect(screen.queryByRole('button', { name: COPY })).toBeNull();
  });
});
