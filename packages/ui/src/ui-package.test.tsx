import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from './Breadcrumbs';
import { Skeleton } from './Skeleton';
import { ErrorState } from './ErrorState';
import { Dropdown, DropdownItem } from './Dropdown';

describe('@nemis-desktop/ui new components', () => {
  it('renders breadcrumb trail with Home prefix', () => {
    render(<Breadcrumbs segments={['School Admin', 'Students']} />);
    expect(screen.getByText(/Home/)).toBeInTheDocument();
    expect(screen.getByText(/Students/)).toBeInTheDocument();
  });

  it('renders a skeleton block', () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  it('fires retry from the error state', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Boom" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('invokes a dropdown item and supports disabled items', async () => {
    const onSelect = vi.fn();
    render(
      <Dropdown open onOpenChange={() => {}} trigger={<span>menu</span>}>
        <DropdownItem onSelect={onSelect}>Profile</DropdownItem>
        <DropdownItem onSelect={vi.fn()} disabled>Sign Out</DropdownItem>
      </Dropdown>,
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Profile' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByRole('menuitem', { name: 'Sign Out' })).toBeDisabled();
  });
});
