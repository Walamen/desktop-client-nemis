import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/government/school-admin' }));
vi.mock('../../lib/presentation/hooks', () => ({
  useSettingsViewModel: () => ({ store: { getState: () => ({ profile: { status: 'idle' } }) }, loadProfile: vi.fn() }),
}));

import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders every nav group and item with correct hrefs', () => {
    render(<Sidebar institutionName="Monrovia Central School" />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Students').closest('a')).toHaveAttribute('href', '/government/school-admin/students');
    expect(screen.getByText('Attendence Management')).toBeInTheDocument();
    expect(screen.getByText('School Settings')).toBeInTheDocument();
    expect(screen.getByText('Monrovia Central School')).toBeInTheDocument();
  });

  it('marks the active route', () => {
    render(<Sidebar institutionName="X" />);
    expect(screen.getByText('Overview').closest('a')).toHaveClass('bg-slate-800');
  });
});
