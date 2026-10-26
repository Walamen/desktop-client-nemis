import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReportCardOutcome } from '@nemis-desktop/types';
import { ReportCardView } from './ReportCardView';
import { payloadFixture } from './fixtures';

describe('ReportCardView', () => {
  it('renders the header facts', () => {
    render(<ReportCardView payload={payloadFixture()} version={2} />);
    expect(screen.getByText('Monrovia Central High')).toBeInTheDocument();
    expect(screen.getByText(/Ruth Kollie/)).toBeInTheDocument();
    expect(screen.getByText('Grace Toe')).toBeInTheDocument();
    expect(screen.getByText(/NEMIS ID/)).toHaveTextContent('4829');
    expect(screen.getByText(/Grade 7A/)).toBeInTheDocument();
    expect(screen.getByText(/2026\/2027/)).toBeInTheDocument();
    expect(screen.getAllByText(/Period 2/).length).toBeGreaterThan(0);
    expect(screen.getByText('Version 2')).toBeInTheDocument();
  });

  it('renders columns in payload order with a dash for null cells', () => {
    render(<ReportCardView payload={payloadFixture()} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Subject', 'Period 1', 'Period 2', 'Term 1', 'Yearly']);
    const row = screen.getByText('Mathematics').closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[0]).toBe('Mathematics');
    expect(cells[1]).toContain('78.5');
    expect(cells[2]).toBe('—');
    expect(cells[3]).toBe('78.5');
    expect(cells[4]).toBe('—');
  });

  it('marks term-average and yearly columns as distinct', () => {
    render(<ReportCardView payload={payloadFixture()} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[1]).toHaveAttribute('data-column-kind', 'PERIOD');
    expect(headers[3]).toHaveAttribute('data-column-kind', 'TERM_AVERAGE');
    expect(headers[4]).toHaveAttribute('data-column-kind', 'YEARLY_AVERAGE');
  });

  it('shows the source school of a carried cell', () => {
    render(<ReportCardView payload={payloadFixture()} />);
    expect(screen.getByText('Paynesville Academy')).toBeInTheDocument();
  });

  it('shows the overall row, attendance and pass mark', () => {
    render(<ReportCardView payload={payloadFixture()} />);
    const overall = screen.getByText('Overall').closest('tr') as HTMLElement;
    expect(within(overall).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Overall', '78.5', '—', '78.5', '—']);
    expect(screen.getByText('Present').nextSibling?.textContent).toBe('40');
    expect(screen.getByText('Absent').nextSibling?.textContent).toBe('3');
    expect(screen.getByText(/Pass mark/)).toHaveTextContent('50');
  });

  it('shows the Withdrawn badge', () => {
    render(<ReportCardView payload={payloadFixture()} status="WITHDRAWN" />);
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();
  });

  it('shows the superseded badge', () => {
    render(<ReportCardView payload={payloadFixture()} status="SUPERSEDED" />);
    expect(screen.getByText('Replaced by a newer version')).toBeInTheDocument();
  });

  it('shows no status badge for a current card and no print controls', () => {
    render(<ReportCardView payload={payloadFixture()} status="CURRENT" />);
    expect(screen.queryByText('Withdrawn')).toBeNull();
    expect(screen.queryByText('Replaced by a newer version')).toBeNull();
    expect(screen.queryByRole('button', { name: /print|pdf/i })).toBeNull();
  });

  describe('final report outcome', () => {
    const final = (outcome: ReportCardOutcome | null, principalRemark: string | null = null) => ({
      ...payloadFixture(),
      kind: 'FINAL' as const,
      outcome,
      principalRemark,
    });
    const o = (status: ReportCardOutcome['status'], nextGradeLevel: string | null = null): ReportCardOutcome => ({
      status,
      nextGradeLevel,
      yearlyAverage: 71,
    });

    it('shows the exact outcome line for all four statuses', () => {
      const cases: [ReportCardOutcome, string][] = [
        [o('PROMOTED', 'GRADE_8'), 'Promoted to Grade 8'],
        [o('RETAINED'), 'Retained in Grade 7'],
        [o('GRADUATED'), 'Graduated'],
        [o('WITHDRAWN'), 'Withdrawn'],
      ];
      for (const [outcome, line] of cases) {
        const { unmount } = render(<ReportCardView payload={final(outcome)} />);
        expect(screen.getByTestId('report-card-outcome')).toHaveTextContent(new RegExp('^' + line + '$'));
        unmount();
      }
    });

    it('shows the principal remark on a final card', () => {
      render(<ReportCardView payload={final(o('GRADUATED'), 'A fine year.')} />);
      expect(screen.getByText('A fine year.')).toBeInTheDocument();
    });

    it('shows no outcome or remark on a period card', () => {
      render(<ReportCardView payload={payloadFixture()} />);
      expect(screen.queryByTestId('report-card-outcome')).toBeNull();
      expect(screen.queryByText(/Principal's remark/)).toBeNull();
    });
  });

  it('marks only cells entered at close', () => {
    const payload = payloadFixture();
    payload.subjects[0]!.cells['gp:gp-2'] = { value: 60, source: 'ADMIN_AT_CLOSE', sourceSchoolName: null };
    render(<ReportCardView payload={payload} />);
    expect(screen.getAllByText('Entered at close')).toHaveLength(1);
    const row = screen.getByText('Mathematics').closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('Entered at close');
    expect(cells[1]).not.toHaveTextContent('Entered at close');
  });

  it('shows an update message instead of the table for a newer schema version', () => {
    const payload = { ...payloadFixture(), schemaVersion: 2 } as unknown as ReturnType<typeof payloadFixture>;
    render(<ReportCardView payload={payload} />);
    expect(screen.getByText('This report card uses a newer format. Update the app to view it.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
