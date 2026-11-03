import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { ReportCardList } from './ReportCardList';
import { detailFixture, summaryFixture } from './fixtures';

function renderIn(ui: ReactElement) {
  return render(<PresentationProvider layer={createRendererPresentation()}>{ui}</PresentationProvider>);
}

function install(over: Record<string, unknown> = {}) {
  const reportCards = {
    listForStudent: vi.fn(async () => [
      summaryFixture({ issueId: 'i-1', academicYearId: 'ay-1', academicYearName: '2026/2027' }),
      summaryFixture({
        issueId: 'i-2',
        academicYearId: 'ay-1',
        academicYearName: '2026/2027',
        gradingPeriodName: 'Period 1',
        status: 'SUPERSEDED',
      }),
      summaryFixture({
        issueId: 'i-3',
        academicYearId: 'ay-0',
        academicYearName: '2025/2026',
        gradingPeriodName: 'Period 3',
      }),
    ]),
    getIssue: vi.fn(async () => detailFixture()),
    ...over,
  };
  (window as unknown as { nemis: unknown }).nemis = { reportCards };
  return reportCards;
}
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('ReportCardList', () => {
  it('does not request report cards for an empty student id', async () => {
    const rc = install();
    renderIn(<ReportCardList studentId="" />);
    await new Promise((res) => setTimeout(res, 50));
    expect(rc.listForStudent).not.toHaveBeenCalled();
  });

  it('groups the issues by academic year', async () => {
    install();
    renderIn(<ReportCardList studentId="st-1" />);
    expect(await screen.findByRole('heading', { name: '2026/2027' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2025/2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Period/ })).toHaveLength(3);
    expect(screen.getByText('Replaced by a newer version')).toBeInTheDocument();
  });

  it('opens an issue and shows the card', async () => {
    const rc = install();
    renderIn(<ReportCardList studentId="st-1" />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Period 2/ }))[0]!);
    await waitFor(() => expect(rc.getIssue).toHaveBeenCalledWith('i-1'));
    expect(await screen.findByText('Monrovia Central High')).toBeInTheDocument();
  });

  it('shows an empty state when the student has no report cards', async () => {
    install({ listForStudent: vi.fn(async () => []) });
    renderIn(<ReportCardList studentId="st-1" />);
    expect(await screen.findByText('No report cards have been issued for this student yet.')).toBeInTheDocument();
  });

  it('shows the parsed message when loading fails', async () => {
    install({
      listForStudent: vi.fn(async () => {
        throw new Error('[FORBIDDEN] Not allowed.');
      }),
    });
    renderIn(<ReportCardList studentId="st-1" />);
    expect(await screen.findByText('Not allowed.')).toBeInTheDocument();
  });

  it('never shows the previous card while the next one loads', async () => {
    let release: (v: ReturnType<typeof detailFixture>) => void = () => undefined;
    const getIssue = vi
      .fn()
      .mockImplementationOnce(async () => detailFixture())
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            release = res;
          }),
      );
    install({ getIssue });
    renderIn(<ReportCardList studentId="st-1" />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Period 2/ }))[0]!);
    expect(await screen.findByText('Monrovia Central High')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Period 3/ }));
    await waitFor(() => expect(getIssue).toHaveBeenCalledWith('i-3'));
    expect(screen.queryByText('Monrovia Central High')).not.toBeInTheDocument();
    release(detailFixture());
    expect(await screen.findByText('Monrovia Central High')).toBeInTheDocument();
  });
});
