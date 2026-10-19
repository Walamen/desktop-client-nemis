import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { TeacherProfilePage } from './TeacherProfilePage';

let searchId: string | null = 't-1';
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => searchId }),
  useRouter: () => ({ push }),
}));

const TEACHER = {
  id: 't-1', firstName: 'Musu', middleName: null, lastName: 'Kollie', photoUrl: null, employeeNumber: 'GB-001',
  position: 'TEACHER', isActive: true, gender: 'FEMALE', primarySubject: 'English',
  institution: { id: 'sch-a', name: 'Alpha School', level: 'PRIMARY', districtName: 'Buchanan', countyName: 'Grand Bassa' },
  phoneNumber: '0770', email: 'musu@x.lr', employmentType: 'FULL_TIME', dateOfBirth: '1990-04-05T00:00:00.000Z',
  nationalId: 'NAT-1', address: '1 Road', dateOfJoining: '2015-09-01T00:00:00.000Z', dateOfLeaving: null,
  qualifications: ['B.Ed', 'M.Ed'],
  classAssignments: [
    { id: 'ct-1', isClassTeacher: true, class: { id: 'c-1', name: '5A', gradeLevel: 'GRADE_5' } },
    { id: 'ct-2', isClassTeacher: false, class: { id: 'c-2', name: '6B', gradeLevel: 'GRADE_6' } },
  ],
  subjectAssignments: [
    { id: 'sub-e', subject: { id: 'sub-e', name: 'English', code: 'ENG' } },
    { id: 'sub-m', subject: { id: 'sub-m', name: 'Maths', code: 'MTH' } },
  ],
};

function renderWith(getTeacher: (id: string) => Promise<unknown>) {
  (window as unknown as { nemis: unknown }).nemis = { county: { getTeacher: vi.fn(getTeacher) } };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <TeacherProfilePage />
    </PresentationProvider>,
  );
}

// The first match is the stat card; "Classes" is also the chip heading.
const stat = (label: string) => screen.getAllByText(label, { selector: 'p' })[0]!.parentElement!.textContent;

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  searchId = 't-1';
  push.mockReset();
});

describe('County teacher profile page', () => {
  it('shows the header, the four stat cards and the four sections', async () => {
    renderWith(async () => TEACHER);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Musu Kollie' })).toBeInTheDocument());
    expect(screen.getByText('GB-001 · Alpha School')).toBeInTheDocument();
    expect(stat('Years of Service')).toContain('Since 2015');
    expect(stat('Classes')).toContain('2');
    expect(stat('Classes')).toContain('Class teacher');
    expect(stat('Subjects')).toContain('2');
    expect(stat('Status')).toContain('Active');
    // The web's formatter keeps the enum's capitals: FULL_TIME shows as FULL TIME.
    expect(stat('Status')).toContain('FULL TIME');
    for (const section of ['Personal & Contact', 'School Assignment', 'Subjects Taught', 'Qualifications']) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
    expect(screen.getByText('NAT-1')).toBeInTheDocument();
    expect(screen.getByText('Grand Bassa')).toBeInTheDocument();
  });

  it('shows class chips with the CT badge and merged subjects with codes', async () => {
    renderWith(async () => TEACHER);
    await waitFor(() => expect(screen.getByText('5A')).toBeInTheDocument());
    expect(screen.getByText('5A').parentElement).toHaveTextContent('CT');
    expect(screen.getByText('6B')).not.toHaveTextContent('CT');
    expect(screen.getByText('(ENG)')).toBeInTheDocument();
    expect(screen.getByText('(MTH)')).toBeInTheDocument();
  });

  it('shows the qualifications list, or "No qualifications recorded."', async () => {
    renderWith(async () => TEACHER);
    await waitFor(() => expect(screen.getByText('M.Ed')).toBeInTheDocument());
    expect(screen.getByText('B.Ed')).toBeInTheDocument();
  });

  it('shows the empty qualifications line', async () => {
    renderWith(async () => ({ ...TEACHER, qualifications: [], subjectAssignments: [] }));
    await waitFor(() => expect(screen.getByText('No qualifications recorded.')).toBeInTheDocument());
    expect(screen.getByText('No subjects assigned.')).toBeInTheDocument();
  });

  it("shows \"Teacher not found or you don't have access.\" for a teacher not on the device", async () => {
    renderWith(async () => null);
    await waitFor(() => expect(screen.getByText("Teacher not found or you don't have access.")).toBeInTheDocument());
    screen.getByRole('button', { name: /Back to Teachers/ }).click();
    expect(push).toHaveBeenCalledWith('/government/county/teachers');
  });
});
