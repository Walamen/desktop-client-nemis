import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { SchoolRegistrationBadge } from './SchoolRegistrationBadge';
import { PrincipalLoginCard } from './PrincipalLoginCard';
import { SchoolRegistrationNotices } from './SchoolRegistrationNotices';
import { acknowledgeRegistrations } from './notices';

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('SchoolRegistrationBadge', () => {
  it('renders each state', () => {
    const { rerender, container } = render(<SchoolRegistrationBadge syncState={null} syncError={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SchoolRegistrationBadge syncState="synced" syncError={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SchoolRegistrationBadge syncState="pending" syncError={null} />);
    expect(screen.getByText('Waiting to sync')).toHaveClass('bg-amber-100');
    rerender(<SchoolRegistrationBadge syncState="rejected" syncError="Email taken" />);
    expect(screen.getByText("Couldn't be added")).toHaveAttribute('title', 'Email taken');
  });
});

describe('PrincipalLoginCard', () => {
  it('shows the email and password and copies each', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PrincipalLoginCard login={{ email: 'ada@school.lr', password: 'Nemis@123' }} />);
    expect(screen.getByText('Principal Login')).toBeInTheDocument();
    expect(screen.getByText('ada@school.lr')).toBeInTheDocument();
    expect(screen.getByText('Nemis@123')).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle('Copy')[1]!);
    expect(writeText).toHaveBeenCalledWith('Nemis@123');
  });
});

describe('SchoolRegistrationNotices', () => {
  it('seeds silently, then announces schools a background sync accepted; acknowledged ids are silent', async () => {
    const rows = [
      { id: 'a', syncState: 'pending' },
      { id: 'b', syncState: 'pending' },
    ];
    const getSchoolRegistrations = vi.fn(async () => rows.map((r) => ({ ...r })));
    (window as unknown as { nemis: unknown }).nemis = { county: { getSchoolRegistrations } };
    const layer = createRendererPresentation();
    render(
      <PresentationProvider layer={layer}>
        <SchoolRegistrationNotices />
      </PresentationProvider>,
    );
    await waitFor(() => expect(getSchoolRegistrations).toHaveBeenCalledTimes(1));
    expect(layer.stores.notifications.store.getState().notifications).toEqual([]);

    rows[0]!.syncState = 'synced';
    rows[1]!.syncState = 'synced';
    acknowledgeRegistrations(['b']);
    act(() => layer.stores.connectivity.store.setState({ lastSyncAt: '2026-10-17T10:00:00.000Z' }));
    await waitFor(() =>
      expect(layer.stores.notifications.store.getState().notifications.map((n) => n.message)).toEqual([
        '1 school added: principal logins are ready.',
      ]),
    );
  });
});
