import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { StudentProfilePage } from './StudentProfilePage';

beforeEach(() => {
  window.history.pushState({}, '', '/government/school-admin/students/profile?id=s-1');
  (window as unknown as { nemis: unknown }).nemis = {
    student: {
      get: vi.fn(async () => ({
        id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
        admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE', gradeLevel: 'GRADE_1',
        isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
      })),
      listEnrollments: vi.fn(async () => []),
    },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.pushState({}, '', '/');
});

describe('StudentProfilePage', () => {
  it('renders the profile header with Grade/Gender/Status badges and fact cards', async () => {
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentProfilePage />
      </PresentationProvider>,
    );
    // "Grace Toe" appears twice: once in the shared `Page` header (out of
    // scope for this task) and once in the new profile header card below it.
    await waitFor(() => expect(screen.getAllByText('Grace Toe').length).toBeGreaterThan(0));
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});

describe('StudentProfilePage enrollment/guardians', () => {
  it('shows titled Enrollment History and Guardians cards matching the personal-info card style', async () => {
    window.history.pushState({}, '', '/government/school-admin/students/profile?id=s-1');
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        get: vi.fn(async () => ({
          id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
          admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE',
          isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
        })),
        listEnrollments: vi.fn(async () => []),
      },
    };
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <StudentProfilePage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('Grace Toe').length).toBeGreaterThan(0));
    expect(screen.getByText('Enrollment History')).toBeInTheDocument();
    expect(screen.getByText('Guardians')).toBeInTheDocument();
    expect(screen.getByText('No enrollment history available.')).toBeInTheDocument();
    expect(screen.getByText('No guardians assigned.')).toBeInTheDocument();
  });
});
