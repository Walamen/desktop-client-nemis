import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DeoTeacher, DeoTeachersResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoTeachersPage from './page';

function teacher(id: string, firstName: string, overrides: Partial<DeoTeacher> = {}): DeoTeacher {
  return {
    id,
    firstName,
    lastName: 'Kollie',
    employeeNumber: `EMP-${id}`,
    schoolId: 's-1',
    schoolName: 'Alpha Academy',
    subjects: ['Mathematics'],
    leadSubject: 'Mathematics',
    gradesStatus: 'Submitted',
    pendingApproval: false,
    unassigned: false,
    ...overrides,
  };
}

const RESULT: DeoTeachersResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Buchanan' },
  county: { id: 'c-1', name: 'Grand Bassa' },
  teachers: [
    teacher('1', 'Ann', { gradesStatus: 'Pending' }),
    teacher('2', 'Musu', {
      schoolId: 's-2',
      schoolName: 'Beta High',
      pendingApproval: true,
      gradesStatus: 'No assessments',
      subjects: [],
      leadSubject: 'Grade 4',
    }),
    teacher('3', 'Sam', { schoolId: 's-2', schoolName: 'Beta High', unassigned: true, subjects: [], leadSubject: 'General', gradesStatus: 'No assessments' }),
  ],
  summary: { totalTeachers: 3, gradesPending: 1, pendingApproval: 1, unassigned: 1 },
};

function mockNemis(result: DeoTeachersResult) {
  (window as unknown as { nemis: unknown }).nemis = { deo: { listTeachers: vi.fn(async () => result) } };
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoTeachersPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

function card(label: string): HTMLElement {
  return screen.getAllByText(label).find((el) => el.tagName === 'P')!.parentElement!;
}

describe('DEO Teacher Monitoring page', () => {
  it('names the district and shows the four cards', async () => {
    mockNemis(RESULT);
    renderPage();
    expect(await screen.findByText('Teacher Monitoring')).toBeTruthy();
    expect(screen.getByText('Buchanan · Grand Bassa')).toBeTruthy();
    expect(within(card('Total Teachers')).getByText('3')).toBeTruthy();
    expect(within(card('Grades Pending')).getByText('1')).toBeTruthy();
    expect(within(card('Pending Approval')).getByText('1')).toBeTruthy();
    expect(within(card('Unassigned')).getByText('1')).toBeTruthy();
    expect(screen.getByText('Teacher attendance is not recorded in NEMIS yet.')).toBeTruthy();
  });

  it('lists teachers with the lead subject, grades chip and status', async () => {
    mockNemis(RESULT);
    renderPage();
    const row = (await screen.findByText('Musu Kollie')).closest('tr')!;
    expect(within(row).getByText('Beta High')).toBeTruthy();
    expect(within(row).getByText('Grade 4')).toBeTruthy();
    expect(within(row).getByText('Not recorded')).toBeTruthy();
    expect(within(row).getByText('No assessments')).toBeTruthy();
    expect(within(row).getByText('Pending Approval')).toBeTruthy();
    const ann = screen.getByText('Ann Kollie').closest('tr')!;
    expect(within(ann).getByText('Pending').className).toContain('amber');
    expect(within(ann).getByText('Active')).toBeTruthy();
  });

  it('filters by tab', async () => {
    mockNemis(RESULT);
    renderPage();
    await screen.findByText('Ann Kollie');
    fireEvent.click(screen.getByRole('button', { name: 'Unassigned' }));
    expect(screen.getByText('Sam Kollie')).toBeTruthy();
    expect(screen.queryByText('Ann Kollie')).toBeNull();
  });

  it('groups by school', async () => {
    mockNemis(RESULT);
    renderPage();
    await screen.findByText('Ann Kollie');
    fireEvent.click(screen.getByRole('button', { name: 'By School' }));
    const beta = screen.getByText('Beta High').closest('tr')!;
    expect(within(beta).getByText('No subjects linked')).toBeTruthy();
    expect(within(beta).getByText('Needs Attention')).toBeTruthy();
    expect(within(beta).getByText('2')).toBeTruthy();
  });

  it('explains when no district is assigned', async () => {
    mockNemis({ ...RESULT, districtId: null, teachers: [] });
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeTruthy();
  });
});
