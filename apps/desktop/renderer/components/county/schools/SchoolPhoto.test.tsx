import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchoolPhoto } from './SchoolPhoto';

describe('SchoolPhoto', () => {
  it('swaps to the fallback image when the photo fails', () => {
    render(<SchoolPhoto src="https://res.cloudinary.com/x/a.jpg" alt="Alpha" width={32} height={32} />);
    const img = screen.getByAltText('Alpha');
    expect(img.getAttribute('src')).toContain('res.cloudinary.com');
    fireEvent.error(img);
    expect(screen.getByAltText('Alpha').getAttribute('src')).toContain('/school-fallback.jpg');
  });
});
