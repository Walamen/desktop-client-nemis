import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { ClassReportCardsPage } from './ClassReportCardsPage';
import { detailFixture, summaryFixture } from './fixtures';

function renderIn(ui: ReactElement) {
  return render(<PresentationProvider layer={createRendererPresentation()}>{ui}</PresentationProvider>);
}

function install(entries: unknown[], over: Record<string, unknown> = {}) {
  const reportCards = {
    listForClass: vi.fn(async () => entries),
    getIssue: vi.fn(async () => detailFixture()),
    ...over,
  };
  (window as unknown as { nemis: unknown }).nemis = { reportCards };
  return reportCards;
}
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('ClassReportCardsPage', () => {
  it('lists students with their latest card and opens it', async () => {
    const rc = install([
      { student: { id: 'st-1', nemisId: '482915736045', fullName: 'Grace Toe' }, latest: summaryFixture() },
      { student: { id: 'st-2', nemisId: null, fullName: 'Moses Dolo' }, latest: null },
    ]);
    renderIn(<ClassReportCardsPage classId="cl-1" />);
    expect(await screen.findByText('Grace Toe')).toBeInTheDocument();
    expect(screen.getByText('Moses Dolo')).toBeInTheDocument();
    expect(screen.getByText('No report card')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Period 2/ }));
    await waitFor(() => expect(rc.getIssue).toHaveBeenCalledWith('iss-1'));
    expect(await screen.findByText('Monrovia Central High')).toBeInTheDocument();
  });

  it('shows the empty copy when no card has been issued for the class', async () => {
    install([{ student: { id: 'st-1', nemisId: null, fullName: 'Grace Toe' }, latest: null }]);
    renderIn(<ClassReportCardsPage classId="cl-1" />);
    expect(await screen.findByText('No report cards have been issued for this class yet.')).toBeInTheDocument();
  });

  it('shows the empty copy for a class with no students', async () => {
    install([]);
    renderIn(<ClassReportCardsPage classId="cl-1" />);
    expect(await screen.findByText('No report cards have been issued for this class yet.')).toBeInTheDocument();
  });

  it('shows an error state when loading fails', async () => {
    install([], {
      listForClass: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    renderIn(<ClassReportCardsPage classId="cl-1" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows a not-found error for an empty class id instead of a skeleton', async () => {
    const rc = install([]);
    renderIn(<ClassReportCardsPage classId="" />);
    expect(await screen.findByText('This class could not be found.')).toBeInTheDocument();
    expect(rc.listForClass).not.toHaveBeenCalled();
  });

  it('drops the previous class entries while another class loads', async () => {
    let release: (v: unknown[]) => void = () => undefined;
    const listForClass = vi
      .fn()
      .mockResolvedValueOnce([{ student: { id: 'st-1', nemisId: null, fullName: 'Grace Toe' }, latest: summaryFixture() }])
      .mockImplementationOnce(() => new Promise((r) => { release = r; }));
    install([], { listForClass });
    const layer = createRendererPresentation();
    const { rerender } = render(
      <PresentationProvider layer={layer}>
        <ClassReportCardsPage classId="cl-1" />
      </PresentationProvider>,
    );
    expect(await screen.findByText('Grace Toe')).toBeInTheDocument();
    rerender(
      <PresentationProvider layer={layer}>
        <ClassReportCardsPage classId="cl-2" />
      </PresentationProvider>,
    );
    await waitFor(() => expect(listForClass).toHaveBeenCalledWith('cl-2'));
    expect(screen.queryByText('Grace Toe')).toBeNull();
    release([]);
  });
});
