import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('shows initials when the photo fails to load', () => {
    render(<Avatar src="https://res.cloudinary.com/x/missing.jpg" firstName="Musu" lastName="Kollie" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('MK')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the role fallback image when the photo fails and there are no initials', () => {
    render(<Avatar src="https://res.cloudinary.com/x/missing.jpg" role="deo" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').getAttribute('src')).toMatch(/\/deo-fallback\.jpg$/);
  });
});
