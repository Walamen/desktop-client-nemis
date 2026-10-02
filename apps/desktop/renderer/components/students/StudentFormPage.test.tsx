import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { StudentFormPage } from './StudentFormPage';

// Multi-step wizard walks type into many fields; under a parallel run they
// can exceed the 5s default without anything being wrong.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const currentYear = {
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 1, classCount: 1,
};
const term1 = {
  id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true,
};
const k1a = { id: 'c1', academicYearId: 'y1', name: 'K1-A', gradeLevel: 'K1', isActive: true, subjectCount: 0 };

function baseNemis() {
  return {
    school: { getSummary: vi.fn(async () => ({ id: 'inst-1', code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isApproved: true })) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [currentYear]) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [term1]) },
    classes: { list: vi.fn(async () => ({ items: [k1a], total: 1 })) },
  };
}

beforeEach(() => {
  (window as unknown as { nemis: unknown }).nemis = baseNemis();
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

// The shared Input/Select components (packages/ui) don't wire a `for`/`id`
// association between their <label> and <input>, so getByLabelText can't
// resolve them (out of scope for this task to fix). Scan the actual
// <label> elements directly (skipping unrelated text like validation
// messages) and walk to the sibling <input> — same intent, works with the
// current markup.
function textboxNear(labelPattern: RegExp): HTMLInputElement {
  const label = Array.from(document.querySelectorAll('label')).find((l) =>
    labelPattern.test(l.textContent ?? ''),
  );
  const input = label?.parentElement?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected an <input> near label matching ${labelPattern}`);
  }
  return input;
}

function selectNear(labelPattern: RegExp): HTMLSelectElement {
  const label = Array.from(document.querySelectorAll('label')).find((l) =>
    labelPattern.test(l.textContent ?? ''),
  );
  const select = label?.parentElement?.querySelector('select');
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Expected a <select> near label matching ${labelPattern}`);
  }
  return select;
}

type User = ReturnType<typeof userEvent.setup>;

/** Find Student is step 1; the first-time-enrollee checkbox skips the lookup. */
async function startAsFirstTimeEnrollee(user: User) {
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Find Student', level: 2 })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole('checkbox', { name: 'This child has no NEMIS ID (first-time enrollee)' }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

async function pickClassAndTerm(user: User) {
  await waitFor(() => expect(selectNear(/^class/i).querySelector('option[value="c1"]')).not.toBeNull());
  await user.selectOptions(selectNear(/^class/i), 'c1');
  await waitFor(() => expect(selectNear(/^term/i).querySelector('option[value="t1"]')).not.toBeNull());
  await user.selectOptions(selectNear(/^term/i), 't1');
}

describe('StudentFormPage create wizard', () => {
  it('walks Find Student -> Student Information -> Grade & Class -> Review, blocking on required fields', async () => {
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    const user = userEvent.setup({ delay: null });
    render(
      <PresentationProvider layer={layer}>
        <StudentFormPage />
      </PresentationProvider>,
    );
    await startAsFirstTimeEnrollee(user);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Student Information', level: 2 }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(
      screen.getByRole('heading', { name: 'Student Information', level: 2 }),
    ).toBeInTheDocument(); // blocked: required fields empty

    await user.type(textboxNear(/first name/i), 'Grace');
    await user.type(textboxNear(/last name/i), 'Toe');
    await user.type(textboxNear(/date of birth/i), '2015-01-01');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Guardian Information', level: 2 }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument(),
    );

    // Step validation: no grade selected yet, Next must not advance.
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument();

    // A grade alone is not enough: class and term are required too.
    await user.click(screen.getByRole('button', { name: 'K1' }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument();

    await pickClassAndTerm(user);
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Review & Submit', level: 2 }),
      ).toBeInTheDocument(),
    );

    // Back navigation returns to the previous step (Grade & Class).
    await user.click(screen.getByRole('button', { name: /back/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument(),
    );
  });
});

describe('StudentFormPage create wizard submit', () => {
  it('creates and enrols the student with its guardians in one call, then shows a plain success screen', async () => {
    const createAndEnrollMock = vi.fn(async () => ({
      id: 's-new', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
      nemisId: '482915736045', dateOfBirth: '2015-01-01', gender: 'FEMALE', isActive: true,
      version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [{ id: 'g-1', guardianId: 'g-1', isPrimary: true }],
    }));
    const createMock = vi.fn();
    const createGuardianMock = vi.fn();
    (window as unknown as { nemis: unknown }).nemis = {
      ...baseNemis(),
      student: { createAndEnroll: createAndEnrollMock, create: createMock, createGuardian: createGuardianMock },
    };
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    const user = userEvent.setup({ delay: null });
    render(
      <PresentationProvider layer={layer}>
        <StudentFormPage />
      </PresentationProvider>,
    );
    await startAsFirstTimeEnrollee(user);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Student Information', level: 2 }),
      ).toBeInTheDocument(),
    );
    await user.type(textboxNear(/first name/i), 'Grace');
    await user.type(textboxNear(/last name/i), 'Toe');
    await user.type(textboxNear(/date of birth/i), '2015-01-01');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Guardian Information', level: 2 }),
      ).toBeInTheDocument(),
    );
    await user.type(textboxNear(/guardian first name/i), 'John');
    await user.type(textboxNear(/guardian last name/i), 'Toe');
    await user.type(textboxNear(/relationship/i), 'Father');
    await user.type(textboxNear(/guardian phone/i), '0770000000');
    await user.type(textboxNear(/guardian email/i), 'john@example.com');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /^K1$/i }));
    await pickClassAndTerm(user);
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Review & Submit', level: 2 }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /create student/i }));

    await waitFor(() =>
      expect(createAndEnrollMock).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: 'inst-1',
          gradeLevel: 'K1',
          classId: 'c1',
          termId: 't1',
          academicYearId: 'y1',
          assertedNoNemisId: true,
          guardians: [
            expect.objectContaining({
              firstName: 'John',
              lastName: 'Toe',
              relationship: 'Father',
              phoneNumber: '0770000000',
              email: 'john@example.com',
              isPrimary: true,
            }),
          ],
        }),
      ),
    );
    // The old two-step path (create, then one createGuardian per guardian) is gone.
    expect(createMock).not.toHaveBeenCalled();
    expect(createGuardianMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/student created/i)).toBeInTheDocument());
    expect(screen.queryByText(/login credentials/i)).toBeNull();
    // The permanent NEMIS ID is minted server-side, never entered by the
    // user, so the success screen is the only place it can be discovered.
    expect(screen.getByText('4829-1573-6045')).toBeInTheDocument();
  });
});

describe('StudentFormPage edit mode', () => {
  it('renders the plain edit form, not the wizard', async () => {
    render(
      <PresentationProvider layer={createRendererPresentation()}>
        <StudentFormPage edit />
      </PresentationProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Edit Student', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Find Student' })).toBeNull();
  });
});
