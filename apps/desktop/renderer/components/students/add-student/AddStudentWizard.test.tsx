import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { AddStudentWizard } from './AddStudentWizard';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
// Multi-step wizard walks type into many fields; under a parallel run they
// can exceed the 5s default without anything being wrong.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const school = {
  id: 'inst-1', code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT',
  approvalStatus: 'APPROVED', isApproved: true,
};
const currentYear = {
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 1, classCount: 2,
};
const term1 = {
  id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true,
};
const jss1a = {
  id: 'c1', academicYearId: 'y1', name: 'JSS1-A', gradeLevel: 'GRADE_7', isActive: true, subjectCount: 0,
};
const sss3a = { ...jss1a, id: 'c12', name: 'SSS3-A', gradeLevel: 'GRADE_12' };

const promotedHit = {
  found: true,
  nemisId: '482915736045',
  firstName: 'Ama',
  lastName: 'Kollie',
  gender: 'FEMALE',
  lastCompletion: { gradeLevel: 'GRADE_6', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_7', academicYearName: '2024/2025' },
  claimPath: 'IMMEDIATE',
};
const graduatedHit = {
  ...promotedHit,
  lastCompletion: { gradeLevel: 'GRADE_12', outcome: 'GRADUATED', nextGradeLevel: null, academicYearName: '2025/2026' },
};

const createdStudent = {
  id: 's-new', institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe', fullName: 'Grace Toe',
  nemisId: '123456789012', dateOfBirth: '2015-01-01', gender: 'FEMALE', isActive: true,
  version: 1, updatedAt: '2026-07-01T00:00:00.000Z', guardians: [],
};

interface Stubs {
  lookup?: (request: unknown) => Promise<unknown>;
  claim?: (request: unknown) => Promise<unknown>;
  request?: (request: unknown) => Promise<unknown>;
}

function stubNemis(stubs: Stubs = {}) {
  const lookup = vi.fn(stubs.lookup ?? (async () => ({ found: false })));
  const claim = vi.fn(stubs.claim ?? (async () => ({ data: { studentId: 's9' }, refreshed: true })));
  const request = vi.fn(
    stubs.request ?? (async () => ({ data: { id: 't1', lapsesAt: '2026-10-16T09:00:00.000Z' }, refreshed: true })),
  );
  const createAndEnroll = vi.fn(async () => createdStudent);
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => school) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [currentYear]) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [term1]) },
    classes: { list: vi.fn(async () => ({ items: [jss1a, sss3a], total: 2 })) },
    registry: { lookup, claim, request },
    student: { createAndEnroll },
  };
  return { lookup, claim, request, createAndEnroll };
}

beforeEach(() => {
  push.mockReset();
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

async function renderWizard({ online = true }: { online?: boolean } = {}) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  if (!online) layer.stores.connectivity.setOnline(false);
  const user = userEvent.setup({ delay: null });
  const view = render(
    <PresentationProvider layer={layer}>
      <AddStudentWizard />
    </PresentationProvider>,
  );
  await screen.findByRole('heading', { name: 'Find Student', level: 2 });
  return { user, layer, ...view };
}

// The shared Input/Select components don't associate <label> with their
// control, so find the label by text and walk to the sibling element
// (copied from StudentFormPage.test.tsx).
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

async function search(user: User, nemisId = '482915736045', dateOfBirth = '2014-03-02') {
  await user.type(textboxNear(/^nemis id/i), nemisId);
  await user.type(textboxNear(/^date of birth/i), dateOfBirth);
  await user.click(screen.getByRole('button', { name: 'Search' }));
}

async function pickClassAndTerm(user: User, classId = 'c1') {
  await waitFor(() => expect(selectNear(/^class/i).querySelector(`option[value="${classId}"]`)).not.toBeNull());
  await user.selectOptions(selectNear(/^class/i), classId);
  await waitFor(() => expect(selectNear(/^term/i).querySelector('option[value="t1"]')).not.toBeNull());
  await user.selectOptions(selectNear(/^term/i), 't1');
}

/** From Student Information through Create: fills the student (the birth
 * date only when Find did not pre-fill it), one guardian, GRADE 7, class and term. */
async function completeCreateFlow(user: User) {
  await screen.findByRole('heading', { name: 'Student Information', level: 2 });
  await user.type(textboxNear(/^first name/i), 'Grace');
  await user.type(textboxNear(/^last name/i), 'Toe');
  if (!textboxNear(/^date of birth/i).value) await user.type(textboxNear(/^date of birth/i), '2015-01-01');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await screen.findByRole('heading', { name: 'Guardian Information', level: 2 });
  await user.type(textboxNear(/guardian first name/i), 'John');
  await user.type(textboxNear(/guardian last name/i), 'Toe');
  await user.type(textboxNear(/relationship/i), 'Father');
  await user.type(textboxNear(/guardian phone/i), '0770000000');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await screen.findByRole('heading', { name: 'Grade & Class', level: 2 });
  await user.click(screen.getByRole('button', { name: 'GRADE 7' }));
  await pickClassAndTerm(user);
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await screen.findByRole('heading', { name: 'Review & Submit', level: 2 });
  await user.click(screen.getByRole('button', { name: 'Create student' }));
}

describe('AddStudentWizard', () => {
  it('offline: search is disabled with the D1 copy; the checkbox still proceeds to Student Information', async () => {
    const { lookup } = stubNemis();
    const { user } = await renderWizard({ online: false });

    expect(
      screen.getByText(
        'Searching for a transferring student needs a connection. You can still enrol a first-time student.',
      ),
    ).toBeInTheDocument();
    expect(textboxNear(/^nemis id/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'This child has no NEMIS ID (first-time enrollee)' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Student Information', level: 2 })).toBeInTheDocument();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('a miss shows only "No matching student." and offers to continue as a new student (no assertion)', async () => {
    const { lookup, createAndEnroll } = stubNemis({ lookup: async () => ({ found: false }) });
    const { user } = await renderWizard();

    await search(user);
    expect(await screen.findByText('No matching student.')).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith({ nemisId: '482915736045', dateOfBirth: '2014-03-02' });
    expect(screen.getByRole('heading', { name: 'Find Student', level: 2 })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue as a new student' }));
    await screen.findByRole('heading', { name: 'Student Information', level: 2 });
    // The searched birth date carries over into Student Information.
    expect(textboxNear(/^date of birth/i).value).toBe('2014-03-02');

    await completeCreateFlow(user);
    await waitFor(() => expect(createAndEnroll).toHaveBeenCalledTimes(1));
    expect(createAndEnroll).toHaveBeenCalledWith(
      expect.objectContaining({ dateOfBirth: '2014-03-02', assertedNoNemisId: false }),
    );
  });

  it('rate limited is not a miss: shows the server message and stays on Find', async () => {
    stubNemis({
      lookup: async () => {
        throw new Error('[RATE_LIMITED] Too many lookups. Please try again later.');
      },
    });
    const { user } = await renderWizard();

    await search(user);
    expect(await screen.findByText('Too many lookups. Please try again later.')).toBeInTheDocument();
    expect(screen.queryByText('No matching student.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue as a new student' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Find Student', level: 2 })).toBeInTheDocument();
  });

  it('IMMEDIATE hit → claim panel; GRADUATED stamp leaves grade empty and requires a reason', async () => {
    const { claim } = stubNemis({ lookup: async () => graduatedHit });
    const { user } = await renderWizard();

    await search(user);
    expect(await screen.findByRole('heading', { name: 'Claim student', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Ama Kollie')).toBeInTheDocument();
    expect(screen.getByText('GRADE 12 — Graduated (2025/2026)')).toBeInTheDocument();
    expect(selectNear(/^grade/i).value).toBe('');
    expect(textboxNear(/^reason for the grade/i)).toBeInTheDocument();

    const claimButton = () => screen.getByRole('button', { name: 'Claim student' });
    expect(claimButton()).toBeDisabled();

    await user.selectOptions(selectNear(/^grade/i), 'GRADE_12');
    expect(claimButton()).toBeDisabled();
    await user.type(textboxNear(/^reason for the grade/i), 'Repeating final year');
    expect(claimButton()).toBeDisabled();
    await waitFor(() => expect(selectNear(/^class/i).querySelector('option[value="c12"]')).not.toBeNull());
    await user.selectOptions(selectNear(/^class/i), 'c12');
    expect(claimButton()).toBeDisabled();
    await waitFor(() => expect(selectNear(/^term/i).querySelector('option[value="t1"]')).not.toBeNull());
    await user.selectOptions(selectNear(/^term/i), 't1');
    expect(claimButton()).toBeEnabled();

    await user.click(claimButton());
    await waitFor(() =>
      expect(claim).toHaveBeenCalledWith({
        nemisId: '482915736045',
        dateOfBirth: '2014-03-02',
        classId: 'c12',
        termId: 't1',
        gradeLevel: 'GRADE_12',
        overrideReason: 'Repeating final year',
      }),
    );
  });

  it('claim success with refresh navigates to the profile; without refresh shows the sync note', async () => {
    const first = stubNemis({ lookup: async () => promotedHit });
    const firstRender = await renderWizard();
    await search(firstRender.user);
    await screen.findByRole('heading', { name: 'Claim student', level: 2 });
    // The stamp's next grade is pre-filled and needs no reason.
    expect(selectNear(/^grade/i).value).toBe('GRADE_7');
    expect(screen.queryByText(/^reason for the grade/i)).toBeNull();
    await pickClassAndTerm(firstRender.user);
    await firstRender.user.click(screen.getByRole('button', { name: 'Claim student' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/government/school-admin/students/profile?id=s9'));
    expect(first.claim).toHaveBeenCalledWith(
      expect.objectContaining({ gradeLevel: 'GRADE_7', classId: 'c1', termId: 't1', overrideReason: undefined }),
    );
    firstRender.unmount();
    push.mockReset();

    stubNemis({
      lookup: async () => promotedHit,
      claim: async () => ({ data: { studentId: 's9' }, refreshed: false }),
    });
    const second = await renderWizard();
    await search(second.user);
    await screen.findByRole('heading', { name: 'Claim student', level: 2 });
    await pickClassAndTerm(second.user);
    await second.user.click(screen.getByRole('button', { name: 'Claim student' }));
    expect(await screen.findByText('Claimed. The student will appear once this device syncs.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('offline claim keeps the form', async () => {
    stubNemis({
      lookup: async () => promotedHit,
      claim: async () => {
        throw new Error("[OFFLINE] You're offline. Connect to the internet to do this.");
      },
    });
    const { user } = await renderWizard();
    await search(user);
    await screen.findByRole('heading', { name: 'Claim student', level: 2 });
    await pickClassAndTerm(user);
    await user.click(screen.getByRole('button', { name: 'Claim student' }));

    expect(await screen.findByText("You're offline. Connect to the internet to do this.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Claim student', level: 2 })).toBeInTheDocument();
    expect(selectNear(/^class/i).value).toBe('c1');
    expect(selectNear(/^term/i).value).toBe('t1');
    expect(selectNear(/^grade/i).value).toBe('GRADE_7');
    expect(push).not.toHaveBeenCalled();
  });

  it('REQUIRES_APPROVAL → request panel; success shows the lapse date without naming the school', async () => {
    const { request } = stubNemis({ lookup: async () => ({ ...promotedHit, claimPath: 'REQUIRES_APPROVAL' }) });
    const { user } = await renderWizard();
    await search(user);
    expect(await screen.findByRole('heading', { name: 'Request release', level: 2 })).toBeInTheDocument();

    const send = () => screen.getByRole('button', { name: 'Send request' });
    await pickClassAndTerm(user);
    expect(send()).toBeDisabled(); // reason still empty
    await user.type(textboxNear(/^reason/i), 'Family moved to Gbarnga');
    expect(send()).toBeEnabled();
    await user.click(send());

    expect(await screen.findByRole('heading', { name: 'Release requested', level: 2 })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith({
      nemisId: '482915736045',
      dateOfBirth: '2014-03-02',
      classId: 'c1',
      termId: 't1',
      gradeLevel: 'GRADE_7',
      reason: 'Family moved to Gbarnga',
    });
    const body = screen.getByText(/the student's current school/);
    expect(body.textContent).toContain('16 Oct 2026');
    expect(body.textContent).toContain('Ama Kollie');
  });

  it('create path requires class and term before Review, then calls createAndEnroll with the assertion', async () => {
    const { createAndEnroll, lookup } = stubNemis();
    const { user } = await renderWizard();

    await user.click(screen.getByRole('checkbox', { name: 'This child has no NEMIS ID (first-time enrollee)' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Student Information', level: 2 });
    await user.type(textboxNear(/^first name/i), 'Grace');
    await user.type(textboxNear(/^last name/i), 'Toe');
    await user.type(textboxNear(/^date of birth/i), '2015-01-01');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByRole('heading', { name: 'Guardian Information', level: 2 });
    await user.type(textboxNear(/guardian first name/i), 'John');
    await user.type(textboxNear(/guardian last name/i), 'Toe');
    await user.type(textboxNear(/relationship/i), 'Father');
    await user.type(textboxNear(/guardian phone/i), '0770000000');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByRole('heading', { name: 'Grade & Class', level: 2 });
    expect(screen.queryByText(/Class assignment can be done later/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'GRADE 7' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Choose a grade, class and term.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument();

    await pickClassAndTerm(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Review & Submit', level: 2 });
    expect(screen.getByText('JSS1-A')).toBeInTheDocument();
    expect(screen.getByText('Term 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create student' }));

    await waitFor(() => expect(createAndEnroll).toHaveBeenCalledTimes(1));
    expect(createAndEnroll).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: 'inst-1',
        firstName: 'Grace',
        lastName: 'Toe',
        dateOfBirth: '2015-01-01',
        gender: 'FEMALE',
        gradeLevel: 'GRADE_7',
        classId: 'c1',
        termId: 't1',
        academicYearId: 'y1',
        assertedNoNemisId: true,
        guardians: [
          {
            firstName: 'John',
            lastName: 'Toe',
            relationship: 'Father',
            phoneNumber: '0770000000',
            email: undefined,
            isPrimary: true,
          },
        ],
      }),
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(await screen.findByText('Student created successfully')).toBeInTheDocument();
    expect(screen.getByText('1234-5678-9012')).toBeInTheDocument();
  });

  it('changing the grade on the create path drops the chosen class, so Next is blocked again', async () => {
    const { createAndEnroll } = stubNemis();
    const { user } = await renderWizard();
    await user.click(screen.getByRole('checkbox', { name: 'This child has no NEMIS ID (first-time enrollee)' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Student Information', level: 2 });
    await user.type(textboxNear(/^first name/i), 'Grace');
    await user.type(textboxNear(/^last name/i), 'Toe');
    await user.type(textboxNear(/^date of birth/i), '2015-01-01');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Guardian Information', level: 2 });
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByRole('heading', { name: 'Grade & Class', level: 2 });
    await user.click(screen.getByRole('button', { name: 'GRADE 7' }));
    await pickClassAndTerm(user);
    await user.click(screen.getByRole('button', { name: 'GRADE 8' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Choose a grade, class and term.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Review & Submit', level: 2 })).toBeNull();

    // Back to the original grade: the class must be chosen again, the term is kept.
    await user.click(screen.getByRole('button', { name: 'GRADE 7' }));
    await waitFor(() => expect(selectNear(/^class/i).querySelector('option[value="c1"]')).not.toBeNull());
    expect(selectNear(/^class/i).value).toBe('');
    expect(selectNear(/^term/i).value).toBe('t1');
    await user.selectOptions(selectNear(/^class/i), 'c1');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Review & Submit', level: 2 });
    await user.click(screen.getByRole('button', { name: 'Create student' }));
    await waitFor(() =>
      expect(createAndEnroll).toHaveBeenCalledWith(
        expect.objectContaining({ gradeLevel: 'GRADE_7', classId: 'c1', termId: 't1' }),
      ),
    );
  });

  it('changing the grade in the claim panel drops the chosen class and disables Claim', async () => {
    const { claim } = stubNemis({ lookup: async () => graduatedHit });
    const { user } = await renderWizard();
    await search(user);
    await screen.findByRole('heading', { name: 'Claim student', level: 2 });
    const claimButton = () => screen.getByRole('button', { name: 'Claim student' });

    await user.selectOptions(selectNear(/^grade/i), 'GRADE_12');
    await user.type(textboxNear(/^reason for the grade/i), 'Repeating final year');
    await pickClassAndTerm(user, 'c12');
    expect(claimButton()).toBeEnabled();

    await user.selectOptions(selectNear(/^grade/i), 'GRADE_7');
    expect(claimButton()).toBeDisabled(); // the reason is still filled — only the class is missing
    await waitFor(() => expect(selectNear(/^class/i).querySelector('option[value="c1"]')).not.toBeNull());
    expect(selectNear(/^class/i).value).toBe('');
    expect(selectNear(/^term/i).value).toBe('t1');
    await user.click(claimButton());
    expect(claim).not.toHaveBeenCalled();
  });

  it('changing the grade in the request panel drops the chosen class and disables Send', async () => {
    const { request } = stubNemis({ lookup: async () => ({ ...promotedHit, claimPath: 'REQUIRES_APPROVAL' }) });
    const { user } = await renderWizard();
    await search(user);
    await screen.findByRole('heading', { name: 'Request release', level: 2 });
    const send = () => screen.getByRole('button', { name: 'Send request' });

    await pickClassAndTerm(user);
    await user.type(textboxNear(/^reason/i), 'Family moved');
    expect(send()).toBeEnabled();

    await user.selectOptions(selectNear(/^grade/i), 'GRADE_12');
    expect(send()).toBeDisabled();
    await waitFor(() => expect(selectNear(/^class/i).querySelector('option[value="c12"]')).not.toBeNull());
    expect(selectNear(/^class/i).value).toBe('');
    expect(selectNear(/^term/i).value).toBe('t1');
    await user.click(send());
    expect(request).not.toHaveBeenCalled();
  });

  it('a miss is cleared when the ID, birth date or checkbox changes', async () => {
    const { lookup } = stubNemis({ lookup: async () => ({ found: false }) });
    const { user } = await renderWizard();
    const missShown = () => screen.queryByText('No matching student.') !== null;

    await search(user);
    await screen.findByText('No matching student.');
    await user.type(textboxNear(/^nemis id/i), '9');
    expect(missShown()).toBe(false);
    expect(screen.queryByRole('button', { name: 'Continue as a new student' })).toBeNull();

    await user.clear(textboxNear(/^nemis id/i));
    await user.type(textboxNear(/^nemis id/i), '482915736045');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('No matching student.');
    await user.clear(textboxNear(/^date of birth/i));
    await user.type(textboxNear(/^date of birth/i), '2014-03-03');
    expect(missShown()).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('No matching student.');
    expect(lookup).toHaveBeenLastCalledWith({ nemisId: '482915736045', dateOfBirth: '2014-03-03' });
    await user.click(screen.getByRole('checkbox', { name: 'This child has no NEMIS ID (first-time enrollee)' }));
    expect(missShown()).toBe(false);
    expect(screen.queryByRole('button', { name: 'Continue as a new student' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('re-entering Find after the checkbox path: a later miss creates without the assertion', async () => {
    const { createAndEnroll } = stubNemis({ lookup: async () => ({ found: false }) });
    const { user } = await renderWizard();

    await user.click(screen.getByRole('checkbox', { name: 'This child has no NEMIS ID (first-time enrollee)' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Student Information', level: 2 });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'Find Student', level: 2 });

    await search(user);
    await screen.findByText('No matching student.');
    await user.click(screen.getByRole('button', { name: 'Continue as a new student' }));
    await completeCreateFlow(user);

    await waitFor(() => expect(createAndEnroll).toHaveBeenCalledTimes(1));
    expect(createAndEnroll).toHaveBeenCalledWith(expect.objectContaining({ assertedNoNemisId: false }));
  });

  it("blocks Guardian Information when the student's email matches a guardian's email", async () => {
    stubNemis();
    const { user } = await renderWizard();

    await user.click(screen.getByRole('checkbox', { name: 'This child has no NEMIS ID (first-time enrollee)' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Student Information', level: 2 });
    await user.type(textboxNear(/^first name/i), 'Grace');
    await user.type(textboxNear(/^last name/i), 'Toe');
    await user.type(textboxNear(/^date of birth/i), '2015-01-01');
    await user.type(textboxNear(/^email/i), 'Family@Example.com');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByRole('heading', { name: 'Guardian Information', level: 2 });
    await user.type(textboxNear(/guardian first name/i), 'John');
    await user.type(textboxNear(/guardian last name/i), 'Toe');
    await user.type(textboxNear(/relationship/i), 'Father');
    await user.type(textboxNear(/guardian phone/i), '0770000000');
    await user.type(textboxNear(/guardian email/i), ' family@example.com');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByText(
        "The student's email can't be the same as a guardian's email. Leave the student's email blank or use a different one.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Guardian Information', level: 2 })).toBeInTheDocument();

    await user.clear(textboxNear(/guardian email/i));
    await user.type(textboxNear(/guardian email/i), 'john@example.com');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument();
  });

  /** Checkbox path through Student Information to Guardian Information. */
  async function toGuardianStep(user: User) {
    await user.click(screen.getByRole('checkbox', { name: 'This child has no NEMIS ID (first-time enrollee)' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Student Information', level: 2 });
    await user.type(textboxNear(/^first name/i), 'Grace');
    await user.type(textboxNear(/^last name/i), 'Toe');
    await user.type(textboxNear(/^date of birth/i), '2015-01-01');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Guardian Information', level: 2 });
  }

  it('a started guardian must be completed (or removed) before leaving Guardian Information', async () => {
    stubNemis();
    const { user } = await renderWizard();
    await toGuardianStep(user);

    // Only an email typed: still a started draft.
    await user.type(textboxNear(/guardian email/i), 'john@example.com');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText("Complete or remove each guardian you've started.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Guardian Information', level: 2 })).toBeInTheDocument();

    // Name and phone but no relationship: still incomplete.
    await user.type(textboxNear(/guardian first name/i), 'John');
    await user.type(textboxNear(/guardian last name/i), 'Toe');
    await user.type(textboxNear(/guardian phone/i), '0770000000');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText("Complete or remove each guardian you've started.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Guardian Information', level: 2 })).toBeInTheDocument();

    await user.type(textboxNear(/relationship/i), 'Father');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument();
  });

  it('a fully blank guardian draft is allowed', async () => {
    stubNemis();
    const { user } = await renderWizard();
    await toGuardianStep(user);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Grade & Class', level: 2 })).toBeInTheDocument();
  });

  it('caps "Add another guardian" at 10', async () => {
    stubNemis();
    const { user } = await renderWizard();
    await toGuardianStep(user);

    const add = screen.getByRole('button', { name: 'Add another guardian' });
    for (let i = 0; i < 9; i += 1) await user.click(add);
    expect(screen.getByRole('heading', { name: 'Guardian 10', level: 3 })).toBeInTheDocument();
    expect(add).toBeDisabled();
    await user.click(add);
    expect(screen.queryByRole('heading', { name: 'Guardian 11', level: 3 })).toBeNull();
  });
});
