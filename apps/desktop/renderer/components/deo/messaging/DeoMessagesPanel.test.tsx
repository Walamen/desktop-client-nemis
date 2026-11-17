import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { DeoMessagesPanel } from './DeoMessagesPanel';

let search = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => search }));

const recipient = (userId: string, firstName: string, role: string, extra: Record<string, unknown> = {}) => ({
  userId, firstName, lastName: 'Doe', photoUrl: null, role,
  districtId: null, districtName: null, institutionId: null, institutionName: null, ...extra,
});
const conversation = (id: string, userId: string, firstName: string, role: string, institutionName: string | null = null) => ({
  id, lastMessageAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), createdAt: '2026-10-01T00:00:00.000Z',
  counterpart: { userId, firstName, lastName: 'Doe', photoUrl: null, role, institutionName },
  lastMessage: 'See you', unreadCount: 1,
});

const overview = {
  recipients: [
    recipient('ceo-1', 'Cee', 'COUNTY_ADMIN'),
    recipient('adm-a', 'Ann', 'INSTITUTION_ADMIN', { institutionId: 's-a', institutionName: 'Alpha School' }),
    recipient('adm-b', 'Bob', 'INSTITUTION_ADMIN', { institutionId: 's-b', institutionName: 'Beta High' }),
  ],
  conversations: [
    conversation('c-a', 'adm-a', 'Ann', 'INSTITUTION_ADMIN', 'Alpha School'),
    conversation('c-gone', 'moved-1', 'Moe', 'INSTITUTION_ADMIN', 'Old School'),
  ],
};

function renderWith(opts: { online?: boolean } = {}) {
  const deo = {
    getMessagingOverview: vi.fn(async () => overview),
    listDirectMessages: vi.fn(async () => []),
    sendDirectMessage: vi.fn(async () => ({ data: null, refreshed: true })),
    startConversation: vi.fn(async () => ({ data: null, refreshed: true })),
    markConversationRead: vi.fn(async () => ({ data: null, refreshed: true })),
    getOnlineUsers: vi.fn(async () => ['ceo-1']),
  };
  (window as unknown as { nemis: unknown }).nemis = {
    deo,
    events: { subscribe: () => () => undefined },
  };
  const layer = createRendererPresentation();
  layer.stores.connectivity.setOnline(opts.online ?? true);
  render(
    <PresentationProvider layer={layer}>
      <DeoMessagesPanel />
    </PresentationProvider>,
  );
  return { deo };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  search = new URLSearchParams();
});

describe('DEO Messages panel', () => {
  it('pins the County Admin, then School Admins (conversations first), then past conversations', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Cee Doe')).toBeInTheDocument());
    // The filter button and the pinned contact's role line.
    expect(screen.getAllByText('County Admin')).toHaveLength(2);
    expect(screen.getByText('School Admins (2)')).toBeInTheDocument();
    expect(screen.getByText('Past conversations (1)')).toBeInTheDocument();
    const names = ['Cee Doe', 'Ann Doe', 'Bob Doe', 'Moe Doe'].map((name) => screen.getByText(name));
    for (let i = 1; i < names.length; i += 1) {
      expect(names[i - 1]!.compareDocumentPosition(names[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('filters by role and finds a school admin by school', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Cee Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'County Admin' }));
    expect(screen.queryByText('Ann Doe')).toBeNull();
    expect(screen.queryByPlaceholderText('Search school admins…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'School Admin' }));
    expect(screen.queryByText('Cee Doe')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Search school admins…'), { target: { value: 'beta' } });
    expect(screen.getByText('Bob Doe')).toBeInTheDocument();
    expect(screen.queryByText('Ann Doe')).toBeNull();
  });

  it('?userId= opens that person, starting a new chat when there is none', async () => {
    search = new URLSearchParams('userId=adm-b');
    const { deo } = renderWith();
    await waitFor(() => expect(screen.getByText('Start your conversation with Bob.')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Type a message/), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(deo.startConversation).toHaveBeenCalledWith({ targetUserId: 'adm-b', initialMessage: 'Hello' }));
  });

  it('?userId= with a conversation opens it and marks it read online', async () => {
    search = new URLSearchParams('userId=adm-a');
    const { deo } = renderWith();
    await waitFor(() => expect(deo.listDirectMessages).toHaveBeenCalledWith('c-a'));
    await waitFor(() => expect(deo.markConversationRead).toHaveBeenCalledWith('c-a'));
  });

  it('offline, the conversation still opens but sending is disabled', async () => {
    search = new URLSearchParams('conv=c-a');
    const { deo } = renderWith({ online: false });
    await waitFor(() => expect(deo.listDirectMessages).toHaveBeenCalledWith('c-a'));
    expect(screen.getByText('Messages need a connection to send.')).toBeInTheDocument();
    expect(deo.markConversationRead).not.toHaveBeenCalled();
  });
});
