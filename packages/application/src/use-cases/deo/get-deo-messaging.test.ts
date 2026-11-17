import { describe, expect, it } from 'vitest';
import type { CountyDirectConversation, CountyMessageRecipient, CountyNotification } from '@nemis-desktop/types';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import {
  InMemoryCountyMessagingReadModel,
  InMemoryCountyNotificationsRepository,
} from '../../testing/county/in-memory-county-messaging';
import {
  GetDeoMessagesUseCase,
  GetDeoMessagingOverviewUseCase,
  GetDeoNotificationsUseCase,
  MarkAllDeoNotificationsReadUseCase,
  MarkDeoNotificationReadUseCase,
} from './get-deo-messaging';

const contact: CountyMessageRecipient = {
  userId: 'ceo-1',
  firstName: 'Cee',
  lastName: 'Oh',
  photoUrl: null,
  role: 'COUNTY_ADMIN',
  districtId: null,
  districtName: null,
  institutionId: null,
  institutionName: null,
};

const conversation = { id: 'conv-1', counterpart: { userId: 'ceo-1' } } as unknown as CountyDirectConversation;

function deps(districtId: string | null = 'd-1') {
  const district = new InMemoryDistrictOverviewReadModel();
  district.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  district.county = { id: 'c-1', name: 'Grand Bassa' };
  district.messageContacts = [contact];
  const messaging = new InMemoryCountyMessagingReadModel();
  messaging.overview = { recipients: [{ ...contact, userId: 'county-only' }], conversations: [conversation] };
  messaging.messagesByConversation.set('conv-1', []);
  const notifications = new InMemoryCountyNotificationsRepository();
  return {
    district,
    messaging,
    notifications,
    base: {
      districtOverview: district,
      messaging,
      notifications,
      currentDistrictId: districtId,
      currentUserId: 'deo-1',
      logger: new RecordingLogger(),
    },
  };
}

describe('DEO messaging use cases', () => {
  it("lists the DEO's own contacts (not the County rule) and conversations", async () => {
    const { base, district, messaging } = deps();
    const { data } = await new GetDeoMessagingOverviewUseCase(base).execute({});
    expect(data).toEqual({ recipients: [contact], conversations: [conversation] });
    expect(district.argsOf('listMessageContacts')).toEqual(['d-1', 'deo-1']);
    expect(messaging.lastUserId).toBe('deo-1');
  });

  it('without a district, still shows past conversations but nobody to message', async () => {
    const { base, district } = deps(null);
    const { data } = await new GetDeoMessagingOverviewUseCase(base).execute({});
    expect(data).toEqual({ recipients: [], conversations: [conversation] });
    expect(district.calls).toEqual([]);
  });

  it("reads a thread as the signed-in DEO", async () => {
    const { base, messaging } = deps();
    expect((await new GetDeoMessagesUseCase(base).execute({ conversationId: 'conv-1' })).data).toEqual([]);
    expect((await new GetDeoMessagesUseCase(base).execute({ conversationId: 'nope' })).data).toBeNull();
    expect(messaging.lastUserId).toBe('deo-1');
  });
});

describe('DEO notification use cases', () => {
  const note = (id: string, isRead: boolean): CountyNotification => ({
    id,
    type: 'NEW_MESSAGE',
    title: id,
    message: id,
    isRead,
    link: null,
    createdAt: '2026-11-17T10:00:00.000Z',
  });

  it('lists every notification of the user with the unread count and the district names', async () => {
    const { base, notifications } = deps();
    notifications.page = { ...notifications.page, items: [note('n-1', false), note('n-2', true)], total: 2, totalAll: 2, unread: 1 };
    const { data } = await new GetDeoNotificationsUseCase(base).execute({});
    expect(data).toEqual({
      districtId: 'd-1',
      district: { id: 'd-1', name: 'Buchanan' },
      county: { id: 'c-1', name: 'Grand Bassa' },
      items: [note('n-1', false), note('n-2', true)],
      unread: 1,
    });
    expect(notifications.lastQuery).toEqual({ recipientId: 'deo-1', query: { filter: 'ALL', page: 1, limit: 100_000 } });
  });

  it("marks only the user's own notifications", async () => {
    const { base, notifications } = deps();
    notifications.owned.set('deo-1', new Set(['n-1', 'n-2']));
    expect((await new MarkDeoNotificationReadUseCase(base).execute({ notificationId: 'n-1' })).data).toBe(true);
    expect((await new MarkDeoNotificationReadUseCase(base).execute({ notificationId: 'other' })).data).toBe(false);
    expect((await new MarkAllDeoNotificationsReadUseCase(base).execute({})).data).toBe(2);
  });
});
