import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })) },
}));

import { AcademicYearsDrawer } from './AcademicYearsDrawer';
import { CURRENT_YEAR, OLD_YEAR, clearNemis, field, renderWithLayer, stubNemis, yearRow } from './setup-test-support';

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

describe('AcademicYearsDrawer status actions (edit view)', () => {
  const openEdit = async (code: string) => {
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${code}` }));
    expect(screen.getByRole('heading', { name: 'Edit Academic Year' })).toBeInTheDocument();
  };
  const shown = () => ['Set current', 'Close', 'Archive', 'Restore'].filter((name) => screen.queryByRole('button', { name }));

  it('offers Archive and Restore for a closed year', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit(OLD_YEAR.code);
    expect(shown()).toEqual(['Archive', 'Restore']);
  });

  it('offers no status change for the current year', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit(CURRENT_YEAR.code);
    expect(shown()).toEqual([]);
  });

  it('offers Set current, Close and Archive for an active non-current year', async () => {
    stubNemis({ years: [yearRow({ id: 'y3', code: '2026/2027', isCurrent: false })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2026/2027');
    expect(shown()).toEqual(['Set current', 'Close', 'Archive']);
  });

  it('offers only Restore for an archived year', async () => {
    stubNemis({ years: [yearRow({ id: 'y4', code: '2020/2021', isCurrent: false, status: 'ARCHIVED' })] });
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit('2020/2021');
    expect(shown()).toEqual(['Restore']);
  });

  it('confirms, changes the status and returns to the list', async () => {
    const setStatus = vi.fn(async () => yearRow({ id: 'y0', code: '2024/2025', isCurrent: false, status: 'ARCHIVED' }));
    stubNemis({ academicYear: { setStatus } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit(OLD_YEAR.code);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(window.confirm).toHaveBeenCalledWith('Change 2024/2025 to archived?');
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'y0', status: 'ARCHIVED' })));
    expect(await screen.findByRole('button', { name: 'Edit 2024/2025' })).toBeInTheDocument();
  });

  it('does nothing when the confirmation is declined', async () => {
    const setStatus = vi.fn();
    stubNemis({ academicYear: { setStatus } });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderWithLayer(<AcademicYearsDrawer {...props()} />);
    await openEdit(OLD_YEAR.code);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(setStatus).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Edit Academic Year' })).toBeInTheDocument();
  });
});
