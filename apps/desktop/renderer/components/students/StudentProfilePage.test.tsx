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
        nemisId: '482915736045', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE', gradeLevel: 'GRADE_1',
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
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
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
          nemisId: '482915736045', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE',
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
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    expect(screen.getByText('Enrollment History')).toBeInTheDocument();
    expect(screen.getByText('Guardians')).toBeInTheDocument();
    expect(screen.getByText('No enrollment history available.')).toBeInTheDocument();
    expect(screen.getByText('No guardians assigned.')).toBeInTheDocument();
  });
});

describe('StudentProfilePage student login note', () => {
  function mount(isCreateSynced: () => Promise<{ synced: boolean }>) {
    (window as unknown as { nemis: unknown }).nemis = {
      student: {
        get: vi.fn(async () => ({
          id: 's-1', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
          nemisId: '482915736045', dateOfBirth: '2015-01-01T00:00:00.000Z', gender: 'FEMALE',
          isActive: true, version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
        })),
        listEnrollments: vi.fn(async () => []),
        isCreateSynced: vi.fn(isCreateSynced),
      },
    };
    render(
      <PresentationProvider layer={createRendererPresentation()}>
        <StudentProfilePage />
      </PresentationProvider>,
    );
  }

  it('says the student signs in with the formatted NEMIS ID once the create has synced', async () => {
    mount(async () => ({ synced: true }));
    expect(await screen.findByText('Signs in to the student portal with NEMIS ID 4829-1573-6045')).toBeInTheDocument();
    expect(screen.queryByText('Student login becomes available after this record syncs.')).not.toBeInTheDocument();
  });

  it('says the login becomes available after sync while the create is still queued', async () => {
    mount(async () => ({ synced: false }));
    expect(await screen.findByText('Student login becomes available after this record syncs.')).toBeInTheDocument();
    expect(screen.queryByText(/Signs in to the student portal/)).not.toBeInTheDocument();
  });

  it('shows neither note, and does not crash, when the check fails', async () => {
    const isCreateSynced = vi.fn(async () => {
      throw new Error('ipc down');
    });
    mount(isCreateSynced);
    await waitFor(() => expect(screen.getByText('Grace Toe')).toBeInTheDocument());
    await waitFor(() => expect(isCreateSynced).toHaveBeenCalled());
    expect(screen.queryByText(/Signs in to the student portal/)).not.toBeInTheDocument();
    expect(screen.queryByText('Student login becomes available after this record syncs.')).not.toBeInTheDocument();
  });
});
