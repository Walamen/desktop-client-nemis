import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RealtimeEvent } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { CountyMessagesPanel } from './CountyMessagesPanel';

let search = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => search }));

const recipient = (userId: string, firstName: string, role: string, extra: Record<string, unknown> = {}) => ({
  userId, firstName, lastName: 'Doe', photoUrl: null, role,
  districtId: 'd-1', districtName: 'Buchanan', institutionId: null, institutionName: null, ...extra,
});
const conversation = (id: string, userId: string, firstName: string, role = 'DEO') => ({
  id, lastMessageAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), createdAt: '2026-10-01T00:00:00.000Z',
  counterpart: { userId, firstName, lastName: 'Doe', photoUrl: null, role, institutionName: null },
  lastMessage: 'See you', unreadCount: 2,
});
const message = (id: string, senderId: string, content: string, isOwn: boolean) => ({
  id, conversationId: 'c-1', senderId, content, isRead: true, readAt: null,
  createdAt: '2026-10-20T10:00:00.000Z', isOwn, senderName: isOwn ? 'You' : 'James Doe',
});

const overview = {
  recipients: [
    recipient('deo-1', 'James', 'DEO'),
    recipient('admin-1', 'Bendu', 'INSTITUTION_ADMIN', {
      districtId: 'd-2', districtName: 'Owensgrove', institutionId: 'sch-a', institutionName: 'Alpha School',
    }),
    recipient('deo-2', 'Comfort', 'DEO'),
  ],
  conversations: [conversation('c-1', 'deo-1', 'James')],
};

function renderWith(opts: { online?: boolean; overrides?: Record<string, unknown> } = {}) {
  let listener: ((event: RealtimeEvent) => void) | null = null;
  const county = {
    getMessagingOverview: vi.fn(async () => overview),
    listDirectMessages: vi.fn(async () => [message('m-1', 'deo-1', 'Report is ready', false), message('m-2', 'ceo-1', 'Thanks', true)]),
    sendDirectMessage: vi.fn(async () => ({ data: null, refreshed: true })),
    startConversation: vi.fn(async () => ({ data: null, refreshed: true })),
    markConversationRead: vi.fn(async () => ({ data: null, refreshed: true })),
    getOnlineUsers: vi.fn(async () => ['admin-1']),
    ...opts.overrides,
  };
  (window as unknown as { nemis: unknown }).nemis = {
    county,
    events: { subscribe: (fn: (event: RealtimeEvent) => void) => ((listener = fn), () => (listener = null)) },
  };
  const layer = createRendererPresentation();
  layer.stores.connectivity.setOnline(opts.online ?? true);
  render(
    <PresentationProvider layer={layer}>
      <CountyMessagesPanel />
    </PresentationProvider>,
  );
  return { county, push: (event: RealtimeEvent) => listener?.(event) };
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  search = new URLSearchParams();
});

const sidebarNames = () =>
  screen.getAllByRole('button').map((b) => b.querySelector('p')?.textContent).filter((t): t is string => !!t && t.endsWith('Doe'));

describe('County Messages panel', () => {
  it('lists conversations then contacts, and filters by role, district and name', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('James Doe')).toBeInTheDocument());
    expect(sidebarNames()).toEqual(['James Doe', 'Bendu Doe', 'Comfort Doe']);
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'School Admin' }));
    expect(sidebarNames()).toEqual(['Bendu Doe']);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'All Districts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Owensgrove' }));
    expect(sidebarNames()).toEqual(['Bendu Doe']);
    fireEvent.click(screen.getByRole('button', { name: 'Owensgrove' }));
    fireEvent.click(screen.getByRole('button', { name: 'All Districts' }));
    fireEvent.change(screen.getByPlaceholderText('Search by name…'), { target: { value: 'comf' } });
    expect(sidebarNames()).toEqual(['Comfort Doe']);
  });

  it('selecting shows the thread with own and incoming bubbles, and marks it read online', async () => {
    const { county } = renderWith();
    await waitFor(() => expect(screen.getByText('James Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByText('James Doe'));
    await waitFor(() => expect(screen.getByText('Report is ready')).toBeInTheDocument());
    expect(screen.getByText('Thanks').closest('div.flex-col')!.className).toContain('items-end');
    expect(county.markConversationRead).toHaveBeenCalledWith('c-1');
  });

  it('send calls the channel and clears the box', async () => {
    const { county } = renderWith();
    await waitFor(() => expect(screen.getByText('James Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByText('James Doe'));
    await waitFor(() => expect(screen.getByText('Report is ready')).toBeInTheDocument());
    const box = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(box, { target: { value: 'On my way' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(county.sendDirectMessage).toHaveBeenCalledWith({ conversationId: 'c-1', content: 'On my way' }));
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('the first message to a contact starts the conversation', async () => {
    const { county } = renderWith();
    await waitFor(() => expect(screen.getByText('Comfort Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Comfort Doe'));
    expect(screen.getByText('Start your conversation with Comfort.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Type a message/), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(county.startConversation).toHaveBeenCalledWith({ targetUserId: 'deo-2', initialMessage: 'Hello' }));
  });

  it('offline disables sending with the note and never marks read', async () => {
    const { county } = renderWith({ online: false });
    await waitFor(() => expect(screen.getByText('James Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByText('James Doe'));
    await waitFor(() => expect(screen.getByText('Report is ready')).toBeInTheDocument());
    expect(screen.getByText('Messages need a connection to send.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type a message/)).toBeDisabled();
    expect(county.markConversationRead).not.toHaveBeenCalled();
  });

  it("?institutionId selects that school's admin and the School Admin filter", async () => {
    search = new URLSearchParams('institutionId=sch-a');
    renderWith();
    await waitFor(() => expect(screen.getByText('Start your conversation with Bendu.')).toBeInTheDocument());
    expect(sidebarNames()).toEqual(['Bendu Doe']);
  });

  it('?institutionId with no admin selects nothing', async () => {
    search = new URLSearchParams('institutionId=sch-none');
    renderWith();
    await waitFor(() => expect(screen.getByText('James Doe')).toBeInTheDocument());
    expect(screen.getByText('Select someone to message')).toBeInTheDocument();
  });

  it('?conv opens that conversation', async () => {
    search = new URLSearchParams('conv=c-1');
    renderWith();
    await waitFor(() => expect(screen.getByText('Report is ready')).toBeInTheDocument());
  });

  it('online dots come from presence', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Bendu Doe')).toBeInTheDocument());
    const bendu = screen.getByText('Bendu Doe').closest('button')!;
    await waitFor(() => expect(within(bendu).getByText('Active')).toBeInTheDocument());
    expect(within(screen.getByText('James Doe').closest('button')!).queryByText('Active')).toBeNull();
  });

  it('a realtime message event reloads the thread', async () => {
    const { county, push } = renderWith();
    await waitFor(() => expect(screen.getByText('James Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByText('James Doe'));
    await waitFor(() => expect(screen.getByText('Report is ready')).toBeInTheDocument());
    county.listDirectMessages.mockResolvedValue([message('m-3', 'deo-1', 'Just arrived', false)]);
    push({ type: 'message', conversationId: 'c-1' });
    await waitFor(() => expect(screen.getByText('Just arrived')).toBeInTheDocument());
  });
});
