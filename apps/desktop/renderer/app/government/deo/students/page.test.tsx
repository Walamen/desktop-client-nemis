import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DeoEnrollmentSchool, DeoStudentsResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoStudentsPage from './page';

function school(id: string, name: string, overrides: Partial<DeoEnrollmentSchool> = {}): DeoEnrollmentSchool {
  return {
    id,
    name,
    code: id.toUpperCase(),
    levels: ['PRIMARY'],
    students: 120,
    teachers: 6,
    attendanceRate: 92,
    performanceStatus: 'Good',
    ...overrides,
  };
}

const RESULT: DeoStudentsResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Buchanan' },
  county: { id: 'c-1', name: 'Grand Bassa' },
  summary: { totalEnrollment: 1250, male: 700, female: 550, avgAttendance: 84 },
  enrollmentTrend: [
    { period: 'Oct 2026', enrollment: 1200 },
    { period: 'Nov 2026', enrollment: 1250 },
  ],
  genderDistribution: { male: 700, female: 550 },
  schools: [
    school('s-1', 'Alpha Academy'),
    school('s-2', 'Beta High', {
      levels: ['PRIMARY', 'JUNIOR_HIGH'],
      attendanceRate: null,
      performanceStatus: 'No Data',
    }),
  ],
  dropoutAlerts: [
    { schoolId: 's-3', schoolName: 'Gamma School', attendanceRate: 55, reason: 'Attendance is 55%', atRiskStudents: 14 },
    { schoolId: 's-2', schoolName: 'Beta High', attendanceRate: null, reason: 'Flagged in district monitoring', atRiskStudents: 0 },
  ],
};

function mockNemis(result: DeoStudentsResult) {
  (window as unknown as { nemis: unknown }).nemis = { deo: { listStudents: vi.fn(async () => result) } };
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoStudentsPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

function card(label: string): HTMLElement {
  return screen.getAllByText(label).find((el) => el.tagName === 'P')!.parentElement!;
}

describe('DEO Students & Enrollment page', () => {
  it('names the district and shows the four cards', async () => {
    mockNemis(RESULT);
    renderPage();
    expect(await screen.findByText('Students & Enrollment')).toBeTruthy();
    expect(screen.getByText('Buchanan · Grand Bassa')).toBeTruthy();
    expect(within(card('Total Enrollment')).getByText('1,250')).toBeTruthy();
    expect(within(card('Male Students')).getByText('700')).toBeTruthy();
    expect(within(card('Female Students')).getByText('550')).toBeTruthy();
    expect(within(card('Avg Attendance')).getByText('84%')).toBeTruthy();
    expect(screen.getByText('Nov 2026')).toBeTruthy();
    expect(screen.getByText('Male: 700')).toBeTruthy();
  });

  it('shows a dash for average attendance with no data', async () => {
    mockNemis({ ...RESULT, summary: { ...RESULT.summary, avgAttendance: null } });
    renderPage();
    await screen.findByText('Students & Enrollment');
    expect(within(card('Avg Attendance')).getByText('—')).toBeTruthy();
  });

  it('lists schools with real levels, No Data attendance and the standing chip', async () => {
    mockNemis(RESULT);
    renderPage();
    const row = (await screen.findAllByText('Beta High')).map((el) => el.closest('tr')).find(Boolean)!;
    expect(within(row).getByText('Primary, Junior High').className).toContain('indigo');
    expect(within(row).getAllByText('No Data')).toHaveLength(2);
    expect(within(row).queryByText('No submission')).toBeNull();
    expect(screen.queryByText('Last Submission')).toBeNull();
    const alpha = screen.getByText('Alpha Academy').closest('tr')!;
    expect(within(alpha).getByText('Primary').className).toContain('purple');
    expect(within(alpha).getByText('92%').className).toContain('green');
    expect(within(alpha).queryByText('Nov 03, 2026')).toBeNull();
    expect(within(alpha).getByText('Good')).toBeTruthy();
  });

  it('lists dropout alerts with the reason and pupils actually at risk', async () => {
    mockNemis(RESULT);
    renderPage();
    await screen.findByText('Dropout Alerts');
    expect(screen.getByText('Reason: Attendance is 55%')).toBeTruthy();
    expect(screen.getByText('14 pupils at risk').className).toContain('red');
    expect(screen.getByText('No pupil below 80%').className).toContain('gray');
  });

  it('hides dropout alerts when there are none', async () => {
    mockNemis({ ...RESULT, dropoutAlerts: [] });
    renderPage();
    await screen.findByText('Alpha Academy');
    expect(screen.queryByText('Dropout Alerts')).toBeNull();
  });

  it('on failure shows only the error, never zero cards, and Retry reloads', async () => {
    const listStudents = vi
      .fn<() => Promise<DeoStudentsResult>>()
      .mockRejectedValueOnce(new Error('database locked'))
      .mockResolvedValue(RESULT);
    (window as unknown as { nemis: unknown }).nemis = { deo: { listStudents } };
    renderPage();
    expect(await screen.findByText('Failed to load enrollment data.')).toBeTruthy();
    expect(screen.queryByText('Total Enrollment')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Alpha Academy')).toBeTruthy();
    expect(listStudents).toHaveBeenCalledTimes(2);
  });

  it('explains when no district is assigned', async () => {
    mockNemis({ ...RESULT, districtId: null, schools: [], dropoutAlerts: [] });
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeTruthy();
  });
});
