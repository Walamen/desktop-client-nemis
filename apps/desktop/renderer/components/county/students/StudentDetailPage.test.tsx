import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { StudentDetailPage } from './StudentDetailPage';

let searchId: string | null = 's-1';
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => searchId }),
  useRouter: () => ({ push }),
}));

const year = (extra: Record<string, unknown>) => ({
  academicYearId: 'y-25', academicYearName: '2025/2026', academicYearStartDate: '2025-09-01', isCurrentYear: true,
  institutionId: 'sch-a', institutionName: 'Alpha School', className: '5A', gradeLevel: 'GRADE_5',
  outcome: null, average: null, attendanceRate: 75, otherCounty: false, ...extra,
});

const DETAIL = {
  student: {
    id: 's-1', firstName: 'Ada', middleName: null, lastName: 'Kollie', nemisId: '482915736045', nationalId: 'NAT-1',
    photoUrl: null, dateOfBirth: '2014-02-03', gender: 'FEMALE', gradeLevel: 'GRADE_5', isActive: true,
    admissionDate: '2020-09-01', phoneNumber: '0770', email: 'ada@x.lr', address: '1 Road',
  },
  institution: { id: 'sch-a', name: 'Alpha School', districtName: 'Buchanan', countyName: 'Grand Bassa' },
  currentEnrollment: { className: '5A', gradeLevel: 'GRADE_5', academicYearName: '2025/2026', enrollmentDate: '2025-09-02', status: 'ACTIVE' },
  guardians: [{ firstName: 'Mary', lastName: 'Kollie', relationship: 'MOTHER', phoneNumber: '0771', email: null, isPrimary: true }],
  years: [
    year({}),
    year({ academicYearId: 'y-24', academicYearName: '2024/2025', academicYearStartDate: '2024-09-01', isCurrentYear: false,
      className: '4B', gradeLevel: 'GRADE_4', outcome: null, average: 70, attendanceRate: null }),
  ],
  transfers: [
    { id: 't-1', date: '2024-08-20', fromInstitutionName: 'Beta School', toInstitutionName: 'Alpha School', status: 'COMPLETED',
      reason: 'Family moved', reviewedByName: 'Musu Kollie', reviewedAt: '2024-08-25' },
  ],
};

const REMOTE = {
  years: [
    { academicYearId: 'y-23', academicYearName: '2023/2024', academicYearStartDate: '2023-09-01', isCurrentYear: false,
      institutionId: 'sch-far', institutionName: 'Kakata Elementary', countyName: 'Margibi', className: '3A',
      gradeLevel: 'GRADE_3', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_4', average: 71 },
  ],
  transfers: [
    { id: 't-0', date: '2023-01-05', fromInstitutionName: 'Owensgrove El.', toInstitutionName: 'Kakata Elementary',
      status: 'COMPLETED', reason: 'Moved', reviewedByName: null, reviewedAt: null },
  ],
};

function renderWith(county: Record<string, unknown>) {
  (window as unknown as { nemis: unknown }).nemis = { county };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <StudentDetailPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  searchId = 's-1';
  push.mockReset();
});

describe('County student detail page', () => {
  it('shows the header and the Overview sections', async () => {
    renderWith({ getStudent: vi.fn(async () => DETAIL), getStudentRecord: vi.fn(async () => ({ status: 'unavailable' })) });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ada Kollie' })).toBeInTheDocument());
    expect(screen.getByText('4829-1573-6045', { exact: false })).toBeInTheDocument();
    for (const section of ['Personal Information', 'Contact Information', 'Enrollment', 'Guardian / Parent']) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
    expect(screen.getByText('NAT-1')).toBeInTheDocument();
    expect(screen.getByText('Mary Kollie')).toBeInTheDocument();
  });

  it('Academic record shows local years at once, then adds Other county years when online', async () => {
    let answer: (value: unknown) => void = () => {};
    renderWith({
      getStudent: vi.fn(async () => DETAIL),
      getStudentRecord: vi.fn(() => new Promise((resolve) => (answer = resolve))),
    });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ada Kollie' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Academic record' }));
    expect(screen.getByText('2025/2026')).toBeInTheDocument();
    expect(screen.queryByText('Kakata Elementary')).not.toBeInTheDocument();
    answer({ status: 'ok', record: REMOTE });
    await waitFor(() => expect(screen.getByText('Kakata Elementary')).toBeInTheDocument());
    const row = screen.getByText('Kakata Elementary').closest('tr')!;
    expect(within(row).getByText('Other county')).toBeInTheDocument();
    expect(within(row).getByText('Promoted')).toBeInTheDocument();
    expect(within(row).getByText('71%')).toBeInTheDocument();
  });

  it('shows the unreachable line when the record is unavailable', async () => {
    renderWith({ getStudent: vi.fn(async () => DETAIL), getStudentRecord: vi.fn(async () => ({ status: 'unavailable' })) });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ada Kollie' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Academic record' }));
    await waitFor(() =>
      expect(screen.getByText("Showing this county's records only — connect to see years at other schools.")).toBeInTheDocument(),
    );
    expect(screen.getByText('2024/2025')).toBeInTheDocument();
  });

  it('shows In progress and Not recorded correctly', async () => {
    renderWith({ getStudent: vi.fn(async () => DETAIL), getStudentRecord: vi.fn(async () => ({ status: 'unavailable' })) });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ada Kollie' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Academic record' }));
    const current = screen.getByText('2025/2026').closest('tr')!;
    expect(within(current).getByText('In progress')).toBeInTheDocument();
    expect(within(current).getByText('75%')).toBeInTheDocument();
    const past = screen.getByText('2024/2025').closest('tr')!;
    expect(within(past).getByText('Not recorded')).toBeInTheDocument();
    expect(within(past).getByText('70%')).toBeInTheDocument();
    expect(within(past).getByText('—')).toBeInTheDocument();
  });

  it('Transfers tab lists merged transfers newest first', async () => {
    renderWith({ getStudent: vi.fn(async () => DETAIL), getStudentRecord: vi.fn(async () => ({ status: 'ok', record: REMOTE })) });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ada Kollie' })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Transfers (2)' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Transfers (2)' }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Beta School');
    expect(rows[0]).toHaveTextContent('Musu Kollie');
    expect(rows[1]).toHaveTextContent('Owensgrove El.');
  });

  it('a student not on the device shows not found', async () => {
    renderWith({ getStudent: vi.fn(async () => null), getStudentRecord: vi.fn(async () => ({ status: 'unavailable' })) });
    await waitFor(() => expect(screen.getByText("Student not found or you don't have access.")).toBeInTheDocument());
  });
});
