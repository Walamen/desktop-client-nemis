import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { PastYearsPage } from './PastYearsPage';
import { summaryFixture } from './fixtures';

function renderIn(ui: ReactElement) {
  return render(<PresentationProvider layer={createRendererPresentation()}>{ui}</PresentationProvider>);
}

function install(years: unknown[], over: Record<string, unknown> = {}) {
  const reportCards = {
    listArchivedYears: vi.fn(async () => years),
    listForClass: vi.fn(async () => [
      { student: { id: 'st-1', nemisId: '482915736045', fullName: 'Grace Toe' }, latest: summaryFixture() },
    ]),
    getIssue: vi.fn(),
    ...over,
  };
  (window as unknown as { nemis: unknown }).nemis = { reportCards };
  return reportCards;
}
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

const YEARS = [
  {
    academicYearId: 'ay-1',
    code: '2025/2026',
    status: 'CLOSED',
    classes: [
      { classId: 'cl-1', name: 'Grade 7A', gradeLevel: 'GRADE_7' },
      { classId: 'cl-2', name: 'Grade 8B', gradeLevel: 'GRADE_8' },
    ],
  },
  { academicYearId: 'ay-0', code: '2024/2025', status: 'REOPENED', classes: [] },
];

describe('PastYearsPage', () => {
  it('shows an empty state when no year has been closed', async () => {
    install([]);
    renderIn(<PastYearsPage />);
    expect(await screen.findByText('No academic year has been closed yet.')).toBeInTheDocument();
  });

  it('goes from a year to a class to its report cards', async () => {
    const rc = install(YEARS);
    renderIn(<PastYearsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /2025\/2026/ }));
    expect(screen.getByRole('heading', { name: '2025/2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grade 8B' }));
    await waitFor(() => expect(rc.listForClass).toHaveBeenCalledWith('cl-2'));
    expect(await screen.findByText('Grace Toe')).toBeInTheDocument();
  });

  it('goes back from the classes to the years', async () => {
    install(YEARS);
    renderIn(<PastYearsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /2025\/2026/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to past years' }));
    expect(screen.getByRole('button', { name: /2024\/2025/ })).toBeInTheDocument();
  });

  it('says so when a year has no classes the caller may open', async () => {
    install(YEARS);
    renderIn(<PastYearsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /2024\/2025/ }));
    expect(screen.getByText('No classes with report cards in this year.')).toBeInTheDocument();
  });

  it('shows the parsed message when loading fails', async () => {
    install([], {
      listArchivedYears: vi.fn(async () => {
        throw new Error('[FORBIDDEN] Not allowed.');
      }),
    });
    renderIn(<PastYearsPage />);
    expect(await screen.findByText('Not allowed.')).toBeInTheDocument();
  });
});
