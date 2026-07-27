import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { StudentFormPage } from './StudentFormPage';

beforeEach(() => {
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => ({ id: 'inst-1', code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT', approvalStatus: 'APPROVED', isApproved: true })) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    term: { getCurrent: vi.fn(async () => null) },
  };
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

describe('StudentFormPage create wizard', () => {
  it('walks Student Information -> Grade Level -> Review, blocking on required fields', async () => {
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    const user = userEvent.setup();
    render(
      <PresentationProvider layer={layer}>
        <StudentFormPage />
      </PresentationProvider>,
    );
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
    await user.type(textboxNear(/student number|admission number/i), 'ADM-1');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Guardian Information', level: 2 }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Grade Level', level: 2 })).toBeInTheDocument(),
    );
  });
});
