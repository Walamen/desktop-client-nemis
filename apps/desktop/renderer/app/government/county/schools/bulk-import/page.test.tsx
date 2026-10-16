import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

describe('County Bulk Import Schools placeholder', () => {
  it('is a ComingSoon page', () => {
    render(<Page />);
    expect(screen.getByText('Bulk Import Schools')).toBeInTheDocument();
  });
});
