import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { mockSearch } from '@/test-utils/search-params';
import { Navigator } from '@/test-utils/navigator';
import { TeacherFormPage } from './TeacherFormPage';

vi.mock('next/navigation', async () => (await import('@/test-utils/search-params')).navigationMock);

const person = (id: string, name: string, address: string) => ({
  id, institutionId: 'inst-1', firstName: name, lastName: 'Teacher', dateOfBirth: '1990-01-01T00:00:00.000Z',
  gender: 'FEMALE', phoneNumber: `077000000${id.slice(-1)}`, employeeNumber: `E-${id}`, position: 'TEACHER',
  employmentType: 'FULL_TIME', dateOfJoining: '2020-01-01T00:00:00.000Z', isActive: true, address,
  approvalStatus: 'APPROVED', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', assignments: [],
});

type Nemis = { teacher: { getProfile: ReturnType<typeof vi.fn> } };
const nemis = () => (window as unknown as { nemis: Nemis }).nemis;
/** The input under a form label (the ui Input renders its label unassociated). */
function field(label: string): HTMLInputElement {
  const el = Array.from(document.querySelectorAll('label'))
    .find((l) => l.firstChild?.textContent === label)
    ?.parentElement?.querySelector('input');
  if (!(el instanceof HTMLInputElement)) throw new Error(`No input under label "${label}"`);
  return el;
}

beforeEach(() => {
  mockSearch('id=t-1');
  window.history.pushState({}, '', '/government/school-admin/teachers-staff/edit?id=t-1');
  (window as unknown as { nemis: unknown }).nemis = {
    teacher: {
      getProfile: vi.fn(async (id: string) =>
        id === 't-2' ? person('t-2', 'Second', 'Beta Street') : person('t-1', 'First', 'Alpha Street'),
      ),
    },
    school: { getSummary: vi.fn(async () => ({ id: 'inst-1', name: 'Test School' })) },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.pushState({}, '', '/');
});

describe('TeacherFormPage edit', () => {
  it("never seeds the form with the previous teacher's profile, and seeds with the new one once loaded", async () => {
    let releaseB: (p: unknown) => void = () => undefined;
    nemis().teacher.getProfile.mockImplementation((id: string) =>
      id === 't-1' ? Promise.resolve(person('t-1', 'First', 'Alpha Street')) : new Promise((r) => { releaseB = r; }),
    );
    render(
      <PresentationProvider layer={createRendererPresentation()}>
        <Navigator to="id=t-2" page={() => <TeacherFormPage edit />} />
      </PresentationProvider>,
    );
    // The shared teachers store now holds teacher A's profile.
    await waitFor(() => expect(field('First name').value).toBe('First'));
    expect(field('Address').value).toBe('Alpha Street');

    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => expect(nemis().teacher.getProfile).toHaveBeenCalledWith('t-2'));
    // B is still loading: none of A's values may be in the form.
    expect(field('First name').value).toBe('');
    expect(field('Address').value).toBe('');
    expect(field('Employee number').value).toBe('');

    releaseB(person('t-2', 'Second', 'Beta Street'));
    await waitFor(() => expect(field('First name').value).toBe('Second'));
    expect(field('Address').value).toBe('Beta Street');
    expect(field('Employee number').value).toBe('E-t-2');
  });

  it("loads the teacher named by its own address, not the previous page's", async () => {
    window.history.pushState({}, '', '/government/school-admin/teachers-staff/profile?id=stale');
    mockSearch('id=t-2');
    render(
      <PresentationProvider layer={createRendererPresentation()}>
        <TeacherFormPage edit />
      </PresentationProvider>,
    );
    await waitFor(() => expect(field('First name').value).toBe('Second'));
    expect(nemis().teacher.getProfile).toHaveBeenCalledWith('t-2');
    expect(nemis().teacher.getProfile).not.toHaveBeenCalledWith('stale');
  });

  it('makes no profile call without an id', async () => {
    mockSearch('');
    render(
      <PresentationProvider layer={createRendererPresentation()}>
        <TeacherFormPage edit />
      </PresentationProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(nemis().teacher.getProfile).not.toHaveBeenCalled();
  });
});
