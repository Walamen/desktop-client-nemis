import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
});
