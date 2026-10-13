import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrentTermNotice } from './CurrentTermNotice';

describe('CurrentTermNotice', () => {
  it.each(['success', 'refreshing'])('renders nothing once the term is %s', (status) => {
    const { container } = render(<CurrentTermNotice status={status} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['idle', 'loading'])('says the term is loading while %s', (status) => {
    render(<CurrentTermNotice status={status} />);
    expect(screen.getByText(/Loading the current term/)).toBeInTheDocument();
  });

  it('links to Terms when no current term exists', () => {
    render(<CurrentTermNotice status="empty" />);
    expect(screen.getByText(/No current term is set/)).toBeInTheDocument();
    expect(screen.queryByText(/Loading/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Set a current term' })).toHaveAttribute('href', '/government/school-admin/academic-grading?open=terms');
  });

  it('shows the load error instead of claiming it is loading', () => {
    render(<CurrentTermNotice status="error" errorMessage="Local database is locked." />);
    expect(screen.getByText(/Local database is locked\./)).toBeInTheDocument();
    expect(screen.queryByText(/Loading/)).toBeNull();
  });
});
