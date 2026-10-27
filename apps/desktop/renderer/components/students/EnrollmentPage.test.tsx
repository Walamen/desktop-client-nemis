import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })) },
}));

import { EnrollmentPage } from './EnrollmentPage';
import { clearNemis, field, renderWithLayer, stubNemis, termRow } from '../academic-grading/setup-test-support';

const REFUSAL =
  'This student was enrolled in an earlier year. Enrol them for this year through the student lookup.';

function stubWithEnroll(enroll: ReturnType<typeof vi.fn>, withNemisId = true) {
  stubNemis({ terms: [termRow()] });
  const nemis = (window as unknown as { nemis: Record<string, unknown> }).nemis;
  nemis.classes = {
    list: vi.fn(async () => ({
      items: [{ id: 'c1', academicYearId: 'y1', name: 'JSS1-A', gradeLevel: 'GRADE_7', isActive: true, subjectCount: 0 }],
      total: 1, limit: 25, offset: 0,
    })),
  };
  nemis.student = {
    enroll,
    get: vi.fn(async () => ({
      id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
      ...(withNemisId ? { nemisId: '482915736045' } : {}), dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE',
      isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
    })),
    listEnrollments: vi.fn(async () => []),
  };
}

beforeEach(() => {
  window.history.pushState({}, '', '/government/school-admin/students/enroll?id=s-1');
});
afterEach(() => {
  clearNemis();
  window.history.pushState({}, '', '/');
});

describe('EnrollmentPage', () => {
  it('shows the returning-student refusal copy when the offline enrol is refused', async () => {
    const enroll = vi.fn(async () => {
      throw new Error(`[RETURNING_STUDENT] ${REFUSAL}`);
    });
    stubWithEnroll(enroll);
    await renderWithLayer(<EnrollmentPage />);
    await waitFor(() => expect(field('Term').querySelectorAll('option').length).toBeGreaterThan(1));
    await waitFor(() => expect(field('Class / section').querySelectorAll('option').length).toBeGreaterThan(1));
    fireEvent.change(field('Term'), { target: { value: 't1' } });
    fireEvent.change(field('Class / section'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete enrollment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(REFUSAL);
    expect(enroll).toHaveBeenCalledTimes(1);
  });

  async function refuse(withNemisId: boolean) {
    stubWithEnroll(
      vi.fn(async () => {
        throw new Error(`[RETURNING_STUDENT] ${REFUSAL}`);
      }),
      withNemisId,
    );
    await renderWithLayer(<EnrollmentPage />);
    await waitFor(() => expect(field('Term').querySelectorAll('option').length).toBeGreaterThan(1));
    await waitFor(() => expect(field('Class / section').querySelectorAll('option').length).toBeGreaterThan(1));
    fireEvent.change(field('Term'), { target: { value: 't1' } });
    fireEvent.change(field('Class / section'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete enrollment' }));
    await screen.findByRole('alert');
  }

  it('links the refusal to the lookup, carrying the NEMIS ID and date of birth', async () => {
    await refuse(true);
    const link = await screen.findByRole('link', { name: 'Find this student in the lookup' });
    expect(link).toHaveAttribute(
      'href',
      '/government/school-admin/students/create?nemisId=482915736045&dob=2015-01-01',
    );
  });

  it('offers no lookup link for a student without a NEMIS ID', async () => {
    await refuse(false);
    await waitFor(() =>
      expect((window as unknown as { nemis: { student: { get: ReturnType<typeof vi.fn> } } }).nemis.student.get).toHaveBeenCalled(),
    );
    expect(screen.queryByRole('link', { name: 'Find this student in the lookup' })).not.toBeInTheDocument();
  });
});
