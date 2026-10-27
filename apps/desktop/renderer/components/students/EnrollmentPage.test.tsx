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

function stubWithEnroll(enroll: ReturnType<typeof vi.fn>) {
  stubNemis({ terms: [termRow()] });
  const nemis = (window as unknown as { nemis: Record<string, unknown> }).nemis;
  nemis.classes = {
    list: vi.fn(async () => ({
      items: [{ id: 'c1', academicYearId: 'y1', name: 'JSS1-A', gradeLevel: 'GRADE_7', isActive: true, subjectCount: 0 }],
      total: 1, limit: 25, offset: 0,
    })),
  };
  nemis.student = { enroll };
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
});
