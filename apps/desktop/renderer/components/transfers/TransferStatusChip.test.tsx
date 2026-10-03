import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransferStatusChip } from './TransferStatusChip';

describe('TransferStatusChip', () => {
  it('checks lapsed before status', () => {
    const { rerender } = render(<TransferStatusChip status="PENDING" lapsed ours />);
    expect(screen.getByText('Lapsed — ready to complete')).toBeTruthy();
    rerender(<TransferStatusChip status="PENDING" lapsed ours={false} />);
    expect(screen.getByText('Lapsed')).toBeTruthy();
  });
  it.each([
    ['PENDING', 'Pending'],
    ['APPROVED', 'Approved'],
    ['REJECTED', 'Rejected'],
    ['CANCELLED', 'Cancelled'],
  ])('labels %s', (status, label) => {
    render(<TransferStatusChip status={status} lapsed={false} ours={false} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
