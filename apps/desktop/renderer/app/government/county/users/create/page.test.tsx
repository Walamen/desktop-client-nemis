import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

describe('County Create User placeholder', () => {
  it('is a ComingSoon page', () => {
    render(<Page />);
    expect(screen.getByText('Create User')).toBeInTheDocument();
  });
});
