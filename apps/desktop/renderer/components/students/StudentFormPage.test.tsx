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
    await waitFor(() => expect(screen.getByText('Student Information')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Student Information')).toBeInTheDocument(); // blocked: required fields empty

    await user.type(screen.getByLabelText(/first name/i), 'Grace');
    await user.type(screen.getByLabelText(/last name/i), 'Toe');
    await user.type(screen.getByLabelText(/date of birth/i), '2015-01-01');
    await user.type(screen.getByLabelText(/student number|admission number/i), 'ADM-1');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText('Guardian Information')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText('Grade Level')).toBeInTheDocument());
  });
});
